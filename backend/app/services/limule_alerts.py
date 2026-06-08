"""Limule proactif — calcul des alertes intelligentes pour le dashboard.

Toutes les règles métier sont déterministes, scopées par `company_id` et
agnostiques de l'environnement (aucun appel réseau requis).
"""
from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    BankTransaction,
    Company,
    ContributionPayment,
    FiscalDeadline,
    GroupMember,
    Invoice,
    OrganizationGroup,
    Product,
    Task,
    User,
)


# Seuils — valeurs par défaut (le seuil de trésorerie est surchargeable par entreprise)
CASH_LOW_THRESHOLD: float = 50_000.0     # XAF (devise locale) — défaut si non configuré
OVERDUE_CRITICAL_COUNT: int = 10         # > 10 factures en retard → critical


def _format_amount(amount: float, currency: str = "XAF") -> str:
    try:
        formatted = f"{int(round(amount)):,}".replace(",", " ")
    except Exception:
        formatted = str(int(amount)) if amount else "0"
    return f"{formatted} {currency}"


def compute_dashboard_alerts(
    db: Session,
    company_id: int,
    user: User | None = None,
) -> list[dict[str, Any]]:
    """Calcule la liste d'alertes proactives pour le dashboard d'une entreprise.

    Chaque alerte respecte le format :
        {severity, type, message, action_url}

    Severities : "critical" | "warning" | "info"
    """
    alerts: list[dict[str, Any]] = []
    today = date.today()

    # Seuil de trésorerie : configurable par entreprise.
    #   - non configuré (None) → valeur par défaut
    #   - 0 → alerte DÉSACTIVÉE explicitement
    #   - > 0 → seuil personnalisé
    company = db.get(Company, company_id)
    cash_threshold = CASH_LOW_THRESHOLD
    cash_alert_enabled = True
    if company is not None:
        cents = getattr(company, "cash_low_threshold_cents", None)
        if cents is not None:
            cash_threshold = cents / 100.0
            if cents <= 0:
                cash_alert_enabled = False

    # ── 1. Factures en retard ────────────────────────────────────────────
    overdue_invoices = db.scalars(
        select(Invoice).where(
            Invoice.company_id == company_id,
            Invoice.due_date.is_not(None),
            Invoice.due_date < today,
            Invoice.status != "paid",
        )
    ).all()
    if overdue_invoices:
        total_late = sum((inv.total_amount or 0) for inv in overdue_invoices)
        count = len(overdue_invoices)
        severity = "critical" if count > OVERDUE_CRITICAL_COUNT else "warning"
        # Devise dominante du lot (ou XAF par défaut)
        currencies = [inv.currency or "XAF" for inv in overdue_invoices]
        currency = max(set(currencies), key=currencies.count) if currencies else "XAF"
        alerts.append({
            "severity": severity,
            "type": "overdue_invoice",
            "message": (
                f"{count} facture{'s' if count > 1 else ''} en retard de paiement "
                f"(total {_format_amount(total_late, currency)})"
            ),
            "action_url": "/billing?status=late",
        })

    # ── 2. Produits sous le seuil de réapprovisionnement ─────────────────
    low_stock = db.scalars(
        select(Product).where(
            Product.company_id == company_id,
            Product.stock_quantity <= Product.reorder_level,
        )
    ).all()
    if low_stock:
        count = len(low_stock)
        alerts.append({
            "severity": "info",
            "type": "low_stock",
            "message": (
                f"{count} produit{'s' if count > 1 else ''} sous le seuil "
                f"de réapprovisionnement"
            ),
            "action_url": "/inventory?filter=low",
        })

    # ── 3. Échéances fiscales dans la fenêtre de rappel ─────────────────
    fiscal_due = db.scalars(
        select(FiscalDeadline).where(
            FiscalDeadline.company_id == company_id,
            FiscalDeadline.status != "done",
            FiscalDeadline.due_date <= today + date.resolution * 30,
        ).order_by(FiscalDeadline.due_date.asc())
    ).all()
    fiscal_due = [
        d for d in fiscal_due
        if d.due_date <= today + date.resolution * max(1, d.reminder_days or 7)
    ]
    if fiscal_due:
        overdue_count = sum(1 for d in fiscal_due if d.due_date < today)
        alerts.append({
            "severity": "critical" if overdue_count else "warning",
            "type": "fiscal_deadline",
            "message": (
                f"{len(fiscal_due)} échéance{'s' if len(fiscal_due) > 1 else ''} fiscale"
                f"{' en retard' if overdue_count else ' à venir'}"
            ),
            "action_url": "/fiscal",
        })

    # ── 4. Tâches Kanban/Work proches de l'échéance ─────────────────────
    tasks_due = db.scalars(
        select(Task).where(
            Task.company_id == company_id,
            Task.status != "done",
            Task.due_date.is_not(None),
            Task.due_date <= today + date.resolution * 7,
        ).order_by(Task.due_date.asc())
    ).all()
    if tasks_due:
        overdue_count = sum(1 for task in tasks_due if task.due_date and task.due_date < today)
        alerts.append({
            "severity": "critical" if overdue_count else "warning",
            "type": "task_deadline",
            "message": (
                f"{len(tasks_due)} tâche{'s' if len(tasks_due) > 1 else ''}"
                f"{' en retard' if overdue_count else ' à échéance proche'}"
            ),
            "action_url": "/kanban",
        })

    # ── 5. Trésorerie faible (crédits - débits sur BankTransaction) ──────
    tx_rows = db.scalars(
        select(BankTransaction).where(BankTransaction.company_id == company_id)
    ).all()
    if cash_alert_enabled and tx_rows:
        credits = sum(
            (r.credit if r.credit is not None else max(r.amount or 0, 0))
            for r in tx_rows
        )
        debits = sum(
            (r.debit if r.debit is not None else max(-(r.amount or 0), 0))
            for r in tx_rows
        )
        balance = credits - debits
        if balance < cash_threshold:
            # Devise majoritaire des transactions
            currencies = [r.currency or "XAF" for r in tx_rows]
            currency = max(set(currencies), key=currencies.count) if currencies else "XAF"
            alerts.append({
                "severity": "critical",
                "type": "cash_low",
                "message": (
                    f"Trésorerie sous {_format_amount(cash_threshold, currency)} — "
                    f"vérifie tes recettes"
                ),
                "action_url": "/transactions",
            })

    # ── 6. Anniversaires de membres aujourd'hui (groupes du user) ────────
    user_groups: list[int] = []
    if user is not None:
        user_groups = list(db.scalars(
            select(OrganizationGroup.id).where(
                OrganizationGroup.company_id == company_id,
            )
        ).all())
    else:
        user_groups = list(db.scalars(
            select(OrganizationGroup.id).where(
                OrganizationGroup.company_id == company_id,
            )
        ).all())

    if user_groups:
        members_today = db.scalars(
            select(GroupMember).where(
                GroupMember.group_id.in_(user_groups),
                GroupMember.date_of_birth.is_not(None),
            )
        ).all()
        birthday_members = [
            m for m in members_today
            if m.date_of_birth
            and m.date_of_birth.month == today.month
            and m.date_of_birth.day == today.day
        ]
        if birthday_members:
            names = ", ".join(m.full_name for m in birthday_members[:3])
            extra = f" et {len(birthday_members) - 3} autres" if len(birthday_members) > 3 else ""
            alerts.append({
                "severity": "info",
                "type": "birthday",
                "message": f"Anniversaire de {names}{extra} aujourd'hui 🎂",
                "action_url": "/groups",
            })

    # ── 7. Cotisations en retard dans les groupes du user ────────────────
    if user_groups:
        late_payments = db.scalars(
            select(ContributionPayment).where(
                ContributionPayment.group_id.in_(user_groups),
                ContributionPayment.due_date.is_not(None),
                ContributionPayment.due_date < today,
                ContributionPayment.status.in_(("pending", "late", "partial")),
            )
        ).all()
        if late_payments:
            count = len(late_payments)
            total_due = sum(
                ((p.amount_due_cents or 0) - (p.amount_paid_cents or 0)) / 100
                for p in late_payments
            )
            severity = "warning" if count <= 5 else "critical"
            alerts.append({
                "severity": severity,
                "type": "overdue_contributions",
                "message": (
                    f"{count} cotisation{'s' if count > 1 else ''} en retard "
                    f"(reste {_format_amount(total_due)})"
                ),
                "action_url": "/groups",
            })

    return alerts
