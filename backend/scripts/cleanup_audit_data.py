#!/usr/bin/env python3
"""
cleanup_audit_data.py — Supprime proprement les données générées par les audits.

Cible : comptes `audit-%@kompta.test`, leurs sociétés et groupes « Audit … »,
puis nettoie en cascade toutes les lignes devenues orphelines. Les sociétés
réelles (ADANSONIA, KOMPTA Platform, etc.) et leurs données sont préservées.

Usage :
    .venv/bin/python scripts/cleanup_audit_data.py            # aperçu (dry-run)
    .venv/bin/python scripts/cleanup_audit_data.py --apply    # exécute

Sécurité : crée un backup horodaté de la base avant toute suppression (--apply).
"""
from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.config import get_settings  # noqa: E402


def _db_path() -> str:
    url = get_settings().database_url
    if not url.startswith("sqlite"):
        print(f"❌ Base non-SQLite ({url}) : script réservé à SQLite local.")
        raise SystemExit(1)
    # sqlite:////abs/path.db  ou  sqlite:///rel/path.db
    return url.split("sqlite:///")[-1].lstrip("/") if ":////" not in url else "/" + url.split("sqlite:////")[-1]


def main() -> int:
    parser = argparse.ArgumentParser(description="Nettoyage des données d'audit")
    parser.add_argument("--apply", action="store_true", help="Exécute réellement (sinon dry-run)")
    args = parser.parse_args()

    path = _db_path()
    if not os.path.exists(path):
        print(f"❌ Base introuvable : {path}")
        return 1

    con = sqlite3.connect(path, timeout=15)
    con.execute("PRAGMA busy_timeout=15000")
    cur = con.cursor()

    audit_users = cur.execute(
        "SELECT id, email FROM users WHERE email LIKE 'audit-%@kompta.test' OR email LIKE 'probe-cookie-%@kompta.test'"
    ).fetchall()
    audit_companies = cur.execute(
        "SELECT id, name FROM companies WHERE name LIKE 'Audit %' OR name LIKE '%Audit Kompta%' OR name LIKE 'Probe %'"
    ).fetchall()
    audit_groups = cur.execute("SELECT id, name FROM organization_groups WHERE name LIKE 'Groupe Audit%'").fetchall()

    print("=== Données d'audit détectées ===")
    print(f"  Utilisateurs : {[e for _, e in audit_users]}")
    print(f"  Sociétés     : {[n for _, n in audit_companies]}")
    print(f"  Groupes      : {[n for _, n in audit_groups]}")

    if not (audit_users or audit_companies or audit_groups):
        print("\n✓ Rien à nettoyer.")
        con.close()
        return 0

    if not args.apply:
        print("\n(dry-run) Relance avec --apply pour supprimer.")
        con.close()
        return 0

    # Backup
    backup = f"{path}.backup-{datetime.now():%Y%m%d-%H%M%S}"
    shutil.copy(path, backup)
    print(f"\n✓ Backup : {backup}")

    con.execute("PRAGMA foreign_keys=OFF")
    for cid, _ in audit_companies:
        cur.execute("DELETE FROM companies WHERE id = ?", (cid,))
    for gid, _ in audit_groups:
        cur.execute("DELETE FROM organization_groups WHERE id = ?", (gid,))
    cur.execute("DELETE FROM users WHERE email LIKE 'audit-%@kompta.test' OR email LIKE 'probe-cookie-%@kompta.test'")

    # Cascade orphelins (fixpoint)
    tables = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'alembic%'"
    ).fetchall()]
    fks = {t: [(r[3], r[2]) for r in cur.execute(f"PRAGMA foreign_key_list('{t}')").fetchall()] for t in tables}
    passes = 0
    while True:
        passes += 1
        deleted = 0
        for t in tables:
            for col, ref in fks[t]:
                cur.execute(f"DELETE FROM '{t}' WHERE \"{col}\" IS NOT NULL AND \"{col}\" NOT IN (SELECT id FROM '{ref}')")
                deleted += cur.rowcount
        if deleted == 0 or passes > 25:
            break
    con.commit()

    ok = cur.execute("PRAGMA integrity_check").fetchone()[0]
    broken = len(cur.execute("PRAGMA foreign_key_check").fetchall())
    con.execute("VACUUM")
    con.close()
    print(f"✓ Cascade : {passes} passes | integrity={ok} | refs cassées={broken}")
    print("✓ Nettoyage terminé.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
