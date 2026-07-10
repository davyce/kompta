"""
Endpoints additionnels pour la passe "remove all mocks" :
- Meetings (CRUD + AI summary)
- AI Generations (Limule history persistant + téléchargeable)
- Daily Notes (lecture + écriture utilisateur + IA)
- Company Modules (toggles tenant-scoped)
- User Preferences
- Accounting aggregates (cashflow, expenses, syscemac)
- Reports revenue-series

Tous les endpoints sont scopés par company_id (multi-tenant) et exigent un user authentifié.
"""

from __future__ import annotations

import asyncio
import io
import json
import re
import zlib
from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from fastapi import Query
from app.api.deps import get_current_user
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import (
    AIGeneration,
    BankTransaction,
    BroadcastLog,
    Company,
    CompanyDocument,
    CompanyModule,
    DailyNote,
    Employee,
    ExchangeRate,
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
from app.services.readiness import build_business_insights
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
    """Retourne le contexte multi-pages que Limule peut utiliser pour raisonner.
    Le contexte est filtré selon le rôle : les données RH/paie/documents extraits
    ne sont visibles que pour les rôles autorisés.
    """
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


@router.get("/limule/history")
def limule_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 30,
) -> list[dict]:
    """Historique compact des Q&A Limule pour l'utilisateur courant.

    Retourne les `limit` dernières interactions ordonnées par date décroissante.
    Format compact (id, question, answer, module, intent, created_at) destiné à
    la sidebar « Mes dernières questions ».
    """
    safe_limit = max(1, min(int(limit or 30), 100))
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
            "question": row.prompt,
            "answer": row.response,
            "module": row.module_key,
            "intent": row.intent,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.get("/limule/alerts")
def limule_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Alertes proactives Limule pour le dashboard.

    Retourne une liste d'alertes structurées (factures en retard, stock bas,
    trésorerie faible, anniversaires de membres, cotisations en retard).
    """
    from app.services.limule_alerts import compute_dashboard_alerts

    return compute_dashboard_alerts(db=db, company_id=current_user.company_id, user=current_user)


@router.get("/limule/business-insights")
def limule_business_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Insights opérationnels réels : forecast trésorerie, anomalies, actions.

    Aucun appel LLM ni donnée inventée : la réponse expose ses sources et renvoie
    `data_quality=empty` si l'entreprise n'a pas encore de données.
    """
    return build_business_insights(db, current_user.company_id)


@router.get("/currency/convert")
def currency_convert(
    amount: float = 1.0,
    from_currency: str = Query("XAF", alias="from"),
    to_currency: str = Query("EUR", alias="to"),
) -> dict:
    """Convertit un montant d'une devise vers une autre via exchangerate.host.

    Fallback déterministe si l'API est indisponible (pas besoin de réseau).
    """
    from app.services.exchange_rates import convert as _convert

    return _convert(amount=amount, from_currency=from_currency, to_currency=to_currency)


@router.get("/currency/rates")
def currency_rates(
    base: str = "XAF",
) -> dict:
    """Retourne les taux courants pour quelques devises majeures depuis `base`."""
    from app.services.exchange_rates import rates_for_base

    return rates_for_base(base=base)


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
    _HEAVY_INTENTS = {
        "prediction_economique", "conseil_investissement", "analyse_secteur", "tresorerie",
        "risk_analysis", "analyse", "rh_analyse", "payroll_analyse", "bilan", "rapport",
        "diagnostic", "evaluation", "synthese", "question",
    }
    _max_tokens = 3500 if intent in _HEAVY_INTENTS else 2200

    usage: dict[str, int] = {}
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
        usage_out=usage,
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
        prompt_tokens=usage.get("prompt_tokens"),
        completion_tokens=usage.get("completion_tokens"),
        tokens_used=usage.get("total_tokens"),
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
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            tokens_used=usage.get("total_tokens"),
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

    _HEAVY_INTENTS = {
        "prediction_economique", "conseil_investissement", "analyse_secteur", "tresorerie",
        "risk_analysis", "analyse", "rh_analyse", "payroll_analyse", "bilan", "rapport",
        "diagnostic", "evaluation", "synthese", "question",
    }
    _max_tokens = 3500 if intent in _HEAVY_INTENTS else 2200

    settings = get_settings()

    async def event_stream():
        full_content = ""
        usage: dict[str, int] = {}
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
                usage_out=usage,
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
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                tokens_used=usage.get("total_tokens"),
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
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                tokens_used=usage.get("total_tokens"),
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


@router.delete("/limule/interactions/{interaction_id}", status_code=204)
def limule_delete_interaction(
    interaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Supprime un échange Limule (propriétaire uniquement)."""
    interaction = db.get(LimuleInteraction, interaction_id)
    if not interaction or interaction.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Interaction Limule introuvable")
    db.delete(interaction)
    db.commit()


@router.delete("/limule/chat/history", status_code=204)
def limule_clear_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Efface tout l'historique de chat Limule pour l'utilisateur courant."""
    interactions = db.scalars(
        select(LimuleInteraction)
        .where(LimuleInteraction.company_id == current_user.company_id)
        .where(LimuleInteraction.user_id == current_user.id)
    ).all()
    for interaction in interactions:
        db.delete(interaction)
    db.commit()


def _require_super_admin(current_user: User) -> None:
    if current_user.role != "super_admin" and not (current_user.custom_role and current_user.custom_role.scope == "admin"):
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
    # Consommation réelle de tokens (mesurée depuis la réponse du fournisseur LLM,
    # PAS une estimation forfaitaire). Peut être partielle si l'historique est ancien
    # (colonnes ajoutées après coup) ou si le fournisseur ne renvoie pas d'usage.
    tokens_measured = db.scalar(
        select(func.count()).select_from(LimuleInteraction).where(LimuleInteraction.tokens_used.is_not(None))
    ) or 0
    avg_tokens = db.scalar(
        select(func.avg(LimuleInteraction.tokens_used)).where(LimuleInteraction.tokens_used.is_not(None))
    )
    total_tokens = db.scalar(
        select(func.coalesce(func.sum(LimuleInteraction.tokens_used), 0))
    ) or 0
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
        # Tokens : données réelles mesurées depuis les réponses du fournisseur LLM.
        # tokens_measured = nb d'interactions pour lesquelles on a un compteur réel ;
        # avg_tokens_per_interaction est null si aucune donnée mesurée n'existe encore.
        "tokens_measured": int(tokens_measured),
        "avg_tokens_per_interaction": round(float(avg_tokens), 1) if avg_tokens else None,
        "total_tokens": int(total_tokens),
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
        f"Factures: {invoices_count} | CA plateforme: {float(sales_total):,.0f} (multi-devises)".replace(",", " "),
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
    usage: dict[str, int] = {}
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
        usage_out=usage,
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
        prompt_tokens=usage.get("prompt_tokens"),
        completion_tokens=usage.get("completion_tokens"),
        tokens_used=usage.get("total_tokens"),
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
) -> StreamingResponse:
    from app.services.pdf_export import build_limule_pdf
    from app.models import Company

    gen = db.get(AIGeneration, gen_id)
    if not gen or gen.company_id != current_user.company_id:
        raise HTTPException(404, "Génération introuvable")

    company = db.get(Company, current_user.company_id)
    company_name = company.name if company else "KOMPTA"

    pdf_bytes = build_limule_pdf(
        title=gen.title or "Document Limule",
        content=gen.content or "",
        prompt=gen.prompt or "",
        generated_at=gen.created_at.strftime("%d/%m/%Y %H:%M"),
        company_name=company_name,
        kind=gen.kind or "text",
    )

    safe_title = re.sub(r"[^\w\-]", "_", gen.title or "limule")[:40]
    date_str = gen.created_at.strftime("%Y%m%d")
    filename = f"limule-{safe_title}-{date_str}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/ai/content/pdf")
def ai_content_pdf(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Génère un PDF à partir d'un contenu Limule arbitraire (fallback chat)."""
    from app.services.pdf_export import build_limule_pdf
    from app.models import Company

    company = db.get(Company, current_user.company_id)
    company_name = company.name if company else "KOMPTA"

    title   = str(payload.get("title") or "Réponse Limule")
    content = str(payload.get("content") or "")
    prompt  = str(payload.get("prompt") or "")
    kind    = str(payload.get("kind") or "text")

    pdf_bytes = build_limule_pdf(
        title=title,
        content=content,
        prompt=prompt,
        generated_at=datetime.now().strftime("%d/%m/%Y %H:%M"),
        company_name=company_name,
        kind=kind,
    )

    safe = re.sub(r"[^\w\-]", "_", title)[:40]
    filename = f"limule-{safe}-{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
    """Génère un journal quotidien Limule basé sur les tâches, réunions et activité du jour."""
    today = date.today()
    now = datetime.now(timezone.utc)
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

    # Réunions du jour
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)
    today_meetings = db.scalars(
        select(Meeting)
        .where(
            Meeting.company_id == current_user.company_id,
            Meeting.start_at >= today_start,
            Meeting.start_at < today_end,
        )
        .order_by(Meeting.start_at.asc())
    ).all()
    upcoming_meetings = db.scalars(
        select(Meeting)
        .where(
            Meeting.company_id == current_user.company_id,
            Meeting.start_at >= now,
        )
        .order_by(Meeting.start_at.asc())
        .limit(5)
    ).all()

    body_lines = [
        f"# Journal du {today.strftime('%d/%m/%Y')}",
        "",
        "## Synthèse Limule",
        (
            f"Limule détecte {len(today_tasks)} tâche(s) prévues aujourd'hui, "
            f"{len(urgent)} priorité(s) haute(s), {len(done[:5])} action(s) récemment terminée(s), "
            f"{len(today_meetings)} réunion(s) prévues ce jour."
        ),
        "",
        "## Réunions du jour",
    ]
    body_lines += [
        f"- {m.start_at.strftime('%H:%M')} — **{m.title}**" + (f" ({m.tag})" if m.tag else "")
        + (f" : {m.ai_summary[:120]}…" if m.ai_summary else "")
        for m in today_meetings
    ] or ["- _Aucune réunion planifiée aujourd'hui._"]
    body_lines += ["", "## À faire aujourd'hui"]
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
    if upcoming_meetings:
        body_lines += ["", "## Prochaines réunions"]
        body_lines += [
            f"- {m.start_at.strftime('%d/%m %H:%M')} — {m.title}"
            for m in upcoming_meetings[:4]
        ]
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
    if current_user.role not in {"admin_entreprise", "manager_entreprise", "super_admin"}:
        raise HTTPException(status_code=403, detail="Accès refusé : administrateur requis.")
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
# TAUX DE CHANGE (EUR/USD → XAF)
# ═══════════════════════════════════════════════════════════════════════════

from app.services.currency import DEFAULT_RATES as _DEFAULT_RATES, get_effective_rate as _get_effective_rate


@router.get("/settings/exchange-rates")
def list_exchange_rates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    result = []
    for quote_currency in _DEFAULT_RATES:
        override = db.scalars(
            select(ExchangeRate).where(
                ExchangeRate.company_id == current_user.company_id,
                ExchangeRate.quote_currency == quote_currency,
            )
        ).first()
        result.append({
            "quote_currency": quote_currency,
            "base_currency": "XAF",
            "rate": _get_effective_rate(quote_currency, current_user.company_id, db),
            "is_override": override is not None,
        })
    return result


@router.patch("/settings/exchange-rates/{quote_currency}")
def update_exchange_rate(
    quote_currency: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role not in {"admin_entreprise", "manager_entreprise", "super_admin"}:
        raise HTTPException(status_code=403, detail="Accès refusé : administrateur requis.")
    quote_currency = quote_currency.upper()
    if quote_currency not in _DEFAULT_RATES:
        raise HTTPException(400, f"Devise non supportée : {quote_currency}")
    rate = payload.get("rate")
    if not isinstance(rate, (int, float)) or rate <= 0:
        raise HTTPException(400, "Taux invalide")
    override = db.scalars(
        select(ExchangeRate).where(
            ExchangeRate.company_id == current_user.company_id,
            ExchangeRate.quote_currency == quote_currency,
        )
    ).first()
    if override:
        override.rate = float(rate)
    else:
        override = ExchangeRate(
            company_id=current_user.company_id,
            base_currency="XAF",
            quote_currency=quote_currency,
            rate=float(rate),
        )
        db.add(override)
    db.commit()
    db.refresh(override)
    return {"quote_currency": override.quote_currency, "base_currency": "XAF", "rate": override.rate, "is_override": True}


# ═══════════════════════════════════════════════════════════════════════════
# ACCOUNTING aggregates
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/accounting/cashflow", response_model=list[CashFlowPoint])
def accounting_cashflow(
    period: str = "month",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CashFlowPoint]:
    """Cashflow agrégé sur les 6 dernières périodes.
    Sources: Factures payées + Ventes POS + Crédits/Débits bancaires (BankTransaction).
    Les BankTransactions sont la source principale (relevés bancaires réels).
    Invoices/Sales complètent si pas encore enregistrés en banque.
    """
    invoices = db.scalars(
        select(Invoice).where(Invoice.company_id == current_user.company_id)
    ).all()
    sales = db.scalars(
        select(Sale).where(Sale.company_id == current_user.company_id)
    ).all()
    payrolls = db.scalars(
        select(PayrollRun).where(PayrollRun.company_id == current_user.company_id)
    ).all()
    tx_rows = db.scalars(
        select(BankTransaction).where(BankTransaction.company_id == current_user.company_id)
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
        month_str = f"{y:04d}-{m:02d}"

        # ── Transactions bancaires réelles (source principale) ──────────────
        tx_month = [r for r in tx_rows if r.date.startswith(month_str)]
        tx_in  = sum(r.credit if r.credit is not None else max(r.amount, 0) for r in tx_month)
        tx_out = sum(r.debit  if r.debit  is not None else max(-r.amount, 0) for r in tx_month)

        # ── Facturations / ventes (si pas de transactions bancaires ce mois) ─
        inv_in = sum(
            inv.total_amount or 0
            for inv in invoices
            if inv.created_at.year == y and inv.created_at.month == m and inv.status in {"paid", "sent"}
        )
        sales_in = sum(
            s.total_amount or 0
            for s in sales
            if s.created_at.year == y and s.created_at.month == m
        )
        payroll_out = sum(
            p.net_total or 0
            for p in payrolls
            if p.created_at.year == y and p.created_at.month == m
        )

        # Si des transactions bancaires existent ce mois : priorité données réelles
        # Sinon : utiliser les données comptables (invoices/sales/payroll)
        if tx_in > 0 or tx_out > 0:
            inflow  = tx_in
            outflow = tx_out + payroll_out  # payroll toujours inclus (paie sortante)
        else:
            inflow  = inv_in + sales_in
            outflow = payroll_out

        points.append(CashFlowPoint(label=label, inflow=float(inflow), outflow=float(outflow)))
    return points


@router.get("/accounting/expenses", response_model=list[ExpenseCategory])
def accounting_expenses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ExpenseCategory]:
    """Répartition des dépenses : transactions bancaires (débits) + paie."""
    payrolls = db.scalars(
        select(PayrollRun).where(PayrollRun.company_id == current_user.company_id)
    ).all()
    salaries = sum(p.gross_total or 0 for p in payrolls)
    social   = sum((p.gross_total or 0) - (p.net_total or 0) for p in payrolls)

    # Transactions bancaires — débits groupés par catégorie
    tx_debits = db.scalars(
        select(BankTransaction).where(
            BankTransaction.company_id == current_user.company_id,
        )
    ).all()
    # Only debit transactions (outflows)
    debit_rows = [
        r for r in tx_debits
        if (r.debit is not None and r.debit > 0) or r.amount < 0
    ]

    CATEGORY_COLORS = {
        "salaires": "#059669",
        "charges sociales": "#10b981",
        "loyer": "#3b82f6",
        "loyers": "#3b82f6",
        "loyers & utilités": "#3b82f6",
        "utilities": "#3b82f6",
        "fournitures": "#f59e0b",
        "fournitures & matériel": "#f59e0b",
        "transport": "#8b5cf6",
        "marketing": "#ec4899",
        "sous-traitance": "#f97316",
        "taxes": "#ef4444",
        "impôts": "#ef4444",
        "divers": "#94a3b8",
        "autres": "#94a3b8",
    }
    DEFAULT_COLOR = "#94a3b8"

    by_cat: dict[str, float] = {}
    for r in debit_rows:
        cat = (r.category or "Autres").strip()
        amt = r.debit if r.debit is not None else abs(r.amount)
        by_cat[cat] = by_cat.get(cat, 0) + amt

    # Merge payroll into category breakdown
    if salaries > 0:
        by_cat["Salaires"] = by_cat.get("Salaires", 0) + float(salaries)
    if social > 0:
        by_cat["Charges sociales"] = by_cat.get("Charges sociales", 0) + float(social)

    # If no real data at all, return estimates based on payroll
    if not by_cat:
        return [
            ExpenseCategory(name="Salaires",           amount=float(salaries), color="#059669"),
            ExpenseCategory(name="Charges sociales",   amount=float(social),   color="#10b981"),
            ExpenseCategory(name="Fournitures",        amount=float(salaries) * 0.08, color="#f59e0b"),
            ExpenseCategory(name="Loyers & utilités",  amount=float(salaries) * 0.15, color="#3b82f6"),
            ExpenseCategory(name="Autres",             amount=float(salaries) * 0.05, color="#94a3b8"),
        ]

    result = [
        ExpenseCategory(
            name=cat,
            amount=round(amt, 2),
            color=CATEGORY_COLORS.get(cat.lower(), DEFAULT_COLOR),
        )
        for cat, amt in sorted(by_cat.items(), key=lambda x: -x[1])
        if amt > 0
    ]
    return result


def _accounting_syscemac_status(db: Session, current_user: User) -> list[dict]:
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


@router.get("/accounting/syscemac-status")
def accounting_syscemac(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    return _accounting_syscemac_status(db, current_user)


# ═══════════════════════════════════════════════════════════════════════════
# REPORTS revenue series
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/reports/revenue-series", response_model=list[RevenueSeriesPoint])
def revenue_series(
    period: str = "annee",
    year: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[RevenueSeriesPoint]:
    """
    Retourne la série revenus/marge par mois selon la période :
    - mois      → 1 mois (4 semaines glissantes, regroupées par semaine)
    - trimestre → 3 derniers mois
    - annee     → 12 derniers mois  (défaut)
    Si year est fourni, retourne les 12 mois de cette année calendaire exacte.
    """
    invoices_all = db.scalars(
        select(Invoice).where(Invoice.company_id == current_user.company_id)
    ).all()
    sales_all = db.scalars(
        select(Sale).where(Sale.company_id == current_user.company_id)
    ).all()
    payrolls_all = db.scalars(
        select(PayrollRun).where(PayrollRun.company_id == current_user.company_id)
    ).all()
    tx_all = db.scalars(
        select(BankTransaction).where(BankTransaction.company_id == current_user.company_id)
    ).all()

    today = date.today()
    months_fr = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"]

    # Mode année calendaire spécifique (N ou N-1)
    if year is not None:
        points: list[RevenueSeriesPoint] = []
        for m in range(1, 13):
            label = months_fr[m - 1]
            month_str = f"{year:04d}-{m:02d}"
            rev = sum(
                inv.total_amount or 0
                for inv in invoices_all
                if inv.created_at.year == year and inv.created_at.month == m
            )
            rev += sum(
                s.total_amount or 0
                for s in sales_all
                if s.created_at.year == year and s.created_at.month == m
            )
            tx_month = [r for r in tx_all if r.date.startswith(month_str)]
            tx_in  = sum(r.credit if r.credit is not None else max(r.amount, 0) for r in tx_month)
            tx_out = sum(r.debit  if r.debit  is not None else max(-r.amount, 0) for r in tx_month)
            total_rev = rev + tx_in
            cost = sum(
                p.net_total or 0
                for p in payrolls_all
                if p.created_at.year == year and p.created_at.month == m
            ) + tx_out
            points.append(RevenueSeriesPoint(label=label, revenue=float(total_rev), margin=float(max(total_rev - cost, 0))))
        return points

    # Nombre de mois à afficher selon le paramètre
    nb_months = {"mois": 1, "trimestre": 3, "annee": 12}.get(period, 12)

    points: list[RevenueSeriesPoint] = []

    if nb_months == 1:
        # Mode "mois" : 4 semaines glissantes, label = "S1" … "S4"
        for week in range(3, -1, -1):
            week_end = today - timedelta(days=week * 7)
            week_start = week_end - timedelta(days=6)
            ws = week_start.isoformat()
            we = week_end.isoformat()
            label = f"S{4 - week}"
            rev = sum(
                inv.total_amount or 0
                for inv in invoices_all
                if inv.created_at.date() >= week_start and inv.created_at.date() <= week_end
            )
            rev += sum(
                s.total_amount or 0
                for s in sales_all
                if s.created_at.date() >= week_start and s.created_at.date() <= week_end
            )
            # Add bank transaction credits (real receipts)
            tx_week_in = sum(
                (r.credit if r.credit is not None else max(r.amount, 0))
                for r in tx_all
                if ws <= r.date <= we
            )
            tx_week_out = sum(
                (r.debit if r.debit is not None else max(-r.amount, 0))
                for r in tx_all
                if ws <= r.date <= we
            )
            total_rev = rev + tx_week_in
            cost = sum(
                p.net_total or 0
                for p in payrolls_all
                if p.created_at.date() >= week_start and p.created_at.date() <= week_end
            ) + tx_week_out
            points.append(RevenueSeriesPoint(label=label, revenue=float(total_rev), margin=float(max(total_rev - cost, 0))))
    else:
        for i in range(nb_months - 1, -1, -1):
            m = today.month - i
            y = today.year
            while m <= 0:
                m += 12
                y -= 1
            label = months_fr[m - 1]
            month_str = f"{y:04d}-{m:02d}"
            rev = sum(
                inv.total_amount or 0
                for inv in invoices_all
                if inv.created_at.year == y and inv.created_at.month == m
            )
            rev += sum(
                s.total_amount or 0
                for s in sales_all
                if s.created_at.year == y and s.created_at.month == m
            )
            # Add bank transaction credits (real receipts)
            tx_month = [r for r in tx_all if r.date.startswith(month_str)]
            tx_in  = sum(r.credit if r.credit is not None else max(r.amount, 0) for r in tx_month)
            tx_out = sum(r.debit  if r.debit  is not None else max(-r.amount, 0) for r in tx_month)
            total_rev = rev + tx_in
            cost = sum(
                p.net_total or 0
                for p in payrolls_all
                if p.created_at.year == y and p.created_at.month == m
            ) + tx_out
            points.append(RevenueSeriesPoint(label=label, revenue=float(total_rev), margin=float(max(total_rev - cost, 0))))

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


# ═══════════════════════════════════════════════════════════════════════════
# IN-APP NOTIFICATIONS (broadcasts persistés)
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/notifications")
def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Diffusions admin visibles par l'utilisateur courant (in-app).

    Inclut les broadcasts ciblant tout le monde (`all`), son entreprise
    (`company_id:<id>` ou `company_ids:...,<id>,...`), ou lui personnellement
    (`user_ids:...,<id>,...`), des 30 derniers jours, du plus récent au plus
    ancien. Permet aux clients (web/iOS/macOS) d'afficher les diffusions même
    si l'utilisateur n'était pas connecté au moment de l'envoi.

    Le filtrage se fait côté Python (pas en SQL) car `target` encode des
    listes CSV (`company_ids:1,2,3`) que l'égalité stricte SQL ne peut pas
    matcher par appartenance — un bug précédent faisait que les diffusions
    multi-entreprises n'apparaissaient jamais dans aucune liste.
    """
    since = datetime.now(timezone.utc) - timedelta(days=30)
    cid = current_user.company_id
    uid = current_user.id
    candidates = db.scalars(
        select(BroadcastLog)
        .where(BroadcastLog.created_at >= since)
        .order_by(BroadcastLog.created_at.desc())
        .limit(200)
    ).all()

    def _matches(t: str) -> bool:
        if t == "all":
            return True
        if t.startswith("company_id:"):
            return cid is not None and t == f"company_id:{cid}"
        if t.startswith("company_ids:"):
            ids = {x for x in t.split(":", 1)[1].split(",") if x}
            return cid is not None and str(cid) in ids
        if t.startswith("user_ids:"):
            ids = {x for x in t.split(":", 1)[1].split(",") if x}
            return str(uid) in ids
        return False

    rows = [r for r in candidates if _matches(r.target)][:50]
    return [
        {
            "id": r.id,
            "title": r.title,
            "message": r.message,
            "type": r.type,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# ═══════════════════════════════════════════════════════════════════════════
# SSE NOTIFICATIONS STREAM
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/notifications/stream")
async def notifications_stream(request: Request, token: str | None = Query(default=None), db: Session = Depends(get_db)):
    """SSE endpoint — pushes pending alerts and low-stock events.
    Accepts a short-lived realtime ticket via query param because EventSource cannot send custom headers.
    """
    # Resolve user from query-param token (EventSource) or Authorization header
    from fastapi import Header as _Header
    auth_header = request.headers.get("authorization", "")
    raw_token: str | None = token
    if not raw_token and auth_header.lower().startswith("bearer "):
        raw_token = auth_header.split(" ", 1)[1]
    if not raw_token:
        from fastapi.responses import Response as _R
        return _R(status_code=401, content="Unauthorized")
    payload = decode_access_token(raw_token)
    if not payload or payload.get("purpose") != "realtime":
        from fastapi.responses import Response as _R
        return _R(status_code=401, content="Invalid token")
    current_user = db.get(User, int(payload["sub"]))
    if not current_user or not current_user.is_active:
        from fastapi.responses import Response as _R
        return _R(status_code=401, content="Inactive user")
    if int(payload.get("ver", 0)) != int(getattr(current_user, "token_version", 0) or 0):
        from fastapi.responses import Response as _R
        return _R(status_code=401, content="Revoked token")
    async def event_generator():
        # Send initial ping
        yield f"data: {json.dumps({'type': 'connected', 'user_id': current_user.id})}\n\n"

        sent_ids: set[int] = set()
        sent_alert_keys: set[int] = set()
        while True:
            if await request.is_disconnected():
                break
            # Fetch open TERAS alerts for this company
            try:
                alerts = db.query(TerasAlert).filter(
                    TerasAlert.company_id == current_user.company_id,
                    TerasAlert.status == "open"
                ).order_by(TerasAlert.id.desc()).limit(5).all()

                for alert in alerts:
                    if alert.id not in sent_ids:
                        sent_ids.add(alert.id)
                        yield f"data: {json.dumps({'type': 'alert', 'id': alert.id, 'title': alert.title, 'severity': alert.severity, 'module': alert.module})}\n\n"

                from app.services.limule_alerts import compute_dashboard_alerts
                business_alerts = compute_dashboard_alerts(db=db, company_id=current_user.company_id, user=current_user)
                for alert in business_alerts:
                    key = zlib.crc32(f"{alert.get('type')}:{alert.get('message')}:{alert.get('action_url')}".encode("utf-8"))
                    if key in sent_alert_keys:
                        continue
                    sent_alert_keys.add(key)
                    yield f"data: {json.dumps({'type': 'alert', 'id': key, 'title': alert.get('message'), 'severity': alert.get('severity'), 'module': alert.get('type'), 'action_url': alert.get('action_url')})}\n\n"
            except Exception:
                pass

            await asyncio.sleep(30)  # Poll every 30s

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
