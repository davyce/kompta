from app.db.init_db import create_tables, seed_demo_data
from app.db.session import SessionLocal


def main() -> None:
    create_tables()
    with SessionLocal() as db:
        seed_demo_data(db)
    print("KOMPTA demo data is ready.")


if __name__ == "__main__":
    main()
