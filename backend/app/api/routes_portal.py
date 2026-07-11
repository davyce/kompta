"""
routes_portal.py — Portail client public (auth séparée du reste de l'app).

Espace où les clients d'une entreprise KOMPTA (modèle `Client`, PAS `User`)
se connectent avec un mot de passe dédié pour voir leurs factures, télécharger
les PDF, et demander le paiement via Mobile Money (instructions manuelles,
pas d'intégration live avec un opérateur).

Endpoints :
  POST /portal/auth/set-password              — (admin User) génère un mot de passe portail pour un Client
  POST /portal/auth/login                      — (public) login Client -> token scope=client_portal
  GET  /portal/me/company                      — infos entreprise (branding)
  GET  /portal/me/invoices                     — factures du client connecté
  GET  /portal/me/invoices/{invoice_id}/pdf    — PDF de la facture
  POST /portal/me/invoices/{invoice_id}/request-payment — instructions Mobile Money
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_client, get_current_user
from app.core.security import (
    clear_portal_auth_cookie,
    create_access_token,
    hash_password,
    set_portal_auth_cookie,
    verify_password,
)
from app.db.session import get_db
from app.models import User
from app.models.domain import Client, Company, Invoice, PaymentAccount
from app.services.access import generate_temporary_password

router = APIRouter(prefix="/portal", tags=["portal"])


# ═══════════════════════════════════════════════════════════════════
# Schemas
# ═══════════════════════════════════════════════════════════════════

class SetPortalPasswordRequest(BaseModel):
    client_id: int


class SetPortalPasswordResponse(BaseModel):
    client_id: int
    email: str | None
    temporary_password: str
    portal_enabled: bool


class PortalLoginRequest(BaseModel):
    email: str
    password: str


class PortalTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    client_id: int
    client_name: str


class PortalClientRead(BaseModel):
    client_id: int
    client_name: str


class PortalCompanyRead(BaseModel):
    id: int
    name: str
    logo_path: str | None = None


class PortalInvoiceRead(BaseModel):
    id: int
    number: str
    status: str
    total_amount: float
    currency: str
    due_date: str | None = None
    payment_requested_at: str | None = None
    created_at: str | None = None


class PortalInvoiceLineRead(BaseModel):
    id: int
    description: str
    quantity: int
    unit_price: float
    tax_rate: float
    total: float


class PortalInvoiceDetailRead(PortalInvoiceRead):
    lines: list[PortalInvoiceLineRead]


class PortalChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class PortalPaymentInstructions(BaseModel):
    invoice_number: str
    amount: float
    currency: str
    reference: str
    provider: str | None = None
    phone_number: str | None = None
    account_name: str | None = None
    instructions: str | None = None
    requested_at: str


# ═══════════════════════════════════════════════════════════════════
# Admin : provisionner l'accès portail d'un client
# ═══════════════════════════════════════════════════════════════════

@router.post("/auth/set-password", response_model=SetPortalPasswordResponse)
def set_portal_password(
    payload: SetPortalPasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SetPortalPasswordResponse:
    if current_user.role not in {"super_admin", "admin_entreprise", "manager_entreprise"} and "portal.manage" not in (current_user.permissions or []):
        raise HTTPException(status_code=403, detail="Vous n'avez pas la permission de gérer l'accès portail des clients.")
    client = db.get(Client, payload.client_id)
    if not client or client.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Client introuvable")

    temporary_password = generate_temporary_password()
    client.portal_password_hash = hash_password(temporary_password)
    client.portal_enabled = True
    client.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(client)

    return SetPortalPasswordResponse(
        client_id=client.id,
        email=client.email,
        temporary_password=temporary_password,
        portal_enabled=client.portal_enabled,
    )


# ═══════════════════════════════════════════════════════════════════
# Auth client (public)
# ═══════════════════════════════════════════════════════════════════

@router.post("/auth/login", response_model=PortalTokenResponse)
def portal_login(payload: PortalLoginRequest, response: Response, db: Session = Depends(get_db)) -> PortalTokenResponse:
    email = payload.email.strip().lower()
    password = payload.password.strip()
    if not email or not password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides")

    # L'email n'est pas forcément unique entre entreprises : on essaie tous
    # les Client correspondants et on garde celui dont le mot de passe matche
    # (même schéma que le login multi-comptes de /auth/login).
    candidates = db.scalars(
        select(Client).where(Client.portal_enabled.is_(True), Client.email.ilike(email))
    ).all()
    client = None
    for candidate in candidates:
        if candidate.portal_password_hash and verify_password(password, candidate.portal_password_hash):
            client = candidate
            break
    if not client:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe invalide")

    token = create_access_token(
        subject=str(client.id),
        extra={"scope": "client_portal", "company_id": client.company_id},
    )
    # Cookie HttpOnly en plus du token dans le corps de la réponse (le
    # frontend arrête de stocker le token en localStorage — vecteur de vol
    # de session par XSS — et s'appuie désormais sur ce cookie ambiant).
    set_portal_auth_cookie(response, token)
    return PortalTokenResponse(access_token=token, client_id=client.id, client_name=client.name)


@router.post("/auth/logout")
def portal_logout(response: Response) -> dict:
    clear_portal_auth_cookie(response)
    return {"status": "logged_out"}


@router.post("/auth/change-password")
def portal_change_password(
    payload: PortalChangePasswordRequest,
    db: Session = Depends(get_db),
    current_client: Client = Depends(get_current_client),
) -> dict:
    if not current_client.portal_password_hash or not verify_password(
        payload.current_password.strip(), current_client.portal_password_hash
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Mot de passe actuel incorrect")
    new_password = payload.new_password.strip()
    if len(new_password) < 8:
        raise HTTPException(status_code=422, detail="Le nouveau mot de passe doit contenir au moins 8 caractères")
    current_client.portal_password_hash = hash_password(new_password)
    current_client.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "password_changed"}


# ═══════════════════════════════════════════════════════════════════
# Espace client (auth client-portal requise)
# ═══════════════════════════════════════════════════════════════════

@router.get("/me", response_model=PortalClientRead)
def portal_me(current_client: Client = Depends(get_current_client)) -> PortalClientRead:
    """Restaure la session au chargement de page via le cookie HttpOnly
    (symétrique de /auth/me côté app principale) — le frontend n'a plus besoin
    de garder le token en mémoire persistante pour savoir qui est connecté."""
    return PortalClientRead(client_id=current_client.id, client_name=current_client.name)


@router.get("/me/company", response_model=PortalCompanyRead)
def portal_company(
    db: Session = Depends(get_db),
    current_client: Client = Depends(get_current_client),
) -> PortalCompanyRead:
    company = db.get(Company, current_client.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Entreprise introuvable")
    return PortalCompanyRead(id=company.id, name=company.name, logo_path=getattr(company, "logo_path", None))


def _invoice_query_for_client(current_client: Client):
    conditions = [Invoice.company_id == current_client.company_id]
    if current_client.email:
        conditions.append(
            (Invoice.client_id == current_client.id) | (Invoice.customer_email.ilike(current_client.email))
        )
    else:
        conditions.append(Invoice.client_id == current_client.id)
    return select(Invoice).where(*conditions)


@router.get("/me/invoices", response_model=list[PortalInvoiceRead])
def portal_my_invoices(
    db: Session = Depends(get_db),
    current_client: Client = Depends(get_current_client),
) -> list[PortalInvoiceRead]:
    stmt = _invoice_query_for_client(current_client).order_by(Invoice.created_at.desc())
    invoices = db.scalars(stmt).all()
    return [
        PortalInvoiceRead(
            id=inv.id,
            number=inv.number,
            status=inv.status,
            total_amount=inv.total_amount,
            currency=inv.currency,
            due_date=inv.due_date.isoformat() if inv.due_date else None,
            payment_requested_at=inv.payment_requested_at.isoformat() if inv.payment_requested_at else None,
            created_at=inv.created_at.isoformat() if inv.created_at else None,
        )
        for inv in invoices
    ]


@router.get("/me/invoices/{invoice_id}", response_model=PortalInvoiceDetailRead)
def portal_invoice_detail(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_client: Client = Depends(get_current_client),
) -> PortalInvoiceDetailRead:
    invoice = _get_owned_invoice(db, invoice_id, current_client)
    return PortalInvoiceDetailRead(
        id=invoice.id,
        number=invoice.number,
        status=invoice.status,
        total_amount=invoice.total_amount,
        currency=invoice.currency,
        due_date=invoice.due_date.isoformat() if invoice.due_date else None,
        payment_requested_at=invoice.payment_requested_at.isoformat() if invoice.payment_requested_at else None,
        created_at=invoice.created_at.isoformat() if invoice.created_at else None,
        lines=[
            PortalInvoiceLineRead(
                id=line.id,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
                tax_rate=line.tax_rate,
                total=line.total,
            )
            for line in invoice.lines
        ],
    )


def _get_owned_invoice(db: Session, invoice_id: int, current_client: Client) -> Invoice:
    invoice = db.scalar(
        select(Invoice).options(selectinload(Invoice.lines)).where(Invoice.id == invoice_id)
    )
    if not invoice or invoice.company_id != current_client.company_id:
        raise HTTPException(status_code=404, detail="Facture introuvable")
    owns = invoice.client_id == current_client.id or (
        current_client.email and invoice.customer_email
        and invoice.customer_email.strip().lower() == current_client.email.strip().lower()
    )
    if not owns:
        raise HTTPException(status_code=404, detail="Facture introuvable")
    return invoice


@router.get("/me/invoices/{invoice_id}/pdf")
def portal_invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_client: Client = Depends(get_current_client),
) -> Response:
    invoice = _get_owned_invoice(db, invoice_id, current_client)
    company = db.get(Company, current_client.company_id)
    from app.services.pdf_export import render_invoice_pdf

    pdf_bytes = render_invoice_pdf(invoice, company)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="facture-{invoice.number}.pdf"'},
    )


@router.post("/me/invoices/{invoice_id}/request-payment", response_model=PortalPaymentInstructions)
def portal_request_payment(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_client: Client = Depends(get_current_client),
) -> PortalPaymentInstructions:
    invoice = _get_owned_invoice(db, invoice_id, current_client)
    invoice.payment_requested_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(invoice)

    account = db.scalar(
        select(PaymentAccount).where(
            PaymentAccount.company_id == current_client.company_id,
            PaymentAccount.provider == "mobile_money",
            PaymentAccount.enabled.is_(True),
        ).order_by(PaymentAccount.is_default_pos.desc())
    )

    return PortalPaymentInstructions(
        invoice_number=invoice.number,
        amount=invoice.total_amount,
        currency=invoice.currency,
        reference=invoice.number,
        provider=account.label if account else None,
        phone_number=account.phone_number if account else None,
        account_name=account.account_name if account else None,
        instructions=account.instructions if account else "Contactez l'entreprise pour connaître les modalités de paiement Mobile Money.",
        requested_at=invoice.payment_requested_at.isoformat(),
    )
