"""
routes_groups_g5.py — IA assistant de groupe, résumés chat, rapports, notifications.

Réutilise les services IA existants de KOMPTA (limule + deepseek).
Les garde-fous de sécurité sont hérités du prompt système Limule (lecture seule,
anti-injection, citations sources). Permissions : un membre simple ne peut pas
poser de questions financières sensibles si son rôle ne l'autorise pas.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes_groups import (
    FINANCE_ROLE_NAMES,
    MANAGER_ROLE_NAMES,
    _get_group,
    _user_group_roles,
    _company_admin,
)
from app.api.routes_groups_g2 import _to_f
from app.db.session import get_db
from app.models import (
    ContributionPayment,
    ContributionPlan,
    GroupActivity,
    GroupExpense,
    GroupMeeting,
    GroupMember,
    GroupTransaction,
    OrganizationGroup,
    User,
)

router = APIRouter(prefix="/groups", tags=["groups-g5"])


class AIAsk(BaseModel):
    question: str


class SummarizeChat(BaseModel):
    messages: list[str]   # list of "Sender: content" strings
    extract_tasks: bool = True


class GenerateReport(BaseModel):
    report_type: str = "monthly"  # monthly|payments|expenses|activity|annual


class ReminderGen(BaseModel):
    member_name: str
    amount_due: float
    plan_title: str
    due_date: date | None = None
    tone: str = "poli"  # poli|ferme|amical


# ── Permissions IA ───────────────────────────────────────────────────────────
SENSITIVE_FINANCE_QUESTIONS = (
    "caisse", "solde", "retard", "dette", "arriéré", "cotisation", "dépense",
    "recette", "transaction", "trésorerie", "budget", "rapport financier",
)


def _question_is_financial(q: str) -> bool:
    ql = q.lower()
    return any(kw in ql for kw in SENSITIVE_FINANCE_QUESTIONS)


def _can_ask_finance(db: Session, group: OrganizationGroup, user: User) -> bool:
    return _company_admin(user) or bool(_user_group_roles(db, group, user) & FINANCE_ROLE_NAMES)


# ── Contexte groupe pour Limule ─────────────────────────────────────────────
def _build_group_context(db: Session, group: OrganizationGroup, include_finance: bool) -> str:
    """Construit le contexte structuré à envoyer à Limule."""
    members = db.scalars(select(GroupMember).where(GroupMember.group_id == group.id, GroupMember.is_active == True)).all()  # noqa: E712
    lines = [
        f"Groupe : {group.name} ({group.type})",
        f"Pays : {group.country} | Ville : {group.city}",
        f"Membres actifs : {len(members)}",
    ]
    if include_finance:
        txns = db.scalars(select(GroupTransaction).where(GroupTransaction.group_id == group.id, GroupTransaction.status == "confirmed")).all()
        balance = sum(t.amount_cents if t.type == "in" else -t.amount_cents for t in txns)
        payments = db.scalars(select(ContributionPayment).where(ContributionPayment.group_id == group.id)).all()
        late = [p for p in payments if p.status in ("partial", "pending", "late")]
        expenses = db.scalars(select(GroupExpense).where(GroupExpense.group_id == group.id, GroupExpense.status == "paid")).all()
        lines += [
            f"Solde caisse : {_to_f(balance)} {group.currency}",
            f"Cotisations reçues : {_to_f(sum(p.amount_paid_cents for p in payments))} {group.currency}",
            f"Cotisations attendues : {_to_f(sum(p.amount_due_cents for p in payments))} {group.currency}",
            f"Membres en retard : {len({p.member_id for p in late})}",
            f"Total dépenses : {_to_f(sum(e.amount_cents for e in expenses))} {group.currency}",
        ]
        if late:
            late_names = []
            for p in late[:5]:
                m = db.get(GroupMember, p.member_id)
                if m:
                    late_names.append(f"{m.full_name} ({_to_f(p.amount_due_cents - p.amount_paid_cents)} {group.currency})")
            if late_names:
                lines.append(f"Membres en retard (aperçu) : {', '.join(late_names)}")
    # Prochaines réunions
    meetings = db.scalars(select(GroupMeeting).where(
        GroupMeeting.group_id == group.id, GroupMeeting.status == "scheduled",
        GroupMeeting.start_datetime >= datetime.now(timezone.utc),
    ).order_by(GroupMeeting.start_datetime).limit(3)).all()
    if meetings:
        lines.append(f"Prochaines réunions : {'; '.join(m.title + ' le ' + str(m.start_datetime.date()) for m in meetings)}")
    return "\n".join(lines)


# ── IA : poser une question ────────────────────────────────────────────────────
@router.post("/{group_id}/ai/ask")
async def ask_ai(group_id: int, payload: AIAsk, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    include_finance = _can_ask_finance(db, group, current_user)
    if _question_is_financial(payload.question) and not include_finance:
        raise HTTPException(status_code=403, detail="Votre rôle ne vous autorise pas à accéder aux informations financières du groupe.")
    context_text = _build_group_context(db, group, include_finance)
    prompt = f"Question sur le groupe « {group.name} » :\n{payload.question}"
    try:
        from app.services.limule import limule_generate
        answer, _ = await limule_generate(kind="group_assistant", prompt=prompt, context=context_text)
    except Exception as exc:
        try:
            from app.services.deepseek import _deepseek_chat
            msgs = [{"role": "system", "content": f"Tu es l'assistant IA du groupe « {group.name} ». Réponds en français professionnel. Lecture seule uniquement."}, {"role": "user", "content": f"{prompt}\n\nContexte :\n{context_text}"}]
            answer = await _deepseek_chat(msgs) or "Service IA indisponible."
        except Exception:
            return {"answer": f"Service IA temporairement indisponible ({exc}).", "source": "offline"}
    return {"answer": answer, "context_lines": len(context_text.splitlines())}


# ── IA : résumé de discussion chat ────────────────────────────────────────────
@router.post("/{group_id}/ai/summarize-chat")
async def summarize_chat(group_id: int, payload: SummarizeChat, db: Session = Depends(get_db),
                         current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    if not (_company_admin(current_user) or _user_group_roles(db, group, current_user) & (MANAGER_ROLE_NAMES | {"Secrétaire"})):
        raise HTTPException(status_code=403, detail="Permission insuffisante")
    if not payload.messages:
        raise HTTPException(status_code=400, detail="Aucun message fourni")
    chat_text = "\n".join(payload.messages[:200])  # limite 200 messages
    task_instruction = "\nExtrais également : (1) les décisions prises, (2) les tâches à réaliser avec responsables, (3) les prochaines actions immédiates." if payload.extract_tasks else ""
    prompt = f"Résume cette discussion du groupe « {group.name} » en français professionnel.{task_instruction}\n\nMessages :\n{chat_text}"
    try:
        from app.services.limule import limule_generate
        summary, _ = await limule_generate(kind="chat_summary", prompt=prompt)
    except Exception:
        try:
            from app.services.deepseek import _deepseek_chat
            msgs4 = [{"role": "system", "content": "Tu résumes des discussions de groupe. Sois concis, neutre, professionnel."}, {"role": "user", "content": prompt}]
            summary = await _deepseek_chat(msgs4) or "Résumé indisponible."
        except Exception as exc:
            return {"summary": f"Service IA indisponible ({exc}).", "tasks": [], "decisions": []}
    return {"summary": summary, "message_count": len(payload.messages)}


# ── IA : génération de rapport texte ─────────────────────────────────────────
@router.post("/{group_id}/ai/generate-report")
async def generate_report(group_id: int, payload: GenerateReport, db: Session = Depends(get_db),
                           current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    if not _can_ask_finance(db, group, current_user):
        raise HTTPException(status_code=403, detail="Accès finances requis")
    context_text = _build_group_context(db, group, include_finance=True)
    label_map = {
        "monthly": "mensuel", "payments": "des cotisations", "expenses": "des dépenses",
        "activity": "des activités", "annual": "annuel",
    }
    label = label_map.get(payload.report_type, payload.report_type)
    prompt = f"Génère un rapport {label} complet pour le groupe « {group.name} ». Utilise les données du contexte, structure avec sections claires, recommande des actions.\n\nContexte :\n{context_text}"
    try:
        from app.services.limule import limule_generate
        content, _ = await limule_generate(kind="report", prompt=prompt, context=context_text)
    except Exception:
        try:
            from app.services.deepseek import _deepseek_chat
            msgs6 = [{"role": "system", "content": f"Tu génères des rapports de groupe. Sois précis, chiffré, actionnable. Groupe : {group.name}."}, {"role": "user", "content": prompt}]
            content = await _deepseek_chat(msgs6) or "Rapport indisponible."
        except Exception as exc:
            content = f"Service IA indisponible ({exc})."
    return {"report_type": payload.report_type, "content": content, "generated_at": datetime.now(timezone.utc)}


# ── IA : analyse des paiements ────────────────────────────────────────────────
@router.post("/{group_id}/ai/payment-analysis")
async def payment_analysis(group_id: int, db: Session = Depends(get_db),
                            current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    if not _can_ask_finance(db, group, current_user):
        raise HTTPException(status_code=403, detail="Accès finances requis")
    context_text = _build_group_context(db, group, include_finance=True)
    prompt = f"Analyse les paiements du groupe « {group.name} » : taux de recouvrement, membres en retard, tendance, anomalies détectées, recommandations concrètes.\n\nContexte :\n{context_text}"
    try:
        from app.services.limule import limule_generate
        analysis, _ = await limule_generate(kind="analysis", prompt=prompt, context=context_text)
    except Exception:
        try:
            from app.services.deepseek import _deepseek_chat
            msgs8 = [{"role": "system", "content": "Tu analyses les paiements de groupes. Sois précis et détecte les anomalies."}, {"role": "user", "content": prompt}]
            analysis = await _deepseek_chat(msgs8) or "Analyse indisponible."
        except Exception as exc:
            analysis = f"Analyse IA indisponible ({exc})."
    return {"analysis": analysis}


# ── IA : générer un message de rappel ─────────────────────────────────────────
@router.post("/{group_id}/ai/generate-reminder-message")
async def generate_reminder_message(group_id: int, payload: ReminderGen, db: Session = Depends(get_db),
                                     current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    if not _can_ask_finance(db, group, current_user):
        raise HTTPException(status_code=403, detail="Accès finances requis")
    date_str = str(payload.due_date) if payload.due_date else "dès que possible"
    prompt = (f"Rédige un message de rappel de cotisation {payload.tone} en français pour le membre « {payload.member_name} » "
              f"du groupe « {group.name} ». Montant dû : {payload.amount_due} {group.currency} "
              f"(plan : {payload.plan_title}, échéance : {date_str}). "
              f"Message court, respectueux, clair, avec coordonnées pour payer.")
    try:
        from app.services.deepseek import _deepseek_chat
        msgs9 = [{"role": "system", "content": "Tu génères des messages de rappel polis pour des groupes. Sois chaleureux et clair."}, {"role": "user", "content": prompt}]
        message = await _deepseek_chat(msgs9) or ""
    except Exception as exc:
        message = (f"Cher(e) {payload.member_name}, nous vous rappelons que votre cotisation "
                   f"de {payload.amount_due} {group.currency} ({payload.plan_title}) est attendue avant le {date_str}. "
                   f"Merci de régulariser votre situation. — Le bureau de {group.name}")
    return {"message": message, "member_name": payload.member_name}


# ── Rapports export JSON (base PDF) ─────────────────────────────────────────
@router.get("/{group_id}/reports/payments")
def report_payments(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    if not _can_ask_finance(db, group, current_user):
        raise HTTPException(status_code=403, detail="Accès finances requis")
    plans = db.scalars(select(ContributionPlan).where(ContributionPlan.group_id == group.id)).all()
    payments = db.scalars(select(ContributionPayment).where(ContributionPayment.group_id == group.id)).all()
    members = {m.id: m.full_name for m in db.scalars(select(GroupMember).where(GroupMember.group_id == group.id)).all()}
    plan_map = {p.id: p.title for p in plans}
    rows = []
    for p in payments:
        rows.append({
            "member": members.get(p.member_id, f"#{p.member_id}"),
            "plan": plan_map.get(p.plan_id, f"#{p.plan_id}"),
            "amount_due": _to_f(p.amount_due_cents),
            "amount_paid": _to_f(p.amount_paid_cents),
            "balance": _to_f(p.amount_due_cents - p.amount_paid_cents),
            "status": p.status, "payment_date": p.payment_date,
        })
    total_due = sum(p.amount_due_cents for p in payments)
    total_paid = sum(p.amount_paid_cents for p in payments)
    return {
        "group": group.name, "currency": group.currency,
        "generated_at": datetime.now(timezone.utc),
        "total_due": _to_f(total_due), "total_paid": _to_f(total_paid),
        "recovery_rate": round(100 * total_paid / total_due, 1) if total_due else 0,
        "rows": rows,
    }


@router.get("/{group_id}/reports/expenses")
def report_expenses(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    if not _can_ask_finance(db, group, current_user):
        raise HTTPException(status_code=403, detail="Accès finances requis")
    expenses = db.scalars(select(GroupExpense).where(GroupExpense.group_id == group.id).order_by(GroupExpense.expense_date.desc())).all()
    by_category: dict[str, int] = {}
    for e in expenses:
        by_category[e.category or "autre"] = by_category.get(e.category or "autre", 0) + e.amount_cents
    return {
        "group": group.name, "currency": group.currency,
        "generated_at": datetime.now(timezone.utc),
        "total": _to_f(sum(e.amount_cents for e in expenses if e.status == "paid")),
        "by_category": {k: _to_f(v) for k, v in sorted(by_category.items(), key=lambda x: -x[1])},
        "rows": [{"id": e.id, "title": e.title, "category": e.category, "amount": _to_f(e.amount_cents),
                  "date": e.expense_date, "status": e.status, "paid_to": e.paid_to} for e in expenses],
    }
