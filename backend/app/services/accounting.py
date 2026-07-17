"""
accounting.py — Moteur comptable en partie double (SYSCOHADA-lite).

Principes :
- Montants en CENTIMES ENTIERS (minor units) → exactitude garantie, jamais de Float.
- Toute écriture est ÉQUILIBRÉE : Σ débits == Σ crédits (vérifié au posting, sinon refus).
- Mode "simple" : les écritures sont générées automatiquement et restent invisibles
  pour le petit commerçant (il ne voit que sa caisse). Mode "full" : journal + balance
  SYSCOHADA visibles et écritures manuelles autorisées.
- Les écritures postées sont IMMUABLES : on corrige par contre-passation (reversal).
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import Account, Company, FiscalYear, JournalEntry, JournalLine


# ── Conversion argent ───────────────────────────────────────────────────────
def to_cents(amount: float | int) -> int:
    """Convertit un montant décimal en centimes entiers (arrondi au centime)."""
    return int(round(float(amount) * 100))


def from_cents(cents: int) -> float:
    """Reconvertit des centimes en montant décimal pour l'affichage/JSON."""
    return round((cents or 0) / 100.0, 2)


# ── Plan comptable SYSCOHADA-lite par défaut ────────────────────────────────
# (code, libellé, type normalisé, classe SYSCOHADA)
DEFAULT_CHART: list[tuple[str, str, str, int]] = [
    # Classe 1 — Capitaux
    ("101", "Capital", "equity", 1),
    ("12", "Résultat de l'exercice", "equity", 1),
    # Classe 2 — Immobilisations
    ("21", "Immobilisations incorporelles", "asset", 2),
    ("24", "Matériel et mobilier", "asset", 2),
    ("28", "Amortissements des immobilisations", "asset", 2),  # contra-actif (solde créditeur)
    # Classe 3 — Stocks
    ("31", "Stocks de marchandises", "asset", 3),
    # Classe 4 — Tiers
    ("401", "Fournisseurs", "liability", 4),
    ("411", "Clients", "asset", 4),
    ("421", "Personnel — rémunérations dues", "liability", 4),
    ("431", "Sécurité sociale (CNSS)", "liability", 4),
    ("443", "État — TVA collectée", "liability", 4),
    ("445", "État — TVA déductible", "asset", 4),
    ("447", "État — impôts (IRPP/IS)", "liability", 4),
    # Classe 5 — Trésorerie
    ("521", "Banque", "asset", 5),
    ("531", "Mobile Money / caisse électronique", "asset", 5),
    ("571", "Caisse espèces", "asset", 5),
    # Classe 6 — Charges
    ("60", "Achats", "expense", 6),
    ("603", "Variation de stock", "expense", 6),  # numéroté 603 par convention SYSCOHADA malgré son lien fonctionnel à la classe 3
    ("62", "Services extérieurs", "expense", 6),
    ("66", "Charges de personnel", "expense", 6),
    ("64", "Impôts et taxes", "expense", 6),
    # Classe 7 — Produits
    ("70", "Ventes", "revenue", 7),
    ("75", "Autres produits (cotisations, dons)", "revenue", 7),
]

# Mapping moyen de paiement → compte de trésorerie SYSCOHADA
PAYMENT_TO_ACCOUNT = {
    "cash": "571",
    "especes": "571",
    "card": "521",
    "bank": "521",
    "virement": "521",
    "mobile_money": "531",
    "zola": "531",
    "wave": "531",
    "orange_money": "531",
    "mtn": "531",
    "airtel": "531",
    "paypal": "521",
}


def treasury_account_code(payment_method: str) -> str:
    return PAYMENT_TO_ACCOUNT.get((payment_method or "").lower(), "571")


# ── Plan comptable : seed & accès ───────────────────────────────────────────
def seed_chart_of_accounts(db: Session, company_id: int) -> None:
    """Crée le plan comptable par défaut pour une société, en ne créant que les
    comptes MANQUANTS (jamais de doublon). Ainsi une société déjà seedée avant
    l'ajout de nouveaux comptes au DEFAULT_CHART (ex. classes 2/3) les reçoit
    automatiquement au prochain appel, sans script de migration séparé ni
    toucher aux comptes déjà en place."""
    existing_codes = set(db.scalars(
        select(Account.code).where(Account.company_id == company_id)
    ).all())
    for code, name, type_, cls in DEFAULT_CHART:
        if code in existing_codes:
            continue
        db.add(Account(company_id=company_id, code=code, name=name, type=type_, syscohada_class=cls))
    db.flush()


def get_account(db: Session, company_id: int, code: str) -> Account:
    acc = db.scalar(
        select(Account).where(Account.company_id == company_id, Account.code == code)
    )
    if not acc:
        # Auto-création défensive si le plan n'a pas été seedé
        seed_chart_of_accounts(db, company_id)
        acc = db.scalar(
            select(Account).where(Account.company_id == company_id, Account.code == code)
        )
    if not acc:
        raise HTTPException(status_code=500, detail=f"Compte {code} introuvable")
    return acc


def _next_entry_reference(db: Session, company_id: int) -> str:
    seq = db.execute(
        text("UPDATE companies SET accounting_seq = accounting_seq + 1 WHERE id = :cid RETURNING accounting_seq"),
        {"cid": company_id},
    ).scalar_one()
    return f"EC-{date.today().year}-{seq:05d}"


def check_period_open(db: Session, company_id: int, effective_date: date) -> None:
    """Lève 400 si `effective_date` tombe dans un exercice fiscal clôturé.
    Si aucun FiscalYear n'existe pour cette date, aucune restriction
    (adoption opt-in — ne casse rien pour les sociétés qui n'utilisent pas
    encore la clôture d'exercice). Utilisé par post_entry() pour toute
    écriture, et par les endpoints qui modifient une pièce sans forcément
    poster d'écriture (ex. suppression de transaction bancaire manuelle)."""
    fy = db.scalar(
        select(FiscalYear).where(
            FiscalYear.company_id == company_id,
            FiscalYear.start_date <= effective_date,
            FiscalYear.end_date >= effective_date,
        )
    )
    if fy and fy.status == "closed":
        raise HTTPException(status_code=400, detail=f"{fy.label} est clôturé — opération refusée sur cette période.")


# ── Posting (cœur du moteur) ────────────────────────────────────────────────
def post_entry(
    db: Session,
    *,
    company_id: int,
    label: str,
    lines: Iterable[dict],
    source_type: str = "manual",
    source_id: int | None = None,
    entry_date: date | None = None,
    currency: str = "XAF",
    user_id: int | None = None,
) -> JournalEntry:
    """Poste une écriture équilibrée.

    `lines` : itérable de dicts {"code": str, "debit": cents, "credit": cents, "label": str}.
    Lève 400 si Σ débits != Σ crédits ou si l'écriture est vide.
    """
    materialized = list(lines)
    total_debit = sum(int(l.get("debit", 0)) for l in materialized)
    total_credit = sum(int(l.get("credit", 0)) for l in materialized)
    if not materialized:
        raise HTTPException(status_code=400, detail="Écriture vide")
    if total_debit != total_credit:
        raise HTTPException(
            status_code=400,
            detail=f"Écriture déséquilibrée : débit {from_cents(total_debit)} ≠ crédit {from_cents(total_credit)}",
        )
    if total_debit == 0:
        raise HTTPException(status_code=400, detail="Écriture de montant nul")

    check_period_open(db, company_id, entry_date or date.today())

    entry = JournalEntry(
        company_id=company_id,
        reference=_next_entry_reference(db, company_id),
        entry_date=entry_date or date.today(),
        label=label,
        source_type=source_type,
        source_id=source_id,
        amount_cents=total_debit,
        currency=currency,
        posted=True,
        created_by_user_id=user_id,
    )
    for l in materialized:
        acc = get_account(db, company_id, l["code"])
        entry.lines.append(
            JournalLine(
                account_id=acc.id,
                account_code=acc.code,
                label=l.get("label", label),
                debit_cents=int(l.get("debit", 0)),
                credit_cents=int(l.get("credit", 0)),
            )
        )
    db.add(entry)
    db.flush()
    return entry


# ── Écritures métier automatiques ───────────────────────────────────────────
def record_sale(db: Session, company: Company, *, sale_id: int, total: float, payment_method: str,
                tax_amount: float = 0.0, user_id: int | None = None) -> JournalEntry | None:
    """Vente POS : Dr Trésorerie / Cr Ventes (70) [+ Cr TVA collectée (443)]."""
    total_c = to_cents(total)
    tax_c = to_cents(tax_amount)
    ht_c = total_c - tax_c
    tre = treasury_account_code(payment_method)
    lines = [{"code": tre, "debit": total_c, "credit": 0, "label": "Encaissement vente"},
             {"code": "70", "debit": 0, "credit": ht_c, "label": "Ventes"}]
    if tax_c > 0:
        lines.append({"code": "443", "debit": 0, "credit": tax_c, "label": "TVA collectée"})
    return post_entry(db, company_id=company.id, label=f"Vente POS #{sale_id}", lines=lines,
                      source_type="sale", source_id=sale_id, currency=company_currency(company), user_id=user_id)


def record_sale_cancellation(db: Session, company: Company, *, sale_id: int, total: float, payment_method: str,
                             tax_amount: float = 0.0, user_id: int | None = None) -> JournalEntry | None:
    """Annulation de vente POS (remboursement en espèces uniquement, cf. règle
    produit — pas de remboursement MoMo/Stripe automatique) : écriture miroir
    de record_sale, Dr Ventes (70) [+ Dr TVA collectée (443)] / Cr Trésorerie
    espèces. L'écriture d'origine n'est jamais modifiée ni supprimée (piste
    d'audit SYSCOHADA immuable) — celle-ci vient la contrebalancer."""
    total_c = to_cents(total)
    tax_c = to_cents(tax_amount)
    ht_c = total_c - tax_c
    tre = treasury_account_code("cash")
    lines = [{"code": "70", "debit": ht_c, "credit": 0, "label": "Annulation vente"}]
    if tax_c > 0:
        lines.append({"code": "443", "debit": tax_c, "credit": 0, "label": "Annulation TVA collectée"})
    lines.append({"code": tre, "debit": 0, "credit": total_c, "label": "Remboursement vente annulée"})
    return post_entry(db, company_id=company.id, label=f"Annulation vente POS #{sale_id}", lines=lines,
                      source_type="sale_cancellation", source_id=sale_id, currency=company_currency(company), user_id=user_id)


def record_cogs_reversal(db: Session, company: Company, *, sale_id: int, cogs_cents: int,
                         user_id: int | None = None) -> JournalEntry | None:
    """Réintégration de stock lors d'une annulation de vente : écriture miroir
    de record_cogs, Dr 31 Stocks / Cr 603 Variation de stock."""
    if cogs_cents <= 0:
        return None
    lines = [{"code": "31", "debit": cogs_cents, "credit": 0, "label": "Réintégration stock (annulation vente)"},
             {"code": "603", "debit": 0, "credit": cogs_cents, "label": "Variation de stock (annulation)"}]
    return post_entry(db, company_id=company.id, label=f"Réintégration stock vente #{sale_id}", lines=lines,
                      source_type="cogs_reversal", source_id=sale_id, currency=company_currency(company), user_id=user_id)


def record_invoice_payment(db: Session, company: Company, *, invoice_id: int, total: float,
                           payment_method: str, user_id: int | None = None) -> JournalEntry | None:
    """Règlement facture : Dr Trésorerie / Cr Clients (411)."""
    total_c = to_cents(total)
    tre = treasury_account_code(payment_method)
    lines = [{"code": tre, "debit": total_c, "credit": 0, "label": "Règlement client"},
             {"code": "411", "debit": 0, "credit": total_c, "label": "Clients"}]
    return post_entry(db, company_id=company.id, label=f"Règlement facture #{invoice_id}", lines=lines,
                      source_type="invoice_payment", source_id=invoice_id, currency=company_currency(company), user_id=user_id)


def record_invoice_payment_reversal(db: Session, company: Company, *, invoice_id: int, total: float,
                                    payment_method: str, user_id: int | None = None) -> JournalEntry | None:
    """Annulation d'une facture déjà réglée : écriture miroir de
    record_invoice_payment, Dr Clients (411) / Cr Trésorerie. Comme pour
    record_sale_cancellation, l'écriture de règlement d'origine n'est jamais
    modifiée — celle-ci vient la contrebalancer."""
    total_c = to_cents(total)
    tre = treasury_account_code(payment_method)
    lines = [{"code": "411", "debit": total_c, "credit": 0, "label": "Annulation règlement client"},
             {"code": tre, "debit": 0, "credit": total_c, "label": "Reprise trésorerie (facture annulée)"}]
    return post_entry(db, company_id=company.id, label=f"Annulation règlement facture #{invoice_id}", lines=lines,
                      source_type="invoice_payment_reversal", source_id=invoice_id, currency=company_currency(company), user_id=user_id)


def record_group_contribution(db: Session, company: Company, *, payment_id: int, amount: float,
                              payment_method: str, user_id: int | None = None) -> JournalEntry | None:
    """Cotisation de groupe encaissée : Dr Trésorerie / Cr Produits cotisations (75)."""
    amount_c = to_cents(amount)
    tre = treasury_account_code(payment_method)
    lines = [{"code": tre, "debit": amount_c, "credit": 0, "label": "Cotisation reçue"},
             {"code": "75", "debit": 0, "credit": amount_c, "label": "Cotisations / dons"}]
    return post_entry(db, company_id=company.id, label=f"Cotisation #{payment_id}", lines=lines,
                      source_type="group_contribution", source_id=payment_id, currency=company_currency(company), user_id=user_id)


def record_group_expense(db: Session, company: Company, *, expense_id: int, amount: float,
                         payment_method: str, user_id: int | None = None) -> JournalEntry | None:
    """Dépense de groupe : Dr Charges (62) / Cr Trésorerie."""
    amount_c = to_cents(amount)
    tre = treasury_account_code(payment_method)
    lines = [{"code": "62", "debit": amount_c, "credit": 0, "label": "Dépense"},
             {"code": tre, "debit": 0, "credit": amount_c, "label": "Décaissement"}]
    return post_entry(db, company_id=company.id, label=f"Dépense groupe #{expense_id}", lines=lines,
                      source_type="group_expense", source_id=expense_id, currency=company_currency(company), user_id=user_id)


def record_payroll_payment(db: Session, company: Company, *, run_id: int,
                           amounts_by_method: dict[str, int], user_id: int | None = None,
                           cnss_employee_cents: int = 0, cnss_employer_cents: int = 0,
                           irpp_cents: int = 0, family_allowance_cents: int = 0,
                           work_accident_cents: int = 0) -> JournalEntry | None:
    """Virement de masse de paie, décomposé (au lieu d'un seul débit "Charges de
    personnel" opaque = net_pay, qui perdait toute trace des cotisations
    retenues) :

    Dr 66 Charges de personnel = coût employeur total (brut + cnss employeur +
                                  allocations familiales + accidents du travail)
    Cr Trésorerie              = net_pay effectivement versé aux salariés
    Cr 431 CNSS                = cnss salariale + cnss patronale + allocations
                                  familiales + accidents du travail (dû à la CNSS)
    Cr 447 État — impôts       = IRPP retenu (dû à la DGI)

    `amounts_by_method` : {payout_method: net_pay_cents}, déjà agrégé par moyen.
    Les montants de cotisations sont agrégés sur l'ensemble du cycle par
    l'appelant (somme des *_cents de chaque bulletin payé dans ce virement).

    L'écriture s'équilibre naturellement : net_pay = brut - cnss_employee - irpp,
    donc Σdébits = brut + cnss_employer + family_allowance + work_accident =
    Σcrédits. Les montants crédités sur 431/447 s'accumulent au fil des cycles
    de paie et représentent la dette non reversée — voir `tax_liabilities()`
    et `remit_tax_liability()` pour le suivi et le reversement effectif.
    """
    net_total_c = sum(amounts_by_method.values())
    if net_total_c <= 0:
        return None
    gross_c = net_total_c + cnss_employee_cents + irpp_cents
    employer_cost_c = gross_c + cnss_employer_cents + family_allowance_cents + work_accident_cents
    cnss_total_c = cnss_employee_cents + cnss_employer_cents + family_allowance_cents + work_accident_cents

    lines = [{"code": "66", "debit": employer_cost_c, "credit": 0, "label": "Charges de personnel — coût employeur total"}]
    for method, amount_c in amounts_by_method.items():
        if amount_c <= 0:
            continue
        tre = treasury_account_code(method)
        lines.append({"code": tre, "debit": 0, "credit": amount_c, "label": f"Paie versée ({method or 'espèces'})"})
    if cnss_total_c > 0:
        lines.append({"code": "431", "debit": 0, "credit": cnss_total_c, "label": "CNSS retenue/due (salariale + patronale + AF + AT)"})
    if irpp_cents > 0:
        lines.append({"code": "447", "debit": 0, "credit": irpp_cents, "label": "IRPP retenu — dû à la DGI"})

    return post_entry(db, company_id=company.id, label=f"Virement de masse — cycle de paie #{run_id}", lines=lines,
                      source_type="payroll_payment", source_id=run_id, currency=company_currency(company), user_id=user_id)


def tax_liabilities(db: Session, company_id: int) -> dict:
    """Montants dus mais non encore reversés à la CNSS (431) et à l'État/DGI
    (447), accumulés au fil des cycles de paie. Solde créditeur = dette."""
    balances: dict[str, int] = {}
    for code in ("431", "447"):
        row = db.execute(
            select(
                func.coalesce(func.sum(JournalLine.credit_cents), 0) - func.coalesce(func.sum(JournalLine.debit_cents), 0),
            )
            .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
            .where(JournalEntry.company_id == company_id, JournalLine.account_code == code)
        ).scalar_one()
        balances[code] = int(row or 0)
    return {
        "cnss_due": from_cents(balances["431"]),
        "cnss_due_cents": balances["431"],
        "state_tax_due": from_cents(balances["447"]),
        "state_tax_due_cents": balances["447"],
    }


def remit_tax_liability(db: Session, company: Company, *, code: str, amount_cents: int,
                        payment_method: str, user_id: int | None = None) -> JournalEntry:
    """Reversement effectif d'une dette fiscale/sociale accumulée : Dr 431|447
    (réduit la dette) / Cr Trésorerie (sortie de caisse réelle)."""
    if code not in ("431", "447"):
        raise HTTPException(status_code=400, detail="Code invalide — utiliser 431 (CNSS) ou 447 (État).")
    if amount_cents <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide.")
    tre = treasury_account_code(payment_method)
    label = "Reversement CNSS" if code == "431" else "Reversement État (IRPP/DGI)"
    lines = [
        {"code": code, "debit": amount_cents, "credit": 0, "label": label},
        {"code": tre, "debit": 0, "credit": amount_cents, "label": label},
    ]
    return post_entry(db, company_id=company.id, label=label, lines=lines,
                      source_type="tax_remittance", currency=company_currency(company), user_id=user_id)


# ── Écritures Phase B : achats, stock, exercice ─────────────────────────────
def record_purchase_receipt(db: Session, company: Company, *, po_id: int,
                            stock_ht_cents: int, expense_ht_cents: int, tax_cents: int = 0,
                            user_id: int | None = None) -> JournalEntry | None:
    """Réception d'un bon de commande, ligne par ligne selon qu'elle est liée
    à un produit suivi en stock ou à une charge hors-stock (service...) :

    Lignes produit (stock_ht_cents) : Dr 31 Stocks (actif — la charge n'est
                                       constatée qu'à la vente, voir record_cogs)
    Lignes hors-stock (expense_ht_cents) : Dr 60 Achats (charge immédiate)
    TVA déductible (tax_cents)          : Dr 445
    Cr 401 Fournisseurs = total (stock + charge + TVA)
    """
    total_c = stock_ht_cents + expense_ht_cents + tax_cents
    if total_c <= 0:
        return None
    lines = []
    if stock_ht_cents > 0:
        lines.append({"code": "31", "debit": stock_ht_cents, "credit": 0, "label": "Entrée en stock (CMP)"})
    if expense_ht_cents > 0:
        lines.append({"code": "60", "debit": expense_ht_cents, "credit": 0, "label": "Achats (hors-stock)"})
    if tax_cents > 0:
        lines.append({"code": "445", "debit": tax_cents, "credit": 0, "label": "TVA déductible"})
    lines.append({"code": "401", "debit": 0, "credit": total_c, "label": "Fournisseurs"})
    return post_entry(db, company_id=company.id, label=f"Réception achat #{po_id}", lines=lines,
                      source_type="purchase_receipt", source_id=po_id, currency=company_currency(company), user_id=user_id)


def record_purchase_payment(db: Session, company: Company, *, po_id: int, total: float,
                            payment_method: str, user_id: int | None = None) -> JournalEntry | None:
    """Règlement fournisseur : Dr 401 Fournisseurs / Cr Trésorerie."""
    total_c = to_cents(total)
    if total_c <= 0:
        return None
    tre = treasury_account_code(payment_method)
    lines = [{"code": "401", "debit": total_c, "credit": 0, "label": "Règlement fournisseur"},
             {"code": tre, "debit": 0, "credit": total_c, "label": "Décaissement"}]
    return post_entry(db, company_id=company.id, label=f"Règlement achat #{po_id}", lines=lines,
                      source_type="purchase_payment", source_id=po_id, currency=company_currency(company), user_id=user_id)


def record_cogs(db: Session, company: Company, *, sale_id: int, cogs_cents: int,
                user_id: int | None = None) -> JournalEntry | None:
    """Sortie de stock à la vente, constatée au coût moyen pondéré (CMP) :
    Dr 603 Variation de stock / Cr 31 Stocks.
    Aucune écriture si cogs_cents <= 0 (ex. produit jamais reçu via un bon de
    commande, sans base de coût connue — évite de fausser la marge avec un
    coût à zéro)."""
    if cogs_cents <= 0:
        return None
    lines = [{"code": "603", "debit": cogs_cents, "credit": 0, "label": "Variation de stock (sortie CMP)"},
             {"code": "31", "debit": 0, "credit": cogs_cents, "label": "Stocks de marchandises"}]
    return post_entry(db, company_id=company.id, label=f"COGS vente #{sale_id}", lines=lines,
                      source_type="cogs", source_id=sale_id, currency=company_currency(company), user_id=user_id)


def net_result_cents(db: Session, company_id: int, *, start: date, end: date) -> int:
    """Résultat net = Σ(crédits - débits) des comptes de classe 6 (charges) et
    7 (produits) sur la période. Positif = bénéfice, négatif = perte."""
    row = db.execute(
        select(func.coalesce(func.sum(JournalLine.credit_cents - JournalLine.debit_cents), 0))
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .join(Account, JournalLine.account_id == Account.id)
        .where(
            JournalEntry.company_id == company_id,
            Account.syscohada_class.in_((6, 7)),
            JournalEntry.entry_date >= start,
            JournalEntry.entry_date <= end,
        )
    ).scalar_one()
    return int(row or 0)


def close_fiscal_year(db: Session, company: Company, *, fiscal_year: FiscalYear,
                      user_id: int | None = None) -> JournalEntry | None:
    """Clôture d'exercice (version minimale) : solde tous les comptes de
    classe 6/7 mouvementés sur la période vers le compte 12 "Résultat de
    l'exercice", puis verrouille la période (voir le garde-fou dans
    post_entry). Pas de report à nouveau multi-exercices, pas de réouverture
    — une correction après clôture nécessite un nouvel exercice."""
    if fiscal_year.status == "closed":
        raise HTTPException(status_code=400, detail="Exercice déjà clôturé")

    rows = db.execute(
        select(
            JournalLine.account_code,
            func.coalesce(func.sum(JournalLine.debit_cents), 0),
            func.coalesce(func.sum(JournalLine.credit_cents), 0),
        )
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .join(Account, JournalLine.account_id == Account.id)
        .where(
            JournalEntry.company_id == company.id,
            Account.syscohada_class.in_((6, 7)),
            JournalEntry.entry_date >= fiscal_year.start_date,
            JournalEntry.entry_date <= fiscal_year.end_date,
        )
        .group_by(JournalLine.account_code)
    ).all()

    lines = []
    net_c = 0
    for code, debit, credit in rows:
        balance = debit - credit  # classe 6/7 : solde normalement débiteur (charge) ou créditeur (produit)
        if balance == 0:
            continue
        net_c += balance
        if balance > 0:
            # Solde débiteur (charge) → on le solde au crédit.
            lines.append({"code": code, "debit": 0, "credit": balance, "label": "Clôture — solde charge"})
        else:
            lines.append({"code": code, "debit": -balance, "credit": 0, "label": "Clôture — solde produit"})

    if not lines:
        fiscal_year.status = "closed"
        fiscal_year.closed_at = datetime.now(timezone.utc)
        fiscal_year.closed_by_user_id = user_id
        return None

    # Équilibre : le résultat (net_c = débits charges - crédits produits, donc
    # négatif si bénéfice) part sur 12 en sens inverse pour équilibrer l'écriture.
    if net_c > 0:
        lines.append({"code": "12", "debit": 0, "credit": net_c, "label": "Résultat de l'exercice (perte)"})
    elif net_c < 0:
        lines.append({"code": "12", "debit": -net_c, "credit": 0, "label": "Résultat de l'exercice (bénéfice)"})

    entry = post_entry(db, company_id=company.id, label=f"Clôture {fiscal_year.label}", lines=lines,
                       source_type="fiscal_year_closing", source_id=fiscal_year.id,
                       entry_date=fiscal_year.end_date, currency=company_currency(company), user_id=user_id)
    fiscal_year.status = "closed"
    fiscal_year.closed_at = datetime.now(timezone.utc)
    fiscal_year.closed_by_user_id = user_id
    fiscal_year.closing_entry_id = entry.id if entry else None
    return entry


def company_currency(company: Company) -> str:
    return getattr(company, "currency", None) or "XAF"


# ── Restitution : balance & grand livre ─────────────────────────────────────
def trial_balance(db: Session, company_id: int) -> dict:
    """Balance générale : par compte, total débit/crédit + solde. Σ doit s'équilibrer."""
    rows = db.execute(
        select(
            JournalLine.account_code,
            func.coalesce(func.sum(JournalLine.debit_cents), 0),
            func.coalesce(func.sum(JournalLine.credit_cents), 0),
        )
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .where(JournalEntry.company_id == company_id)
        .group_by(JournalLine.account_code)
        .order_by(JournalLine.account_code)
    ).all()
    accounts_meta = {
        a.code: a.name
        for a in db.scalars(select(Account).where(Account.company_id == company_id)).all()
    }
    lines = []
    total_debit = total_credit = 0
    for code, debit, credit in rows:
        total_debit += debit
        total_credit += credit
        lines.append({
            "account_code": code,
            "account_name": accounts_meta.get(code, code),
            "debit": from_cents(debit),
            "credit": from_cents(credit),
            "balance": from_cents(debit - credit),
        })
    return {
        "lines": lines,
        "total_debit": from_cents(total_debit),
        "total_credit": from_cents(total_credit),
        "balanced": total_debit == total_credit,
    }
