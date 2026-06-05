import os
import sys

from app.db.init_db import create_tables, seed_demo_data
from app.db.session import SessionLocal


def main() -> None:
    if "--yes-demo" not in sys.argv and os.getenv("SEED_DEMO") != "true":
        raise SystemExit(
            "Seed démo désactivé par défaut. Relancez avec SEED_DEMO=true "
            "ou backend/scripts/seed.py --yes-demo dans une base locale isolée."
        )
    create_tables()
    with SessionLocal() as db:
        seed_demo_data(db)
    print("Données démo KOMPTA créées dans la base locale.")


if __name__ == "__main__":
    main()
