from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    AIGeneration,
    ChatChannel,
    Company,
    CompanyDocument,
    DailyNote,
    DeclarationRecord,
    Employee,
    Invoice,
    Investment,
    LimuleInteraction,
    Meeting,
    Message,
    PaymentAccount,
    PayrollRun,
    Product,
    Sale,
    Task,
    TerasAlert,
    TerasScoreSnapshot,
    User,
)


PAGE_MODULES: dict[str, str] = {
    "/": "dashboard",
    "/employees": "rh",
    "/documents": "documents",
    "/payroll": "payroll",
    "/billing": "billing",
    "/pos": "pos",
    "/inventory": "inventory",
    "/chat": "chat",
    "/work": "work",
    "/calendar": "calendar",
    "/notes": "notes",
    "/reports": "reports",
    "/reports-teras": "teras",
    "/assistants": "assistants",
    "/declarations": "declarations",
    "/settings": "settings",
    "/accounting": "accounting",
    "/projects": "projects",
    "/investments": "investments",
}


def module_from_path(page_path: str | None) -> str:
    if not page_path:
        return "global"
    normalized = page_path.split("?")[0].rstrip("/") or "/"
    if normalized in PAGE_MODULES:
        return PAGE_MODULES[normalized]
    for prefix, module in sorted(PAGE_MODULES.items(), key=lambda item: len(item[0]), reverse=True):
        if prefix != "/" and normalized.startswith(prefix):
            return module
    return "global"


def detect_intent(prompt: str) -> str:
    text = prompt.lower()
    # Prédiction / prévision économique
    if any(word in text for word in [
        "prévision", "prevision", "prévoir", "prevoir", "prédiction", "prediction",
        "tendance", "projection", "forecast", "anticip", "évolution", "evolution",
        "croissance", "déclin", "décroissance", "prochains mois", "prochain mois",
        "prochains 3", "prochains 6", "prochain trimestre", "prochain semestre",
        "fin d'année", "fin de l'année", "2025", "2026", "2027", "horizon", "scénario",
        "va-t-il se passer", "que va-t-il", "à quoi s'attendre", "dans les prochains",
        "d'ici", "dans 30 jours", "dans 60 jours", "dans 90 jours",
    ]):
        return "prediction_economique"
    # Investissement / stratégie financière
    if any(word in text for word in [
        "investir", "investissement", "placement", "capital", "financer", "financement",
        "rentabilité", "retour sur investissement", "roi", "rentable", "embaucher ou",
        "devrais-je", "devrais je", "vaut-il mieux", "vaut il mieux", "opportunité",
        "expansion", "croître", "développer", "stratégie", "strategie", "plan",
        "budget", "priorité d'investissement", "allouer",
    ]):
        return "conseil_investissement"
    # Analyse sectorielle / marché
    if any(word in text for word in [
        "secteur", "marché", "marche", "concurrent", "concurrence", "industrie",
        "benchmark", "comparaison", "positionnement", "part de marché",
        "contexte économique", "conjoncture", "zone cemac", "afrique centrale",
        "congo", "gabon", "cameroun", "tchad", "rca", "guinée",
    ]):
        return "analyse_secteur"
    # Trésorerie / liquidité / cash
    if any(word in text for word in [
        "trésorerie", "tresorerie", "liquidité", "liquidite", "cash", "flux",
        "cashflow", "solde", "encaissement", "décaissement", "besoin en fonds",
        "bfr", "financement court terme", "découvert", "decouvert",
    ]):
        return "tresorerie"
    # Risques / conformité
    if any(word in text for word in ["risque", "alerte", "anomalie", "conform", "teras"]):
        return "risk_analysis"
    if any(word in text for word in ["resume", "résume", "résumé", "resume", "synthese", "synthèse", "résumé du", "resumé"]):
        return "summary"
    if any(word in text for word in ["tache", "tâche", "action", "todo"]):
        return "task_creation"
    if any(word in text for word in ["email", "courrier", "relance", "message"]):
        return "drafting"
    if any(word in text for word in ["paie", "bulletin", "salaire", "cnps"]):
        return "payroll_support"
    if any(word in text for word in ["stock", "inventaire", "caisse", "vente", "pos"]):
        return "operations_support"
    return "question"


def _safe_json(value: str, fallback: Any) -> Any:
    try:
        return json.loads(value or "")
    except Exception:
        return fallback


def _money(value: float | int | None, currency: str = "XAF") -> str:
    return f"{float(value or 0):,.0f} {currency}".replace(",", " ")


def _short(value: str, limit: int = 220) -> str:
    text = " ".join((value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _count(db: Session, model: Any, company_id: int, *criteria: Any) -> int:
    stmt = select(func.count()).select_from(model).where(model.company_id == company_id)
    for criterion in criteria:
        stmt = stmt.where(criterion)
    return int(db.scalar(stmt) or 0)


def _sum(db: Session, column: Any, company_id: int, model: Any, *criteria: Any) -> float:
    stmt = select(func.coalesce(func.sum(column), 0)).select_from(model).where(model.company_id == company_id)
    for criterion in criteria:
        stmt = stmt.where(criterion)
    return float(db.scalar(stmt) or 0)


def _recent_limule_memory(
    db: Session,
    *,
    company_id: int,
    user_id: int | None,
    module_key: str,
    limit: int = 6,
) -> dict[str, Any]:
    if not user_id:
        return {"scope": "user_module", "module": module_key, "count": 0, "recent_interactions": []}

    rows = db.scalars(
        select(LimuleInteraction)
        .where(
            LimuleInteraction.company_id == company_id,
            LimuleInteraction.user_id == user_id,
            LimuleInteraction.module_key == module_key,
        )
        .order_by(LimuleInteraction.created_at.desc())
        .limit(limit)
    ).all()

    # Le LLM comprend mieux un fil chronologique qu'une pile inverse.
    interactions = [
        {
            "id": row.id,
            "intent": row.intent,
            "prompt": _short(row.prompt, 180),
            "response": _short(row.response, 260),
            "rating": row.rating,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in reversed(rows)
    ]
    return {
        "scope": "user_module",
        "module": module_key,
        "count": len(interactions),
        "recent_interactions": interactions,
    }


def _resolve_currency(db: Session, user: Any, company_id: int) -> str:
    """Retourne la devise préférée de l'utilisateur depuis user_preferences."""
    try:
        from app.models.domain import UserPreference as _UP
        uid = getattr(user, "id", None)
        if uid:
            pref = db.scalar(select(_UP).where(_UP.user_id == uid))
            if pref and pref.currency:
                return pref.currency
        pref = db.scalar(select(_UP).where(_UP.company_id == company_id))
        if pref and pref.currency:
            return pref.currency
    except Exception:
        pass
    return "XAF"


def build_limule_context(
    db: Session,
    company_id: int,
    user: User,
    page_path: str | None = "",
    focus_module: str | None = None,
    max_records: int = 5,
) -> dict[str, Any]:
    company = db.get(Company, company_id)
    module_key = focus_module or module_from_path(page_path)
    company_currency = _resolve_currency(db, user, company_id)
    today = date.today()
    now = datetime.now(timezone.utc)

    employees = db.scalars(
        select(Employee)
        .where(Employee.company_id == company_id)
        .order_by(Employee.created_at.desc())
        .limit(max_records)
    ).all()
    active_employees = _count(db, Employee, company_id, Employee.status == "active")

    latest_payroll = db.scalar(
        select(PayrollRun)
        .options(selectinload(PayrollRun.payslips))
        .where(PayrollRun.company_id == company_id)
        .order_by(PayrollRun.created_at.desc())
    )

    low_stock = db.scalars(
        select(Product)
        .where(Product.company_id == company_id, Product.stock_quantity <= Product.reorder_level)
        .order_by(Product.stock_quantity.asc())
        .limit(max_records)
    ).all()
    recent_sales = db.scalars(
        select(Sale)
        .where(Sale.company_id == company_id)
        .order_by(Sale.created_at.desc())
        .limit(max_records)
    ).all()
    recent_docs = db.scalars(
        select(CompanyDocument)
        .where(CompanyDocument.company_id == company_id)
        .order_by(CompanyDocument.created_at.desc())
        .limit(max_records)
    ).all()
    open_alerts = db.scalars(
        select(TerasAlert)
        .where(TerasAlert.company_id == company_id, TerasAlert.status == "open")
        .order_by(TerasAlert.severity.desc(), TerasAlert.created_at.desc())
        .limit(max_records)
    ).all()
    teras_scores = db.scalars(
        select(TerasScoreSnapshot)
        .where(TerasScoreSnapshot.company_id == company_id)
        .order_by(TerasScoreSnapshot.created_at.desc())
        .limit(max_records)
    ).all()
    urgent_tasks = db.scalars(
        select(Task)
        .where(Task.company_id == company_id, Task.status != "done")
        .order_by(Task.due_date.asc().nulls_last(), Task.created_at.desc())
        .limit(max_records)
    ).all()
    upcoming_meetings = db.scalars(
        select(Meeting)
        .where(Meeting.company_id == company_id, Meeting.start_at >= now - timedelta(hours=2))
        .order_by(Meeting.start_at.asc())
        .limit(max_records)
    ).all()
    recent_notes = db.scalars(
        select(DailyNote)
        .where(DailyNote.company_id == company_id)
        .order_by(DailyNote.note_date.desc(), DailyNote.created_at.desc())
        .limit(max_records)
    ).all()
    recent_messages = db.scalars(
        select(Message)
        .options(selectinload(Message.author), selectinload(Message.channel))
        .where(Message.company_id == company_id)
        .order_by(Message.created_at.desc())
        .limit(max_records)
    ).all()
    payment_accounts = db.scalars(
        select(PaymentAccount)
        .where(PaymentAccount.company_id == company_id, PaymentAccount.enabled == True)  # noqa: E712
        .order_by(PaymentAccount.is_default_pos.desc(), PaymentAccount.is_default_payroll.desc())
    ).all()
    declarations = db.scalars(
        select(DeclarationRecord)
        .where(DeclarationRecord.company_id == company_id)
        .order_by(DeclarationRecord.created_at.desc())
        .limit(max_records)
    ).all()

    # Investissements boursiers
    investments = db.scalars(
        select(Investment)
        .where(Investment.company_id == company_id)
        .order_by(Investment.created_at.desc())
    ).all()

    # Dernière analyse de portefeuille générée par Limule
    last_portfolio_analysis = db.scalar(
        select(AIGeneration)
        .where(
            AIGeneration.company_id == company_id,
            AIGeneration.kind.in_(["portfolio_analysis", "investment_analysis"]),
        )
        .order_by(AIGeneration.created_at.desc())
    )

    sales_total = _sum(db, Sale.total_amount, company_id, Sale)
    invoices_total = _sum(db, Invoice.total_amount, company_id, Invoice)
    invoices_pending = _count(db, Invoice, company_id, Invoice.status.in_(["draft", "sent", "overdue"]))
    products_count = _count(db, Product, company_id)
    documents_count = _count(db, CompanyDocument, company_id)
    tasks_open = _count(db, Task, company_id, Task.status != "done")
    memory = _recent_limule_memory(
        db,
        company_id=company_id,
        user_id=user.id,
        module_key=module_key,
        limit=max_records + 1,
    )

    signals: list[dict[str, Any]] = []
    if low_stock:
        signals.append({
            "type": "inventory_low_stock",
            "severity": "medium",
            "label": f"{len(low_stock)} produit(s) sous seuil",
            "module": "inventory",
        })
    high_alerts = [alert for alert in open_alerts if alert.severity in {"high", "critical"}]
    if high_alerts:
        signals.append({
            "type": "teras_risk",
            "severity": "high",
            "label": f"{len(high_alerts)} alerte(s) TERAS forte(s)",
            "module": "teras",
        })
    if latest_payroll and any(slip.payout_status != "ready" for slip in latest_payroll.payslips):
        signals.append({
            "type": "payroll_payout_incomplete",
            "severity": "medium",
            "label": "Certains bulletins n'ont pas une destination de paiement prête",
            "module": "payroll",
        })
    overdue_tasks = [task for task in urgent_tasks if task.due_date and task.due_date <= today and task.status != "done"]
    if overdue_tasks:
        signals.append({
            "type": "task_due",
            "severity": "medium",
            "label": f"{len(overdue_tasks)} tâche(s) dues ou en retard",
            "module": "work",
        })

    context = {
        "module": module_key,
        "page_path": page_path or "",
        "generated_at": now.isoformat(),
        "currency": company_currency,
        "company": {
            "id": company.id if company else company_id,
            "name": company.name if company else "Entreprise",
            "industry": company.industry if company else "",
            "country": company.country if company else "",
            "completion_score": company.completion_score if company else 0,
            "teras_score": company.teras_score if company else 0,
        },
        "user": {
            "id": user.id,
            "name": user.full_name,
            "role": user.role,
            "department": user.department,
            "branch": user.branch,
        },
        "kpis": {
            "employees_active": active_employees,
            "products": products_count,
            "documents": documents_count,
            "sales_total": sales_total,
            "invoices_total": invoices_total,
            "invoices_pending": invoices_pending,
            "tasks_open": tasks_open,
            "teras_alerts_open": len(open_alerts),
        },
        "memory": memory,
        "modules": {
            "rh": {
                "active_count": active_employees,
                "recent_employees": [
                    {
                        "name": f"{employee.first_name} {employee.last_name}",
                        "job_title": employee.job_title,
                        "department": employee.department,
                        "branch": employee.branch,
                        "status": employee.status,
                        "salary": employee.salary,
                        "payout_method": employee.payout_method,
                        "account_status": employee.account_status,
                    }
                    for employee in employees
                ],
            },
            "payroll": {
                "latest_period": latest_payroll.period if latest_payroll else "",
                "latest_status": latest_payroll.status if latest_payroll else "",
                "net_total": latest_payroll.net_total if latest_payroll else 0,
                "payment_account": latest_payroll.payment_account_label if latest_payroll else "",
                "payslip_count": len(latest_payroll.payslips) if latest_payroll else 0,
                "payouts_ready": (
                    sum(1 for slip in latest_payroll.payslips if slip.payout_status == "ready")
                    if latest_payroll else 0
                ),
            },
            "finance": {
                "invoices_total": invoices_total,
                "sales_total": sales_total,
                "pending_invoices": invoices_pending,
            },
            "pos": {
                "recent_sales": [
                    {
                        "receipt": sale.receipt_number,
                        "amount": sale.total_amount,
                        "method": sale.payment_method,
                        "account": sale.payment_account_label,
                        "status": sale.status,
                    }
                    for sale in recent_sales
                ],
            },
            "inventory": {
                "product_count": products_count,
                "low_stock": [
                    {
                        "name": product.name,
                        "sku": product.sku,
                        "stock": product.stock_quantity,
                        "reorder_level": product.reorder_level,
                    }
                    for product in low_stock
                ],
            },
            "documents": {
                "count": documents_count,
                "recent": [
                    {
                        "id": doc.id,
                        "title": doc.title,
                        "type": doc.document_type,
                        "status": doc.status,
                        "confidence": doc.confidence,
                        "summary": _short(doc.ai_summary, 220),
                        "text_length": doc.text_length,
                        "parse_method": doc.parse_method,
                        "extracted": _safe_json(doc.extracted_data, {}),
                    }
                    for doc in recent_docs
                ],
            },
            "teras": {
                "company_score": company.teras_score if company else 0,
                "alerts": [
                    {
                        "title": alert.title,
                        "severity": alert.severity,
                        "module": alert.module,
                        "recommendation": _short(alert.recommendation, 180),
                    }
                    for alert in open_alerts
                ],
                "scores": [
                    {
                        "domain": score.domain,
                        "score": score.score,
                        "summary": _short(score.summary, 180),
                        "recommendations": _safe_json(score.recommendations, []),
                    }
                    for score in teras_scores
                ],
            },
            "work": {
                "open_tasks": [
                    {
                        "title": task.title,
                        "status": task.status,
                        "priority": task.priority,
                        "due_date": task.due_date.isoformat() if task.due_date else None,
                        "assignee": task.assignee_name,
                        "source": task.source,
                    }
                    for task in urgent_tasks
                ],
            },
            "chat": {
                "recent_messages": [
                    {
                        "channel": message.channel.name if message.channel else "",
                        "author": message.author.full_name if message.author else "",
                        "body": _short(message.body, 160),
                        "ai_suggestion": message.ai_suggestion,
                    }
                    for message in recent_messages
                ],
            },
            "calendar": {
                "upcoming_meetings": [
                    {
                        "title": meeting.title,
                        "start_at": meeting.start_at.isoformat(),
                        "tag": meeting.tag,
                        "status": meeting.status,
                        "summary": _short(meeting.ai_summary, 160),
                        "flags": _safe_json(meeting.teras_flags_json, []),
                    }
                    for meeting in upcoming_meetings
                ],
            },
            "notes": {
                "recent": [
                    {
                        "date": note.note_date.isoformat(),
                        "title": note.title,
                        "ai_generated": note.ai_generated,
                        "summary": _short(note.body, 180),
                    }
                    for note in recent_notes
                ],
            },
            "declarations": {
                "recent": [
                    {
                        "period": declaration.period,
                        "type": declaration.declaration_type,
                        "status": declaration.status,
                        "confidence": declaration.confidence,
                        "missing_documents": _safe_json(declaration.missing_documents, []),
                    }
                    for declaration in declarations
                ],
            },
            "investments": {
                "positions": [
                    {
                        "ticker": inv.ticker,
                        "name": inv.display_name,
                        "exchange": inv.exchange,
                        "currency_stock": inv.currency_stock,
                        "shares": inv.shares,
                        "invested_amount": inv.invested_amount,
                        "purchase_price_ref": inv.purchase_price_ref,
                        "purchase_date": inv.purchase_date,
                        "last_analysis": _short(inv.last_analysis, 400) if inv.last_analysis else None,
                    }
                    for inv in investments
                ],
                "total_invested": sum(inv.invested_amount for inv in investments),
                "positions_count": len(investments),
                "last_analysis": _short(last_portfolio_analysis.content, 1200) if last_portfolio_analysis else None,
                "last_analysis_kind": last_portfolio_analysis.kind if last_portfolio_analysis else None,
                "last_analysis_at": last_portfolio_analysis.created_at.isoformat() if last_portfolio_analysis else None,
            },
            "payments": {
                "accounts": [
                    {
                        "provider": account.provider,
                        "label": account.label,
                        "currency": account.currency,
                        "use_for_pos": account.use_for_pos,
                        "use_for_payroll": account.use_for_payroll,
                        "default_pos": account.is_default_pos,
                        "default_payroll": account.is_default_payroll,
                    }
                    for account in payment_accounts
                ],
            },
        },
        "signals": signals,
        "sources": [
            "company",
            "employees",
            "payroll",
            "pos",
            "inventory",
            "documents",
            "teras",
            "tasks",
            "chat",
            "calendar",
            "notes",
            "payments",
            "investments",
        ],
    }
    context["prompt_context"] = render_context_for_prompt(context)
    return context


def render_context_for_prompt(context: dict[str, Any]) -> str:
    company = context["company"]
    kpis = context["kpis"]
    modules = context["modules"]
    cur = context.get("currency", "XAF")
    lines = [
        f"Page active: {context['page_path'] or 'globale'} / module: {context['module']}",
        f"Entreprise: {company['name']} ({company['industry']}, {company['country']}) | Devise: {cur}",
        f"Scores: completion {company['completion_score']}/100, TERAS {company['teras_score']}/100",
        (
            "KPI: "
            f"{kpis['employees_active']} employés actifs, "
            f"{kpis['products']} produits, "
            f"{kpis['documents']} documents, "
            f"CA ventes {_money(kpis['sales_total'], cur)}, "
            f"{kpis['tasks_open']} tâches ouvertes, "
            f"{kpis['teras_alerts_open']} alertes TERAS ouvertes"
        ),
    ]
    if context["signals"]:
        lines.append("Signaux prioritaires:")
        lines += [f"- [{s['severity']}] {s['label']} ({s['module']})" for s in context["signals"]]
    if modules["payroll"]["latest_period"]:
        lines.append(
            "Paie: "
            f"{modules['payroll']['latest_period']} · {modules['payroll']['latest_status']} · "
            f"net {_money(modules['payroll']['net_total'], cur)} · "
            f"{modules['payroll']['payouts_ready']}/{modules['payroll']['payslip_count']} versements prêts"
        )
    if modules["inventory"]["low_stock"]:
        lines.append("Stock bas: " + "; ".join(
            f"{p['name']} ({p['stock']}/{p['reorder_level']})"
            for p in modules["inventory"]["low_stock"][:3]
        ))
    if modules["teras"]["alerts"]:
        lines.append("Alertes TERAS: " + "; ".join(
            f"{a['title']} [{a['severity']}]" for a in modules["teras"]["alerts"][:3]
        ))
    if modules["work"]["open_tasks"]:
        lines.append("Tâches ouvertes: " + "; ".join(
            f"{t['title']} ({t['priority']})" for t in modules["work"]["open_tasks"][:4]
        ))
    if modules["documents"]["recent"]:
        doc_parts = []
        for d in modules["documents"]["recent"][:4]:
            part = f"{d['title']} [{d['type']}]"
            ext = d.get("extracted") or {}
            montants = ext.get("montants") or {}
            total = montants.get("total_ttc") or montants.get("net_a_payer")
            if total:
                part += f" {float(total):,.0f} {cur}"
            if d.get("text_length", 0) > 0:
                part += f" ({d['text_length']} cars)"
            doc_parts.append(part)
        lines.append("Documents récents: " + "; ".join(doc_parts))
    if modules["calendar"]["upcoming_meetings"]:
        lines.append("Réunions à venir: " + "; ".join(
            f"{m['title']} ({m['tag']})" for m in modules["calendar"]["upcoming_meetings"][:3]
        ))
    # Notes récentes
    recent_notes_items = modules.get("notes", {}).get("recent", [])
    if recent_notes_items:
        lines.append("Notes récentes: " + "; ".join(
            f"{n['date'][:10]} – {n['title']}: {n['summary']}"
            for n in recent_notes_items[:3]
        ))
    # Portefeuille boursier
    inv_module = modules.get("investments", {})
    positions = inv_module.get("positions", [])
    if positions:
        total_invested = inv_module.get("total_invested", 0)
        lines.append(
            f"Portefeuille boursier: {len(positions)} position(s), "
            f"total investi {total_invested:,.0f} — "
            + "; ".join(
                f"{p['name']} ({p['ticker']}) {p['shares']} titres × {p['purchase_price_ref']} {p['currency_stock']}"
                for p in positions
            )
        )
        # Dernière analyse de portefeuille — contexte clé pour les follow-ups
        last_analysis = inv_module.get("last_analysis")
        last_kind = inv_module.get("last_analysis_kind", "")
        last_at = inv_module.get("last_analysis_at", "")
        if last_analysis:
            kind_label = "Analyse de portefeuille" if last_kind == "portfolio_analysis" else "Analyse d'action"
            lines.append(
                f"\n=== {kind_label} (générée le {last_at[:10] if last_at else '?'}) ===\n"
                f"{last_analysis}\n"
                f"=== Fin de l'analyse ==="
            )

    memory_items = context.get("memory", {}).get("recent_interactions", [])
    if memory_items:
        lines.append("Mémoire Limule récente: " + " | ".join(
            f"{item['intent']}: {item['prompt']}" for item in memory_items[-3:]
        ))
    return "\n".join(lines)


def training_tags(prompt: str, context: dict[str, Any], intent: str) -> list[str]:
    text = prompt.lower()
    tags = {"limule", intent, context.get("module", "global")}
    keyword_map = {
        "payroll": ["paie", "bulletin", "salaire", "cnps"],
        "finance": ["facture", "cash", "tresorerie", "trésorerie", "budget"],
        "pos": ["caisse", "vente", "pos", "ticket"],
        "inventory": ["stock", "inventaire", "produit"],
        "documents": ["document", "contrat", "piece", "pièce", "justificatif"],
        "teras": ["teras", "conformite", "conformité", "risque"],
        "chat": ["message", "chat", "canal"],
        "calendar": ["reunion", "réunion", "calendrier"],
    }
    for tag, keywords in keyword_map.items():
        if any(keyword in text for keyword in keywords):
            tags.add(tag)
    for signal in context.get("signals", []):
        tags.add(signal.get("type", "signal"))
        tags.add(f"severity:{signal.get('severity', 'unknown')}")
    if re.search(r"\b\d+([,.]\d+)?\b", prompt):
        tags.add("contains_numeric")
    return sorted(tags)


def build_training_record(interaction: LimuleInteraction, company: Company | None = None) -> dict[str, Any]:
    context = _safe_json(interaction.context_snapshot, {})
    return {
        "id": interaction.id,
        "company": {
            "id": interaction.company_id,
            "name": company.name if company else context.get("company", {}).get("name", ""),
            "industry": company.industry if company else context.get("company", {}).get("industry", ""),
            "country": company.country if company else context.get("company", {}).get("country", ""),
        },
        "module": interaction.module_key,
        "intent": interaction.intent,
        "input": interaction.prompt,
        "output": interaction.response,
        "context": context,
        "sources": _safe_json(interaction.context_sources, []),
        "signals": _safe_json(interaction.detected_signals, []),
        "tags": _safe_json(interaction.training_tags, []),
        "rating": interaction.rating,
        "feedback": interaction.feedback,
        "created_at": interaction.created_at.isoformat() if interaction.created_at else None,
        "privacy_note": "Contient des données métier tenant-scoped; anonymisation recommandée avant entraînement externe.",
    }
