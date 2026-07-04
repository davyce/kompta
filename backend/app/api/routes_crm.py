"""
routes_crm.py — CRM léger : pipeline d'opportunités (prospects → devis → facture).

Endpoints :
  GET    /crm/opportunities                      — liste (filtrable par stage)
  POST   /crm/opportunities                      — créer une opportunité
  PATCH  /crm/opportunities/{id}                  — modifier (ex: changer d'étape)
  DELETE /crm/opportunities/{id}                  — supprimer
  GET    /crm/pipeline/summary                   — agrégats par étape
  POST   /crm/opportunities/{id}/convert-to-invoice — convertir une opportunité gagnée en facture
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes import _next_invoice_number
from app.db.session import get_db
from app.models.domain import Client, Invoice, InvoiceLine, Opportunity
from app.schemas.domain import (
    ConvertOpportunityResult,
    OpportunityCreate,
    OpportunityRead,
    OpportunityUpdate,
    PipelineStageSummary,
    PipelineSummaryRead,
)
from app.services import accounting as _accounting

router = APIRouter(prefix="/crm", tags=["crm"])

STAGES = ["nouveau", "qualifie", "proposition", "negociation", "gagne", "perdu"]


@router.get("/opportunities", response_model=list[OpportunityRead])
def list_opportunities(
    stage: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[Opportunity]:
    stmt = select(Opportunity).where(Opportunity.company_id == current_user.company_id)
    if stage:
        stmt = stmt.where(Opportunity.stage == stage)
    stmt = stmt.order_by(Opportunity.created_at.desc())
    return db.scalars(stmt).all()


@router.post("/opportunities", response_model=OpportunityRead, status_code=201)
def create_opportunity(
    payload: OpportunityCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Opportunity:
    if payload.client_id is not None:
        client = db.get(Client, payload.client_id)
        if not client or client.company_id != current_user.company_id:
            raise HTTPException(404, "Client introuvable")
    opportunity = Opportunity(
        **payload.model_dump(),
        company_id=current_user.company_id,
    )
    db.add(opportunity)
    db.commit()
    db.refresh(opportunity)
    return opportunity


@router.patch("/opportunities/{opportunity_id}", response_model=OpportunityRead)
def update_opportunity(
    opportunity_id: int,
    payload: OpportunityUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Opportunity:
    opportunity = db.get(Opportunity, opportunity_id)
    if not opportunity or opportunity.company_id != current_user.company_id:
        raise HTTPException(404, "Opportunité introuvable")
    data = payload.model_dump(exclude_unset=True)
    if "stage" in data and data["stage"] not in STAGES:
        raise HTTPException(422, f"Étape invalide : {data['stage']}")
    for k, v in data.items():
        setattr(opportunity, k, v)
    opportunity.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(opportunity)
    return opportunity


@router.delete("/opportunities/{opportunity_id}", status_code=204)
def delete_opportunity(
    opportunity_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    opportunity = db.get(Opportunity, opportunity_id)
    if not opportunity or opportunity.company_id != current_user.company_id:
        raise HTTPException(404, "Opportunité introuvable")
    db.delete(opportunity)
    db.commit()


@router.get("/pipeline/summary", response_model=PipelineSummaryRead)
def pipeline_summary(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> PipelineSummaryRead:
    opportunities = db.scalars(
        select(Opportunity).where(Opportunity.company_id == current_user.company_id)
    ).all()
    by_stage: dict[str, PipelineStageSummary] = {
        stage: PipelineStageSummary(stage=stage, count=0, total_estimated_amount_cents=0)
        for stage in STAGES
    }
    for opp in opportunities:
        entry = by_stage.setdefault(
            opp.stage, PipelineStageSummary(stage=opp.stage, count=0, total_estimated_amount_cents=0)
        )
        entry.count += 1
        entry.total_estimated_amount_cents += opp.estimated_amount_cents or 0
    return PipelineSummaryRead(stages=list(by_stage.values()))


@router.post("/opportunities/{opportunity_id}/convert-to-invoice", response_model=ConvertOpportunityResult, status_code=201)
def convert_opportunity_to_invoice(
    opportunity_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ConvertOpportunityResult:
    opportunity = db.get(Opportunity, opportunity_id)
    if not opportunity or opportunity.company_id != current_user.company_id:
        raise HTTPException(404, "Opportunité introuvable")
    if opportunity.stage != "gagne":
        raise HTTPException(422, "Seule une opportunité 'gagnée' peut être convertie en facture")

    existing_invoice = db.scalar(
        select(Invoice).where(
            Invoice.source_opportunity_id == opportunity.id,
            Invoice.company_id == current_user.company_id,
        )
    )
    if existing_invoice is not None:
        raise HTTPException(409, "Cette opportunité a déjà été convertie en facture.")

    client = None
    if opportunity.client_id is not None:
        client = db.get(Client, opportunity.client_id)
    if client is None:
        # Créer un client léger à partir du contact capturé inline.
        client = Client(
            name=opportunity.contact_name or opportunity.title,
            email=opportunity.contact_email or None,
            phone=opportunity.contact_phone or None,
            status="active",
            company_id=current_user.company_id,
        )
        db.add(client)
        db.flush()
        opportunity.client_id = client.id

    amount = (opportunity.estimated_amount_cents or 0) / 100.0
    invoice = Invoice(
        number=_next_invoice_number(db, current_user.company_id),
        customer_name=client.name,
        customer_email=client.email,
        status="draft",
        source_opportunity_id=opportunity.id,
        company_id=current_user.company_id,
    )
    invoice.lines.append(
        InvoiceLine(
            description=opportunity.title,
            quantity=1,
            unit_price=amount,
            unit_price_cents=opportunity.estimated_amount_cents or 0,
            tax_rate=0.0,
            total=amount,
            total_cents=opportunity.estimated_amount_cents or 0,
        )
    )
    invoice.subtotal = round(amount, 2)
    invoice.tax_amount = 0.0
    invoice.total_amount = round(amount, 2)
    invoice.subtotal_cents = opportunity.estimated_amount_cents or 0
    invoice.tax_amount_cents = 0
    invoice.total_amount_cents = opportunity.estimated_amount_cents or 0

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    return ConvertOpportunityResult(
        invoice_id=invoice.id,
        invoice_number=invoice.number,
        client_id=client.id,
    )
