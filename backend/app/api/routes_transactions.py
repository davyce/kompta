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

from pydantic import BaseModel

from app.api.deps import get_current_user, get_db
from app.api.routes import _require_admin
from app.models import BankTransaction, BankStatementImport, BankStatementLine, PaymentAccount, Company
from app.schemas.domain import BankTransactionCreate, BankTransactionRead, BankTransactionUpdate, CashDepositCreate
from app.services import accounting as _accounting
from app.services.currency import convert_to_xaf

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
    total_credits = sum(
        convert_to_xaf(r.credit or max(r.amount, 0), r.currency, current_user.company_id, db) for r in rows
    )
    total_debits = sum(
        convert_to_xaf(r.debit or max(-r.amount, 0), r.currency, current_user.company_id, db) for r in rows
    )
    balance       = total_credits - total_debits
    by_category: dict[str, float] = {}
    for r in rows:
        cat = r.category or "divers"
        by_category[cat] = by_category.get(cat, 0) + convert_to_xaf(abs(r.amount), r.currency, current_user.company_id, db)
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


@router.post("/transactions/cash-deposit", response_model=BankTransactionRead, status_code=201)
def create_cash_deposit(
    payload: CashDepositCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> BankTransaction:
    """Dépôt de trésorerie : enregistre l'ajout d'espèces (issues du coffre par ex.)
    dans la trésorerie suivie. Repostable à volonté (chaque dépôt est un mouvement
    distinct), contrairement au solde d'ouverture qui est unique par compte.

    Poste une écriture équilibrée : Dr compte de trésorerie / Cr 101 Capital.
    Atomique : si l'écriture comptable échoue, la transaction bancaire est annulée
    (cf. pattern ACC-01 dans create_sale).
    """
    payment_account: PaymentAccount | None = None
    currency = "XAF"
    account_code = "571"  # Caisse espèces par défaut
    account_label = "Espèces (caisse)"
    if payload.payment_account_id is not None:
        payment_account = db.scalar(
            select(PaymentAccount).where(
                PaymentAccount.id == payload.payment_account_id,
                PaymentAccount.company_id == current_user.company_id,
            )
        )
        if not payment_account:
            raise HTTPException(status_code=404, detail="Compte de paiement introuvable")
        currency = payment_account.currency or "XAF"
        account_code = _accounting.treasury_account_code(payment_account.provider)
        account_label = payment_account.label or account_label

    label = payload.label.strip() if payload.label else f"Dépôt de trésorerie ({account_label})"

    txn = BankTransaction(
        company_id=current_user.company_id,
        payment_account_id=payload.payment_account_id,
        date=payload.date,
        label=label,
        amount=payload.amount,
        debit=None,
        credit=payload.amount,
        currency=currency,
        category="depot_tresorerie",
        source_type="depot_tresorerie",
        status="confirmed",
    )
    db.add(txn)
    db.flush()

    company = db.get(Company, current_user.company_id)
    amount_xaf = convert_to_xaf(payload.amount, currency, current_user.company_id, db)
    amount_cents = _accounting.to_cents(amount_xaf)
    try:
        if amount_cents > 0:
            lines = [
                {"code": account_code, "debit": amount_cents, "credit": 0, "label": label},
                {"code": "101", "debit": 0, "credit": amount_cents, "label": "Capital — dépôt de trésorerie"},
            ]
            _accounting.post_entry(
                db,
                company_id=current_user.company_id,
                label=label,
                lines=lines,
                source_type="cash_deposit",
                source_id=txn.id,
                entry_date=datetime.strptime(payload.date, "%Y-%m-%d").date(),
                currency="XAF",
                user_id=current_user.id,
            )
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Le dépôt de trésorerie n'a pas pu être enregistré (échec de l'écriture comptable). Réessayez.",
        )

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
    # Suppression définitive d'un enregistrement financier : réservée aux
    # admins (cf. audit). Un rôle non-admin ne doit pas pouvoir effacer une
    # transaction bancaire, qui fait foi pour la réconciliation et la
    # comptabilité de l'entreprise.
    _require_admin(current_user)
    txn = db.get(BankTransaction, txn_id)
    if not txn or txn.company_id != current_user.company_id:
        raise HTTPException(404, "Transaction introuvable")
    db.delete(txn)
    db.commit()


# ═══════════════════════════════════════════════════════════════════
# RÉCONCILIATION BANCAIRE
# ═══════════════════════════════════════════════════════════════════

def _get_payment_account_scoped(db: Session, account_id: int, current_user: Any) -> PaymentAccount:
    account = db.get(PaymentAccount, account_id)
    if not account or account.company_id != current_user.company_id:
        raise HTTPException(404, "Compte de paiement introuvable")
    return account


def _get_import_scoped(db: Session, import_id: int, current_user: Any) -> BankStatementImport:
    imp = db.get(BankStatementImport, import_id)
    if not imp or imp.company_id != current_user.company_id:
        raise HTTPException(404, "Import introuvable")
    return imp


def _parse_amount(raw: str) -> float | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s = s.replace(" ", "").replace(" ", "")
    # Format FR : "1.234,56" ou "1234,56" -> point décimal = virgule
    if "," in s and "." in s:
        # Le dernier séparateur rencontré est le séparateur décimal
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _parse_date(raw: str) -> str | None:
    if not raw:
        return None
    s = str(raw).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _sniff_rows(content: bytes) -> list[list[str]]:
    """Parse défensif d'un CSV : gère ; ou , comme délimiteur, encodage utf-8/latin-1."""
    text_data = None
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text_data = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text_data is None:
        text_data = content.decode("utf-8", errors="ignore")

    sample = text_data[:4096]
    # Les relevés FR utilisent ';' comme séparateur et ',' comme décimale des
    # montants -> on privilégie toujours ';' s'il est présent, pour éviter que
    # csv.Sniffer() ne confonde la virgule décimale avec un délimiteur.
    if ";" in sample:
        delimiter = ";"
    elif "\t" in sample:
        delimiter = "\t"
    else:
        delimiter = ","

    reader = csv.reader(io.StringIO(text_data), delimiter=delimiter)
    return [row for row in reader if row and any(cell.strip() for cell in row)]


def _extract_statement_rows(content: bytes) -> list[dict]:
    """
    Best-effort : supporte un CSV 3 colonnes (date, libellé, montant), tolère un
    en-tête, colonnes dans un ordre différent, et formats FR (DD/MM/YYYY, virgule).
    """
    rows = _sniff_rows(content)
    parsed: list[dict] = []
    for row in rows:
        cells = [c.strip() for c in row]
        if len(cells) < 2:
            continue
        # Cherche la cellule date, la cellule montant, le reste = libellé
        date_val = None
        amount_val = None
        date_idx = None
        amount_idx = None
        for idx, cell in enumerate(cells):
            if date_val is None:
                d = _parse_date(cell)
                if d:
                    date_val = d
                    date_idx = idx
                    continue
            if amount_val is None:
                a = _parse_amount(cell)
                if a is not None and cell.replace(".", "").replace(",", "").replace("-", "").replace(" ", "").isdigit() is False:
                    # cellule contient des chiffres + séparateurs seulement -> a déjà été calculé par _parse_amount
                    pass
                if a is not None:
                    amount_val = a
                    amount_idx = idx

        if date_val is None or amount_val is None:
            continue  # ligne d'en-tête ou illisible -> ignorée

        label_cells = [
            c for i, c in enumerate(cells)
            if i != date_idx and i != amount_idx and c
        ]
        label = " ".join(label_cells).strip() or "—"

        parsed.append({"date": date_val, "label": label[:400], "amount": amount_val})
    return parsed


def _run_matching(db: Session, imp: BankStatementImport) -> None:
    """Fait correspondre les lignes 'unmatched' de cet import à des BankTransaction existantes."""
    lines = db.scalars(
        select(BankStatementLine)
        .where(BankStatementLine.import_id == imp.id, BankStatementLine.match_status == "unmatched")
    ).all()
    if not lines:
        return

    already_matched_ids = {
        r for (r,) in db.execute(
            select(BankStatementLine.matched_transaction_id)
            .where(BankStatementLine.matched_transaction_id.is_not(None))
        ).all()
    }

    candidates = db.scalars(
        select(BankTransaction).where(BankTransaction.company_id == imp.company_id)
    ).all()

    for line in lines:
        line_date = datetime.strptime(line.date, "%Y-%m-%d")
        best_exact = None
        best_suggested = None
        best_suggested_delta = None
        for txn in candidates:
            if txn.id in already_matched_ids:
                continue
            txn_cents = round((txn.amount or 0) * 100)
            if txn_cents != line.amount_cents:
                continue
            try:
                txn_date = datetime.strptime(txn.date, "%Y-%m-%d")
            except (ValueError, TypeError):
                continue
            delta = abs((txn_date - line_date).days)
            if delta > 3:
                continue
            if delta == 0:
                best_exact = txn
                break
            if best_suggested_delta is None or delta < best_suggested_delta:
                best_suggested = txn
                best_suggested_delta = delta

        if best_exact is not None:
            line.match_status = "matched"
            line.matched_transaction_id = best_exact.id
            already_matched_ids.add(best_exact.id)
        elif best_suggested is not None:
            line.match_status = "suggested"
            line.candidate_transaction_id = best_suggested.id
        # sinon reste "unmatched"

    db.flush()
    imp.matched_count = db.scalar(
        select(func.count()).select_from(BankStatementLine)
        .where(BankStatementLine.import_id == imp.id, BankStatementLine.match_status == "matched")
    ) or 0
    imp.suggested_count = db.scalar(
        select(func.count()).select_from(BankStatementLine)
        .where(BankStatementLine.import_id == imp.id, BankStatementLine.match_status == "suggested")
    ) or 0
    imp.unmatched_count = db.scalar(
        select(func.count()).select_from(BankStatementLine)
        .where(BankStatementLine.import_id == imp.id, BankStatementLine.match_status == "unmatched")
    ) or 0
    imp.status = "done"


def _line_to_dict(line: BankStatementLine, db: Session) -> dict:
    d = {
        "id": line.id,
        "import_id": line.import_id,
        "date": line.date,
        "label": line.label,
        "amount": round(line.amount_cents / 100, 2),
        "raw_reference": line.raw_reference,
        "match_status": line.match_status,
        "matched_transaction_id": line.matched_transaction_id,
        "candidate_transaction_id": line.candidate_transaction_id,
        "matched_transaction": None,
        "candidate_transaction": None,
    }
    if line.matched_transaction_id:
        t = db.get(BankTransaction, line.matched_transaction_id)
        if t:
            d["matched_transaction"] = {"id": t.id, "date": t.date, "label": t.label, "amount": t.amount}
    if line.candidate_transaction_id:
        t = db.get(BankTransaction, line.candidate_transaction_id)
        if t:
            d["candidate_transaction"] = {"id": t.id, "date": t.date, "label": t.label, "amount": t.amount}
    return d


@router.post("/treasury/accounts/{account_id}/statements/import")
async def import_bank_statement(
    account_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Importe un relevé bancaire (CSV) pour un compte de paiement et lance le rapprochement auto."""
    account = _get_payment_account_scoped(db, account_id, current_user)
    content = await file.read()
    filename = file.filename or "releve.csv"

    rows = _extract_statement_rows(content)
    if not rows:
        raise HTTPException(422, "Impossible d'extraire des lignes de ce fichier. Vérifiez le format (date; libellé; montant).")

    imp = BankStatementImport(
        company_id=current_user.company_id,
        payment_account_id=account.id,
        filename=filename[:300],
        status="processing",
        line_count=len(rows),
    )
    db.add(imp)
    db.flush()

    for row in rows:
        line = BankStatementLine(
            import_id=imp.id,
            date=row["date"],
            label=row["label"],
            amount_cents=round(row["amount"] * 100),
            match_status="unmatched",
        )
        db.add(line)
    db.flush()

    _run_matching(db, imp)
    db.commit()
    db.refresh(imp)

    lines = db.scalars(
        select(BankStatementLine).where(BankStatementLine.import_id == imp.id).order_by(BankStatementLine.date)
    ).all()

    return {
        "import_id": imp.id,
        "filename": imp.filename,
        "status": imp.status,
        "line_count": imp.line_count,
        "matched_count": imp.matched_count,
        "suggested_count": imp.suggested_count,
        "unmatched_count": imp.unmatched_count,
        "lines": [_line_to_dict(l, db) for l in lines],
    }


@router.post("/treasury/statements/{import_id}/match")
def rerun_matching(
    import_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    imp = _get_import_scoped(db, import_id, current_user)
    _run_matching(db, imp)
    db.commit()
    db.refresh(imp)
    return {"import_id": imp.id, "matched_count": imp.matched_count, "suggested_count": imp.suggested_count, "unmatched_count": imp.unmatched_count}


@router.get("/treasury/statements/{import_id}")
def get_bank_statement_import(
    import_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    imp = _get_import_scoped(db, import_id, current_user)
    lines = db.scalars(
        select(BankStatementLine).where(BankStatementLine.import_id == imp.id).order_by(BankStatementLine.date)
    ).all()
    return {
        "import_id": imp.id,
        "filename": imp.filename,
        "payment_account_id": imp.payment_account_id,
        "status": imp.status,
        "line_count": imp.line_count,
        "matched_count": imp.matched_count,
        "suggested_count": imp.suggested_count,
        "unmatched_count": imp.unmatched_count,
        "imported_at": imp.imported_at,
        "lines": [_line_to_dict(l, db) for l in lines],
    }


class ConfirmLinePayload(BaseModel):
    transaction_id: int


def _get_line_scoped(db: Session, line_id: int, current_user: Any) -> tuple[BankStatementLine, BankStatementImport]:
    line = db.get(BankStatementLine, line_id)
    if not line:
        raise HTTPException(404, "Ligne introuvable")
    imp = db.get(BankStatementImport, line.import_id)
    if not imp or imp.company_id != current_user.company_id:
        raise HTTPException(404, "Ligne introuvable")
    return line, imp


@router.post("/treasury/statements/lines/{line_id}/confirm")
def confirm_statement_line(
    line_id: int,
    payload: ConfirmLinePayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    line, imp = _get_line_scoped(db, line_id, current_user)
    txn = db.get(BankTransaction, payload.transaction_id)
    if not txn or txn.company_id != current_user.company_id:
        raise HTTPException(404, "Transaction introuvable")
    line.matched_transaction_id = txn.id
    line.match_status = "matched"
    db.commit()
    db.refresh(line)
    return _line_to_dict(line, db)


@router.post("/treasury/statements/lines/{line_id}/create-transaction")
def create_transaction_from_line(
    line_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    line, imp = _get_line_scoped(db, line_id, current_user)
    txn = BankTransaction(
        company_id=imp.company_id,
        payment_account_id=imp.payment_account_id,
        date=line.date,
        label=line.label,
        amount=round(line.amount_cents / 100, 2),
        debit=abs(round(line.amount_cents / 100, 2)) if line.amount_cents < 0 else None,
        credit=round(line.amount_cents / 100, 2) if line.amount_cents > 0 else None,
        currency="XAF",
        source_type="releve_bancaire",
        status="reconciled",
    )
    db.add(txn)
    db.flush()
    line.matched_transaction_id = txn.id
    line.match_status = "matched"
    db.commit()
    db.refresh(line)
    return _line_to_dict(line, db)


@router.post("/treasury/statements/lines/{line_id}/ignore")
def ignore_statement_line(
    line_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    line, imp = _get_line_scoped(db, line_id, current_user)
    line.match_status = "ignored"
    db.commit()
    db.refresh(line)
    return _line_to_dict(line, db)
