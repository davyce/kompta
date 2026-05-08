"""
routes_transactions.py — Module de suivi des transactions financières.

Endpoints:
  GET    /transactions                    — liste paginée
  POST   /transactions                    — créer manuellement
  PUT    /transactions/{id}               — modifier
  DELETE /transactions/{id}               — supprimer
  POST   /transactions/import             — importer depuis un fichier (PDF/CSV/Excel/image/txt)
  GET    /transactions/export             — export CSV
  GET    /transactions/stats              — statistiques globales
"""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any

import math

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import BankTransaction
from app.schemas.domain import BankTransactionCreate, BankTransactionRead, BankTransactionUpdate

router = APIRouter(tags=["transactions"])

# SYSTEM PROMPT for Limule transaction extraction
EXTRACTION_SYSTEM = """Tu es un expert-comptable KOMPTA spécialisé dans l'extraction de transactions financières.
Tu reçois le texte brut d'un document (relevé bancaire, facture, CSV, etc.) et tu dois extraire TOUTES les transactions.

Retourne UNIQUEMENT un tableau JSON (array) de transactions, chaque transaction ayant cette structure :
[
  {
    "date": "YYYY-MM-DD",
    "label": "libellé complet de la transaction",
    "debit": 0.0,
    "credit": 0.0,
    "balance": null,
    "currency": "XAF",
    "category": "une des catégories ci-dessous",
    "counterpart": "nom du tiers si identifiable",
    "reference": "numéro de référence si présent",
    "raw_line": "ligne originale du document"
  }
]

Catégories possibles (choisir la plus proche) :
"ventes", "achats_fournisseurs", "salaires_charges", "loyer_charges_fixes", "banque_frais",
"impots_taxes", "investissements", "remboursements", "transferts_internes", "divers_entrees",
"divers_sorties", "tresorerie", "clients_reglements", "emprunts_remboursements"

Règles :
- date au format YYYY-MM-DD (si ambiguë, mettre l'année en cours)
- debit = montant sorti (positif)
- credit = montant entré (positif)
- amount = credit - debit (donc négatif si débit)
- Ne pas inventer de données — si une valeur est absente, mettre null
- Convertir les formats monétaires locaux (FCFA, F CFA, CDF → XAF)
- Extraire TOUTES les lignes de transactions, même les petits montants
"""


async def _extract_transactions_with_limule(
    text: str,
    filename: str,
    db: Session,
    company_id: int,
    user: Any,
) -> list[dict]:
    """Utilise Limule pour extraire les transactions d'un texte brut."""
    from app.services.deepseek import _deepseek_chat, _extract_json

    if not text or len(text.strip()) < 10:
        return []

    truncated = text[:15_000]  # max context

    prompt = (
        f"Fichier : {filename}\n\n"
        f"=== CONTENU DU DOCUMENT ===\n{truncated}\n=== FIN ===\n\n"
        f"Extrais TOUTES les transactions selon le format demandé. "
        f"Retourne uniquement le tableau JSON."
    )

    raw = await _deepseek_chat(
        [
            {"role": "system", "content": EXTRACTION_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=0.05,
        max_tokens=8000,
    )

    data = _extract_json(raw)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "transactions" in data:
        return data["transactions"]
    return []


def _normalize_transaction(txn: dict, source_file: str, source_type: str) -> dict:
    """Normalise une transaction extraite."""
    debit  = _safe_float(txn.get("debit"))
    credit = _safe_float(txn.get("credit"))
    amount = _safe_float(txn.get("amount")) or (credit - debit if credit is not None or debit is not None else 0)

    date_str = str(txn.get("date") or "")
    if not date_str or len(date_str) < 4:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Ensure YYYY-MM-DD
    if len(date_str) == 10 and date_str[2] == "/":
        parts = date_str.split("/")
        date_str = f"{parts[2]}-{parts[1]}-{parts[0]}"

    return {
        "date":        date_str[:10],
        "label":       str(txn.get("label") or "")[:400],
        "amount":      amount,
        "debit":       debit,
        "credit":      credit,
        "balance":     _safe_float(txn.get("balance")),
        "currency":    str(txn.get("currency") or "XAF")[:10],
        "category":    str(txn.get("category") or "")[:80],
        "sub_category": str(txn.get("sub_category") or "")[:80] or None,
        "counterpart": str(txn.get("counterpart") or "")[:200] or None,
        "reference":   str(txn.get("reference") or "")[:80] or None,
        "source_type": source_type,
        "source_file": source_file[:300] if source_file else None,
        "status":      "confirmed",
        "raw_line":    str(txn.get("raw_line") or "")[:1000] or None,
    }


def _safe_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        return float(str(val).replace(" ", "").replace(",", "."))
    except (ValueError, TypeError):
        return None


# ═══════════════════════════════════════════════════════════════════
# CRUD
# ═══════════════════════════════════════════════════════════════════

@router.get("/transactions")
def list_transactions(
    skip: int = 0,
    limit: int = 500,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=0, le=200),
    category: str | None = None,
    source_type: str | None = None,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = select(BankTransaction).where(BankTransaction.company_id == current_user.company_id)
    if category:
        q = q.where(BankTransaction.category == category)
    if source_type:
        q = q.where(BankTransaction.source_type == source_type)
    if status:
        q = q.where(BankTransaction.status == status)
    if date_from:
        q = q.where(BankTransaction.date >= date_from)
    if date_to:
        q = q.where(BankTransaction.date <= date_to)
    q = q.order_by(BankTransaction.date.desc())
    if per_page == 0:
        # Legacy: use old skip/limit params
        return db.scalars(q.offset(skip).limit(limit)).all()
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    items = db.scalars(q.offset((page - 1) * per_page).limit(per_page)).all()
    return {"items": items, "total": total, "page": page, "per_page": per_page, "pages": math.ceil(total / per_page) if per_page else 1}


@router.get("/transactions/stats")
def transaction_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    rows = db.scalars(
        select(BankTransaction).where(BankTransaction.company_id == current_user.company_id)
    ).all()
    total_credits = sum(r.credit or max(r.amount, 0) for r in rows)
    total_debits  = sum(r.debit  or max(-r.amount, 0) for r in rows)
    balance       = total_credits - total_debits
    by_category: dict[str, float] = {}
    for r in rows:
        cat = r.category or "divers"
        by_category[cat] = by_category.get(cat, 0) + abs(r.amount)
    return {
        "count":          len(rows),
        "total_credits":  round(total_credits, 2),
        "total_debits":   round(total_debits, 2),
        "balance":        round(balance, 2),
        "by_category":    by_category,
    }


@router.get("/transactions/export")
def export_transactions_csv(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = db.scalars(
        select(BankTransaction)
        .where(BankTransaction.company_id == current_user.company_id)
        .order_by(BankTransaction.date.desc())
    ).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date","Libellé","Débit","Crédit","Solde","Devise","Catégorie","Tiers","Référence","Source","Statut"])
    for r in rows:
        writer.writerow([
            r.date, r.label,
            r.debit or "", r.credit or "", r.balance or "",
            r.currency, r.category, r.counterpart or "",
            r.reference or "", r.source_type, r.status,
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=transactions-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.csv"},
    )


@router.post("/transactions", response_model=BankTransactionRead, status_code=201)
def create_transaction(
    payload: BankTransactionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> BankTransaction:
    txn = BankTransaction(**payload.model_dump(), company_id=current_user.company_id)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@router.post("/transactions/import")
async def import_transactions(
    file: UploadFile = File(...),
    source_type: str = Form("import"),
    document_id: int | None = Form(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Importe des transactions depuis un fichier (PDF, CSV, Excel, texte, image).
    Utilise le pipeline doc_parser + Limule pour extraire les transactions.
    """
    from app.services.doc_parser import extract_text_from_bytes

    content = await file.read()
    mime = file.content_type or "application/octet-stream"
    filename = file.filename or "document"

    # Déterminer source_type depuis le nom du fichier si non fourni
    fname_lower = filename.lower()
    if source_type == "import":
        if "releve" in fname_lower or "statement" in fname_lower or "bancaire" in fname_lower:
            source_type = "releve_bancaire"
        elif "facture" in fname_lower or "invoice" in fname_lower:
            source_type = "facture_externe"
        elif fname_lower.endswith(".csv"):
            source_type = "csv"

    # 1. Extraction texte brut
    parse_result = extract_text_from_bytes(content, mime_type=mime, filename=filename)
    raw_text = parse_result.get("text") or ""
    parse_method = parse_result.get("method") or "unknown"

    if not raw_text or len(raw_text.strip()) < 5:
        raise HTTPException(422, f"Impossible d'extraire le texte de ce fichier (méthode: {parse_method}). Vérifiez que le fichier est lisible.")

    # 2. Extraction Limule
    extracted_txns = await _extract_transactions_with_limule(
        raw_text, filename=filename, db=db,
        company_id=current_user.company_id, user=current_user,
    )

    if not extracted_txns:
        raise HTTPException(422, "Aucune transaction identifiée dans ce document. Vérifiez le contenu du fichier.")

    # 3. Persistance
    created_txns: list[BankTransaction] = []
    for raw_txn in extracted_txns:
        try:
            norm = _normalize_transaction(raw_txn, source_file=filename, source_type=source_type)
            if not norm["label"] or not norm["date"]:
                continue
            txn = BankTransaction(
                **norm,
                document_id=document_id,
                company_id=current_user.company_id,
            )
            db.add(txn)
            created_txns.append(txn)
        except Exception:
            continue

    db.commit()
    for txn in created_txns:
        db.refresh(txn)

    return {
        "imported": len(created_txns),
        "source_file": filename,
        "source_type": source_type,
        "parse_method": parse_method,
        "text_length": len(raw_text),
        "transactions": [
            {
                "id": t.id,
                "date": t.date,
                "label": t.label,
                "amount": t.amount,
                "debit": t.debit,
                "credit": t.credit,
                "balance": t.balance,
                "currency": t.currency,
                "category": t.category,
                "counterpart": t.counterpart,
                "reference": t.reference,
                "source_type": t.source_type,
                "source_file": t.source_file,
                "status": t.status,
            }
            for t in created_txns
        ],
    }


@router.put("/transactions/{txn_id}", response_model=BankTransactionRead)
def update_transaction(
    txn_id: int,
    payload: BankTransactionUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> BankTransaction:
    txn = db.get(BankTransaction, txn_id)
    if not txn or txn.company_id != current_user.company_id:
        raise HTTPException(404, "Transaction introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(txn, k, v)
    db.commit()
    db.refresh(txn)
    return txn


@router.delete("/transactions/{txn_id}", status_code=204)
def delete_transaction(
    txn_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    txn = db.get(BankTransaction, txn_id)
    if not txn or txn.company_id != current_user.company_id:
        raise HTTPException(404, "Transaction introuvable")
    db.delete(txn)
    db.commit()
