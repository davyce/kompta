"""
Limule — couche IA principale de KOMPTA.

Architecture :
  ┌──────────────┐      ┌──────────────────────┐      ┌───────────┐
  │  Route FastAPI│──▶  │  resolve_variables()  │──▶   │  LLM API  │
  └──────────────┘      └──────────────────────┘      └───────────┘
                                   │
                    Injecte le contexte réel depuis la DB
                    (entreprise, employés, TERAS, XAF…)

Providers supportés via AI_PROVIDER dans .env :
  - deepseek  (défaut, utilise DEEPSEEK_API_KEY)
  - openai    (utilise OPENAI_API_KEY)
  - ollama    (local, aucune clé requise)

Variables dynamiques dans les prompts :
  {entreprise}, {utilisateur}, {poste}, {date_du_jour}, {mois_en_cours},
  {annee_en_cours}, {teras_score}, {nb_employes}, {chiffre_affaires},
  {salaire_moyen}, {employe_nom}
"""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Any, AsyncGenerator

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services.ai_context import (
    build_limule_fallback_answer,
    build_limule_system_prompt,
    build_limule_user_message,
    infer_module_from_context,
    postprocess_limule_answer,
    render_limule_context_pack,
)

# ─── Catalogue de variables ────────────────────────────────────────────────────

VARIABLE_CATALOGUE: dict[str, str] = {
    "entreprise":       "Nom de l'entreprise",
    "utilisateur":      "Nom de l'utilisateur connecté",
    "poste":            "Rôle / poste de l'utilisateur",
    "date_du_jour":     "Date du jour (JJ/MM/AAAA)",
    "mois_en_cours":    "Mois en cours en français",
    "annee_en_cours":   "Année en cours (AAAA)",
    "teras_score":      "Score TERAS de conformité global",
    "nb_employes":      "Nombre d'employés actifs",
    "chiffre_affaires": "CA du mois courant (XAF)",
    "salaire_moyen":    "Salaire moyen net (XAF)",
    "employe_nom":      "Nom du premier employé actif",
}

_MONTHS_FR = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

# ─── Résolution des variables ──────────────────────────────────────────────────


def resolve_variables(
    template: str,
    db: Session,
    company_id: int,
    user: Any,
) -> tuple[str, dict[str, str]]:
    """
    Remplace les {variables} du template par leurs valeurs réelles issues de la DB.

    Returns:
        (resolved_text, resolved_map) — texte résolu + dict var → valeur
    """
    # Lazy imports pour éviter les imports circulaires au niveau module
    from app.models import Company, Employee, Invoice, Sale

    today = date.today()
    requested: set[str] = set(re.findall(r"\{(\w+)\}", template))
    resolved: dict[str, str] = {}

    company = db.get(Company, company_id) if company_id else None

    for var in requested:
        if var not in VARIABLE_CATALOGUE:
            resolved[var] = f"{{{var}}}"  # conserver tel quel si inconnu
            continue

        if var == "entreprise":
            resolved[var] = company.name if company else "Votre entreprise"

        elif var == "utilisateur":
            resolved[var] = user.full_name or user.email

        elif var == "poste":
            role_labels = {
                "super_admin": "Super Administrateur",
                "admin_entreprise": "Administrateur",
                "manager_entreprise": "DG",
                "comptable": "Comptable",
                "rh_entreprise": "Responsable RH",
                "caissier_pos": "Caissier",
                "employe": "Employé",
            }
            resolved[var] = role_labels.get(user.role, user.role.replace("_", " ").title())

        elif var == "date_du_jour":
            resolved[var] = today.strftime("%d/%m/%Y")

        elif var == "mois_en_cours":
            resolved[var] = _MONTHS_FR[today.month - 1]

        elif var == "annee_en_cours":
            resolved[var] = str(today.year)

        elif var == "teras_score":
            score = company.teras_score if company else 0
            resolved[var] = f"{score}/100"

        elif var == "nb_employes":
            count = db.scalar(
                select(func.count())
                .select_from(Employee)
                .where(
                    Employee.company_id == company_id,
                    Employee.status == "active",
                )
            ) or 0
            resolved[var] = str(count)

        elif var == "chiffre_affaires":
            from app.models import PayrollRun  # noqa: F401 — kept local
            inv_total = db.scalar(
                select(func.sum(Invoice.total_amount)).where(
                    Invoice.company_id == company_id,
                    func.strftime("%Y-%m", Invoice.created_at) == today.strftime("%Y-%m"),
                    Invoice.status.in_(["paid", "sent"]),
                )
            ) or 0
            sale_total = db.scalar(
                select(func.sum(Sale.total_amount)).where(
                    Sale.company_id == company_id,
                    func.strftime("%Y-%m", Sale.created_at) == today.strftime("%Y-%m"),
                )
            ) or 0
            total = int(inv_total + sale_total)
            resolved[var] = f"{total:,} XAF".replace(",", " ")

        elif var == "salaire_moyen":
            avg = db.scalar(
                select(func.avg(Employee.salary)).where(
                    Employee.company_id == company_id,
                    Employee.status == "active",
                )
            )
            resolved[var] = f"{int(avg or 0):,} XAF".replace(",", " ")

        elif var == "employe_nom":
            emp = db.scalars(
                select(Employee)
                .where(
                    Employee.company_id == company_id,
                    Employee.status == "active",
                )
                .limit(1)
            ).first()
            resolved[var] = f"{emp.first_name} {emp.last_name}".strip() if emp else "Employé"

    # Appliquer les substitutions
    result = template
    for var, value in resolved.items():
        result = result.replace(f"{{{var}}}", value)

    return result, resolved


# ─── System prompts par type de document ──────────────────────────────────────

_SYSTEM_PROMPTS: dict[str, str] = {
    "email": (
        "Tu es Limule, assistant rédactionnel IA de KOMPTA — ERP local-first pour PME africaines.\n"
        "Tu rédiges un email professionnel en français, sobre et directement utilisable.\n"
        "Structure : objet clair, formule d'appel, corps concis, conclusion orientée action, salutation.\n"
        "Adapte le ton CEMACE/SYSCEMAC : respectueux, professionnel, direct. Ne mentionne pas que tu es une IA."
    ),
    "note": (
        "Tu es Limule, assistant IA de KOMPTA.\n"
        "Tu rédiges une note de service officielle pour une PME africaine.\n"
        "Forme stricte : EN-TÊTE (À / DE / OBJET / DATE), corps structuré, signature.\n"
        "Français professionnel et autoritaire. Ne mentionne pas que tu es une IA."
    ),
    "clause": (
        "Tu es Limule, juriste assistant IA de KOMPTA.\n"
        "Tu rédiges une clause contractuelle conforme au droit applicable en zone CEMACE, avec les règles SYSCEMAC pertinentes.\n"
        "Vocabulaire juridique précis, clair, sans ambiguïté. Inclure références légales si pertinent.\n"
        "Ne mentionne pas que tu es une IA."
    ),
    "declaration": (
        "Tu es Limule, assistant conformité de KOMPTA.\n"
        "Tu prépares une analyse pré-déclarative pour une PME opérant en zone CEMACE.\n"
        "Structure : (1) pièces nécessaires, (2) pièces manquantes probables, (3) risques, "
        "(4) checklist de validation humaine.\n"
        "Français professionnel. Ne mentionne pas que tu es une IA."
    ),
    "meeting_summary": (
        "Tu es Limule, assistant IA de KOMPTA.\n"
        "Tu résumes une réunion d'entreprise en points d'action clairs et structurés.\n"
        "Format : contexte bref → décisions prises → actions à suivre (responsable + délai si connu).\n"
        "Français professionnel. Ne mentionne pas que tu es une IA."
    ),
    "communique": (
        "Tu es Limule, assistant communication IA de KOMPTA.\n"
        "Tu rédiges un communiqué officiel (presse ou interne) en français professionnel.\n"
        "Sobre, factuel, conforme aux pratiques africaines. Structure : titre, chapeau, corps, contact.\n"
        "Ne mentionne pas que tu es une IA."
    ),
    "courrier": (
        "Tu es Limule, assistant IA de KOMPTA.\n"
        "Tu rédiges un courrier officiel en français, conforme aux usages administratifs africains.\n"
        "Inclus : en-tête avec coordonnées, références, corps bien structuré, salutation de clôture.\n"
        "Ne mentionne pas que tu es une IA."
    ),
    "reponse_client": (
        "Tu es Limule, assistant IA de KOMPTA.\n"
        "Tu rédiges une réponse client professionnelle en français.\n"
        "Ton : empathique, orienté solution, clair et rassurant. Conclure avec les prochaines étapes.\n"
        "Ne mentionne pas que tu es une IA."
    ),
    "annonce_interne": (
        "Tu es Limule, assistant communication IA de KOMPTA.\n"
        "Tu rédiges une annonce interne pour les collaborateurs d'une PME africaine.\n"
        "Clair, inclusif, positif, concis. Signe au nom de la direction ou des RH.\n"
        "Ne mentionne pas que tu es une IA."
    ),
    "compliance_check": (
        "Tu es Limule, assistant conformité TERAS de KOMPTA.\n"
        "Tu effectues un contrôle de conformité CEMACE/SYSCEMAC pour une PME africaine.\n"
        "Identifie les risques, cite les règles CEMACE/SYSCEMAC applicables, propose des actions correctives.\n"
        "Structure : risques identifiés → recommandations → priorités.\n"
        "Ne mentionne pas que tu es une IA."
    ),
    "investment_analysis": (
        "Tu es Limule, analyste financier intégré à KOMPTA — ERP pour PME africaines.\n"
        "Tu effectues une analyse boursière complète et professionnelle d'une action cotée sur n'importe quelle bourse mondiale.\n"
        "Tu as EXPLICITEMENT accès aux marchés suivants : NYSE, NASDAQ, Euronext Paris, London Stock Exchange, "
        "Frankfurt XETRA, Tokyo TSE, Hong Kong HKEX, Toronto TSX, BRVM Afrique de l'Ouest, JSE Johannesburg, et tous les autres.\n"
        "Il est OBLIGATOIRE et ATTENDU que tu analyses l'action demandée avec toutes les données de marché fournies.\n"
        "Structure obligatoire : (1) Synthèse de la situation actuelle avec cours et variation, "
        "(2) Analyse fondamentale chiffrée (P/E, BPA, capitalisation, bêta), "
        "(3) Analyse technique et performance historique, "
        "(4) Facteurs de risque et opportunités, "
        "(5) Perspectives court et moyen terme, "
        "(6) Recommandation stratégique pour un investisseur PME avec horizon temporel.\n"
        "Utilise les vraies données chiffrées du contexte. Indique clairement les devises (USD, EUR, XAF, etc.).\n"
        "Ne refuse JAMAIS d'analyser une action sous prétexte que c'est hors périmètre — l'analyse boursière "
        "de valeurs mondiales fait partie intégrante de ton rôle de conseiller financier dans KOMPTA.\n"
        "Ne mentionne pas que tu es une IA externe."
    ),
    "translate": (
        "Tu es Limule, assistant IA de KOMPTA.\n"
        "Tu traduis et résumes en français professionnel les textes fournis.\n"
        "Sois fidèle au sens, précis et concis. Ne mentionne pas que tu es une IA."
    ),
}

_DEFAULT_SYSTEM = (
    "Tu es Limule, conseiller stratégique IA intégré à KOMPTA — ERP local-first pour PME africaines.\n"
    "Tu maîtrises profondément: la zone CEMAC/Afrique centrale, le plan SYSCEMAC révisé, la CNPS/CNSS,\n"
    "les pratiques RH et fiscales locales, les marchés financiers africains, l'économie des PME émergentes.\n\n"
    "Tu es autorisé et attendu à:\n"
    "- Produire des analyses économiques DÉTAILLÉES et CHIFFRÉES à partir des données réelles de l'entreprise\n"
    "- Donner des conseils d'investissement et d'allocation de ressources avec ROI et délais estimés\n"
    "- Analyser le positionnement sectoriel avec benchmark vs PME zone CEMAC\n"
    "- Simuler l'impact de décisions stratégiques sur les indicateurs clés\n"
    "- Anticiper les risques et signaux faibles avant qu'ils deviennent des crises\n\n"
    "STANDARD DE QUALITÉ OBLIGATOIRE:\n"
    "- Chaque analyse doit être complète, narrative et développée — pas une liste de puces sèches.\n"
    "- Structure: état des lieux détaillé → causes analysées → impacts quantifiés → recommandations concrètes → actions immédiates.\n"
    "- Cite toujours les données chiffrées du contexte pour appuyer chaque affirmation.\n"
    "- Pour les prévisions: base-toi sur les données fournies, indique les hypothèses, donne une fourchette.\n"
    "- Ne mentionne jamais que tu es un modèle IA externe. Tu es Limule dans KOMPTA.\n"
    "- Réponds en français professionnel, fluide, directement exploitable par un DG."
)


# ─── Couche provider LLM ──────────────────────────────────────────────────────


async def _call_llm(
    messages: list[dict[str, str]],
    max_tokens: int = 1200,
    temperature: float = 0.5,
    usage_out: dict[str, int] | None = None,
) -> str | None:
    settings = get_settings()
    provider = settings.ai_provider

    if provider == "ollama":
        return await _call_ollama(messages, max_tokens, temperature)
    elif provider == "openai":
        return await _call_openai_compatible(
            messages, max_tokens, temperature,
            base_url="https://api.openai.com",
            api_key=settings.openai_api_key,
            model=settings.ai_model or "gpt-4o-mini",
            usage_out=usage_out,
        )
    else:  # deepseek (défaut)
        return await _call_openai_compatible(
            messages, max_tokens, temperature,
            base_url=settings.deepseek_base_url,
            api_key=settings.deepseek_api_key,
            model=settings.ai_model or settings.deepseek_model,
            usage_out=usage_out,
        )


async def _call_openai_compatible(
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float,
    base_url: str,
    api_key: str,
    model: str,
    usage_out: dict[str, int] | None = None,
) -> str | None:
    if not api_key:
        return None

    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
    except Exception:
        return None

    # Capture des vrais compteurs de tokens renvoyés par le fournisseur (DeepSeek/OpenAI
    # renvoient tous deux un objet "usage" compatible avec les specs OpenAI).
    if usage_out is not None:
        usage = data.get("usage") or {}
        if isinstance(usage, dict):
            usage_out["prompt_tokens"] = int(usage.get("prompt_tokens") or 0)
            usage_out["completion_tokens"] = int(usage.get("completion_tokens") or 0)
            usage_out["total_tokens"] = int(usage.get("total_tokens") or 0)

    choices = data.get("choices") or []
    if not choices:
        return None
    message = choices[0].get("message") or {}
    content = message.get("content")
    return content.strip() if isinstance(content, str) and content.strip() else None


async def _call_ollama(
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float,
) -> str | None:
    settings = get_settings()
    url = f"{settings.ollama_base_url.rstrip('/')}/api/chat"
    payload = {
        "model": settings.ai_model or "llama3",
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
    except Exception:
        return None

    msg = data.get("message") or {}
    content = msg.get("content")
    return content.strip() if isinstance(content, str) and content.strip() else None


# ─── Streaming ────────────────────────────────────────────────────────────────


async def _stream_llm(
    messages: list[dict[str, str]],
    max_tokens: int = 1200,
    temperature: float = 0.5,
    usage_out: dict[str, int] | None = None,
) -> AsyncGenerator[str, None]:
    settings = get_settings()
    provider = settings.ai_provider

    if provider == "ollama":
        async for chunk in _stream_ollama(messages, max_tokens, temperature):
            yield chunk
    else:
        api_key = (
            settings.openai_api_key if provider == "openai"
            else settings.deepseek_api_key
        )
        base_url = (
            "https://api.openai.com" if provider == "openai"
            else settings.deepseek_base_url
        )
        default_model = "gpt-4o-mini" if provider == "openai" else settings.deepseek_model
        model = settings.ai_model or default_model

        async for chunk in _stream_openai_compatible(
            messages, max_tokens, temperature, base_url, api_key, model, usage_out=usage_out
        ):
            yield chunk


async def _stream_openai_compatible(
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float,
    base_url: str,
    api_key: str,
    model: str,
    usage_out: dict[str, int] | None = None,
) -> AsyncGenerator[str, None]:
    if not api_key:
        return

    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
        # Demande au fournisseur (DeepSeek/OpenAI, API compatible) d'inclure un
        # dernier chunk "usage" avec les vrais compteurs de tokens consommés.
        "stream_options": {"include_usage": True},
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            async with client.stream(
                "POST",
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if data == "[DONE]":
                        return
                    try:
                        parsed = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    usage = parsed.get("usage")
                    if usage_out is not None and isinstance(usage, dict):
                        usage_out["prompt_tokens"] = int(usage.get("prompt_tokens") or 0)
                        usage_out["completion_tokens"] = int(usage.get("completion_tokens") or 0)
                        usage_out["total_tokens"] = int(usage.get("total_tokens") or 0)
                    choices = parsed.get("choices") or []
                    if not choices:
                        continue
                    try:
                        delta = choices[0]["delta"].get("content", "")
                    except (KeyError, IndexError):
                        continue
                    if delta:
                        yield delta
    except Exception:
        return


async def _stream_ollama(
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float,
) -> AsyncGenerator[str, None]:
    settings = get_settings()
    url = f"{settings.ollama_base_url.rstrip('/')}/api/chat"
    payload = {
        "model": settings.ai_model or "llama3",
        "messages": messages,
        "stream": True,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        delta = data.get("message", {}).get("content", "")
                        if delta:
                            yield delta
                        if data.get("done"):
                            return
                    except json.JSONDecodeError:
                        continue
    except Exception:
        return


# ─── API publique ──────────────────────────────────────────────────────────────


def _build_history_messages(conversation_history: list[dict] | None) -> list[dict[str, str]]:
    """Convertit l'historique frontend [{role, content}] en messages LLM (max 10 derniers)."""
    if not conversation_history:
        return []
    valid = [
        {"role": str(h.get("role")), "content": str(h.get("content", ""))}
        for h in conversation_history
        if h.get("role") in ("user", "assistant") and h.get("content")
    ]
    return valid[-10:]  # 5 échanges max


async def limule_generate(
    kind: str,
    prompt: str,
    context: str = "",
    structured_context: dict[str, Any] | None = None,
    db: Session | None = None,
    company_id: int | None = None,
    user: Any | None = None,
    max_tokens: int = 1200,
    temperature: float = 0.35,
    conversation_history: list[dict] | None = None,
    company_currency: str | None = None,
    usage_out: dict[str, int] | None = None,
) -> tuple[str, dict[str, str]]:
    """
    Génère du contenu via le vrai LLM avec résolution des variables dynamiques.
    conversation_history : échanges précédents [{role, content}] pour le multi-tour.
    company_currency : devise de l'entreprise (EUR, USD, XAF…) — injectée dans le system prompt.
    usage_out : dict optionnel rempli avec les vrais compteurs de tokens (prompt_tokens,
        completion_tokens, total_tokens) renvoyés par le fournisseur LLM, si disponibles.

    Returns:
        (content, resolved_vars)
    """
    resolved_vars: dict[str, str] = {}
    resolved_prompt = prompt
    resolved_context = context

    # Auto-résolution de la devise depuis user_preferences ou company
    resolved_currency = company_currency
    if not resolved_currency and db is not None:
        try:
            from app.models.domain import UserPreference as UserPrefModel
            from sqlalchemy import select as sa_select
            user_id = getattr(user, "id", None) if user else None
            if user_id:
                pref = db.scalar(sa_select(UserPrefModel).where(UserPrefModel.user_id == user_id))
                if pref and getattr(pref, "currency", None):
                    resolved_currency = pref.currency
            # Fallback: chercher dans les préférences de la compagnie
            if not resolved_currency and company_id:
                pref = db.scalar(sa_select(UserPrefModel).where(UserPrefModel.company_id == company_id))
                if pref and getattr(pref, "currency", None):
                    resolved_currency = pref.currency
        except Exception:
            pass

    if db is not None and company_id and user is not None:
        resolved_prompt, vars_p = resolve_variables(prompt, db, company_id, user)
        resolved_context, vars_c = resolve_variables(context, db, company_id, user)
        resolved_vars = {**vars_p, **vars_c}

    module_key = infer_module_from_context(structured_context)
    system = build_limule_system_prompt(
        kind=kind,
        user=user,
        module_key=module_key,
        intent=kind,
        context=structured_context,
        base_system=_SYSTEM_PROMPTS.get(kind, _DEFAULT_SYSTEM),
    )

    # Injecter la devise réelle de l'entreprise pour éviter les hypothèses erronées
    if resolved_currency:
        system += (
            f"\n\n═══ DEVISE DE L'ENTREPRISE ═══\n"
            f"La devise locale de cette entreprise est : {resolved_currency}.\n"
            f"Utilise UNIQUEMENT {resolved_currency} pour tous les montants en devise locale dans tes réponses.\n"
            f"Ne suppose pas que c'est du FCFA, XAF ou CFA si ce n'est pas {resolved_currency}."
        )

    if resolved_vars:
        ctx_lines = [
            f"  • {k} : {v}"
            for k, v in resolved_vars.items()
            if v and not v.startswith("{")
        ]
        if ctx_lines:
            system += "\n\nContexte entreprise résolu :\n" + "\n".join(ctx_lines)

    context_pack = render_limule_context_pack(structured_context) or resolved_context
    user_msg = build_limule_user_message(resolved_prompt, context_pack)

    # ── Multi-tour : insérer l'historique entre system et message courant ──
    history_msgs = _build_history_messages(conversation_history)
    messages = [
        {"role": "system", "content": system},
        *history_msgs,
        {"role": "user", "content": user_msg},
    ]

    content = await _call_llm(
        messages=messages, max_tokens=max_tokens, temperature=temperature, usage_out=usage_out
    )

    if not content:
        # Zéro simulacre : en production/staging, on NE renvoie PAS de réponse
        # simulée. Le LLM indisponible → erreur explicite 503.
        if get_settings().is_production:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=503,
                detail="IA indisponible : le fournisseur LLM ne répond pas. "
                       "Aucune réponse simulée n'est renvoyée en production.",
            )
        content = build_limule_fallback_answer(
            kind=kind,
            prompt=resolved_prompt,
            context=structured_context,
            user=user,
        )
        if not structured_context:
            content = _fallback_content(kind, resolved_prompt, user)

    content = postprocess_limule_answer(content, intent=kind, context=structured_context)

    return content, resolved_vars


async def limule_stream(
    kind: str,
    prompt: str,
    context: str = "",
    structured_context: dict[str, Any] | None = None,
    db: Session | None = None,
    company_id: int | None = None,
    user: Any | None = None,
    max_tokens: int = 1200,
    temperature: float = 0.35,
    conversation_history: list[dict] | None = None,
    company_currency: str | None = None,
    usage_out: dict[str, int] | None = None,
) -> AsyncGenerator[str, None]:
    """
    Version streaming de limule_generate.
    conversation_history : échanges précédents pour le multi-tour.
    company_currency : devise de l'entreprise — injectée dans le system prompt.
    usage_out : dict optionnel rempli avec les vrais compteurs de tokens si le
        fournisseur les renvoie dans le flux SSE (stream_options.include_usage).
    Yield les chunks de texte au fur et à mesure qu'ils arrivent du LLM.
    Si le LLM est indisponible, yield le fallback en un seul bloc.
    """
    resolved_vars: dict[str, str] = {}
    resolved_prompt = prompt
    resolved_context = context

    # Auto-résolution de la devise depuis user_preferences ou company
    resolved_currency = company_currency
    if not resolved_currency and db is not None:
        try:
            from app.models.domain import UserPreference as UserPrefModel
            from sqlalchemy import select as sa_select
            user_id = getattr(user, "id", None) if user else None
            if user_id:
                pref = db.scalar(sa_select(UserPrefModel).where(UserPrefModel.user_id == user_id))
                if pref and getattr(pref, "currency", None):
                    resolved_currency = pref.currency
            if not resolved_currency and company_id:
                pref = db.scalar(sa_select(UserPrefModel).where(UserPrefModel.company_id == company_id))
                if pref and getattr(pref, "currency", None):
                    resolved_currency = pref.currency
        except Exception:
            pass

    if db is not None and company_id and user is not None:
        resolved_prompt, vars_p = resolve_variables(prompt, db, company_id, user)
        resolved_context, vars_c = resolve_variables(context, db, company_id, user)
        resolved_vars = {**vars_p, **vars_c}

    module_key = infer_module_from_context(structured_context)
    system = build_limule_system_prompt(
        kind=kind,
        user=user,
        module_key=module_key,
        intent=kind,
        context=structured_context,
        base_system=_SYSTEM_PROMPTS.get(kind, _DEFAULT_SYSTEM),
    )

    # Injecter la devise réelle de l'entreprise
    if resolved_currency:
        system += (
            f"\n\n═══ DEVISE DE L'ENTREPRISE ═══\n"
            f"La devise locale de cette entreprise est : {resolved_currency}.\n"
            f"Utilise UNIQUEMENT {resolved_currency} pour tous les montants en devise locale dans tes réponses.\n"
            f"Ne suppose pas que c'est du FCFA, XAF ou CFA si ce n'est pas {resolved_currency}."
        )

    if resolved_vars:
        ctx_lines = [
            f"  • {k} : {v}"
            for k, v in resolved_vars.items()
            if v and not v.startswith("{")
        ]
        if ctx_lines:
            system += "\n\nContexte entreprise résolu :\n" + "\n".join(ctx_lines)

    context_pack = render_limule_context_pack(structured_context) or resolved_context
    user_msg = build_limule_user_message(resolved_prompt, context_pack)

    history_msgs = _build_history_messages(conversation_history)
    messages = [
        {"role": "system", "content": system},
        *history_msgs,
        {"role": "user", "content": user_msg},
    ]

    got_any = False
    async for chunk in _stream_llm(messages, max_tokens, temperature, usage_out=usage_out):
        got_any = True
        yield chunk

    if not got_any:
        # Zéro simulacre : en production/staging, pas de réponse métier simulée.
        # On émet un état explicite d'indisponibilité (le flux SSE est déjà ouvert,
        # on ne peut pas renvoyer un code 503 propre — on signale donc clairement).
        if get_settings().is_production:
            yield (
                "⚠️ **IA indisponible** — le fournisseur LLM (Limule) ne répond pas "
                "actuellement. Aucune réponse simulée n'est générée. Réessaie dans un moment."
            )
        elif structured_context:
            yield build_limule_fallback_answer(
                kind=kind,
                prompt=resolved_prompt,
                context=structured_context,
                user=user,
            )
        else:
            yield _fallback_content(kind, resolved_prompt, user)


# ─── Contenu de secours ────────────────────────────────────────────────────────


def _fallback_content(kind: str, prompt: str, user: Any = None) -> str:
    """Contenu professionnel de secours quand le LLM est indisponible."""
    sig = "\n\n— Limule · KOMPTA"
    if user and hasattr(user, "full_name"):
        sig = f"\n\n— Limule · KOMPTA\nGénéré pour {user.full_name}"

    if kind == "email":
        return (
            f"Objet : {prompt[:60]}\n\n"
            f"Bonjour,\n\nSuite à notre échange concernant « {prompt} », "
            f"voici les éléments à prendre en compte :\n\n"
            f"1. Contexte et enjeux\n"
            f"2. Points d'attention\n"
            f"3. Prochaines étapes\n\n"
            f"Restant à votre disposition pour tout complément." + sig
        )
    if kind == "note":
        return (
            f"NOTE DE SERVICE\n\nObjet : {prompt}\n\n"
            f"Il est porté à la connaissance de l'ensemble des collaborateurs concernés que "
            f"les dispositions suivantes s'appliquent à compter de ce jour.\n\n"
            f"Tout collaborateur souhaitant un complément d'information est invité à se "
            f"rapprocher de sa hiérarchie." + sig
        )
    if kind == "clause":
        return (
            f"CLAUSE — {prompt}\n\n"
            f"Le Salarié s'engage à respecter les dispositions suivantes dans l'exercice "
            f"de ses fonctions au sein de l'entreprise, conformément aux textes applicables en zone CEMACE "
            f"en vigueur. Tout manquement pourra donner lieu à des sanctions disciplinaires "
            f"conformes au règlement intérieur et au Code du travail applicable." + sig
        )
    if kind == "declaration":
        return (
            f"ANALYSE DÉCLARATIVE — {prompt}\n\n"
            f"Pièces nécessaires : justificatifs comptables, relevés bancaires, "
            f"états de paie de la période.\n"
            f"Recommandation : vérifier la complétude des pièces avant dépôt. "
            f"Faire relire par un expert-comptable habilité." + sig
        )
    if kind == "meeting_summary":
        return (
            f"RÉSUMÉ DE RÉUNION\n\n"
            f"Objet : {prompt}\n\n"
            f"Décisions prises : à compléter par les participants.\n"
            f"Actions à suivre : assigner les responsables et fixer les délais.\n"
            f"Prochaine réunion : à planifier selon disponibilités." + sig
        )
    return f"Réponse à : {prompt}\n\nLimule a bien reçu votre demande." + sig
