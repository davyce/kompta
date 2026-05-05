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
from datetime import date, datetime, timedelta, timezone
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
    CompanyDocument,
    CompanyModule,
    DailyNote,
    Employee,
    Invoice,
    LimuleInteraction,
    Meeting,
    PayrollRun,
    Sale,
    Task,
    TerasAlert,
    Ticket,
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


def _json_list(value: str | None) -> list:
    try:
        parsed = json.loads(value or "[]")
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


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


# ═══════════════════════════════════════════════════════════════════════════
# LIMULE GLOBAL CONTEXT + TRAINING DATASET
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/limule/context")
def limule_context(
    page_path: str = "",
    module: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Retourne le contexte multi-pages que Limule peut utiliser pour raisonner."""
    from app.services.ai_context import LIMULE_CONTEXT_VERSION, render_limule_context_pack
    from app.services.limule_context import build_limule_context

    context = build_limule_context(
        db=db,
        company_id=current_user.company_id,
        user=current_user,
        page_path=page_path,
        focus_module=module,
    )
    return {
        "context_version": LIMULE_CONTEXT_VERSION,
        "module": context["module"],
        "page_path": context["page_path"],
        "summary": context["prompt_context"],
        "ai_context": render_limule_context_pack(context),
        "memory": context["memory"],
        "kpis": context["kpis"],
        "signals": context["signals"],
        "sources": context["sources"],
        "modules": context["modules"],
    }


@router.get("/limule/chat/history")
def limule_chat_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 12,
) -> list[dict]:
    """Retourne les derniers échanges du chat Limule pour l'utilisateur connecté."""
    safe_limit = max(1, min(int(limit or 12), 50))
    rows = db.scalars(
        select(LimuleInteraction)
        .where(LimuleInteraction.company_id == current_user.company_id)
        .where(LimuleInteraction.user_id == current_user.id)
        .order_by(LimuleInteraction.created_at.desc())
        .limit(safe_limit)
    ).all()

    return [
        {
            "id": row.id,
            "prompt": row.prompt,
            "response": row.response,
            "module": row.module_key,
            "intent": row.intent,
            "page_path": row.page_path,
            "sources": _json_list(row.context_sources),
            "signals": _json_list(row.detected_signals),
            "rating": row.rating,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in reversed(rows)
    ]


@router.post("/limule/chat", status_code=201)
async def limule_chat(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Copilot Limule contextualisé.

    Il lit une synthèse transverse des modules, génère une réponse, puis enregistre
    prompt/réponse/contexte dans une table exploitable par le super-admin.
    """
    from app.core.config import get_settings
    from app.services.ai_context import LIMULE_CONTEXT_VERSION
    from app.services.limule import limule_generate
    from app.services.limule_context import build_limule_context, detect_intent, training_tags

    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt requis")
    page_path = str(payload.get("page_path") or "")
    requested_module = payload.get("module")
    conversation_history = payload.get("conversation_history") or []

    context = build_limule_context(
        db=db,
        company_id=current_user.company_id,
        user=current_user,
        page_path=page_path,
        focus_module=str(requested_module) if requested_module else None,
    )
    intent = detect_intent(prompt)
    module_key = context["module"]

    # Intents analytiques complexes → plus de tokens pour des réponses détaillées
    _HEAVY_INTENTS = {"prediction_economique", "conseil_investissement", "analyse_secteur", "tresorerie", "risk_analysis"}
    _max_tokens = 2800 if intent in _HEAVY_INTENTS else 1600

    content, _ = await limule_generate(
        kind=intent,
        prompt=prompt,
        context=context["prompt_context"],
        structured_context=context,
        db=db,
        company_id=current_user.company_id,
        user=current_user,
        max_tokens=_max_tokens,
        temperature=0.3 if intent in _HEAVY_INTENTS else 0.4,
        conversation_history=conversation_history,
    )

    tags = training_tags(prompt, context, intent)
    settings = get_settings()
    interaction = LimuleInteraction(
        prompt=prompt,
        response=content,
        page_path=page_path,
        module_key=module_key,
        intent=intent,
        model=settings.ai_model or settings.deepseek_model or "limule",
        provider=settings.ai_provider or "limule",
        context_snapshot=json.dumps(context, ensure_ascii=False, default=str),
        context_sources=json.dumps(context["sources"], ensure_ascii=False),
        detected_signals=json.dumps(context["signals"], ensure_ascii=False),
        training_tags=json.dumps(tags, ensure_ascii=False),
        user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(interaction)
    db.add(
        AIGeneration(
            kind=intent,
            title=f"Limule · {module_key}",
            prompt=prompt,
            content=content,
            model=interaction.model,
            teras_used=any(tag == "teras" or tag.startswith("severity:") for tag in tags),
            user_id=current_user.id,
            company_id=current_user.company_id,
        )
    )
    db.commit()
    db.refresh(interaction)

    return {
        "interaction_id": interaction.id,
        "answer": content,
        "context_version": LIMULE_CONTEXT_VERSION,
        "module": module_key,
        "intent": intent,
        "sources": context["sources"],
        "signals": context["signals"],
        "training_tags": tags,
        "context_summary": context["prompt_context"],
        "confidence": 88 if context["signals"] else 78,
    }


@router.post("/limule/chat/stream")
async def limule_chat_stream(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Copilot Limule en streaming (SSE).

    Format SSE :
      data: {"delta": "chunk de texte"}\\n\\n
      data: {"done": true, "interaction_id": 123, "intent": "...", "module": "...",
             "sources": [...], "signals": [...]}\\n\\n
      data: [DONE]\\n\\n
    """
    from app.core.config import get_settings
    from app.services.ai_context import LIMULE_CONTEXT_VERSION
    from app.services.limule import limule_stream
    from app.services.limule_context import build_limule_context, detect_intent, training_tags

    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt requis")
    page_path = str(payload.get("page_path") or "")
    requested_module = payload.get("module")
    conversation_history = payload.get("conversation_history") or []

    context = build_limule_context(
        db=db,
        company_id=current_user.company_id,
        user=current_user,
        page_path=page_path,
        focus_module=str(requested_module) if requested_module else None,
    )
    intent = detect_intent(prompt)
    module_key = context["module"]

    _HEAVY_INTENTS = {"prediction_economique", "conseil_investissement", "analyse_secteur", "tresorerie", "risk_analysis"}
    _max_tokens = 2800 if intent in _HEAVY_INTENTS else 1600

    settings = get_settings()

    async def event_stream():
        full_content = ""
        try:
            async for chunk in limule_stream(
                kind=intent,
                prompt=prompt,
                context=context["prompt_context"],
                structured_context=context,
                db=db,
                company_id=current_user.company_id,
                user=current_user,
                max_tokens=_max_tokens,
                temperature=0.3 if intent in _HEAVY_INTENTS else 0.4,
                conversation_history=conversation_history,
            ):
                full_content += chunk
                yield f"data: {json.dumps({'delta': chunk}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

        # Persister l'interaction après le streaming
        try:
            tags = training_tags(prompt, context, intent)
            interaction = LimuleInteraction(
                prompt=prompt,
                response=full_content,
                page_path=page_path,
                module_key=module_key,
                intent=intent,
                model=settings.ai_model or settings.deepseek_model or "limule",
                provider=settings.ai_provider or "limule",
                context_snapshot=json.dumps(context, ensure_ascii=False, default=str),
                context_sources=json.dumps(context["sources"], ensure_ascii=False),
                detected_signals=json.dumps(context["signals"], ensure_ascii=False),
                training_tags=json.dumps(tags, ensure_ascii=False),
                user_id=current_user.id,
                company_id=current_user.company_id,
            )
            db.add(interaction)
            db.add(AIGeneration(
                kind=intent,
                title=f"Limule · {module_key}",
                prompt=prompt,
                content=full_content,
                model=interaction.model,
                teras_used=any(t == "teras" or t.startswith("severity:") for t in tags),
                user_id=current_user.id,
                company_id=current_user.company_id,
            ))
            db.commit()
            db.refresh(interaction)
            yield f"data: {json.dumps({'done': True, 'interaction_id': interaction.id, 'intent': intent, 'module': module_key, 'sources': context['sources'], 'signals': context['signals']}, ensure_ascii=False)}\n\n"
        except Exception:
            yield f"data: {json.dumps({'done': True, 'interaction_id': None, 'intent': intent, 'module': module_key, 'sources': [], 'signals': []})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.patch("/limule/interactions/{interaction_id}/feedback")
def limule_feedback(
    interaction_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    interaction = db.get(LimuleInteraction, interaction_id)
    if not interaction or interaction.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Interaction Limule introuvable")
    rating = payload.get("rating")
    if rating is not None:
        try:
            interaction.rating = max(1, min(5, int(rating)))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Note invalide")
    if "feedback" in payload:
        interaction.feedback = str(payload.get("feedback") or "")[:1200]
    db.commit()
    return {"id": interaction.id, "rating": interaction.rating, "feedback": interaction.feedback}


def _require_super_admin(current_user: User) -> None:
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super-admin access required")


@router.get("/admin/limule/insights")
def admin_limule_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _require_super_admin(current_user)
    since = datetime.now(timezone.utc) - timedelta(days=7)
    total = db.scalar(select(func.count()).select_from(LimuleInteraction)) or 0
    last7 = db.scalar(
        select(func.count()).select_from(LimuleInteraction).where(LimuleInteraction.created_at >= since)
    ) or 0
    rated = db.scalar(
        select(func.count()).select_from(LimuleInteraction).where(LimuleInteraction.rating.is_not(None))
    ) or 0
    avg_rating = db.scalar(select(func.avg(LimuleInteraction.rating)).where(LimuleInteraction.rating.is_not(None))) or 0
    by_module_rows = db.execute(
        select(LimuleInteraction.module_key, func.count())
        .group_by(LimuleInteraction.module_key)
        .order_by(func.count().desc())
    ).all()
    by_intent_rows = db.execute(
        select(LimuleInteraction.intent, func.count())
        .group_by(LimuleInteraction.intent)
        .order_by(func.count().desc())
    ).all()
    recent = db.scalars(
        select(LimuleInteraction).order_by(LimuleInteraction.created_at.desc()).limit(8)
    ).all()
    company_names = {c.id: c.name for c in db.scalars(select(Company)).all()}
    return {
        "total_interactions": int(total),
        "last_7_days": int(last7),
        "rated": int(rated),
        "avg_rating": round(float(avg_rating), 2) if avg_rating else 0,
        "training_ready": int(db.scalar(
            select(func.count()).select_from(LimuleInteraction).where(LimuleInteraction.rating >= 4)
        ) or 0),
        "by_module": [{"module": module, "count": int(count)} for module, count in by_module_rows],
        "by_intent": [{"intent": intent, "count": int(count)} for intent, count in by_intent_rows],
        "recent": [
            {
                "id": row.id,
                "company": company_names.get(row.company_id, ""),
                "module": row.module_key,
                "intent": row.intent,
                "prompt": row.prompt[:180],
                "tags": json.loads(row.training_tags or "[]"),
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in recent
        ],
    }


@router.post("/admin/limule/chat", status_code=201)
async def admin_limule_chat(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Grand Sage superadmin: analyse cross-tenant et recommandations plateforme."""
    _require_super_admin(current_user)
    from app.core.config import get_settings
    from app.services.limule import limule_generate

    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt requis")

    companies = db.scalars(select(Company).order_by(Company.created_at.desc())).all()
    tickets = db.scalars(select(Ticket).order_by(Ticket.created_at.desc()).limit(10)).all()
    alerts = db.scalars(
        select(TerasAlert).where(TerasAlert.status == "open").order_by(TerasAlert.created_at.desc()).limit(10)
    ).all()
    users_count = db.scalar(select(func.count()).select_from(User)) or 0
    employees_count = db.scalar(select(func.count()).select_from(Employee)) or 0
    invoices_count = db.scalar(select(func.count()).select_from(Invoice)) or 0
    sales_total = db.scalar(select(func.coalesce(func.sum(Sale.total_amount), 0))) or 0
    limule_total = db.scalar(select(func.count()).select_from(LimuleInteraction)) or 0
    tickets_open = sum(1 for ticket in tickets if ticket.status in {"open", "in_progress"})
    tickets_critical = sum(1 for ticket in tickets if ticket.priority == "critical" and ticket.status != "closed")
    avg_teras = round(sum(c.teras_score for c in companies) / len(companies), 1) if companies else 0
    company_names = {c.id: c.name for c in companies}
    risk_companies = sorted(companies, key=lambda company: (company.teras_score, -company.completion_score))[:5]

    context_lines = [
        "Cockpit superadmin KOMPTA Grand Sage",
        f"Entreprises: {len(companies)} | Utilisateurs: {users_count} | Employés: {employees_count}",
        f"Factures: {invoices_count} | CA plateforme: {float(sales_total):,.0f} XAF".replace(",", " "),
        f"Tickets récents ouverts: {tickets_open} | critiques: {tickets_critical}",
        f"Alertes TERAS ouvertes: {len(alerts)} | Score TERAS moyen: {avg_teras}/100",
        f"Interactions Limule enregistrées: {limule_total}",
        "",
        "Entreprises à surveiller:",
        *[
            f"- {company.name}: TERAS {company.teras_score}/100, setup {company.completion_score}%, {company.industry}, {company.country}"
            for company in risk_companies
        ],
        "",
        "Tickets récents:",
        *[
            f"- #{ticket.id} {ticket.priority}/{ticket.status} | {company_names.get(ticket.company_id, 'Plateforme')} | {ticket.subject}"
            for ticket in tickets[:6]
        ],
        "",
        "Alertes TERAS récentes:",
        *[
            f"- {alert.severity}/{alert.module}: {alert.title}"
            for alert in alerts[:6]
        ],
    ]
    structured_context = {
        "module": "superadmin",
        "page_path": "/admin/limule",
        "summary": "\n".join(context_lines),
        "sources": ["admin_overview", "admin_companies", "admin_tickets", "teras_alerts", "limule_dataset"],
        "signals": [
            {"label": "Tickets critiques", "severity": "critical", "module": "support", "value": tickets_critical},
            {"label": "Alertes TERAS ouvertes", "severity": "high", "module": "teras", "value": len(alerts)},
            {"label": "Score TERAS moyen", "severity": "info", "module": "platform", "value": avg_teras},
        ],
        "kpis": {
            "companies": len(companies),
            "users": int(users_count),
            "employees": int(employees_count),
            "sales_total": float(sales_total),
            "tickets_open": tickets_open,
            "tickets_critical": tickets_critical,
            "alerts_open": len(alerts),
            "avg_teras": avg_teras,
            "limule_interactions": int(limule_total),
        },
        "modules": {
            "risk_companies": [
                {"id": c.id, "name": c.name, "teras_score": c.teras_score, "completion_score": c.completion_score}
                for c in risk_companies
            ],
            "tickets": [
                {"id": t.id, "subject": t.subject, "status": t.status, "priority": t.priority, "company": company_names.get(t.company_id, "")}
                for t in tickets[:10]
            ],
            "alerts": [
                {"id": a.id, "title": a.title, "severity": a.severity, "module": a.module}
                for a in alerts[:10]
            ],
        },
    }
    content, _ = await limule_generate(
        kind="platform_admin",
        prompt=prompt,
        context="\n".join(context_lines),
        structured_context=structured_context,
        db=db,
        company_id=current_user.company_id,
        user=current_user,
        max_tokens=1400,
        temperature=0.25,
    )

    settings = get_settings()
    interaction = LimuleInteraction(
        prompt=prompt,
        response=content,
        page_path="/admin/limule",
        module_key="superadmin",
        intent="platform_admin",
        model=settings.ai_model or settings.deepseek_model or "limule-grand-sage",
        provider=settings.ai_provider or "limule",
        context_snapshot=json.dumps(structured_context, ensure_ascii=False, default=str),
        context_sources=json.dumps(structured_context["sources"], ensure_ascii=False),
        detected_signals=json.dumps(structured_context["signals"], ensure_ascii=False),
        training_tags=json.dumps(["superadmin", "platform", "grand_sage"], ensure_ascii=False),
        user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return {
        "interaction_id": interaction.id,
        "answer": content,
        "sources": structured_context["sources"],
        "signals": structured_context["signals"],
        "kpis": structured_context["kpis"],
    }


@router.get("/admin/limule/dataset")
def admin_limule_dataset(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 100,
    company_id: int | None = None,
    module: str | None = None,
) -> list[dict]:
    _require_super_admin(current_user)
    from app.services.limule_context import build_training_record

    stmt = select(LimuleInteraction)
    if company_id:
        stmt = stmt.where(LimuleInteraction.company_id == company_id)
    if module:
        stmt = stmt.where(LimuleInteraction.module_key == module)
    stmt = stmt.order_by(LimuleInteraction.created_at.desc()).limit(min(limit, 500))
    rows = db.scalars(stmt).all()
    companies = {c.id: c for c in db.scalars(select(Company)).all()}
    return [build_training_record(row, companies.get(row.company_id)) for row in rows]


@router.get("/admin/limule/dataset/export")
def admin_limule_dataset_export(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 500,
) -> Response:
    _require_super_admin(current_user)
    from app.services.limule_context import build_training_record

    rows = db.scalars(
        select(LimuleInteraction).order_by(LimuleInteraction.created_at.desc()).limit(min(limit, 2000))
    ).all()
    companies = {c.id: c for c in db.scalars(select(Company)).all()}
    jsonl = "\n".join(
        json.dumps(build_training_record(row, companies.get(row.company_id)), ensure_ascii=False, default=str)
        for row in rows
    )
    return Response(
        content=jsonl.encode("utf-8"),
        media_type="application/x-ndjson; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="limule-training-dataset.jsonl"'},
    )


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
    open_tasks = [t for t in tasks if t.status != "done"]
    next_task = today_tasks[0] if today_tasks else (urgent[0] if urgent else (open_tasks[0] if open_tasks else None))
    body_lines = [
        f"# Journal du {today.strftime('%d/%m/%Y')}",
        "",
        "## Synthèse Limule",
        (
            f"Limule détecte {len(today_tasks)} tâche(s) prévues aujourd'hui, "
            f"{len(urgent)} priorité(s) haute(s), {len(done[:5])} action(s) récemment terminée(s)."
        ),
        "",
        "## À faire aujourd'hui",
    ]
    body_lines += [
        f"- [ ] {t.title}" + (f" — {t.assignee_name}" if t.assignee_name else "")
        for t in today_tasks
    ] or ["- _Aucune tâche planifiée aujourd'hui._"]
    body_lines += ["", "## Priorités et risques"]
    body_lines += [
        f"- {t.title}" + (f" — échéance {t.due_date.strftime('%d/%m/%Y')}" if t.due_date else "")
        for t in urgent
    ] or ["- _Aucune priorité haute ouverte._"]
    body_lines += ["", "## Réalisé récemment"]
    body_lines += [
        f"- {t.title}" + (f" — {t.assignee_name}" if t.assignee_name else "")
        for t in done[:5]
    ] or ["- _Rien à signaler._"]
    body_lines += ["", "## Prochaine meilleure action"]
    body_lines += [f"- {next_task.title}" if next_task else "- Vérifier les alertes TERAS et planifier les prochaines actions."]
    body_lines += ["", "_Généré par Limule — à valider et compléter par l'équipe._"]
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


# ═══════════════════════════════════════════════════════════════════════════
# LIMULE — Analyse & Chat documentaire
# ═══════════════════════════════════════════════════════════════════════════


@router.post("/limule/documents/{doc_id}/analyze")
async def limule_analyze_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Déclenche le pipeline complet d'extraction sur un document existant :
    - Re-lecture du fichier depuis le disque
    - Extraction texte brut (PDF / Excel / Word / CSV…)
    - Extraction LLM structurée (montants, parties, risques…)
    - Ingestion automatique dans la DB (factures, etc.)
    Retourne les données extraites + le résumé.
    """
    doc = db.get(CompanyDocument, doc_id)
    if not doc or doc.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Document introuvable")

    from app.services.documents import reanalyze_document, get_document_extracted

    updated = await reanalyze_document(db, document=doc, full_reextract=True)
    extracted = get_document_extracted(updated)

    return {
        "id": updated.id,
        "title": updated.title,
        "document_type": updated.document_type,
        "ai_summary": updated.ai_summary,
        "ai_tags": updated.ai_tags,
        "confidence": updated.confidence,
        "text_length": updated.text_length,
        "parse_method": updated.parse_method,
        "extracted": extracted,
    }


@router.post("/limule/documents/{doc_id}/chat")
async def limule_document_chat(
    doc_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Permet d'interroger Limule sur le contenu d'un document spécifique.
    Le texte brut extrait + les données structurées sont injectés comme contexte.

    Body: { "prompt": str, "conversation_history": [...] }
    """
    doc = db.get(CompanyDocument, doc_id)
    if not doc or doc.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Document introuvable")

    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="prompt requis")

    from app.services.limule import limule_generate
    from app.services.limule_context import build_limule_context, detect_intent, training_tags
    from app.services.ai_context import build_limule_system_prompt, render_limule_context_pack
    from app.services.doc_extractor import format_extracted_for_context
    from app.services.documents import get_document_extracted
    from app.core.config import get_settings

    # Contexte entreprise global
    ctx = build_limule_context(db, current_user.company_id, current_user)
    intent = detect_intent(prompt)

    # Données du document
    extracted = get_document_extracted(doc)
    doc_context_text = format_extracted_for_context(extracted, title=doc.title)

    # Texte brut tronqué pour le LLM (12 000 chars max)
    raw_text_snippet = (doc.raw_text or "")[:12_000]

    # Construit le system prompt adapté à l'analyse documentaire
    system = build_limule_system_prompt(
        kind="document_analysis",
        user=current_user,
        module_key="documents",
        intent=intent,
        context=ctx,
    )

    # Construit le user message avec le contenu du document
    doc_block = ""
    if doc_context_text:
        doc_block += f"\n\n=== DONNÉES EXTRAITES DU DOCUMENT ===\n{doc_context_text}"
    if raw_text_snippet:
        doc_block += f"\n\n=== TEXTE BRUT DU DOCUMENT (extrait) ===\n{raw_text_snippet}"

    ctx_text = render_limule_context_pack(ctx)
    full_prompt = (
        f"L'utilisateur analyse le document : « {doc.title} » (type: {doc.document_type})\n"
        f"Question: {prompt}"
        f"{doc_block}\n\n"
        f"Contexte entreprise:\n{ctx_text}"
    )

    # Historique de conversation
    conversation_history = payload.get("conversation_history") or []

    # Appel LLM
    answer = await limule_generate(
        user_msg=full_prompt,
        system=system,
        conversation_history=conversation_history,
    )

    # Persistance
    interaction_id = None
    try:
        _tags = training_tags(prompt, ctx, intent)
        _settings = get_settings()
        _interaction = LimuleInteraction(
            prompt=prompt,
            response=answer,
            page_path=f"/documents/{doc_id}",
            module_key="documents",
            intent=intent,
            model=_settings.ai_model or _settings.deepseek_model or "limule",
            provider=_settings.ai_provider or "limule",
            context_snapshot=json.dumps(ctx, ensure_ascii=False, default=str),
            context_sources=json.dumps(["documents", "extracted_data", "raw_text"], ensure_ascii=False),
            detected_signals=json.dumps([], ensure_ascii=False),
            training_tags=json.dumps(_tags, ensure_ascii=False),
            user_id=current_user.id,
            company_id=current_user.company_id,
        )
        db.add(_interaction)
        db.add(AIGeneration(
            kind=intent,
            title=f"Limule · documents · {doc.title[:60]}",
            prompt=prompt,
            content=answer,
            model=_interaction.model,
            teras_used=False,
            user_id=current_user.id,
            company_id=current_user.company_id,
        ))
        db.commit()
        db.refresh(_interaction)
        interaction_id = _interaction.id
    except Exception:
        pass

    return {
        "interaction_id": interaction_id,
        "response": answer,
        "document": {
            "id": doc.id,
            "title": doc.title,
            "type": doc.document_type,
            "confidence": doc.confidence,
            "text_length": doc.text_length,
        },
        "intent": intent,
        "module": "documents",
        "sources": ["documents", "extracted_data", "raw_text", "limule_context"],
    }


@router.post("/limule/documents/{doc_id}/chat/stream")
async def limule_document_chat_stream(
    doc_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Version streaming SSE du chat documentaire Limule.
    """
    doc = db.get(CompanyDocument, doc_id)
    if not doc or doc.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Document introuvable")

    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="prompt requis")

    from app.services.limule import limule_stream
    from app.services.limule_context import build_limule_context, detect_intent
    from app.services.ai_context import build_limule_system_prompt, render_limule_context_pack
    from app.services.doc_extractor import format_extracted_for_context
    from app.services.documents import get_document_extracted

    ctx = build_limule_context(db, current_user.company_id, current_user)
    intent = detect_intent(prompt)
    extracted = get_document_extracted(doc)
    doc_context_text = format_extracted_for_context(extracted, title=doc.title)
    raw_text_snippet = (doc.raw_text or "")[:12_000]

    system = build_limule_system_prompt(
        kind="document_analysis",
        user=current_user,
        module_key="documents",
        intent=intent,
        context=ctx,
    )

    doc_block = ""
    if doc_context_text:
        doc_block += f"\n\n=== DONNÉES EXTRAITES DU DOCUMENT ===\n{doc_context_text}"
    if raw_text_snippet:
        doc_block += f"\n\n=== TEXTE BRUT DU DOCUMENT (extrait) ===\n{raw_text_snippet}"

    ctx_text = render_limule_context_pack(ctx)
    full_prompt = (
        f"L'utilisateur analyse le document : « {doc.title} » (type: {doc.document_type})\n"
        f"Question: {prompt}"
        f"{doc_block}\n\n"
        f"Contexte entreprise:\n{ctx_text}"
    )

    conversation_history = payload.get("conversation_history") or []

    async def event_stream():
        full_text = ""
        async for chunk in limule_stream(
            user_msg=full_prompt,
            system=system,
            conversation_history=conversation_history,
        ):
            full_text += chunk
            yield f"data: {json.dumps({'delta': chunk}, ensure_ascii=False)}\n\n"

        # Persistance de l'interaction
        interaction_id = None
        try:
            from app.services.limule_context import training_tags
            from app.core.config import get_settings as _gs
            _tags = training_tags(prompt, ctx, intent)
            _settings = _gs()
            _interaction = LimuleInteraction(
                prompt=prompt,
                response=full_text,
                page_path=f"/documents/{doc_id}",
                module_key="documents",
                intent=intent,
                model=_settings.ai_model or _settings.deepseek_model or "limule",
                provider=_settings.ai_provider or "limule",
                context_snapshot=json.dumps(ctx, ensure_ascii=False, default=str),
                context_sources=json.dumps(["documents", "extracted_data", "raw_text"], ensure_ascii=False),
                detected_signals=json.dumps([], ensure_ascii=False),
                training_tags=json.dumps(_tags, ensure_ascii=False),
                user_id=current_user.id,
                company_id=current_user.company_id,
            )
            db.add(_interaction)
            db.add(AIGeneration(
                kind=intent,
                title=f"Limule · documents · {doc.title[:60]}",
                prompt=prompt,
                content=full_text,
                model=_interaction.model,
                teras_used=False,
                user_id=current_user.id,
                company_id=current_user.company_id,
            ))
            db.commit()
            db.refresh(_interaction)
            interaction_id = _interaction.id
        except Exception:
            pass

        meta = json.dumps({
            "done": True,
            "interaction_id": interaction_id,
            "intent": intent,
            "module": "documents",
            "sources": ["documents", "extracted_data", "raw_text"],
            "signals": [],
        }, ensure_ascii=False)
        yield f"data: {meta}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
