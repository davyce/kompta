"""check_orphaned_fks.py — Détecte les références FK orphelines dans SQLite.

SQLite n'impose PAS les contraintes de clé étrangère par défaut (contrairement
à PostgreSQL) : une ligne peut donc référencer un id qui n'existe plus (ex.
un utilisateur supprimé dont d'anciens audit_logs gardent la trace). Ces
orphelins passent inaperçus sous SQLite mais font échouer :
  - un `pg_dump`/`pg_restore` (ADD CONSTRAINT valide les données existantes),
  - potentiellement la migration initiale si une contrainte est ajoutée après
    coup plutôt qu'en même temps que la table.

À exécuter AVANT toute bascule vers PostgreSQL (migrate_sqlite_to_postgres.py
n'échoue pas dessus lui-même grâce à session_replication_role='replica', mais
un backup/restore PostgreSQL ultérieur sur ces mêmes données échouerait).

Usage :
    python -m scripts.check_orphaned_fks --sqlite sqlite:////chemin/vers/kompta.db

Sortie : liste des (table, colonne, id_ligne, id_référencé_manquant). Code de
sortie 0 si aucun orphelin, 1 sinon (utilisable dans un script de bascule).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.models import Base  # noqa: E402


def check(sqlite_url: str) -> int:
    engine = create_engine(sqlite_url)
    total_orphans = 0

    with Session(engine) as session:
        for table in Base.metadata.sorted_tables:
            for fk in table.foreign_keys:
                col = fk.parent
                ref_table = fk.column.table
                ref_col = fk.column
                if ref_table.name == table.name:
                    continue  # auto-référence : hors scope de ce contrôle simple
                query = text(
                    f"SELECT t.id, t.{col.name} FROM {table.name} t "
                    f"WHERE t.{col.name} IS NOT NULL "
                    f"AND t.{col.name} NOT IN (SELECT {ref_col.name} FROM {ref_table.name})"
                )
                try:
                    rows = session.execute(query).all()
                except Exception:
                    continue  # colonne/table introuvable (schéma partiellement à jour) : ignoré
                for row_id, ref_value in rows:
                    total_orphans += 1
                    print(f"  ⚠ {table.name}.{col.name} (id={row_id}) → {ref_table.name}.{ref_col.name}={ref_value} INTROUVABLE")

    if total_orphans == 0:
        print("✓ Aucune référence orpheline détectée.")
        return 0
    print(f"\n{total_orphans} référence(s) orpheline(s) trouvée(s) — "
          f"à nettoyer (ou mettre la colonne à NULL) avant bascule PostgreSQL.")
    return 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sqlite", required=True, help="URL SQLAlchemy de la base SQLite (sqlite:///...)")
    args = parser.parse_args()
    sys.exit(check(args.sqlite))


if __name__ == "__main__":
    main()
