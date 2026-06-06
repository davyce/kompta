"""
routes_accounting_reports.py — Rapports comptables exportables (SYSCOHADA-lite).

Endpoints :
  GET /accounting/reports/general-ledger      — Grand livre (par compte, balance cumulée)
  GET /accounting/reports/trial-balance       — Balance générale (par compte, D/C/Solde)
  GET /accounting/reports/balance-sheet       — Bilan au jour J (ACTIF = PASSIF)
  GET /accounting/reports/income-statement    — Compte de résultat (Charges/Produits/Résultat)

Toutes les routes sont scopées par company_id et supportent ?format=json|csv|pdf.
Montants exposés en unités majeures (depuis cents) via accounting.from_cents.
"""
from __future__ import annotations

import csv
import io
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Account, Company, JournalEntry, JournalLine, User
from app.services import accounting as acc

router = APIRouter(prefix="/accounting/reports", tags=["accounting-reports"])

_ACCOUNTING_MANAGER_ROLES = {"comptable", "rh_entreprise", "manager_entreprise", "super_admin"}


def _can_view_reports(user: User) -> bool:
    return user.role.startswith("admin") or user.role in _ACCOUNTING_MANAGER_ROLES


def _guard(user: User) -> None:
    if not _can_view_reports(user):
        raise HTTPException(status_code=403, detail="Permission comptable insuffisante")


def _parse_date(value: str | None, *, field: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Date invalide pour {field}: {value}") from exc


def _accounts_meta(db: Session, company_id: int) -> dict[str, Account]:
    acc.seed_chart_of_accounts(db, company_id)
    db.commit()
    rows = db.scalars(select(Account).where(Account.company_id == company_id)).all()
    return {a.code: a for a in rows}


# ── Helpers d'export ────────────────────────────────────────────────────────
def _csv_response(rows: list[list], filename: str) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf)
    for r in rows:
        writer.writerow(r)
    data = buf.getvalue().encode("utf-8-sig")
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _pdf_response(title: str, headers: list[str], rows: list[list], filename: str,
                  summary_lines: list[str] | None = None) -> Response:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError as exc:  # pragma: no cover — reportlab est listé dans requirements
        raise HTTPException(status_code=500, detail="reportlab indisponible pour export PDF") from exc

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=1 * cm, rightMargin=1 * cm, topMargin=1 * cm, bottomMargin=1 * cm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Title"], fontSize=16, textColor=colors.HexColor("#0f766e"))
    muted = ParagraphStyle("muted", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#6b7280"))

    flowables = [Paragraph(title, title_style), Spacer(1, 0.3 * cm)]
    if summary_lines:
        for line in summary_lines:
            flowables.append(Paragraph(line, muted))
        flowables.append(Spacer(1, 0.4 * cm))

    table_data = [headers] + [[str(c) for c in r] for r in rows]
    table = Table(table_data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    flowables.append(table)
    doc.build(flowables)
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── 1. Grand Livre ──────────────────────────────────────────────────────────
@router.get("/general-ledger")
def general_ledger(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    account: str | None = Query(default=None),
    format: str = Query(default="json", pattern="^(json|csv|pdf)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _guard(current_user)
    d_from = _parse_date(from_, field="from")
    d_to = _parse_date(to, field="to")
    accounts = _accounts_meta(db, current_user.company_id)

    stmt = (
        select(
            JournalLine.account_code,
            JournalEntry.entry_date,
            JournalEntry.reference,
            JournalEntry.label,
            JournalEntry.source_type,
            JournalLine.label,
            JournalLine.debit_cents,
            JournalLine.credit_cents,
        )
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .where(JournalEntry.company_id == current_user.company_id)
        .order_by(JournalLine.account_code.asc(), JournalEntry.entry_date.asc(), JournalEntry.id.asc())
    )
    if d_from is not None:
        stmt = stmt.where(JournalEntry.entry_date >= d_from)
    if d_to is not None:
        stmt = stmt.where(JournalEntry.entry_date <= d_to)
    if account:
        stmt = stmt.where(JournalLine.account_code == account)

    rows = db.execute(stmt).all()

    out: list[dict] = []
    running: dict[str, int] = {}
    for code, dt, ref, entry_label, source_type, line_label, debit, credit in rows:
        running[code] = running.get(code, 0) + (debit - credit)
        out.append({
            "account_code": code,
            "account_name": accounts.get(code).name if accounts.get(code) else code,
            "date": dt.isoformat() if dt else None,
            "journal": source_type,
            "reference": ref,
            "description": line_label or entry_label,
            "debit": acc.from_cents(debit),
            "credit": acc.from_cents(credit),
            "balance_cumulee": acc.from_cents(running[code]),
        })

    payload = {
        "from": d_from.isoformat() if d_from else None,
        "to": d_to.isoformat() if d_to else None,
        "account_filter": account,
        "lines": out,
        "count": len(out),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    if format == "json":
        return payload

    headers = ["Compte", "Libellé compte", "Date", "Journal", "Référence", "Description", "Débit", "Crédit", "Balance cumulée"]
    table_rows = [
        [l["account_code"], l["account_name"], l["date"] or "", l["journal"], l["reference"],
         l["description"], l["debit"], l["credit"], l["balance_cumulee"]]
        for l in out
    ]
    fname_base = f"grand_livre_{(d_from or 'all')}_{(d_to or 'all')}"
    if format == "csv":
        return _csv_response([headers] + table_rows, f"{fname_base}.csv")
    summary = [
        f"Période : {d_from or '—'} → {d_to or '—'}",
        f"Compte filtré : {account or 'tous'}",
        f"Lignes : {len(out)}",
    ]
    return _pdf_response("Grand Livre", headers, table_rows, f"{fname_base}.pdf", summary)


# ── 2. Balance ──────────────────────────────────────────────────────────────
@router.get("/trial-balance")
def trial_balance_report(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    format: str = Query(default="json", pattern="^(json|csv|pdf)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _guard(current_user)
    d_from = _parse_date(from_, field="from")
    d_to = _parse_date(to, field="to")
    accounts = _accounts_meta(db, current_user.company_id)

    stmt = (
        select(
            JournalLine.account_code,
            func.coalesce(func.sum(JournalLine.debit_cents), 0),
            func.coalesce(func.sum(JournalLine.credit_cents), 0),
        )
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .where(JournalEntry.company_id == current_user.company_id)
        .group_by(JournalLine.account_code)
        .order_by(JournalLine.account_code.asc())
    )
    if d_from is not None:
        stmt = stmt.where(JournalEntry.entry_date >= d_from)
    if d_to is not None:
        stmt = stmt.where(JournalEntry.entry_date <= d_to)

    lines: list[dict] = []
    total_debit = total_credit = 0
    for code, debit, credit in db.execute(stmt).all():
        total_debit += debit
        total_credit += credit
        a = accounts.get(code)
        lines.append({
            "account_number": code,
            "account_name": a.name if a else code,
            "total_debit": acc.from_cents(debit),
            "total_credit": acc.from_cents(credit),
            "balance": acc.from_cents(debit - credit),
        })

    payload = {
        "from": d_from.isoformat() if d_from else None,
        "to": d_to.isoformat() if d_to else None,
        "lines": lines,
        "total_debit": acc.from_cents(total_debit),
        "total_credit": acc.from_cents(total_credit),
        "balanced": total_debit == total_credit,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    if format == "json":
        return payload

    headers = ["N° Compte", "Libellé", "Total Débit", "Total Crédit", "Solde"]
    table_rows = [
        [l["account_number"], l["account_name"], l["total_debit"], l["total_credit"], l["balance"]]
        for l in lines
    ]
    table_rows.append(["TOTAL", "", payload["total_debit"], payload["total_credit"],
                       payload["total_debit"] - payload["total_credit"]])
    fname_base = f"balance_{(d_from or 'all')}_{(d_to or 'all')}"
    if format == "csv":
        return _csv_response([headers] + table_rows, f"{fname_base}.csv")
    summary = [
        f"Période : {d_from or '—'} → {d_to or '—'}",
        f"Total Débit : {payload['total_debit']}    Total Crédit : {payload['total_credit']}",
        f"Équilibrée : {'OUI' if payload['balanced'] else 'NON'}",
    ]
    return _pdf_response("Balance générale", headers, table_rows, f"{fname_base}.pdf", summary)


# ── 3. Bilan ────────────────────────────────────────────────────────────────
def _balances_by_account(db: Session, company_id: int, *, until: date | None) -> list[tuple[str, int, int]]:
    """Renvoie (account_code, sum_debit, sum_credit) cumulés jusqu'à `until` (inclus)."""
    stmt = (
        select(
            JournalLine.account_code,
            func.coalesce(func.sum(JournalLine.debit_cents), 0),
            func.coalesce(func.sum(JournalLine.credit_cents), 0),
        )
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .where(JournalEntry.company_id == company_id)
        .group_by(JournalLine.account_code)
    )
    if until is not None:
        stmt = stmt.where(JournalEntry.entry_date <= until)
    return [(code, int(d), int(c)) for code, d, c in db.execute(stmt).all()]


@router.get("/balance-sheet")
def balance_sheet(
    date_: str | None = Query(default=None, alias="date"),
    format: str = Query(default="json", pattern="^(json|csv|pdf)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _guard(current_user)
    d_at = _parse_date(date_, field="date") or date.today()
    accounts = _accounts_meta(db, current_user.company_id)
    rows = _balances_by_account(db, current_user.company_id, until=d_at)

    # Buckets ACTIF / PASSIF en cents
    actif = {"immobilisations": 0, "stocks": 0, "creances": 0, "tresorerie": 0}
    passif = {"capitaux": 0, "dettes": 0, "decouverts": 0}
    # Pour équilibre : on calcule le résultat de l'exercice (classes 7 - 6) pour l'inclure
    # en capitaux (classe 1) car ces comptes restent ouverts tant qu'on n'a pas clos.
    produits_total = 0
    charges_total = 0

    actif_details: dict[str, list[dict]] = {k: [] for k in actif}
    passif_details: dict[str, list[dict]] = {k: [] for k in passif}

    for code, debit, credit in rows:
        a = accounts.get(code)
        cls = a.syscohada_class if a else 0
        balance = debit - credit  # > 0 = solde débiteur, < 0 = solde créditeur
        name = a.name if a else code

        if cls == 2:
            actif["immobilisations"] += balance
            actif_details["immobilisations"].append({"code": code, "name": name, "amount": acc.from_cents(balance)})
        elif cls == 3:
            actif["stocks"] += balance
            actif_details["stocks"].append({"code": code, "name": name, "amount": acc.from_cents(balance)})
        elif cls == 4:
            # Solde débiteur → créance (ACTIF), solde créditeur → dette (PASSIF)
            if balance >= 0:
                actif["creances"] += balance
                actif_details["creances"].append({"code": code, "name": name, "amount": acc.from_cents(balance)})
            else:
                passif["dettes"] += -balance
                passif_details["dettes"].append({"code": code, "name": name, "amount": acc.from_cents(-balance)})
        elif cls == 5:
            if balance >= 0:
                actif["tresorerie"] += balance
                actif_details["tresorerie"].append({"code": code, "name": name, "amount": acc.from_cents(balance)})
            else:
                passif["decouverts"] += -balance
                passif_details["decouverts"].append({"code": code, "name": name, "amount": acc.from_cents(-balance)})
        elif cls == 1:
            # Capitaux : solde créditeur usuellement → on garde le crédit comme positif
            passif["capitaux"] += -balance
            passif_details["capitaux"].append({"code": code, "name": name, "amount": acc.from_cents(-balance)})
        elif cls == 6:
            charges_total += balance  # débit
        elif cls == 7:
            produits_total += -balance  # crédit

    resultat = produits_total - charges_total
    # Le résultat de l'exercice augmente (ou diminue) les capitaux propres
    passif["capitaux"] += resultat
    passif_details["capitaux"].append({"code": "12*", "name": "Résultat de l'exercice (calculé)",
                                       "amount": acc.from_cents(resultat)})

    total_actif = sum(actif.values())
    total_passif = sum(passif.values())

    payload = {
        "date": d_at.isoformat(),
        "actif": {
            "immobilisations": acc.from_cents(actif["immobilisations"]),
            "stocks": acc.from_cents(actif["stocks"]),
            "creances": acc.from_cents(actif["creances"]),
            "tresorerie": acc.from_cents(actif["tresorerie"]),
            "total": acc.from_cents(total_actif),
            "details": actif_details,
        },
        "passif": {
            "capitaux": acc.from_cents(passif["capitaux"]),
            "dettes": acc.from_cents(passif["dettes"]),
            "decouverts": acc.from_cents(passif["decouverts"]),
            "total": acc.from_cents(total_passif),
            "details": passif_details,
        },
        "resultat_exercice": acc.from_cents(resultat),
        "balanced": total_actif == total_passif,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    if format == "json":
        return payload

    headers = ["Section", "Rubrique", "Montant"]
    table_rows = [
        ["ACTIF", "Immobilisations (classe 2)", payload["actif"]["immobilisations"]],
        ["ACTIF", "Stocks (classe 3)", payload["actif"]["stocks"]],
        ["ACTIF", "Créances (classe 4 débiteur)", payload["actif"]["creances"]],
        ["ACTIF", "Trésorerie (classe 5 débiteur)", payload["actif"]["tresorerie"]],
        ["ACTIF", "TOTAL ACTIF", payload["actif"]["total"]],
        ["PASSIF", "Capitaux (classe 1 + résultat)", payload["passif"]["capitaux"]],
        ["PASSIF", "Dettes (classe 4 créditeur)", payload["passif"]["dettes"]],
        ["PASSIF", "Découverts (classe 5 créditeur)", payload["passif"]["decouverts"]],
        ["PASSIF", "TOTAL PASSIF", payload["passif"]["total"]],
    ]
    fname_base = f"bilan_{d_at.isoformat()}"
    if format == "csv":
        return _csv_response([headers] + table_rows, f"{fname_base}.csv")
    summary = [
        f"Au {d_at.isoformat()}",
        f"TOTAL ACTIF : {payload['actif']['total']}    TOTAL PASSIF : {payload['passif']['total']}",
        f"Équilibré : {'OUI' if payload['balanced'] else 'NON'}",
    ]
    return _pdf_response("Bilan comptable", headers, table_rows, f"{fname_base}.pdf", summary)


# ── 4. Compte de résultat ───────────────────────────────────────────────────
# Mapping prefixes SYSCOHADA pour ventiler charges/produits
_CHARGE_BUCKETS: list[tuple[str, str]] = [
    ("60", "Achats"),
    ("61", "Services extérieurs"),
    ("62", "Services extérieurs"),
    ("63", "Impôts et taxes"),
    ("64", "Impôts et taxes"),
    ("65", "Charges diverses"),
    ("66", "Charges de personnel"),
    ("67", "Charges financières"),
    ("68", "Charges exceptionnelles"),
    ("69", "Charges exceptionnelles"),
]

_PRODUIT_BUCKETS: list[tuple[str, str]] = [
    ("70", "Ventes"),
    ("71", "Autres produits"),
    ("72", "Production immobilisée"),
    ("73", "Autres produits"),
    ("74", "Subventions"),
    ("75", "Autres produits"),
    ("76", "Produits financiers"),
    ("77", "Produits financiers"),
    ("78", "Produits exceptionnels"),
    ("79", "Produits exceptionnels"),
]


def _classify(code: str, buckets: list[tuple[str, str]]) -> str | None:
    for prefix, label in buckets:
        if code.startswith(prefix):
            return label
    return None


@router.get("/income-statement")
def income_statement(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    format: str = Query(default="json", pattern="^(json|csv|pdf)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _guard(current_user)
    d_from = _parse_date(from_, field="from")
    d_to = _parse_date(to, field="to")

    stmt = (
        select(
            JournalLine.account_code,
            func.coalesce(func.sum(JournalLine.debit_cents), 0),
            func.coalesce(func.sum(JournalLine.credit_cents), 0),
        )
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .where(JournalEntry.company_id == current_user.company_id)
        .group_by(JournalLine.account_code)
    )
    if d_from is not None:
        stmt = stmt.where(JournalEntry.entry_date >= d_from)
    if d_to is not None:
        stmt = stmt.where(JournalEntry.entry_date <= d_to)

    charges_by_bucket: dict[str, int] = {}
    produits_by_bucket: dict[str, int] = {}
    total_charges = 0
    total_produits = 0

    for code, debit, credit in db.execute(stmt).all():
        debit = int(debit)
        credit = int(credit)
        bucket_c = _classify(code, _CHARGE_BUCKETS)
        bucket_p = _classify(code, _PRODUIT_BUCKETS)
        if bucket_c is not None:
            # solde débiteur = charge nette
            amount = debit - credit
            charges_by_bucket[bucket_c] = charges_by_bucket.get(bucket_c, 0) + amount
            total_charges += amount
        elif bucket_p is not None:
            amount = credit - debit
            produits_by_bucket[bucket_p] = produits_by_bucket.get(bucket_p, 0) + amount
            total_produits += amount

    resultat = total_produits - total_charges

    payload = {
        "from": d_from.isoformat() if d_from else None,
        "to": d_to.isoformat() if d_to else None,
        "charges": {k: acc.from_cents(v) for k, v in charges_by_bucket.items()},
        "produits": {k: acc.from_cents(v) for k, v in produits_by_bucket.items()},
        "total_charges": acc.from_cents(total_charges),
        "total_produits": acc.from_cents(total_produits),
        "resultat": acc.from_cents(resultat),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    if format == "json":
        return payload

    headers = ["Section", "Rubrique", "Montant"]
    table_rows: list[list] = []
    for k, v in payload["produits"].items():
        table_rows.append(["PRODUITS", k, v])
    table_rows.append(["PRODUITS", "TOTAL PRODUITS", payload["total_produits"]])
    for k, v in payload["charges"].items():
        table_rows.append(["CHARGES", k, v])
    table_rows.append(["CHARGES", "TOTAL CHARGES", payload["total_charges"]])
    table_rows.append(["RÉSULTAT", "Produits − Charges", payload["resultat"]])

    fname_base = f"compte_resultat_{(d_from or 'all')}_{(d_to or 'all')}"
    if format == "csv":
        return _csv_response([headers] + table_rows, f"{fname_base}.csv")
    summary = [
        f"Période : {d_from or '—'} → {d_to or '—'}",
        f"Total Produits : {payload['total_produits']}    Total Charges : {payload['total_charges']}",
        f"Résultat : {payload['resultat']}",
    ]
    return _pdf_response("Compte de résultat", headers, table_rows, f"{fname_base}.pdf", summary)
