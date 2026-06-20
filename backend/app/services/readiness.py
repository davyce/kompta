"""Readiness and business insight helpers.

These helpers are deterministic: they inspect live application state and local
configuration, without network calls or invented data.
"""
from __future__ import annotations

import os
import json
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import engine
from app.models import (
    Account,
    BankTransaction,
    Company,
    DeclarationRecord,
    Employee,
    FiscalDeadline,
    GroupMember,
    Invoice,
    JournalEntry,
    JournalLine,
    OrganizationGroup,
    PayrollRun,
    Product,
    Sale,
    Task,
    User,
)
from app.services import accounting as acc


_PASS = "pass"
_WARN = "warn"
_FAIL = "fail"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _env_flag(name: str) -> bool | None:
    raw = os.getenv(name)
    if raw is None:
        return None
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _check(id_: str, title: str, status: str, detail: str, *, action: str = "", priority: str = "medium") -> dict[str, str]:
    return {
        "id": id_,
        "title": title,
        "status": status,
        "detail": detail,
        "action": action,
        "priority": priority,
    }


def _section(id_: str, title: str, items: list[dict[str, str]]) -> dict[str, Any]:
    statuses = [item["status"] for item in items]
    status = _FAIL if _FAIL in statuses else _WARN if _WARN in statuses else _PASS
    return {"id": id_, "title": title, "status": status, "items": items}


def _score(sections: list[dict[str, Any]]) -> int:
    items = [item for section in sections for item in section["items"]]
    if not items:
        return 0
    weight = {_PASS: 1.0, _WARN: 0.55, _FAIL: 0.0}
    return round(100 * sum(weight.get(item["status"], 0) for item in items) / len(items))


def _overall(sections: list[dict[str, Any]]) -> str:
    statuses = [section["status"] for section in sections]
    return _FAIL if _FAIL in statuses else _WARN if _WARN in statuses else _PASS


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def build_production_preflight(db: Session, settings: Settings) -> dict[str, Any]:
    """Return a production deployment preflight report for super-admins."""
    env = settings.environment.strip().lower()
    is_prod_like = env in {"prod", "production", "staging", "preprod", "pre-production"}
    placeholder_secrets = {"dev-kompta-secret", "change-me-in-production", "secret", "changeme", ""}
    super_password = settings.super_admin_password

    deploy_items = [
        _check(
            "environment",
            "Environnement",
            _PASS if is_prod_like else _WARN,
            f"ENVIRONMENT={settings.environment}",
            action="Basculer ENVIRONMENT=production/staging avant exposition publique." if not is_prod_like else "",
            priority="high",
        ),
        _check(
            "secret_key",
            "SECRET_KEY fort",
            _FAIL if is_prod_like and settings.secret_key in placeholder_secrets else _PASS if len(settings.secret_key) >= 32 else _WARN,
            "Secret de production non placeholder." if settings.secret_key not in placeholder_secrets else "Secret placeholder détecté.",
            action="Définir un SECRET_KEY aléatoire d'au moins 32 caractères." if settings.secret_key in placeholder_secrets or len(settings.secret_key) < 32 else "",
            priority="critical",
        ),
        _check(
            "super_admin_password",
            "Super-admin",
            _FAIL if is_prod_like and super_password == "super2026" else _WARN if super_password == "super2026" else _PASS,
            "Mot de passe super-admin personnalisé." if super_password != "super2026" else "Mot de passe super-admin par défaut.",
            action="Définir SUPER_ADMIN_PASSWORD avec une valeur forte." if super_password == "super2026" else "",
            priority="critical",
        ),
        _check(
            "seed_demo",
            "Données de démo",
            _FAIL if is_prod_like and _env_flag("SEED_DEMO") is True else _PASS,
            f"SEED_DEMO={os.getenv('SEED_DEMO', '<unset>')}",
            action="Retirer SEED_DEMO=true en production." if _env_flag("SEED_DEMO") is True else "",
            priority="critical",
        ),
        _check(
            "public_url",
            "URL publique HTTPS",
            _PASS if settings.public_url.startswith("https://") else _WARN,
            settings.public_url,
            action="Configurer PUBLIC_URL en https://..." if not settings.public_url.startswith("https://") else "",
            priority="high",
        ),
    ]

    migration_items: list[dict[str, str]] = []
    try:
        db.execute(text("SELECT 1"))
        migration_items.append(_check("db_connectivity", "Base de données", _PASS, f"{engine.url.drivername} connecté."))
    except Exception as exc:  # pragma: no cover - defensive
        migration_items.append(_check("db_connectivity", "Base de données", _FAIL, str(exc), priority="critical"))

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    column_map = {name: {col["name"] for col in inspector.get_columns(name)} for name in table_names}
    expected = {
        "tasks": {"order_index", "tags", "project"},
        "invoices": {"subtotal_cents", "tax_amount_cents", "total_amount_cents", "approval_status"},
        "invoice_lines": {"unit_price_cents", "total_cents", "tax_rate"},
        "password_reset_tokens": {"token_hash", "expires_at", "used_at", "request_ip"},
    }
    for table, columns in expected.items():
        missing = sorted(columns - column_map.get(table, set()))
        migration_items.append(
            _check(
                f"schema_{table}",
                f"Schéma {table}",
                _PASS if not missing else _FAIL,
                "Colonnes attendues présentes." if not missing else f"Colonnes manquantes: {', '.join(missing)}",
                action="Relancer create_tables()/ensure_sqlite_migrations sur la base de production." if missing else "",
                priority="critical" if missing else "medium",
            )
        )

    ops_items = [
        _check(
            "stripe",
            "Stripe",
            _PASS if settings.stripe_secret_key.startswith("sk_live_") else _WARN if settings.stripe_secret_key else _FAIL if is_prod_like else _WARN,
            "Clé live détectée." if settings.stripe_secret_key.startswith("sk_live_") else "Stripe absent ou non-live.",
            action="Configurer STRIPE_SECRET_KEY live et STRIPE_WEBHOOK_SECRET en production." if not settings.stripe_secret_key.startswith("sk_live_") else "",
            priority="high",
        ),
        _check(
            "momo",
            "MTN MoMo",
            _PASS if settings.momo_enabled and settings.momo_target_environment.lower() not in {"sandbox", "test"} else _WARN,
            f"enabled={settings.momo_enabled}, target={settings.momo_target_environment}",
            action="Basculer MOMO_TARGET_ENVIRONMENT hors sandbox et vérifier les identifiants MoMo prod." if settings.momo_target_environment.lower() in {"sandbox", "test"} else "",
            priority="high",
        ),
        _check(
            "email",
            "SMTP",
            _PASS if settings.email_enabled else _WARN,
            "SMTP prêt." if settings.email_enabled else "SMTP non configuré: relances et resets ne partiront pas par email.",
            action="Configurer SMTP_HOST/SMTP_USER/SMTP_PASSWORD." if not settings.email_enabled else "",
        ),
        _check(
            "sentry",
            "Sentry / erreurs",
            _PASS if os.getenv("SENTRY_DSN") else _WARN,
            "SENTRY_DSN configuré." if os.getenv("SENTRY_DSN") else "Pas de DSN Sentry détecté.",
            action="Ajouter SENTRY_DSN ou un équivalent d'error tracking.",
        ),
        _check(
            "uptime",
            "Uptime monitoring",
            _PASS if os.getenv("UPTIME_MONITOR_URL") else _WARN,
            "UPTIME_MONITOR_URL configuré." if os.getenv("UPTIME_MONITOR_URL") else "Pas d'URL d'uptime externe détectée.",
            action="Configurer un ping externe sur /api/health.",
        ),
    ]

    storage_path = Path(settings.document_storage_dir)
    try:
        storage_path.mkdir(parents=True, exist_ok=True)
        probe = storage_path / ".kompta-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        storage_status, storage_detail = _PASS, f"{storage_path} accessible en écriture."
    except Exception as exc:
        storage_status, storage_detail = _FAIL, str(exc)
    ops_items.append(_check("storage_write", "Stockage documents", storage_status, storage_detail, priority="high"))

    root = _repo_root()
    manifest_path = root / "frontend" / "public" / "manifest.json"
    sw_path = root / "frontend" / "public" / "sw.js"
    pwa_files = [manifest_path, sw_path]
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    except json.JSONDecodeError:
        manifest = {}
    for icon in manifest.get("icons", []):
        src = str(icon.get("src") or "").lstrip("/")
        if src:
            pwa_files.append(root / "frontend" / "public" / src)
    missing_pwa = [str(path.relative_to(root)) for path in pwa_files if not path.exists()]
    ops_items.append(
        _check(
            "pwa_assets",
            "PWA installable",
            _PASS if not missing_pwa else _WARN,
            "Manifest, service worker et icônes présents." if not missing_pwa else f"Assets manquants: {', '.join(missing_pwa)}",
            action="Ajouter les assets PWA manquants." if missing_pwa else "",
        )
    )

    business_items = [
        _check(
            "companies",
            "Tenants",
            _PASS if (db.scalar(select(Company.id).limit(1)) is not None) else _WARN,
            f"{db.scalar(select(text('COUNT(*)')).select_from(Company)) or 0} société(s) en base.",
        ),
        _check(
            "platform_admin",
            "Admin plateforme",
            _PASS if db.scalar(select(User).where(User.role == "super_admin")) else _FAIL,
            "Super-admin présent." if db.scalar(select(User).where(User.role == "super_admin")) else "Aucun super-admin.",
            action="" if db.scalar(select(User).where(User.role == "super_admin")) else "Relancer seed_platform_admin avec SUPER_ADMIN_EMAIL/PASSWORD.",
            priority="critical",
        ),
    ]

    sections = [
        _section("deploy", "Déploiement production", deploy_items),
        _section("migrations", "Migrations et schéma", migration_items),
        _section("integrations", "Intégrations opérationnelles", ops_items),
        _section("tenant", "Multi-tenant minimal", business_items),
    ]
    failures = [item for section in sections for item in section["items"] if item["status"] == _FAIL]
    warnings = [item for section in sections for item in section["items"] if item["status"] == _WARN]
    return {
        "status": _overall(sections),
        "score": _score(sections),
        "environment": settings.environment,
        "generated_at": _now_iso(),
        "sections": sections,
        "failures": failures,
        "warnings": warnings,
        "next_actions": [item["action"] for item in failures + warnings if item.get("action")][:8],
    }


def build_ohada_readiness(db: Session, company_id: int) -> dict[str, Any]:
    """Return a tenant-scoped accounting/OHADA readiness snapshot."""
    company = db.get(Company, company_id)
    if not company:
        return {"status": _FAIL, "score": 0, "sections": [], "generated_at": _now_iso()}

    legal_fields = ["legal_form", "rccm", "niu", "tax_regime", "manager_name", "address", "city", "email"]
    missing_legal = [field for field in legal_fields if not str(getattr(company, field, "") or "").strip()]
    legal_items = [
        _check(
            "legal_identity",
            "Identité légale OHADA/CEMAC",
            _PASS if not missing_legal else _WARN,
            "Mentions légales complètes." if not missing_legal else f"Champs à compléter: {', '.join(missing_legal)}",
            action="Compléter les mentions légales dans Paramètres/Entreprise." if missing_legal else "",
            priority="high",
        )
    ]

    acc.seed_chart_of_accounts(db, company_id)
    db.flush()
    accounts = db.scalars(select(Account).where(Account.company_id == company_id)).all()
    classes = sorted({a.syscohada_class for a in accounts})
    required_classes = {1, 4, 5, 6, 7}
    accounting_items = [
        _check(
            "syscohada_chart",
            "Plan comptable SYSCOHADA-lite",
            _PASS if required_classes.issubset(set(classes)) else _FAIL,
            f"{len(accounts)} compte(s), classes {', '.join(str(c) for c in classes) or 'aucune'}.",
            action="Relancer le seed du plan comptable." if not required_classes.issubset(set(classes)) else "",
            priority="critical",
        )
    ]
    balance = acc.trial_balance(db, company_id)
    accounting_items.append(
        _check(
            "trial_balance",
            "Balance équilibrée",
            _PASS if balance.get("balanced") else _FAIL,
            f"Débit={balance.get('total_debit')} / Crédit={balance.get('total_credit')}",
            action="Rechercher les écritures déséquilibrées." if not balance.get("balanced") else "",
            priority="critical",
        )
    )
    entries_count = db.scalar(select(text("COUNT(*)")).select_from(JournalEntry).where(JournalEntry.company_id == company_id)) or 0
    accounting_items.append(
        _check(
            "journal_entries",
            "Journal comptable",
            _PASS if entries_count else _WARN,
            f"{entries_count} écriture(s) postée(s).",
            action="Poster au moins une vente/facture payée ou une écriture manuelle pour valider le cycle." if not entries_count else "",
        )
    )

    invoices = db.scalars(select(Invoice).where(Invoice.company_id == company_id)).all()
    invoices_with_tax = [inv for inv in invoices if (inv.tax_amount_cents or 0) > 0 or (inv.tax_amount or 0) > 0]
    invoice_items = [
        _check(
            "invoice_numbering",
            "Numérotation factures",
            _PASS,
            f"Séquence courante: {company.invoice_seq}. {len(invoices)} facture(s).",
        ),
        _check(
            "invoice_tax",
            "TVA sur factures",
            _PASS if invoices_with_tax else _WARN,
            f"{len(invoices_with_tax)} facture(s) avec TVA collectée.",
            action="Créer une facture avec ligne taxable pour valider la TVA." if not invoices_with_tax else "",
        ),
    ]

    current_year = date.today().year
    fiscal_count = db.scalar(
        select(text("COUNT(*)")).select_from(FiscalDeadline).where(
            FiscalDeadline.company_id == company_id,
            FiscalDeadline.due_date >= date(current_year, 1, 1),
            FiscalDeadline.due_date <= date(current_year, 12, 31),
        )
    ) or 0
    declarations_count = db.scalar(
        select(text("COUNT(*)")).select_from(DeclarationRecord).where(DeclarationRecord.company_id == company_id)
    ) or 0
    fiscal_items = [
        _check(
            "fiscal_calendar",
            "Agenda fiscal annuel",
            _PASS if fiscal_count >= 20 else _WARN,
            f"{fiscal_count} échéance(s) fiscales {current_year}.",
            action="Générer l'agenda fiscal annuel." if fiscal_count < 20 else "",
            priority="high",
        ),
        _check(
            "declaration_records",
            "Dossiers déclaratifs",
            _PASS if declarations_count else _WARN,
            f"{declarations_count} dossier(s) déclaratif(s).",
            action="Préparer au moins une déclaration TVA/IS/sociale." if not declarations_count else "",
        ),
    ]

    employees = db.scalar(select(text("COUNT(*)")).select_from(Employee).where(Employee.company_id == company_id)) or 0
    payrolls = db.scalar(select(text("COUNT(*)")).select_from(PayrollRun).where(PayrollRun.company_id == company_id)) or 0
    payroll_items = [
        _check(
            "payroll_cemac",
            "Paie et CNSS",
            _PASS if payrolls else _WARN,
            f"{employees} employé(s), {payrolls} run(s) de paie.",
            action="Créer/valider un run de paie pour vérifier CNSS/IRPP." if employees and not payrolls else "",
        )
    ]

    sections = [
        _section("legal", "Mentions légales", legal_items),
        _section("accounting", "Comptabilité OHADA", accounting_items),
        _section("billing", "Facturation / TVA", invoice_items),
        _section("fiscal", "Déclarations fiscales", fiscal_items),
        _section("payroll", "RH / Paie", payroll_items),
    ]
    return {
        "status": _overall(sections),
        "score": _score(sections),
        "company_id": company_id,
        "company_name": company.name,
        "generated_at": _now_iso(),
        "sections": sections,
        "next_actions": [
            item["action"]
            for section in sections
            for item in section["items"]
            if item["status"] != _PASS and item.get("action")
        ][:8],
    }


def _month_key(dt: datetime | date | str | None) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt[:7] if len(dt) >= 7 else None
    return f"{dt.year:04d}-{dt.month:02d}"


def build_business_insights(db: Session, company_id: int) -> dict[str, Any]:
    """Deterministic Limule-style insights from tenant data."""
    today = date.today()
    invoices = db.scalars(select(Invoice).where(Invoice.company_id == company_id)).all()
    sales = db.scalars(select(Sale).where(Sale.company_id == company_id)).all()
    tx_rows = db.scalars(select(BankTransaction).where(BankTransaction.company_id == company_id)).all()
    products = db.scalars(select(Product).where(Product.company_id == company_id)).all()
    tasks = db.scalars(select(Task).where(Task.company_id == company_id)).all()
    fiscal_deadlines = db.scalars(select(FiscalDeadline).where(FiscalDeadline.company_id == company_id)).all()

    inflow_by_month: Counter[str] = Counter()
    outflow_by_month: Counter[str] = Counter()
    for inv in invoices:
        if inv.status == "paid":
            key = _month_key(inv.paid_at or inv.created_at)
            if key:
                inflow_by_month[key] += float(inv.total_amount or 0)
    for sale in sales:
        key = _month_key(sale.created_at)
        if key:
            inflow_by_month[key] += float(sale.total_amount or 0)
    for tx in tx_rows:
        key = _month_key(tx.date)
        if not key:
            continue
        inflow_by_month[key] += float(tx.credit if tx.credit is not None else max(tx.amount or 0, 0))
        outflow_by_month[key] += float(tx.debit if tx.debit is not None else max(-(tx.amount or 0), 0))

    months = sorted(set(inflow_by_month) | set(outflow_by_month))[-6:]
    net_points = [
        {
            "month": month,
            "inflow": round(inflow_by_month[month], 2),
            "outflow": round(outflow_by_month[month], 2),
            "net": round(inflow_by_month[month] - outflow_by_month[month], 2),
        }
        for month in months
    ]
    recent_nets = [point["net"] for point in net_points[-3:]]
    projected_30d_net = round(sum(recent_nets) / len(recent_nets), 2) if recent_nets else 0.0

    overdue = [
        inv for inv in invoices
        if inv.due_date and inv.due_date < today and inv.status != "paid"
    ]
    low_stock = [p for p in products if (p.stock_quantity or 0) <= (p.reorder_level or 0)]
    deadlines_due = [
        d for d in fiscal_deadlines
        if d.status != "done" and d.due_date <= today + timedelta(days=max(1, d.reminder_days or 7))
    ]
    tasks_due = [
        t for t in tasks
        if t.status != "done" and t.due_date and t.due_date <= today + timedelta(days=7)
    ]

    anomalies: list[dict[str, Any]] = []
    if overdue:
        anomalies.append({
            "type": "overdue_invoices",
            "severity": "critical" if len(overdue) > 5 else "warning",
            "title": "Factures en retard",
            "detail": f"{len(overdue)} facture(s), total {round(sum(inv.total_amount or 0 for inv in overdue), 2)}",
            "action_url": "/billing?status=late",
        })
    if low_stock:
        anomalies.append({
            "type": "low_stock",
            "severity": "warning",
            "title": "Stock bas",
            "detail": f"{len(low_stock)} produit(s) sous seuil",
            "action_url": "/inventory?filter=low",
        })
    if deadlines_due:
        anomalies.append({
            "type": "fiscal_deadline",
            "severity": "critical" if any(d.due_date < today for d in deadlines_due) else "warning",
            "title": "Échéances fiscales",
            "detail": f"{len(deadlines_due)} échéance(s) à traiter",
            "action_url": "/fiscal",
        })
    if tasks_due:
        anomalies.append({
            "type": "task_deadline",
            "severity": "warning",
            "title": "Tâches proches",
            "detail": f"{len(tasks_due)} tâche(s) à échéance proche",
            "action_url": "/kanban",
        })
    if projected_30d_net < 0:
        anomalies.append({
            "type": "cashflow_negative",
            "severity": "critical",
            "title": "Prévision trésorerie négative",
            "detail": f"Net projeté 30 jours: {projected_30d_net}",
            "action_url": "/analytics",
        })

    recommendations: list[str] = []
    if overdue:
        recommendations.append("Relancer les factures en retard avant nouvelle dépense non essentielle.")
    if low_stock:
        recommendations.append("Créer un réassort prioritaire sur les produits sous seuil.")
    if deadlines_due:
        recommendations.append("Préparer les pièces fiscales avant la date limite.")
    if tasks_due:
        recommendations.append("Reprioriser le Kanban sur les tâches à échéance.")
    if not recommendations:
        recommendations.append("Aucune anomalie métier détectée sur les données disponibles.")

    sources = {
        "invoices": len(invoices),
        "sales": len(sales),
        "bank_transactions": len(tx_rows),
        "products": len(products),
        "tasks": len(tasks),
        "fiscal_deadlines": len(fiscal_deadlines),
    }
    active_sources = sum(1 for value in sources.values() if value > 0)
    data_quality = "good" if active_sources >= 4 else "partial" if active_sources else "empty"

    return {
        "generated_at": _now_iso(),
        "company_id": company_id,
        "data_quality": data_quality,
        "sources": sources,
        "cashflow_forecast": {
            "method": "average_last_3_observed_months",
            "months": net_points,
            "projected_30d_net": projected_30d_net,
            "source_months": len(recent_nets),
        },
        "anomalies": anomalies,
        "recommendations": recommendations,
        "confidence": 0 if data_quality == "empty" else min(95, 45 + active_sources * 10),
    }


def build_group_portfolio(db: Session, company_id: int) -> dict[str, Any]:
    """Aggregate groups/orgs for multi-tenant portfolio supervision."""
    groups = db.scalars(
        select(OrganizationGroup).where(OrganizationGroup.company_id == company_id).order_by(OrganizationGroup.name)
    ).all()
    rows: list[dict[str, Any]] = []
    for group in groups:
        members = db.scalar(select(text("COUNT(*)")).select_from(GroupMember).where(GroupMember.group_id == group.id)) or 0
        rows.append({
            "id": group.id,
            "name": group.name,
            "type": group.type,
            "status": group.status,
            "country": group.country,
            "city": group.city,
            "currency": group.currency,
            "linked_company_id": group.linked_company_id,
            "members": members,
            "is_active": group.is_active,
        })
    return {
        "company_id": company_id,
        "generated_at": _now_iso(),
        "groups_total": len(rows),
        "active_groups": sum(1 for row in rows if row["is_active"] and row["status"] == "active"),
        "linked_groups": sum(1 for row in rows if row["linked_company_id"]),
        "members_total": sum(row["members"] for row in rows),
        "groups": rows,
        "warnings": [
            {
                "type": "unlinked_groups",
                "message": "Des groupes ne sont pas rattachés à une entité/filiale.",
                "count": sum(1 for row in rows if not row["linked_company_id"]),
            }
        ] if any(not row["linked_company_id"] for row in rows) else [],
    }
