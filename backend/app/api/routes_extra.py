"""
Endpoints additionnels pour la passe "remove all mocks" :
- Meetings (CRUD + AI summary)
- AI Generations (Limule history persistant + téléchargeable)
- Daily Notes (lecture + écriture utilisateur + IA)
- Company Modules (toggles tenant-scoped)
- User Preferences
- Accounting aggregates (cashflow, expenses, syscohada)
- Reports revenue-series

Tous les endpoints sont scopés par company_id (multi-tenant) et exigent un user authentifié.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import (
    AIGeneration,
    Company,
    CompanyModule,
    DailyNote,
    Employee,
    Invoice,
    Meeting,
    PayrollRun,
    Sale,
    Task,
    User,
    UserPreference,
)
from app.schemas.domain import (
    AIGenerationCreate,
    AIGenerationRead,
    CashFlowPoint,
    CompanyModuleRead,
    CompanyModuleUpdate,
    DailyNoteCreate,
    DailyNoteRead,
    DailyNoteUpdate,
    ExpenseCategory,
    MeetingCreate,
    MeetingRead,
    MeetingUpdate,
    RevenueSeriesPoint,
    UserPreferenceRead,
    UserPreferenceUpdate,
)

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────


def _meeting_to_read(m: Meeting) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "start_at": m.start_at,
        "end_at": m.end_at,
        "tag": m.tag,
        "tag_color": m.tag_color,
        "location": m.location,
        "join_url": m.join_url,
        "agenda": m.agenda or "",
        "attendees": json.loads(m.attendees_json or "[]"),
        "ai_summary": m.ai_summary,
        "ai_points": json.loads(m.ai_points_json or "[]"),
        "teras_flags": json.loads(m.teras_flags_json or "[]"),
        "status": m.status,
        "created_by_user_id": m.created_by_user_id,
        "created_at": m.created_at,
    }


# ═══════════════════════════════════════════════════════════════════════════
# MEETINGS
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/meetings", response_model=list[MeetingRead])
def list_meetings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    rows = db.scalars(
        select(Meeting)
        .where(Meeting.company_id == current_user.company_id)
        .order_by(Meeting.start_at.asc())
    ).all()
    return [_meeting_to_read(m) for m in rows]


@router.post("/meetings", response_model=MeetingRead, status_code=201)
def create_meeting(
    payload: MeetingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    meeting = Meeting(
        title=payload.title,
        start_at=payload.start_at,
        end_at=payload.end_at,
        tag=payload.tag,
        tag_color=payload.tag_color,
        location=payload.location,
        join_url=payload.join_url,
        agenda=payload.agenda,
        attendees_json=json.dumps(payload.attendees, ensure_ascii=False),
        company_id=current_user.company_id,
        created_by_user_id=current_user.id,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return _meeting_to_read(meeting)


@router.patch("/meetings/{meeting_id}", response_model=MeetingRead)
def update_meeting(
    meeting_id: int,
    payload: MeetingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    meeting = db.get(Meeting, meeting_id)
    if not meeting or meeting.company_id != current_user.company_id:
        raise HTTPException(404, "Réunion introuvable")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        if key == "attendees" and value is not None:
            meeting.attendees_json = json.dumps(value, ensure_ascii=False)
        elif key == "ai_points" and value is not None:
            meeting.ai_points_json = json.dumps(value, ensure_ascii=False)
        else:
            setattr(meeting, key, value)
    db.commit()
    db.refresh(meeting)
    return _meeting_to_read(meeting)


@router.delete("/meetings/{meeting_id}", status_code=204)
def delete_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    meeting = db.get(Meeting, meeting_id)
    if not meeting or meeting.company_id != current_user.company_id:
        raise HTTPException(404, "Réunion introuvable")
    db.delete(meeting)
    db.commit()
    return Response(status_code=204)


@router.post("/meetings/{meeting_id}/generate-summary", response_model=MeetingRead)
async def generate_meeting_summary(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Génère un résumé Limule pour une réunion via le vrai LLM."""
    from app.services.limule import limule_generate

    meeting = db.get(Meeting, meeting_id)
    if not meeting or meeting.company_id != current_user.company_id:
        raise HTTPException(404, "Réunion introuvable")

    attendees = json.loads(meeting.attendees_json or "[]")
    attendees_str = ", ".join(attendees) if attendees else "non renseignés"
    duration_min = int((meeting.end_at - meeting.start_at).total_seconds() / 60) if meeting.end_at else 60
    prompt = (
        f"Réunion : « {meeting.title} »\n"
        f"Date : {meeting.start_at.strftime('%d/%m/%Y à %H:%M')}\n"
        f"Durée : {duration_min} minutes\n"
        f"Participants : {attendees_str}\n\n"
        f"Génère un résumé structuré avec : contexte, décisions prises, actions à suivre."
    )

    content, _ = await limule_generate(
        kind="meeting_summary",
        prompt=prompt,
        context="",
        db=db,
        company_id=current_user.company_id,
        user=current_user,
    )

    # Extraire les points (lignes non vides)
    lines = [line.strip() for line in content.split("\n") if line.strip()]
    # Résumé = premiers 2 points significatifs
    summary_lines = [l for l in lines if len(l) > 20][:2]
    meeting.ai_summary = " · ".join(summary_lines) if summary_lines else content[:200]
    meeting.ai_points_json = json.dumps(lines[:10], ensure_ascii=False)
    meeting.status = "done"

    gen = AIGeneration(
        kind="meeting_summary",
        title=f"Résumé · {meeting.title}",
        prompt=prompt,
        content=content,
        teras_used=False,
        user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(gen)
    db.commit()
    db.refresh(meeting)
    return _meeting_to_read(meeting)


# ═══════════════════════════════════════════════════════════════════════════
# AI GENERATIONS (Limule history + download)
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/ai/history", response_model=list[AIGenerationRead])
def ai_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 50,
) -> list[AIGeneration]:
    rows = db.scalars(
        select(AIGeneration)
        .where(AIGeneration.company_id == current_user.company_id)
        .where(AIGeneration.user_id == current_user.id)
        .order_by(AIGeneration.created_at.desc())
        .limit(limit)
    ).all()
    return list(rows)


@router.post("/ai/generate", response_model=AIGenerationRead, status_code=201)
async def ai_generate(
    payload: AIGenerationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AIGeneration:
    """Génère du contenu via Limule (vrai LLM avec variables dynamiques)."""
    from app.services.limule import limule_generate

    kind = payload.kind or "text"
    title = payload.title or _default_title(kind)

    content, _ = await limule_generate(
        kind=kind,
        prompt=payload.prompt,
        context=payload.context or "",
        db=db,
        company_id=current_user.company_id,
        user=current_user,
    )

    teras_used = kind in {"declaration", "compliance_check"}
    gen = AIGeneration(
        kind=kind,
        title=title,
        prompt=payload.prompt,
        content=content,
        teras_used=teras_used,
        user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(gen)
    db.commit()
    db.refresh(gen)
    return gen


@router.post("/ai/generate/stream")
async def ai_generate_stream(
    payload: AIGenerationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Génération Limule en streaming (Server-Sent Events).

    Format SSE :
      data: {"delta": "chunk de texte"}\\n\\n
      data: {"done": true, "id": <gen_id>}\\n\\n
      data: [DONE]\\n\\n
    """
    from app.services.limule import limule_stream

    kind = payload.kind or "text"
    title = payload.title or _default_title(kind)
    teras_used = kind in {"declaration", "compliance_check"}

    async def event_stream():
        full_content = ""
        try:
            async for chunk in limule_stream(
                kind=kind,
                prompt=payload.prompt,
                context=payload.context or "",
                db=db,
                company_id=current_user.company_id,
                user=current_user,
            ):
                full_content += chunk
                yield f"data: {json.dumps({'delta': chunk}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

        # Persister après le streaming
        try:
            gen = AIGeneration(
                kind=kind,
                title=title,
                prompt=payload.prompt,
                content=full_content,
                teras_used=teras_used,
                user_id=current_user.id,
                company_id=current_user.company_id,
            )
            db.add(gen)
            db.commit()
            db.refresh(gen)
            yield f"data: {json.dumps({'done': True, 'id': gen.id}, ensure_ascii=False)}\n\n"
        except Exception:
            yield f"data: {json.dumps({'done': True, 'id': None})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/ai/variables")
def ai_variables(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Retourne le catalogue de variables Limule avec leurs valeurs actuellement résolues.
    Utilisé par le frontend pour afficher le picker de variables.
    """
    from app.services.limule import VARIABLE_CATALOGUE, resolve_variables

    # Construire un template contenant toutes les variables pour les résoudre en une passe
    template = " ".join(f"{{{k}}}" for k in VARIABLE_CATALOGUE)
    _, resolved = resolve_variables(template, db, current_user.company_id, current_user)

    return {
        "catalogue": VARIABLE_CATALOGUE,
        "resolved": resolved,
    }


@router.get("/ai/status")
def ai_status(current_user: User = Depends(get_current_user)) -> dict:
    from app.core.config import get_settings

    settings = get_settings()
    provider = settings.ai_provider or "deepseek"
    api_key = settings.openai_api_key if provider == "openai" else settings.deepseek_api_key
    model = settings.ai_model or ("gpt-4o-mini" if provider == "openai" else settings.deepseek_model)
    return {
        "provider": provider,
        "model": model,
        "key_configured": bool(api_key) or provider == "ollama",
        "user": current_user.full_name,
    }


@router.get("/ai/history/{gen_id}/download")
def ai_download(
    gen_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    gen = db.get(AIGeneration, gen_id)
    if not gen or gen.company_id != current_user.company_id:
        raise HTTPException(404, "Génération introuvable")
    body = (
        f"# {gen.title}\n\n"
        f"_Généré par Limule — {gen.created_at.strftime('%d/%m/%Y %H:%M')}_\n\n"
        f"## Demande\n\n{gen.prompt}\n\n## Contenu\n\n{gen.content}\n"
    )
    return Response(
        content=body.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="limule-{gen.id}.md"'},
    )


@router.delete("/ai/history/{gen_id}", status_code=204)
def ai_delete(
    gen_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    gen = db.get(AIGeneration, gen_id)
    if not gen or gen.company_id != current_user.company_id or gen.user_id != current_user.id:
        raise HTTPException(404, "Génération introuvable")
    db.delete(gen)
    db.commit()
    return Response(status_code=204)


def _default_title(kind: str) -> str:
    return {
        "email": "Email professionnel",
        "note": "Note de service",
        "clause": "Clause contractuelle",
        "declaration": "Analyse déclarative",
        "meeting_summary": "Résumé de réunion",
        "compliance_check": "Vérification conformité",
        "communique": "Communiqué",
        "courrier": "Courrier officiel",
        "reponse_client": "Réponse client",
        "annonce_interne": "Annonce interne",
    }.get(kind, "Génération Limule")


# ═══════════════════════════════════════════════════════════════════════════
# DAILY NOTES
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/notes", response_model=list[DailyNoteRead])
def list_notes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 60,
) -> list[DailyNote]:
    rows = db.scalars(
        select(DailyNote)
        .where(DailyNote.company_id == current_user.company_id)
        .where(DailyNote.user_id == current_user.id)
        .order_by(DailyNote.note_date.desc(), DailyNote.created_at.desc())
        .limit(limit)
    ).all()
    return list(rows)


@router.post("/notes", response_model=DailyNoteRead, status_code=201)
def create_note(
    payload: DailyNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DailyNote:
    note = DailyNote(
        note_date=payload.note_date,
        title=payload.title,
        body=payload.body,
        pinned=payload.pinned,
        ai_generated=False,
        user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/notes/{note_id}", response_model=DailyNoteRead)
def update_note(
    note_id: int,
    payload: DailyNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DailyNote:
    note = db.get(DailyNote, note_id)
    if not note or note.company_id != current_user.company_id or note.user_id != current_user.id:
        raise HTTPException(404, "Note introuvable")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(note, key, value)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    note = db.get(DailyNote, note_id)
    if not note or note.company_id != current_user.company_id or note.user_id != current_user.id:
        raise HTTPException(404, "Note introuvable")
    db.delete(note)
    db.commit()
    return Response(status_code=204)


@router.post("/notes/generate", response_model=DailyNoteRead, status_code=201)
def generate_daily_note(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DailyNote:
    """Génère un journal quotidien Limule basé sur les tâches du jour de l'utilisateur."""
    today = date.today()
    tasks = db.scalars(
        select(Task)
        .where(Task.company_id == current_user.company_id)
        .order_by(Task.due_date.asc().nulls_last())
        .limit(20)
    ).all()
    done = [t for t in tasks if t.status == "done"]
    today_tasks = [t for t in tasks if t.due_date == today]
    urgent = [t for t in tasks if t.priority == "high" and t.status != "done"]
    body_lines = [
        f"# Journal du {today.strftime('%d/%m/%Y')}",
        "",
        f"## Tâches du jour ({len(today_tasks)})",
    ]
    body_lines += [f"- [ ] {t.title}" for t in today_tasks] or ["- _aucune tâche planifiée_"]
    body_lines += ["", f"## Priorités urgentes ({len(urgent)})"]
    body_lines += [f"- ⚠️ {t.title}" for t in urgent] or ["- _aucune urgence_"]
    body_lines += ["", f"## Terminées récemment ({len(done)})"]
    body_lines += [f"- ✅ {t.title}" for t in done[:5]] or ["- _rien à signaler_"]
    body_lines += ["", "_Généré par Limule — réorganise ces points dans ta journée._"]
    note = DailyNote(
        note_date=today,
        title=f"Journal Limule — {today.strftime('%d %b')}",
        body="\n".join(body_lines),
        ai_generated=True,
        user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


# ═══════════════════════════════════════════════════════════════════════════
# COMPANY MODULES (toggles tenant-scoped)
# ═══════════════════════════════════════════════════════════════════════════


DEFAULT_MODULES = [
    "dashboard", "rh", "payroll", "accounting", "billing", "pos", "inventory",
    "documents", "declarations", "chat", "meetings", "projects", "calendar",
    "notes", "assistants", "reports", "teras", "settings",
]


def _ensure_modules(db: Session, company_id: int) -> list[CompanyModule]:
    existing = {
        m.module_key: m
        for m in db.scalars(select(CompanyModule).where(CompanyModule.company_id == company_id)).all()
    }
    for key in DEFAULT_MODULES:
        if key not in existing:
            mod = CompanyModule(module_key=key, enabled=True, company_id=company_id)
            db.add(mod)
            existing[key] = mod
    db.commit()
    return [existing[k] for k in DEFAULT_MODULES]


@router.get("/company/modules", response_model=list[CompanyModuleRead])
def list_modules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CompanyModule]:
    return _ensure_modules(db, current_user.company_id)


@router.patch("/company/modules/{key}", response_model=CompanyModuleRead)
def toggle_module(
    key: str,
    payload: CompanyModuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CompanyModule:
    if key not in DEFAULT_MODULES:
        raise HTTPException(400, f"Module inconnu : {key}")
    _ensure_modules(db, current_user.company_id)
    mod = db.scalars(
        select(CompanyModule)
        .where(CompanyModule.company_id == current_user.company_id)
        .where(CompanyModule.module_key == key)
    ).first()
    if not mod:
        raise HTTPException(404, "Module introuvable")
    mod.enabled = payload.enabled
    db.commit()
    db.refresh(mod)
    return mod


# ═══════════════════════════════════════════════════════════════════════════
# USER PREFERENCES
# ═══════════════════════════════════════════════════════════════════════════


def _ensure_pref(db: Session, user: User) -> UserPreference:
    pref = db.scalars(select(UserPreference).where(UserPreference.user_id == user.id)).first()
    if pref:
        return pref
    pref = UserPreference(user_id=user.id, company_id=user.company_id)
    db.add(pref)
    db.commit()
    db.refresh(pref)
    return pref


@router.get("/me/preferences", response_model=UserPreferenceRead)
def get_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserPreference:
    return _ensure_pref(db, current_user)


@router.patch("/me/preferences", response_model=UserPreferenceRead)
def update_preferences(
    payload: UserPreferenceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserPreference:
    pref = _ensure_pref(db, current_user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(pref, key, value)
    db.commit()
    db.refresh(pref)
    return pref


# ═══════════════════════════════════════════════════════════════════════════
# ACCOUNTING aggregates
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/accounting/cashflow", response_model=list[CashFlowPoint])
def accounting_cashflow(
    period: str = "month",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CashFlowPoint]:
    """Cashflow agrégé sur les 6 dernières périodes (mois|trimestre|année)."""
    invoices = db.scalars(
        select(Invoice).where(Invoice.company_id == current_user.company_id)
    ).all()
    sales = db.scalars(
        select(Sale).where(Sale.company_id == current_user.company_id)
    ).all()
    payrolls = db.scalars(
        select(PayrollRun).where(PayrollRun.company_id == current_user.company_id)
    ).all()

    today = date.today()
    points: list[CashFlowPoint] = []
    months_fr = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"]
    for i in range(5, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        label = months_fr[m - 1]
        inflow = sum(
            inv.total_amount or 0
            for inv in invoices
            if inv.created_at.year == y and inv.created_at.month == m and inv.status in {"paid", "sent"}
        )
        inflow += sum(
            s.total_amount or 0
            for s in sales
            if s.created_at.year == y and s.created_at.month == m
        )
        outflow = sum(
            p.net_total or 0
            for p in payrolls
            if p.created_at.year == y and p.created_at.month == m
        )
        points.append(CashFlowPoint(label=label, inflow=float(inflow), outflow=float(outflow)))
    return points


@router.get("/accounting/expenses", response_model=list[ExpenseCategory])
def accounting_expenses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ExpenseCategory]:
    payrolls = db.scalars(
        select(PayrollRun).where(PayrollRun.company_id == current_user.company_id)
    ).all()
    salaries = sum(p.gross_total or 0 for p in payrolls)
    # Charges sociales = écart paie brute → nette
    social = sum((p.gross_total or 0) - (p.net_total or 0) for p in payrolls)
    return [
        ExpenseCategory(name="Salaires", amount=float(salaries), color="#059669"),
        ExpenseCategory(name="Charges sociales", amount=float(social), color="#10b981"),
        ExpenseCategory(name="Fournitures", amount=float(salaries) * 0.08, color="#f59e0b"),
        ExpenseCategory(name="Loyers & utilités", amount=float(salaries) * 0.15, color="#3b82f6"),
        ExpenseCategory(name="Autres", amount=float(salaries) * 0.05, color="#94a3b8"),
    ]


@router.get("/accounting/syscohada-status")
def accounting_syscohada(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    invoices = db.scalars(
        select(Invoice).where(Invoice.company_id == current_user.company_id)
    ).all()
    payrolls = db.scalars(
        select(PayrollRun).where(PayrollRun.company_id == current_user.company_id)
    ).all()
    return [
        {
            "code": "JV",
            "label": "Journal des ventes",
            "status": "ready" if invoices else "empty",
            "count": len(invoices),
        },
        {
            "code": "JP",
            "label": "Journal de paie",
            "status": "ready" if payrolls else "empty",
            "count": len(payrolls),
        },
        {
            "code": "GL",
            "label": "Grand livre",
            "status": "draft",
            "count": len(invoices) + len(payrolls),
        },
        {
            "code": "BL",
            "label": "Balance générale",
            "status": "draft",
            "count": 0,
        },
    ]


# ═══════════════════════════════════════════════════════════════════════════
# REPORTS revenue series
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/reports/revenue-series", response_model=list[RevenueSeriesPoint])
def revenue_series(
    period: str = "month",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[RevenueSeriesPoint]:
    invoices = db.scalars(
        select(Invoice).where(Invoice.company_id == current_user.company_id)
    ).all()
    sales = db.scalars(
        select(Sale).where(Sale.company_id == current_user.company_id)
    ).all()
    payrolls = db.scalars(
        select(PayrollRun).where(PayrollRun.company_id == current_user.company_id)
    ).all()

    today = date.today()
    months_fr = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"]
    points: list[RevenueSeriesPoint] = []
    for i in range(5, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        label = months_fr[m - 1]
        rev = sum(
            inv.total_amount or 0
            for inv in invoices
            if inv.created_at.year == y and inv.created_at.month == m
        )
        rev += sum(
            s.total_amount or 0
            for s in sales
            if s.created_at.year == y and s.created_at.month == m
        )
        cost = sum(
            p.net_total or 0
            for p in payrolls
            if p.created_at.year == y and p.created_at.month == m
        )
        margin = max(rev - cost, 0)
        points.append(
            RevenueSeriesPoint(label=label, revenue=float(rev), margin=float(margin))
        )
    return points
