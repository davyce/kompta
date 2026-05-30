"""
migrate_cents.py — Migration des colonnes Float monétaires vers BigInteger cents.

Stratégie non-destructive :
  1. Ajoute colonnes *_cents (BigInteger) à côté des Float existants.
  2. Backfille depuis les Float (× 100, arrondi).
  3. Les colonnes Float héritées restent en base (backward compat) mais sont
     marquées DEPRECATED dans les modèles. Les nouvelles colonnes _cents sont
     utilisées par tout le code post-migration.

Note : tax_rate (%) et client_discounts.discount_value (%) restent en Float
       car ce sont des TAUX, pas des montants.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import engine


MIGRATIONS: list[tuple[str, str, str]] = [
    # (table, old_float_col, new_cents_col)
    ("invoices",          "total_amount",       "total_amount_cents"),
    ("invoices",          "subtotal",            "subtotal_cents"),
    ("invoices",          "tax_amount",          "tax_amount_cents"),
    ("invoice_lines",     "unit_price",          "unit_price_cents"),
    ("invoice_lines",     "total",               "total_cents"),
    ("products",          "price",               "price_cents"),
    ("sale_items",        "unit_price",          "unit_price_cents"),
    ("sale_items",        "line_total",          "line_total_cents"),
    ("sales",             "total_amount",        "total_amount_cents"),
    ("payslips",          "gross_pay",           "gross_pay_cents"),
    ("payslips",          "deductions",          "deductions_cents"),
    ("payslips",          "net_pay",             "net_pay_cents"),
    ("payslips",          "bonus",               "bonus_cents"),
    ("payslips",          "overtime_pay",        "overtime_pay_cents"),
    ("payslips",          "absence_deduction",   "absence_deduction_cents"),
    ("payroll_runs",      "gross_total",         "gross_total_cents"),
    ("payroll_runs",      "net_total",           "net_total_cents"),
    ("employees",         "salary",              "salary_cents"),
    ("bank_transactions", "amount",              "amount_cents"),
    ("bank_transactions", "debit",               "debit_cents"),
    ("bank_transactions", "credit",              "credit_cents"),
    ("bank_transactions", "balance",             "balance_cents"),
    ("budget_categories", "planned_amount",      "planned_amount_cents"),
    ("investments",       "invested_amount",     "invested_amount_cents"),
    ("investments",       "purchase_price_ref",  "purchase_price_ref_cents"),
    ("pos_sessions",      "total_amount",        "total_amount_cents"),
]


def run_cents_migration() -> dict[str, int]:
    """Exécute la migration. Retourne le nombre de lignes backfillées par table."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    existing_tables = {t: {c["name"] for c in inspector.get_columns(t)} for t in inspector.get_table_names()}
    stats: dict[str, int] = {}

    with engine.begin() as conn:
        for table, old_col, new_col in MIGRATIONS:
            if table not in existing_tables:
                continue
            cols = existing_tables[table]
            # 1. Ajouter la colonne _cents si absente
            if new_col not in cols:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {new_col} INTEGER DEFAULT 0"))
            # 2. Backfill depuis le Float (ROUND(float * 100))
            result = conn.execute(
                text(f"UPDATE {table} SET {new_col} = CAST(ROUND(COALESCE({old_col}, 0) * 100) AS INTEGER) WHERE {new_col} = 0 OR {new_col} IS NULL")
            )
            if table not in stats:
                stats[table] = 0
            stats[table] += result.rowcount

    return stats


if __name__ == "__main__":
    result = run_cents_migration()
    print("Migration terminée :")
    for t, n in sorted(result.items()):
        print(f"  {t}: {n} lignes mises à jour")
