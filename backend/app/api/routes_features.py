"""
routes_features.py — Fonctionnalités complémentaires KOMPTA

Endpoints ajoutés :
- POST /auth/request-reset          Demande de réinitialisation de mot de passe
- POST /auth/reset-password         Réinitialisation effective (token)
- GET  /ai/health                   Statut et disponibilité du LLM (Limule / DeepSeek)
- GET  /payroll/payslips/{id}/download  PDF simple du bulletin de paie
- GET  /teras/export-report         PDF d'export du rapport TERAS
- GET  /audit-logs                  Journal des actions (scoped par company)
- POST /meetings/{id}/agenda        Mise à jour de l'agenda d'une réunion
- GET  /pos/sales/export-csv        Export CSV des ventes POS avec filtres
- GET  /inventory/low-stock         Produits sous le seuil de réapprovisionnement
"""

from __future__ import annotations

import csv
import io
import json
import secrets
import textwrap
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models import (
    AccessAuditLog,
    Company,
    Employee,
    Meeting,
    Payslip,
    PayrollRun,
    Product,
    Sale,
    SaleItem,
    TerasAlert,
    TerasScoreSnapshot,
    User,
)

router = APIRouter()
settings = get_settings()

# ──────────────────────────────────────────────────────────────────────────────
# Reset de mot de passe — tokens PERSISTÉS EN DB, hashés, usage unique, expiration.
# (remplace l'ancien store en mémoire). Le token clair n'est renvoyé en réponse
# qu'en dev/local ; en prod il part par email (si SMTP configuré).
# ──────────────────────────────────────────────────────────────────────────────
import hashlib

from app.models import PasswordResetToken

_RESET_TTL_MINUTES = 30


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _is_prod_env() -> bool:
    env = (getattr(get_settings(), "environment", "") or "").strip().lower()
    return env in {"prod", "production", "staging"}


@router.post("/auth/request-reset")
def request_password_reset(
    payload: dict[str, str],
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Génère un token de réinitialisation persisté en DB (hashé), usage unique.

    En prod : le token part par email si SMTP est configuré, jamais dans la réponse.
    En dev/local : le token clair est renvoyé pour faciliter les tests.
    Lookup permissif (email ou téléphone, plusieurs formats).
    """
    from app.api.routes import _login_lookup_conditions
    identifier = (payload.get("identifier") or "").strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Identifiant requis")

    generic = {"message": "Si un compte correspond, un lien de réinitialisation a été envoyé."}
    user = db.scalar(select(User).where(_login_lookup_conditions(identifier)))
    if not user:
        # Ne jamais révéler si le compte existe (anti-énumération)
        return generic

    # Invalider les anciens tokens actifs de cet utilisateur (un seul à la fois)
    now = datetime.now(timezone.utc)
    old_tokens = db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
    ).all()
    for t in old_tokens:
        t.used_at = now  # marqués consommés → invalides

    clear_token = secrets.token_urlsafe(32)
    reset = PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_reset_token(clear_token),
        expires_at=now + timedelta(minutes=_RESET_TTL_MINUTES),
        request_ip=(request.client.host if request.client else "")[:64],
    )
    db.add(reset)

    # Audit
    try:
        db.add(AccessAuditLog(
            actor_user_id=user.id, target_user_id=user.id,
            action="password_reset_requested",
            details=f"Demande de réinitialisation depuis {reset.request_ip}",
            company_id=user.company_id,
        ))
    except Exception:
        pass
    db.commit()

    # Email en prod (best-effort en arrière-plan)
    settings = get_settings()
    if settings.email_enabled and user.email:
        try:
            from app.services.email import send_reset_password_email
            company = db.get(Company, user.company_id) if user.company_id else None
            background_tasks.add_task(
                send_reset_password_email,
                to=user.email, full_name=user.full_name,
                temp_password=clear_token,  # ici le token, l'email expliquera la procédure
                company_name=(company.name if company else "KOMPTA"),
            )
        except Exception:
            pass

    # En dev/local uniquement : renvoyer le token clair pour test
    if _is_prod_env():
        return generic
    return {
        "message": "Token généré (mode dev).",
        "reset_token": clear_token,
        "expires_in_minutes": _RESET_TTL_MINUTES,
        "note": "Mode local : copiez ce token pour réinitialiser le mot de passe.",
    }


@router.post("/auth/reset-password")
def reset_password(
    payload: dict[str, str],
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Réinitialise le mot de passe via un token DB valide (hashé, usage unique)."""
    token = (payload.get("token") or "").strip()
    new_password = (payload.get("new_password") or "").strip()

    if not token or not new_password:
        raise HTTPException(status_code=400, detail="Token et nouveau mot de passe requis")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Mot de passe trop court (min. 8 caractères)")

    entry = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == _hash_reset_token(token))
    )
    if not entry or entry.used_at is not None:
        raise HTTPException(status_code=400, detail="Token invalide ou déjà utilisé")
    # SQLite stocke les datetimes en naïf : normaliser en UTC aware pour comparer.
    expires_at = entry.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Token expiré")

    user = db.get(User, entry.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    from app.core.security import hash_password
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    # Révoquer toutes les sessions actives (le mdp a changé)
    user.token_version = int(user.token_version or 0) + 1
    entry.used_at = datetime.now(timezone.utc)

    try:
        db.add(AccessAuditLog(
            actor_user_id=user.id, target_user_id=user.id,
            action="password_reset_completed",
            details="Mot de passe réinitialisé via token",
            company_id=user.company_id,
        ))
    except Exception:
        pass
    db.commit()

    return {"message": "Mot de passe réinitialisé avec succès."}


# ──────────────────────────────────────────────────────────────────────────────
# LLM / AI Health
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/ai/health")
async def ai_health(
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Vérifie la disponibilité du LLM configuré.
    Retourne status: ok | degraded | offline et latency_ms.
    """
    import time
    import httpx

    settings = get_settings()
    provider = settings.ai_provider.lower() if hasattr(settings, "ai_provider") else "deepseek"

    if provider == "ollama":
        base = getattr(settings, "ollama_base_url", "http://localhost:11434")
        url = f"{base.rstrip('/')}/api/tags"
        try:
            t0 = time.monotonic()
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(url)
            latency = int((time.monotonic() - t0) * 1000)
            if r.status_code == 200:
                models = [m.get("name") for m in r.json().get("models", [])]
                return {"status": "ok", "provider": "ollama", "latency_ms": latency, "models": models}
        except Exception:
            pass
        return {"status": "offline", "provider": "ollama", "latency_ms": None, "models": []}

    # DeepSeek / OpenAI compatible
    api_key = settings.deepseek_api_key if provider == "deepseek" else getattr(settings, "openai_api_key", "")
    if not api_key:
        return {"status": "no_key", "provider": provider, "latency_ms": None, "model": None}

    base_url = settings.deepseek_base_url if provider == "deepseek" else "https://api.openai.com/v1"
    url = f"{base_url.rstrip('/')}/models"
    try:
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
        latency = int((time.monotonic() - t0) * 1000)
        if r.status_code == 200:
            model = settings.deepseek_model if provider == "deepseek" else getattr(settings, "ai_model", "")
            return {"status": "ok", "provider": provider, "latency_ms": latency, "model": model}
    except Exception:
        pass
    return {"status": "offline", "provider": provider, "latency_ms": None, "model": None}


# ──────────────────────────────────────────────────────────────────────────────
# Payslip PDF download
# ──────────────────────────────────────────────────────────────────────────────

def _generate_payslip_pdf_bytes(slip: Payslip, company_name: str) -> bytes:
    """Génère un PDF simple du bulletin de paie (sans librairie externe via HTML→bytes simulé)."""
    # On génère un HTML minimaliste converti en bytes (texte brut PDF-like)
    # Pour une vraie app : utiliser weasyprint ou reportlab
    content = f"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]
  /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>
endobj
4 0 obj << /Length 800 >>
stream
BT
/F1 14 Tf
50 800 Td (BULLETIN DE PAIE) Tj
/F1 10 Tf
0 -30 Td ({company_name}) Tj
0 -20 Td (Reference : {slip.reference}) Tj
0 -20 Td (Employe    : {slip.employee_name}) Tj
0 -40 Td (Salaire brut     : {slip.gross_pay:,.0f} XAF) Tj
0 -20 Td (Deductions       : {slip.deductions:,.0f} XAF) Tj
0 -20 Td (NET A PAYER      : {slip.net_pay:,.0f} XAF) Tj
0 -30 Td (Mode paiement : {slip.payout_method}) Tj
0 -20 Td (Destination    : {slip.payout_destination}) Tj
0 -20 Td (Statut paiement: {slip.payout_status}) Tj
0 -40 Td (Document genere automatiquement par KOMPTA) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000317 00000 n
trailer << /Root 1 0 R /Size 5 >>
startxref
1170
%%EOF"""
    return content.encode("latin-1", errors="replace")


@router.get("/payroll/payslips/{payslip_id}/download")
def download_payslip(
    payslip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Télécharge le bulletin de paie d'un employé en PDF."""
    privileged_roles = {"admin_entreprise", "manager_entreprise", "rh_entreprise", "super_admin"}
    slip = db.scalar(
        select(Payslip)
        .join(PayrollRun, Payslip.payroll_run_id == PayrollRun.id)
        .where(Payslip.id == payslip_id, PayrollRun.company_id == current_user.company_id)
    )
    if not slip:
        raise HTTPException(status_code=404, detail="Bulletin introuvable")
    if current_user.role not in privileged_roles and slip.employee_id != current_user.employee_id:
        raise HTTPException(status_code=404, detail="Bulletin introuvable")

    company = db.get(Company, current_user.company_id)
    company_name = company.name if company else "KOMPTA"
    db.add(
        AccessAuditLog(
            company_id=current_user.company_id,
            actor_user_id=current_user.id,
            employee_id=slip.employee_id,
            action="payroll.payslip_download",
            details=f"Payslip#{payslip_id} telecharge : {slip.reference}",
        )
    )
    db.commit()

    pdf_bytes = _generate_payslip_pdf_bytes(slip, company_name)
    filename = f"bulletin_{slip.reference}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ──────────────────────────────────────────────────────────────────────────────
# TERAS PDF Report Export
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/teras/export-report")
def teras_export_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Exporte le rapport TERAS complet de la société en PDF (texte structuré)."""
    company = db.get(Company, current_user.company_id)
    company_name = company.name if company else "KOMPTA"

    snapshots = db.scalars(
        select(TerasScoreSnapshot)
        .where(TerasScoreSnapshot.company_id == current_user.company_id)
        .order_by(TerasScoreSnapshot.created_at.desc())
    ).all()

    alerts = db.scalars(
        select(TerasAlert)
        .where(TerasAlert.company_id == current_user.company_id, TerasAlert.status == "open")
        .order_by(TerasAlert.severity)
    ).all()

    now = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")
    lines = [
        f"RAPPORT TERAS — {company_name}",
        f"Généré le : {now}",
        "=" * 60,
        "",
        "SCORES PAR DOMAINE",
        "-" * 40,
    ]
    for snap in snapshots:
        lines.append(f"  [{snap.domain.upper():20s}]  Score: {snap.score}/100  Confiance: {snap.confidence}%")
        lines.append(f"    Maturité : {snap.maturity_level}")
        if snap.summary:
            lines.append(f"    Résumé   : {snap.summary[:200]}")
        lines.append("")

    lines += ["", "ALERTES OUVERTES", "-" * 40]
    for alert in alerts:
        lines.append(f"  [{alert.severity.upper():8s}] {alert.title}")
        if alert.recommendation:
            lines.append(f"    → {alert.recommendation[:200]}")
    if not alerts:
        lines.append("  Aucune alerte ouverte.")

    lines += ["", "=" * 60, "Document généré automatiquement par KOMPTA / TERAS Engine."]

    report_text = "\n".join(lines)
    pdf_content = f"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]
  /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> >> >>
endobj
4 0 obj << /Length {len(report_text) + 50} >>
stream
BT /F1 9 Tf 40 800 Td 12 TL
"""
    for line in lines[:60]:  # limit to ~60 lines for simple PDF
        safe = line.replace("(", "\\(").replace(")", "\\)").replace("\\", "\\\\")
        pdf_content += f"({safe[:90]}) Tj T*\n"
    pdf_content += "ET\nendstream\nendobj\nxref\n0 5\ntrailer << /Root 1 0 R /Size 5 >>\nstartxref\n0\n%%EOF"

    pdf_bytes = pdf_content.encode("latin-1", errors="replace")
    filename = f"teras_report_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ──────────────────────────────────────────────────────────────────────────────
# Audit Logs (company-scoped)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/audit-logs")
def list_audit_logs(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Retourne le journal d'audit de la société (dernières actions)."""
    logs = db.scalars(
        select(AccessAuditLog)
        .where(AccessAuditLog.company_id == current_user.company_id)
        .order_by(AccessAuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    result = []
    for log in logs:
        actor = None
        if log.actor_user_id:
            u = db.get(User, log.actor_user_id)
            actor = u.full_name if u else f"User#{log.actor_user_id}"

        emp_name = None
        if log.employee_id:
            e = db.get(Employee, log.employee_id)
            emp_name = f"{e.first_name} {e.last_name}" if e else f"Emp#{log.employee_id}"

        result.append({
            "id": log.id,
            "action": log.action,
            "details": log.details,
            "actor": actor,
            "employee": emp_name,
            "created_at": log.created_at,
        })
    return result


# ──────────────────────────────────────────────────────────────────────────────
# Meeting agenda update
# ──────────────────────────────────────────────────────────────────────────────

@router.patch("/meetings/{meeting_id}/agenda")
def update_meeting_agenda(
    meeting_id: int,
    payload: dict[str, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Met à jour l'ordre du jour d'une réunion."""
    meeting = db.scalar(
        select(Meeting).where(
            Meeting.id == meeting_id,
            Meeting.company_id == current_user.company_id,
        )
    )
    if not meeting:
        raise HTTPException(status_code=404, detail="Réunion introuvable")

    meeting.agenda = payload.get("agenda", "")
    db.commit()
    return {"id": meeting.id, "agenda": meeting.agenda, "updated": True}


# ──────────────────────────────────────────────────────────────────────────────
# POS — CSV export with filters
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/pos/sales/export-csv")
def export_pos_sales_csv(
    date_from: str | None = Query(None, description="YYYY-MM-DD"),
    date_to: str | None = Query(None, description="YYYY-MM-DD"),
    product_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Exporte les ventes POS en CSV avec filtres optionnels."""
    query = select(Sale).where(Sale.company_id == current_user.company_id)

    if date_from:
        try:
            from datetime import date
            df = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.where(Sale.created_at >= df)
        except ValueError:
            pass

    if date_to:
        try:
            dt = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
            query = query.where(Sale.created_at < dt)
        except ValueError:
            pass

    sales = db.scalars(query.order_by(Sale.created_at.desc())).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Reçu", "Date", "Montant (XAF)", "Méthode paiement", "Statut", "Produits"])

    for sale in sales:
        items_str = "; ".join(
            f"{item.product_name} x{item.quantity}"
            for item in sale.items
            if (product_id is None or item.product_id == product_id)
        )
        if product_id and not items_str:
            continue
        writer.writerow([
            sale.receipt_number,
            sale.created_at.strftime("%d/%m/%Y %H:%M"),
            f"{sale.total_amount:,.0f}",
            sale.payment_method,
            sale.status,
            items_str,
        ])

    output.seek(0)
    filename = f"ventes_pos_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),  # utf-8-sig for Excel compatibility
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ──────────────────────────────────────────────────────────────────────────────
# Inventory — low stock alert
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/inventory/low-stock")
def get_low_stock_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Retourne les produits dont le stock est inférieur ou égal au seuil de réapprovisionnement."""
    products = db.scalars(
        select(Product)
        .where(
            Product.company_id == current_user.company_id,
            Product.stock_quantity <= Product.reorder_level,
        )
        .order_by(Product.stock_quantity)
    ).all()

    return [
        {
            "id": p.id,
            "name": p.name,
            "sku": p.sku,
            "category": p.category,
            "stock_quantity": p.stock_quantity,
            "reorder_level": p.reorder_level,
            "deficit": max(0, p.reorder_level - p.stock_quantity),
            "price": p.price,
        }
        for p in products
    ]
