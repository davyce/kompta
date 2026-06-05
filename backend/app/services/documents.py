"""
documents.py — Gestion documentaire KOMPTA avec pipeline d'intelligence complète.

Pipeline à l'upload :
  1. Validation MIME + taille (blocage si non autorisé)         ← sécurité D3
  2. Persistance fichier sur disque
  3. Extraction texte brut (PDF, Excel, Word, CSV, texte…)      ← doc_parser
  4. Extraction LLM structurée (montants, parties, risques…)    ← doc_extractor
  5. Analyse/classification basique (type, tags, résumé)        ← deepseek.analyze_document
  6. Ingestion automatique DB (suggestions, jamais Invoice réel) ← doc_extractor.ingest_extracted_data
  7. Persistance enrichie dans CompanyDocument
"""
from __future__ import annotations

import json
import re
import secrets
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

# ── Sécurité upload (D3) ──────────────────────────────────────────────────────

# Types MIME autorisés (allowlist stricte)
ALLOWED_MIME_TYPES: frozenset[str] = frozenset({
    # Documents textuels
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "text/plain",
    "text/csv",
    # Images (pour OCR)
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/tiff",
})

# Extensions autorisées (double vérification)
ALLOWED_EXTENSIONS: frozenset[str] = frozenset({
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".odt", ".ods",
    ".txt", ".csv", ".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif",
})

# Taille maximale : 15 Mo
MAX_UPLOAD_SIZE_BYTES: int = 15 * 1024 * 1024  # 15 MB


def validate_upload_security(upload: UploadFile, content: bytes) -> None:
    """Valide MIME, extension et taille avant traitement.
    Lève HTTPException 422 si le fichier n'est pas autorisé.
    """
    # Vérification taille
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Fichier trop volumineux : {len(content) // (1024*1024)} Mo. Maximum autorisé : {MAX_UPLOAD_SIZE_BYTES // (1024*1024)} Mo.",
        )

    # Vérification MIME (déclaré par le client)
    mime = (upload.content_type or "").lower().split(";")[0].strip()
    if mime and mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Type de fichier non autorisé : {mime}. Types acceptés : PDF, Word, Excel, CSV, images.",
        )

    # Vérification extension
    filename = upload.filename or ""
    ext = Path(filename).suffix.lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Extension non autorisée : {ext}. Extensions acceptées : {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
        )

    # Vérification magic bytes pour les types les plus courants
    if mime == "application/pdf" and not content.startswith(b"%PDF"):
        raise HTTPException(
            status_code=422,
            detail="Le fichier ne semble pas être un PDF valide (signature incorrecte).",
        )

from app.core.config import get_settings
from app.models import CompanyDocument, Employee, User
from app.services.deepseek import analyze_document
from app.services.doc_parser import extract_text_from_bytes, extract_text
from app.services.doc_extractor import extract_structured_data, ingest_extracted_data


def _safe_filename(filename: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "-", filename.strip()) or "document.bin"
    return cleaned[:180]


def storage_root() -> Path:
    root = Path(get_settings().document_storage_dir)
    if not root.is_absolute():
        root = Path.cwd() / root
    root.mkdir(parents=True, exist_ok=True)
    return root


# ──────────────────────────────────────────────────────────────────────────────
# Pipeline principal
# ──────────────────────────────────────────────────────────────────────────────

async def create_document_record(
    db: Session,
    *,
    title: str,
    filename: str,
    content: bytes,
    mime_type: str,
    current_user: User,
    source_module: str = "documents",
    employee_id: int | None = None,
    content_preview: str = "",   # gardé pour rétro-compatibilité, mais non utilisé
) -> CompanyDocument:
    """
    Crée un CompanyDocument avec extraction complète :
    texte brut + données structurées LLM + ingestion automatique.
    """
    safe_name = _safe_filename(filename)
    unique_name = f"{current_user.company_id}-{secrets.token_hex(8)}-{safe_name}"
    path = storage_root() / unique_name
    path.write_bytes(content)

    # ── 1. Extraction texte brut ───────────────────────────────────────────────
    parse_result = extract_text_from_bytes(content, mime_type=mime_type, filename=filename)
    raw_text: str = parse_result.get("text") or ""
    parse_method: str = parse_result.get("method") or "unknown"

    # Fallback pour la preview (rétro-compat analyse légère)
    effective_preview = raw_text[:8000] if raw_text else content_preview[:5000]

    # ── 2. Analyse/classification LLM basique (type, résumé, tags, confidence) ─
    analysis = await analyze_document(title or safe_name, safe_name, effective_preview)
    doc_type = str(analysis["document_type"])

    # ── 3. Extraction LLM structurée (montants, parties, risques…) ────────────
    extracted: dict[str, Any] = {}
    if raw_text and len(raw_text.strip()) >= 30:
        extracted = await extract_structured_data(raw_text, doc_type=doc_type, title=title or safe_name)
        # Utilise le type du LLM extracteur si plus précis
        if extracted.get("document_type") and extracted["document_type"] != "general":
            doc_type = extracted["document_type"]

    # ── 4. Persistance document ────────────────────────────────────────────────
    document = CompanyDocument(
        title=title or safe_name,
        filename=safe_name,
        storage_path=str(path),
        mime_type=mime_type,
        size_bytes=len(content),
        document_type=doc_type,
        source_module=source_module,
        status="classified",
        ai_summary=str(extracted.get("resume") or analysis.get("summary") or ""),
        ai_tags=", ".join(str(tag) for tag in (extracted.get("tags") or analysis.get("tags") or [])),
        confidence=int(extracted.get("confidence") or analysis.get("confidence") or 70),
        raw_text=raw_text[:60_000],         # tronque à 60k pour SQLite/Postgres
        extracted_data=json.dumps(extracted, ensure_ascii=False, default=str),
        text_length=len(raw_text),
        parse_method=parse_method,
        employee_id=employee_id,
        created_by_user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    # ── 5. Ingestion automatique (factures, etc.) — après commit pour avoir l'id ──
    if extracted and document.id:
        try:
            ingest_extracted_data(
                db,
                document_id=document.id,
                company_id=current_user.company_id,
                extracted=extracted,
                created_by_user_id=current_user.id,
            )
        except Exception as exc:  # noqa: BLE001
            # L'ingestion auto ne doit jamais faire échouer l'upload
            import logging
            logging.getLogger(__name__).warning("Ingestion auto échouée pour doc %d: %s", document.id, exc)

    return document


async def create_document_from_upload(
    db: Session,
    *,
    upload: UploadFile,
    title: str,
    current_user: User,
    employee_id: int | None = None,
) -> CompanyDocument:
    # ── D3 : Validation sécurité avant tout traitement ────────────────────────
    content = await upload.read()
    validate_upload_security(upload, content)
    # ─────────────────────────────────────────────────────────────────────────
    return await create_document_record(
        db,
        title=title or upload.filename or "document",
        filename=upload.filename or "document.bin",
        content=content,
        mime_type=upload.content_type or "application/octet-stream",
        current_user=current_user,
        employee_id=employee_id,
    )


async def reanalyze_document(
    db: Session,
    *,
    document: CompanyDocument,
    content_preview: str = "",
    full_reextract: bool = True,
) -> CompanyDocument:
    """
    Ré-analyse un document existant.
    Si full_reextract=True (défaut), relit le fichier depuis le disque et refait tout le pipeline.
    """
    raw_text = document.raw_text or ""
    parse_method = document.parse_method or ""

    # Re-lit le fichier si raw_text manquant ou si on force
    if full_reextract or not raw_text:
        path = Path(document.storage_path)
        if path.exists():
            parse_result = extract_text(path, mime_type=document.mime_type, filename=document.filename)
            raw_text = parse_result.get("text") or ""
            parse_method = parse_result.get("method") or parse_method
        elif content_preview:
            raw_text = content_preview

    effective_preview = raw_text[:8000] if raw_text else content_preview[:5000]

    # Analyse basique
    analysis = await analyze_document(document.title, document.filename, effective_preview)
    doc_type = str(analysis["document_type"])

    # Extraction structurée
    extracted: dict[str, Any] = {}
    if raw_text and len(raw_text.strip()) >= 30:
        extracted = await extract_structured_data(raw_text, doc_type=doc_type, title=document.title)
        if extracted.get("document_type") and extracted["document_type"] != "general":
            doc_type = extracted["document_type"]

    document.document_type = doc_type
    document.ai_summary = str(extracted.get("resume") or analysis.get("summary") or "")
    document.ai_tags = ", ".join(str(tag) for tag in (extracted.get("tags") or analysis.get("tags") or []))
    document.confidence = int(extracted.get("confidence") or analysis.get("confidence") or 70)
    document.raw_text = raw_text[:60_000]
    document.extracted_data = json.dumps(extracted, ensure_ascii=False, default=str)
    document.text_length = len(raw_text)
    document.parse_method = parse_method
    document.status = "classified"
    db.commit()
    db.refresh(document)

    # Re-ingestion
    if extracted and document.id:
        try:
            ingest_extracted_data(
                db,
                document_id=document.id,
                company_id=document.company_id,
                extracted=extracted,
            )
        except Exception as exc:  # noqa: BLE001
            import logging
            logging.getLogger(__name__).warning("Re-ingestion échouée pour doc %d: %s", document.id, exc)

    return document


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def employee_document_count(db: Session, employee: Employee) -> int:
    return (
        db.scalar(
            select(CompanyDocument)
            .where(CompanyDocument.company_id == employee.company_id, CompanyDocument.employee_id == employee.id)
            .limit(1)
        )
        is not None
    )


def document_payload_for_employee(db: Session, employee: Employee) -> list[dict[str, Any]]:
    documents = db.scalars(
        select(CompanyDocument).where(
            CompanyDocument.company_id == employee.company_id,
            CompanyDocument.employee_id == employee.id,
        )
    ).all()
    return [
        {
            "id": doc.id,
            "title": doc.title,
            "type": doc.document_type,
            "confidence": doc.confidence,
            "summary": doc.ai_summary,
            "tags": doc.ai_tags,
            "text_length": doc.text_length,
            "parse_method": doc.parse_method,
        }
        for doc in documents
    ]


def serialize_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str)


def get_document_extracted(document: CompanyDocument) -> dict[str, Any]:
    """Retourne les données extraites désérialisées."""
    try:
        return json.loads(document.extracted_data or "{}")
    except (json.JSONDecodeError, TypeError):
        return {}
