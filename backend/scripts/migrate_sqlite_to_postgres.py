"""migrate_sqlite_to_postgres.py — Migration ponctuelle SQLite → PostgreSQL.

Copie toutes les tables définies dans app.models.Base.metadata depuis une
base SQLite source vers une base PostgreSQL cible, dans l'ordre topologique
des clés étrangères, puis réaligne les séquences PostgreSQL (SERIAL) sur les
IDs importés.

Usage :
    python -m scripts.migrate_sqlite_to_postgres \
        --sqlite sqlite:////chemin/vers/kompta.db \
        --postgres postgresql://kompta:motdepasse@localhost:5432/kompta \
        [--dry-run]

Le script est idempotent en lecture (ne modifie jamais la source SQLite) et
s'arrête à la première erreur — la transaction PostgreSQL est alors annulée
dans son ensemble (rien n'est laissé à moitié migré).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.models import Base  # noqa: E402  (import après sys.path.insert)


def migrate(sqlite_url: str, postgres_url: str, dry_run: bool = False) -> None:
    if not sqlite_url.startswith("sqlite"):
        raise SystemExit(f"--sqlite doit être une URL sqlite:///..., reçu : {sqlite_url}")
    if not postgres_url.startswith("postgresql"):
        raise SystemExit(f"--postgres doit être une URL postgresql://..., reçu : {postgres_url}")

    src_engine = create_engine(sqlite_url)
    dst_engine = create_engine(postgres_url)

    print(f"Source (SQLite)   : {sqlite_url}")
    print(f"Destination (PG)  : {postgres_url.split('@')[-1]}")  # masque les identifiants
    print(f"Mode              : {'DRY-RUN (aucune écriture)' if dry_run else 'ÉCRITURE RÉELLE'}")
    print()

    print("→ Création du schéma sur PostgreSQL (Base.metadata.create_all)…")
    if not dry_run:
        Base.metadata.create_all(bind=dst_engine)

    tables = Base.metadata.sorted_tables  # ordre topologique (parents avant enfants)
    print(f"→ {len(tables)} tables à migrer, dans l'ordre des dépendances FK.\n")

    report: list[tuple[str, int, int]] = []  # (table, lignes_source, lignes_copiées)

    with Session(src_engine) as src_session, Session(dst_engine) as dst_session:
        if not dry_run:
            # Désactive temporairement les triggers de vérification FK
            # (technique standard PostgreSQL de chargement en masse). Plus
            # robuste que "SET CONSTRAINTS ALL DEFERRED" : les contraintes
            # créées par Base.metadata.create_all() ne sont pas DEFERRABLE
            # par défaut, donc DEFERRED serait un no-op sur les tables aux
            # dépendances cycliques (ex. users ↔ employees ↔ custom_roles,
            # confirmé par le warning SQLAlchemy "unresolvable cycles").
            # Nécessite que le rôle de connexion soit propriétaire des
            # tables (le cas du POSTGRES_USER du conteneur).
            dst_session.execute(text("SET session_replication_role = 'replica'"))

        for table in tables:
            rows = src_session.execute(select(table)).mappings().all()
            n = len(rows)
            copied = 0
            if rows and not dry_run:
                # Insertion par lots de 500 pour limiter la mémoire sur les
                # grosses tables (ex. audit_logs, notifications) sans perdre
                # l'intérêt du batch insert.
                batch = [dict(r) for r in rows]
                for i in range(0, len(batch), 500):
                    chunk = batch[i:i + 500]
                    dst_session.execute(table.insert(), chunk)
                    copied += len(chunk)
            elif rows:
                copied = n  # dry-run : compté mais pas écrit

            report.append((table.name, n, copied))
            status = "·" if n == 0 else ("✓" if not dry_run else "(dry-run)")
            print(f"  {status} {table.name:<40} {n:>7} ligne(s)")

        if not dry_run:
            print("\n→ Réalignement des séquences PostgreSQL sur les IDs importés…")
            for table in tables:
                if "id" not in table.c:
                    continue
                dst_session.execute(text(
                    f"SELECT setval("
                    f"pg_get_serial_sequence('{table.name}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {table.name}), 0) + 1, "
                    f"false"
                    f") WHERE pg_get_serial_sequence('{table.name}', 'id') IS NOT NULL"
                ))
            # Réactive les triggers FK avant de valider — sinon le prochain
            # utilisateur de cette connexion (pool) hériterait du mode
            # "replica" et verrait ses propres contraintes silencieusement
            # ignorées.
            dst_session.execute(text("SET session_replication_role = 'origin'"))
            dst_session.commit()
            print("→ Commit effectué.")
        else:
            print("\n(dry-run) Aucune écriture, aucun commit.")

    print("\n=== Résumé ===")
    total_src = sum(n for _, n, _ in report)
    total_dst = sum(c for _, _, c in report)
    mismatches = [(t, n, c) for t, n, c in report if n != c and not dry_run]
    for t, n, c in report:
        if n > 0:
            print(f"  {t:<40} source={n:<7} copié={c:<7} {'OK' if n == c or dry_run else '⚠ ÉCART'}")
    print(f"\nTotal lignes source : {total_src}")
    print(f"Total lignes copiées: {total_dst}")
    if mismatches and not dry_run:
        print("\n⚠ ÉCARTS DÉTECTÉS — vérifier avant de basculer la production :")
        for t, n, c in mismatches:
            print(f"    {t}: {n} en source, {c} copiées")
        sys.exit(1)
    elif not dry_run:
        print("\n✓ Migration terminée, tous les comptages correspondent.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sqlite", required=True, help="URL SQLAlchemy de la base SQLite source (sqlite:///...)")
    parser.add_argument("--postgres", required=True, help="URL SQLAlchemy de la base PostgreSQL cible (postgresql://...)")
    parser.add_argument("--dry-run", action="store_true", help="Compte les lignes sans rien écrire sur PostgreSQL")
    args = parser.parse_args()
    migrate(args.sqlite, args.postgres, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
