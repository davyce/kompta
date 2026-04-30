import json
import re
import secrets
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import CompanyDocument, Employee, User
from app.services.deepseek import analyze_document


def _safe_filename(filename: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "-", filename.strip()) or "document.bin"
    return cleaned[:180]


def storage_root() -> Path:
    root = Path(get_settings().document_storage_dir)
    if not root.is_absolute():
        root = Path.cwd() / root
    root.mkdir(parents=True, exist_ok=True)
    return root


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
    content_preview: str = "",
) -> CompanyDocument:
    safe_name = _safe_filename(filename)
    unique_name = f"{current_user.company_id}-{secrets.token_hex(8)}-{safe_name}"
    path = storage_root() / unique_name
    path.write_bytes(content)

    analysis = await analyze_document(title or safe_name, safe_name, content_preview)
    document = CompanyDocument(
        title=title or safe_name,
        filename=safe_name,
        storage_path=str(path),
        mime_type=mime_type,
        size_bytes=len(content),
        document_type=str(analysis["document_type"]),
        source_module=source_module,
        status="classified",
        ai_summary=str(analysis["summary"]),
        ai_tags=", ".join(str(tag) for tag in analysis.get("tags", [])),
        confidence=int(analysis.get("confidence") or 70),
        employee_id=employee_id,
        created_by_user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


async def create_document_from_upload(
    db: Session,
    *,
    upload: UploadFile,
    title: str,
    current_user: User,
    employee_id: int | None = None,
) -> CompanyDocument:
    content = await upload.read()
    preview = ""
    if (upload.content_type or "").startswith("text/") or upload.filename.endswith((".txt", ".md", ".csv")):
        preview = content[:5000].decode("utf-8", errors="ignore")
    return await create_document_record(
        db,
        title=title or upload.filename,
        filename=upload.filename,
        content=content,
        mime_type=upload.content_type or "application/octet-stream",
        current_user=current_user,
        employee_id=employee_id,
        content_preview=preview,
    )


async def reanalyze_document(db: Session, *, document: CompanyDocument, content_preview: str = "") -> CompanyDocument:
    analysis = await analyze_document(document.title, document.filename, content_preview)
    document.document_type = str(analysis["document_type"])
    document.ai_summary = str(analysis["summary"])
    document.ai_tags = ", ".join(str(tag) for tag in analysis.get("tags", []))
    document.confidence = int(analysis.get("confidence") or 70)
    document.status = "classified"
    db.commit()
    db.refresh(document)
    return document


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
        select(CompanyDocument).where(CompanyDocument.company_id == employee.company_id, CompanyDocument.employee_id == employee.id)
    ).all()
    return [
        {
            "id": document.id,
            "title": document.title,
            "type": document.document_type,
            "confidence": document.confidence,
            "summary": document.ai_summary,
            "tags": document.ai_tags,
        }
        for document in documents
    ]


def serialize_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str)
