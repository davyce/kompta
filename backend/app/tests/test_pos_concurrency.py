"""Tests de concurrence POS : décrément de stock, isolation des sessions de
caisse par session_id, et constat sur l'idempotence des ventes.

Contexte (cf. commit 98de9e4) : `Sale.session_id` rattache désormais chaque
vente à la session de caisse ouverte du caissier, et la création de vente est
atomique avec son écriture comptable (rollback complet en cas d'échec).

Limitation connue : ces tests tournent sur SQLite (DB de dev), dont le
verrouillage au niveau fichier est bien plus strict que PostgreSQL sous écritures
concurrentes réelles (erreurs `database is locked` possibles même quand la
logique applicative est correcte). On utilise donc un pool de threads réduit,
des transactions courtes, et un léger retry/backoff pour absorber ce bruit de
verrouillage SQLite — pas une lacune de la logique testée. Une validation de
charge réelle (nombreux writers concurrents) nécessite PostgreSQL, cf.
`load_tests/README.md`.
"""
from __future__ import annotations

import threading
import time
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import Company, User

ADMIN_EMAIL = "admin@kompta.local"
ADMIN_PASSWORD = "kompta123"


def _auth(client: TestClient, email: str = ADMIN_EMAIL, password: str = ADMIN_PASSWORD) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _create_second_cashier(company_id: int) -> tuple[str, str]:
    """Crée un second utilisateur (caissier) rattaché à la même entreprise que
    l'admin démo, directement en base (pas de flux d'invitation nécessaire
    pour ce test de concurrence entre deux sessions de caisse)."""
    email = f"caissier-{uuid4().hex[:8]}@kompta.local"
    password = "Caissier2026!"
    with SessionLocal() as db:
        company = db.get(Company, company_id)
        assert company is not None
        user = User(
            email=email,
            full_name="Caissier Concurrence Test",
            role="caissier",
            password_hash=hash_password(password),
            account_status="active",
            is_active=True,
            company_id=company_id,
        )
        db.add(user)
        db.commit()
    return email, password


def _post_with_retry(client: TestClient, url: str, headers: dict, json: dict, retries: int = 5):
    """SQLite (DB de dev) verrouille tout le fichier lors d'une écriture ; sous
    écritures concurrentes réelles, un writer peut recevoir `database is locked`
    alors que la logique applicative est correcte. On absorbe ce bruit avec un
    petit retry/backoff — à revisiter une fois PostgreSQL en production, où ce
    genre de contention est géré nativement au niveau ligne."""
    last_resp = None
    for attempt in range(retries):
        resp = client.post(url, headers=headers, json=json)
        if resp.status_code != 500 or "locked" not in resp.text.lower():
            return resp
        last_resp = resp
        time.sleep(0.05 * (attempt + 1))
    return last_resp


# ═══════════════════════════════════════════════════════════════════════════
# 1. Décrément de stock concurrent : pas de survente possible.
# ═══════════════════════════════════════════════════════════════════════════
def test_concurrent_sales_never_oversell_stock() -> None:
    with TestClient(app) as client:
        headers = _auth(client)
        suffix = uuid4().hex[:8]
        product = client.post(
            "/api/products",
            headers=headers,
            json={
                "name": f"Produit concurrence {suffix}",
                "sku": f"CONC-{suffix}",
                "category": "Tests",
                "price": 1000,
                "stock_quantity": 5,
            },
        )
        assert product.status_code == 201, product.text
        product_id = product.json()["id"]

        results: list[int] = []
        lock = threading.Lock()

        def _sell(qty: int) -> None:
            # Chaque thread doit utiliser son propre TestClient/session HTTP
            # pour refléter deux requêtes réellement concurrentes.
            with TestClient(app) as thread_client:
                h = _auth(thread_client)
                resp = _post_with_retry(
                    thread_client,
                    "/api/pos/sales",
                    h,
                    {
                        "payment_method": "cash",
                        "items": [{"product_id": product_id, "quantity": qty}],
                        "tva_enabled": False,
                    },
                )
                with lock:
                    results.append(resp.status_code)

        threads = [threading.Thread(target=_sell, args=(3,)) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

        # Stock=5, deux ventes de 3 chacune (total demandé=6) : une seule peut
        # réussir (201), l'autre doit échouer proprement pour stock insuffisant (409).
        assert sorted(results) == [201, 409], f"Résultats inattendus: {results}"

        with SessionLocal() as db:
            from app.models import Product
            refreshed = db.get(Product, product_id)
            assert refreshed is not None
            # Le stock final ne doit JAMAIS être négatif, et une seule vente de
            # 3 a dû passer : stock final = 5 - 3 = 2.
            assert refreshed.stock_quantity == 2, f"Stock final incohérent: {refreshed.stock_quantity}"
            assert refreshed.stock_quantity >= 0


def test_concurrent_sales_exact_stock_boundary() -> None:
    """Stock=5, deux ventes concurrentes de qty=5 chacune : une seule doit passer,
    stock final doit être exactement 0 (jamais négatif)."""
    with TestClient(app) as client:
        headers = _auth(client)
        suffix = uuid4().hex[:8]
        product = client.post(
            "/api/products",
            headers=headers,
            json={
                "name": f"Produit frontiere {suffix}",
                "sku": f"BOUND-{suffix}",
                "category": "Tests",
                "price": 500,
                "stock_quantity": 5,
            },
        )
        assert product.status_code == 201, product.text
        product_id = product.json()["id"]

        results: list[int] = []
        lock = threading.Lock()

        def _sell() -> None:
            with TestClient(app) as thread_client:
                h = _auth(thread_client)
                resp = _post_with_retry(
                    thread_client,
                    "/api/pos/sales",
                    h,
                    {
                        "payment_method": "cash",
                        "items": [{"product_id": product_id, "quantity": 5}],
                        "tva_enabled": False,
                    },
                )
                with lock:
                    results.append(resp.status_code)

        threads = [threading.Thread(target=_sell) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

        assert sorted(results) == [201, 409], f"Résultats inattendus: {results}"

        with SessionLocal() as db:
            from app.models import Product
            refreshed = db.get(Product, product_id)
            assert refreshed is not None
            assert refreshed.stock_quantity == 0


# ═══════════════════════════════════════════════════════════════════════════
# 2. Isolation des sessions de caisse sous charge concurrente.
# ═══════════════════════════════════════════════════════════════════════════
def test_concurrent_sessions_balance_isolation() -> None:
    """Deux caissiers de la même entreprise, chacun avec sa propre session de
    caisse ouverte, vendent en même temps : le solde de chacun ne doit refléter
    QUE ses propres ventes (preuve que le FK session_id, ajouté en 98de9e4,
    empêche la contamination croisée même sous charge concurrente, pas
    seulement en séquentiel)."""
    with TestClient(app) as admin_client:
        admin_headers = _auth(admin_client)
        # Récupère la company de l'admin démo pour rattacher le second caissier.
        login = admin_client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        me = admin_client.get("/api/auth/me", headers=admin_headers)
        company_id = me.json()["company_id"] if me.status_code == 200 else None
        if company_id is None:
            with SessionLocal() as db:
                admin = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
                company_id = admin.company_id

        cashier_email, cashier_password = _create_second_cashier(company_id)

        suffix = uuid4().hex[:8]
        product = admin_client.post(
            "/api/products",
            headers=admin_headers,
            json={
                "name": f"Produit isolation {suffix}",
                "sku": f"ISO-{suffix}",
                "category": "Tests",
                "price": 1000,
                "stock_quantity": 100,
            },
        )
        assert product.status_code == 201, product.text
        product_id = product.json()["id"]

        # Ferme toute session déjà ouverte pour l'admin (état résiduel d'autres
        # tests) afin de partir d'un état propre et prévisible.
        def _ensure_fresh_session(client: TestClient, headers: dict) -> int:
            existing = client.get("/api/pos/sessions/current/balance", headers=headers)
            if existing.status_code == 200:
                client.patch(
                    f"/api/pos/sessions/{existing.json()['session_id']}/close",
                    headers=headers,
                )
            opened = client.post("/api/pos/sessions", headers=headers, json={"opening_balance_cents": 0})
            assert opened.status_code == 201, opened.text
            return opened.json()["id"]

        admin_session_id = _ensure_fresh_session(admin_client, admin_headers)

        with TestClient(app) as cashier_client:
            cashier_headers = _auth(cashier_client, cashier_email, cashier_password)
            cashier_session_id = _ensure_fresh_session(cashier_client, cashier_headers)
            assert cashier_session_id != admin_session_id

            barrier = threading.Barrier(2, timeout=30)
            errors: list[Exception] = []

            def _admin_sell() -> None:
                try:
                    with TestClient(app) as c:
                        h = _auth(c)
                        barrier.wait()
                        for _ in range(3):
                            resp = _post_with_retry(
                                c, "/api/pos/sales", h,
                                {"payment_method": "cash", "items": [{"product_id": product_id, "quantity": 1}], "tva_enabled": False},
                            )
                            assert resp.status_code == 201, resp.text
                except Exception as exc:  # pragma: no cover - surfaced via errors list
                    errors.append(exc)

            def _cashier_sell() -> None:
                try:
                    with TestClient(app) as c:
                        h = _auth(c, cashier_email, cashier_password)
                        barrier.wait()
                        for _ in range(2):
                            resp = _post_with_retry(
                                c, "/api/pos/sales", h,
                                {"payment_method": "cash", "items": [{"product_id": product_id, "quantity": 1}], "tva_enabled": False},
                            )
                            assert resp.status_code == 201, resp.text
                except Exception as exc:  # pragma: no cover
                    errors.append(exc)

            t1 = threading.Thread(target=_admin_sell)
            t2 = threading.Thread(target=_cashier_sell)
            t1.start()
            t2.start()
            t1.join(timeout=60)
            t2.join(timeout=60)

            assert not errors, f"Erreurs dans les threads: {errors}"

            admin_balance = admin_client.get("/api/pos/sessions/current/balance", headers=admin_headers)
            cashier_balance = cashier_client.get("/api/pos/sessions/current/balance", headers=cashier_headers)
            assert admin_balance.status_code == 200, admin_balance.text
            assert cashier_balance.status_code == 200, cashier_balance.text

            # Admin a vendu 3× 1000 = 3000 (300000 cents), caissier 2× 1000 = 2000 (200000 cents).
            # Chaque solde ne doit refléter QUE ses propres ventes, jamais celles de l'autre session.
            assert admin_balance.json()["cash_sales_cents"] == 300_000, admin_balance.json()
            assert cashier_balance.json()["cash_sales_cents"] == 200_000, cashier_balance.json()
            assert admin_balance.json()["session_id"] == admin_session_id
            assert cashier_balance.json()["session_id"] == cashier_session_id


# ═══════════════════════════════════════════════════════════════════════════
# 3. Idempotence — constat, pas une nouvelle conception.
# ═══════════════════════════════════════════════════════════════════════════
def test_duplicate_rapid_sale_requests_both_decrement_stock_no_idempotency_key() -> None:
    """CONSTAT (pas une régression à corriger ici) : `POST /pos/sales` n'a
    aujourd'hui AUCUN mécanisme d'idempotence (pas d'`Idempotency-Key`, pas de
    déduplication par payload). Si le même payload est soumis deux fois de
    suite (ex: double-clic caisse, requête réseau retentée par le front), DEUX
    ventes distinctes sont créées et le stock est décrémenté deux fois.

    Ce test documente ce comportement actuel plutôt que de le corriger : la
    mise en place d'une vraie clé d'idempotence (header dédié + table de
    déduplication ou contrainte unique sur un identifiant client-généré) est une
    décision de conception plus large, hors du périmètre de cette tâche."""
    with TestClient(app) as client:
        headers = _auth(client)
        suffix = uuid4().hex[:8]
        product = client.post(
            "/api/products",
            headers=headers,
            json={
                "name": f"Produit idempotence {suffix}",
                "sku": f"IDEM-{suffix}",
                "category": "Tests",
                "price": 1000,
                "stock_quantity": 10,
            },
        )
        assert product.status_code == 201, product.text
        product_id = product.json()["id"]

        payload = {
            "payment_method": "cash",
            "items": [{"product_id": product_id, "quantity": 2}],
            "tva_enabled": False,
        }
        first = client.post("/api/pos/sales", headers=headers, json=payload)
        second = client.post("/api/pos/sales", headers=headers, json=payload)
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text
        assert first.json()["id"] != second.json()["id"], (
            "Deux ventes distinctes sont créées pour un payload identique soumis deux fois : "
            "confirme l'absence de mécanisme d'idempotence côté /pos/sales."
        )

        with SessionLocal() as db:
            from app.models import Product
            refreshed = db.get(Product, product_id)
            assert refreshed is not None
            # Stock décrémenté DEUX fois (2 + 2 = 4) faute d'idempotence — comportement documenté, pas corrigé ici.
            assert refreshed.stock_quantity == 6
