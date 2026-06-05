from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


DB_PATH = Path(__file__).resolve().parents[1] / "kompta.db"
DEMO_COMPANY_WHERE = (
    "name = 'KOMPTA Demo' "
    "OR legal_name = 'KOMPTA Demo SARL' "
    "OR name LIKE 'Nouvelle Societe %' "
    "OR name LIKE 'Autre %' "
    "OR name LIKE 'E2E Audit %' "
    "OR name LIKE 'E2E-DOCS-%' "
    "OR legal_name LIKE 'E2E-DOCS-%'"
)
DEMO_EMAIL_WHERE = (
    "email IN ("
    "'admin@kompta.local', 'finance@kompta.local', 'caissier@kompta.local', "
    "'rh@kompta.local', 'dg@kompta.local'"
    ") OR email LIKE 'nadia.%@kompta.local' "
    "OR email LIKE 'diane.dg.%@kompta.local' "
    "OR email LIKE 'autre.%@kompta.local' "
    "OR email LIKE 'e2e.%@test.cg' "
    "OR email LIKE 'pres%@test.cg' "
    "OR email LIKE 'membre%@test.cg' "
    "OR email = 'test@kompta.com'"
)


def table_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    return [row[1] for row in conn.execute(f'PRAGMA table_info("{table}")')]


def foreign_keys(conn: sqlite3.Connection, table: str) -> list[tuple[str, str, str]]:
    return [(row[3], row[2], row[4]) for row in conn.execute(f'PRAGMA foreign_key_list("{table}")')]


def rows_for_column(conn: sqlite3.Connection, table: str, column: str, values: set[int]) -> set[int]:
    if not values or "id" not in table_columns(conn, table):
        return set()
    placeholders = ",".join("?" for _ in values)
    query = f'SELECT id FROM "{table}" WHERE "{column}" IN ({placeholders})'
    return {int(row[0]) for row in conn.execute(query, tuple(values))}


def main() -> None:
    parser = argparse.ArgumentParser(description="Supprime les données locales de démonstration KOMPTA.")
    parser.add_argument("--apply", action="store_true", help="Applique la suppression. Sans ce flag, affiche seulement le plan.")
    parser.add_argument("--db", default=str(DB_PATH), help="Chemin de la base SQLite KOMPTA.")
    args = parser.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]

    ids: dict[str, set[int]] = {table: set() for table in tables if "id" in table_columns(conn, table)}
    company_ids = {int(row[0]) for row in conn.execute(f"SELECT id FROM companies WHERE {DEMO_COMPANY_WHERE}")}
    user_ids = {int(row[0]) for row in conn.execute(f"SELECT id FROM users WHERE {DEMO_EMAIL_WHERE}")}
    ids.setdefault("companies", set()).update(company_ids)
    ids.setdefault("users", set()).update(user_ids)

    changed = True
    while changed:
        changed = False
        for table in tables:
            if table not in ids:
                continue
            for column, ref_table, ref_column in foreign_keys(conn, table):
                if ref_column != "id":
                    continue
                ref_ids = ids.get(ref_table, set())
                found = rows_for_column(conn, table, column, ref_ids)
                before = len(ids[table])
                ids[table].update(found)
                if len(ids[table]) != before:
                    changed = True

    plan = {table: len(table_ids) for table, table_ids in ids.items() if table_ids}
    print("Plan de suppression demo:")
    for table, count in sorted(plan.items()):
        print(f"- {table}: {count}")

    if not args.apply:
        print("Dry-run uniquement. Ajoutez --apply pour supprimer.")
        return

    conn.execute("PRAGMA foreign_keys = OFF")
    with conn:
        for table, table_ids in sorted(ids.items(), key=lambda item: len(item[1]), reverse=True):
            if not table_ids:
                continue
            placeholders = ",".join("?" for _ in table_ids)
            conn.execute(f'DELETE FROM "{table}" WHERE id IN ({placeholders})', tuple(table_ids))

        platform_id = conn.execute("SELECT id FROM companies WHERE name = 'KOMPTA Platform'").fetchone()
        if platform_id:
            conn.execute(
                "UPDATE users SET company_id = ?, department = 'KOMPTA Platform', branch = 'HQ' WHERE role = 'super_admin'",
                (int(platform_id[0]),),
            )
    conn.execute("PRAGMA foreign_keys = ON")
    print("Données demo supprimées.")


if __name__ == "__main__":
    main()
