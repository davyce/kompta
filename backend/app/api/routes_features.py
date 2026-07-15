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

import asyncio
import csv
import io
import json
import secrets
import textwrap
import time
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

_AI_HEALTH_TTL_SECONDS = 120.0
_ai_health_cache: dict[str, Any] | None = None
_ai_health_cache_at: float = 0.0
_ai_health_lock = asyncio.Lock()


@router.get("/ai/health")
async def ai_health(
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Vérifie la disponibilité du LLM configuré.
    Retourne status: ok | degraded | offline et latency_ms.

    Mise en cache serveur (TTL 2 min, verrou anti-emballement) : sans ça,
    chaque utilisateur qui charge l'app déclenchait un nouvel appel externe
    (jusqu'à 8s de timeout) vers le fournisseur IA — contribuait à des
    chargements à froid de ~27s et à des timeouts sur /workspace.
    """
    global _ai_health_cache, _ai_health_cache_at

    now = time.monotonic()
    if _ai_health_cache is not None and (now - _ai_health_cache_at) < _AI_HEALTH_TTL_SECONDS:
        return _ai_health_cache

    async with _ai_health_lock:
        # Un autre appel concurrent a peut-être déjà rafraîchi le cache
        # pendant qu'on attendait le verrou.
        now = time.monotonic()
        if _ai_health_cache is not None and (now - _ai_health_cache_at) < _AI_HEALTH_TTL_SECONDS:
            return _ai_health_cache

        result = await _check_ai_health()
        _ai_health_cache = result
        _ai_health_cache_at = time.monotonic()
        return result


async def _check_ai_health() -> dict[str, Any]:
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
    """Génère un vrai PDF du bulletin de paie avec ReportLab."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor, black, white
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Table, TableStyle

    buf = io.BytesIO()
    W, H = A4  # 595 x 842 pt
    c = rl_canvas.Canvas(buf, pagesize=A4)

    # ── En-tête ──────────────────────────────────────────────────────────────
    GREEN = HexColor("#10b981")
    DARK  = HexColor("#17211f")
    GREY  = HexColor("#717182")

    # Bandeau vert
    c.setFillColor(GREEN)
    c.rect(0, H - 60, W, 60, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(20 * mm, H - 38, "BULLETIN DE PAIE")
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, H - 52, company_name[:80])

    # Référence à droite
    c.setFont("Helvetica-Bold", 10)
    ref_txt = f"Réf : {slip.reference}"
    c.drawRightString(W - 20 * mm, H - 38, ref_txt)

    # ── Informations employé ──────────────────────────────────────────────────
    y = H - 90
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, y, "Informations de l'employé")
    c.setStrokeColor(GREEN)
    c.setLineWidth(1.5)
    c.line(20 * mm, y - 3, W - 20 * mm, y - 3)

    y -= 20
    c.setFont("Helvetica", 10)
    c.setFillColor(GREY)
    c.drawString(20 * mm, y, "Nom et prénom :")
    c.setFillColor(DARK)
    c.drawString(80 * mm, y, (slip.employee_name or "—")[:60])

    y -= 16
    c.setFillColor(GREY)
    c.drawString(20 * mm, y, "Méthode de paiement :")
    c.setFillColor(DARK)
    c.drawString(80 * mm, y, (slip.payout_method or "—"))

    y -= 16
    c.setFillColor(GREY)
    c.drawString(20 * mm, y, "Destination :")
    c.setFillColor(DARK)
    c.drawString(80 * mm, y, (slip.payout_destination or "—")[:60])

    y -= 16
    c.setFillColor(GREY)
    c.drawString(20 * mm, y, "Statut paiement :")
    c.setFillColor(DARK)
    c.drawString(80 * mm, y, (slip.payout_status or "—"))

    # ── Tableau des montants ──────────────────────────────────────────────────
    y -= 36
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, y, "Détail de la rémunération")
    c.setStrokeColor(GREEN)
    c.line(20 * mm, y - 3, W - 20 * mm, y - 3)

    rows = [
        ["Libellé", "Montant (XAF)"],
        ["Salaire brut", f"{slip.gross_pay:,.0f}"],
        ["Total déductions", f"- {slip.deductions:,.0f}"],
        ["Net à payer", f"{slip.net_pay:,.0f}"],
    ]
    col_w = [(W - 40 * mm) * 0.65, (W - 40 * mm) * 0.35]
    tbl = Table(rows, colWidths=col_w, rowHeights=22)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), GREEN),
        ("TEXTCOLOR",    (0, 0), (-1, 0), white),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 10),
        ("ALIGN",        (1, 0), (1, -1), "RIGHT"),
        ("BACKGROUND",   (0, -1), (-1, -1), HexColor("#f0fdf4")),
        ("FONTNAME",     (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TEXTCOLOR",    (0, -1), (-1, -1), DARK),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [white, HexColor("#f8fafc")]),
        ("GRID",         (0, 0), (-1, -1), 0.5, HexColor("#e2e8f0")),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    tbl.wrapOn(c, W, H)
    y -= 10
    tbl.drawOn(c, 20 * mm, y - len(rows) * 22)

    # ── Pied de page ─────────────────────────────────────────────────────────
    c.setFillColor(GREY)
    c.setFont("Helvetica-Oblique", 8)
    c.drawCentredString(W / 2, 20 * mm, "Document généré automatiquement par KOMPTA — Confidentiel")
    c.setStrokeColor(HexColor("#e2e8f0"))
    c.line(20 * mm, 25 * mm, W - 20 * mm, 25 * mm)

    c.save()
    return buf.getvalue()


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
# Audit Logs : voir `routes_audit.py` (GET /audit-logs canonique — agrège les deux
# tables audit_logs + access_audit_logs, RBAC, pagination). Le doublon plus pauvre
# qui existait ici a été retiré (il était shadowé par le router audit de toute façon).
# ──────────────────────────────────────────────────────────────────────────────


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
