import json
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas import DeclarationRequest, WritingRequest


def mock_writing_response(payload: WritingRequest, signer_name: str) -> dict[str, Any]:
    return {
        "draft": (
            f"Bonjour,\n\nSuite a vos notes, voici une proposition de {payload.content_type} "
            f"au ton {payload.tone} pour {payload.audience}.\n\n{payload.notes.strip()}\n\n"
            f"Cordialement,\n{signer_name}"
        ),
        "confidence": 76,
        "sources": ["Contexte utilisateur", "Parametres entreprise", "Historique local mocke"],
        "provider": "mock",
    }


def mock_declaration_response(payload: DeclarationRequest) -> dict[str, Any]:
    return {
        "case": f"{payload.declaration_type.upper()}-{payload.period}",
        "status": "draft_ready",
        "confidence": 74,
        "missing_documents": ["Releve bancaire de la periode", "Justificatifs de deux depenses programme"],
        "checklist": [
            "Verifier l'identite fiscale de l'entreprise",
            "Controler les factures et encaissements",
            "Valider la paie de la periode",
            "Faire relire par un humain avant depot",
        ],
        "provider": "mock",
    }


async def _deepseek_chat(messages: list[dict[str, str]], max_tokens: int = 900) -> str | None:
    settings = get_settings()
    if not settings.deepseek_api_key:
        return None

    url = f"{settings.deepseek_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.deepseek_model,
        "messages": messages,
        "temperature": 0.4,
        "max_tokens": max_tokens,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.deepseek_timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError:
        return None

    choices = data.get("choices") or []
    if not choices:
        return None
    message = choices[0].get("message") or {}
    content = message.get("content")
    return content.strip() if isinstance(content, str) and content.strip() else None


async def generate_writing(payload: WritingRequest, signer_name: str) -> dict[str, Any]:
    fallback = mock_writing_response(payload, signer_name)
    content = await _deepseek_chat(
        [
            {
                "role": "system",
                "content": (
                    "Tu es l'assistant de redaction KOMPTA. Redige en francais clair, professionnel, "
                    "directement utilisable par une entreprise. Ne mentionne pas que tu es une IA."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Type: {payload.content_type}\nTon: {payload.tone}\nAudience: {payload.audience}\n"
                    f"Signataire: {signer_name}\nNotes:\n{payload.notes}"
                ),
            },
        ]
    )
    if not content:
        return fallback
    return {
        "draft": content,
        "confidence": 82,
        "sources": ["DeepSeek", "Notes utilisateur", "Contexte KOMPTA"],
        "provider": "deepseek",
    }


async def generate_declaration(payload: DeclarationRequest) -> dict[str, Any]:
    fallback = mock_declaration_response(payload)
    content = await _deepseek_chat(
        [
            {
                "role": "system",
                "content": (
                    "Tu es l'assistant declaration/conformite KOMPTA. Retourne uniquement un JSON valide "
                    "avec les cles case, status, confidence, missing_documents, checklist."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Prepare une pre-declaration {payload.declaration_type} pour la periode {payload.period}. "
                    "Liste les pieces manquantes probables et une checklist de validation humaine."
                ),
            },
        ],
        max_tokens=700,
    )
    if not content:
        return fallback
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        parsed = {
            "case": f"{payload.declaration_type.upper()}-{payload.period}",
            "status": "draft_ready",
            "confidence": 78,
            "missing_documents": [],
            "checklist": [content],
        }
    parsed["provider"] = "deepseek"
    return parsed


def _extract_json(content: str) -> dict[str, Any] | None:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(content[start : end + 1])
            except json.JSONDecodeError:
                return None
    return None


VALID_DOCUMENT_TYPES = {
    "contrat_travail", "facture", "bulletin_paie", "declaration",
    "attestation", "convention", "reglement", "rapport", "general",
}


def normalize_document_type(raw: str) -> str:
    """Normalise un type de document retourné par le LLM vers les types connus."""
    if not raw:
        return "general"
    lowered = raw.lower().strip()
    # Correspondances directes
    if lowered in VALID_DOCUMENT_TYPES:
        return lowered
    # Correspondances par mots-clés
    if "contrat" in lowered or "travail" in lowered or "employment" in lowered:
        return "contrat_travail"
    if "facture" in lowered or "invoice" in lowered:
        return "facture"
    if "paie" in lowered or "bulletin" in lowered or "salaire" in lowered:
        return "bulletin_paie"
    if "fiscal" in lowered or "declaration" in lowered or "tax" in lowered:
        return "declaration"
    if "attestation" in lowered or "certificat" in lowered or "confirmation" in lowered:
        return "attestation"
    if "convention" in lowered or "accord" in lowered:
        return "convention"
    if "reglement" in lowered or "procedure" in lowered:
        return "reglement"
    if "rapport" in lowered or "report" in lowered or "bilan" in lowered:
        return "rapport"
    return "general"


def fallback_document_analysis(title: str, filename: str, content_preview: str = "") -> dict[str, Any]:
    lowered = f"{title} {filename} {content_preview}".lower()
    if "contrat" in lowered or "travail" in lowered:
        document_type = "contrat_travail"
        tags = ["RH", "Contrat", "Employe"]
    elif "facture" in lowered or "invoice" in lowered:
        document_type = "facture"
        tags = ["Finance", "Facturation"]
    elif "paie" in lowered or "bulletin" in lowered:
        document_type = "bulletin_paie"
        tags = ["Paie", "RH"]
    elif "fiscal" in lowered or "declaration" in lowered:
        document_type = "declaration"
        tags = ["Conformite", "Fiscal"]
    elif "attestation" in lowered or "certificat" in lowered:
        document_type = "attestation"
        tags = ["RH", "Attestation"]
    elif "rapport" in lowered or "bilan" in lowered:
        document_type = "rapport"
        tags = ["Direction", "Rapport"]
    else:
        document_type = "general"
        tags = ["Document", "A classer"]
    return {
        "document_type": document_type,
        "summary": "Document classé automatiquement. Analyse IA externe indisponible ou non sollicitée.",
        "tags": tags,
        "confidence": 68,
        "risks": [],
        "provider": "mock",
    }


async def analyze_document(title: str, filename: str, content_preview: str = "") -> dict[str, Any]:
    fallback = fallback_document_analysis(title, filename, content_preview)
    content = await _deepseek_chat(
        [
            {
                "role": "system",
                "content": (
                    "Tu es l'agent documentaire KOMPTA. Classe et analyse le document. "
                    "Retourne uniquement un JSON avec document_type, summary, tags, confidence, risks."
                ),
            },
            {
                "role": "user",
                "content": f"Titre: {title}\nNom fichier: {filename}\nExtrait:\n{content_preview[:3000]}",
            },
        ],
        max_tokens=600,
    )
    if not content:
        return fallback
    parsed = _extract_json(content)
    if not parsed:
        fallback["summary"] = content[:800]
        fallback["provider"] = "deepseek"
        return fallback
    raw_type = str(parsed.get("document_type") or fallback["document_type"])
    return {
        "document_type": normalize_document_type(raw_type),
        "summary": str(parsed.get("summary") or parsed.get("resume") or fallback["summary"]),
        "tags": parsed.get("tags") if isinstance(parsed.get("tags"), list) else fallback["tags"],
        "confidence": int(parsed.get("confidence") or fallback["confidence"]),
        "risks": parsed.get("risks") if isinstance(parsed.get("risks"), list) else [],
        "provider": "deepseek",
    }


async def generate_contract_clauses(company_name: str, employee_payload: dict[str, Any]) -> dict[str, Any]:
    fallback = {
        "title": "Contrat de travail",
        "clauses": [
            "L'employe exercera ses fonctions selon la fiche de poste et les instructions raisonnables de l'entreprise.",
            "La remuneration indiquee est une reference contractuelle sous reserve des validations fiscales, sociales et internes.",
            "Les acces numeriques, documents et informations professionnelles sont personnels, confidentiels et auditables.",
            "L'employe devra respecter les procedures internes, les obligations de confidentialite et les regles de securite.",
        ],
        "provider": "mock",
    }
    content = await _deepseek_chat(
        [
            {
                "role": "system",
                "content": (
                    "Tu es juriste RH assistant pour KOMPTA. Genere des clauses de contrat de travail en francais "
                    "professionnel. Retourne uniquement un JSON avec title et clauses (liste)."
                ),
            },
            {
                "role": "user",
                "content": f"Entreprise: {company_name}\nEmploye:\n{json.dumps(employee_payload, ensure_ascii=False)}",
            },
        ],
        max_tokens=900,
    )
    if not content:
        return fallback
    parsed = _extract_json(content)
    if not parsed:
        return {"title": "Contrat de travail", "clauses": [content], "provider": "deepseek"}
    clauses = parsed.get("clauses")
    return {
        "title": str(parsed.get("title") or "Contrat de travail"),
        "clauses": clauses if isinstance(clauses, list) and clauses else fallback["clauses"],
        "provider": "deepseek",
    }
