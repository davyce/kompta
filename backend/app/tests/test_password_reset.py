"""Tests du reset de mot de passe persisté en DB (token hashé, usage unique)."""
import hashlib

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.db.session import SessionLocal
from app.models import PasswordResetToken, User


def _register_company(client: TestClient, suffix: str) -> dict:
    r = client.post("/api/auth/register-company", json={
        "signatory_name": "Test Signataire", "accept_privacy": True, "accept_terms": True, "accept_disclaimer": True,
        "company_name": f"Reset {suffix}",
        "legal_name": f"Reset {suffix}",
        "industry": "Test",
        "organization_type": "PME",
        "country": "Congo",
        "admin_full_name": f"Admin {suffix}",
        "admin_email": f"reset.{suffix}@test.cg",
        "admin_phone": f"+24206{suffix[-7:]}",
        "company_name": f"Reset {suffix}",
        "legal_name": f"Reset {suffix}",
        "industry": "Test",
        "organization_type": "PME",
        "country": "Congo",
        "admin_full_name": f"Admin {suffix}",
        "admin_email": f"reset.{suffix}@test.cg",
        "admin_phone": f"+24206{suffix[-7:]}",
        "password": "InitialPass2026!",
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_reset_flow_end_to_end() -> None:
    import time
    suffix = str(int(time.time()))
    with TestClient(app) as client:
        _register_company(client, suffix)
        email = f"reset.{suffix}@test.cg"

        # 1. Demander un reset
        req = client.post("/api/auth/request-reset", json={"identifier": email})
        assert req.status_code == 200
        token = req.json().get("reset_token")
        assert token, "Le token doit être renvoyé en mode test/local"

        # 2. Le token est stocké HASHÉ en DB (jamais en clair)
        with SessionLocal() as db:
            row = db.scalar(select(PasswordResetToken).where(
                PasswordResetToken.token_hash == hashlib.sha256(token.encode()).hexdigest()
            ))
            assert row is not None
            assert row.used_at is None
            # le clair n'apparaît nulle part en base
            clair = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token))
            assert clair is None

        # 3. Réinitialiser
        new_pw = "NouveauMotDePasse2026!"
        rp = client.post("/api/auth/reset-password", json={"token": token, "new_password": new_pw})
        assert rp.status_code == 200, rp.text

        # 4. Login avec le nouveau mdp fonctionne
        login = client.post("/api/auth/login", json={"email": email, "password": new_pw})
        assert login.status_code == 200

        # 5. Le token est consommé → réutilisation refusée
        again = client.post("/api/auth/reset-password", json={"token": token, "new_password": "Encore2026!"})
        assert again.status_code == 400


def test_reset_unknown_identifier_is_generic() -> None:
    with TestClient(app) as client:
        r = client.post("/api/auth/request-reset", json={"identifier": "inconnu@nowhere.xyz"})
        assert r.status_code == 200
        # Pas de token pour un compte inexistant (anti-énumération)
        assert "reset_token" not in r.json()


def test_reset_short_password_rejected() -> None:
    import time
    suffix = str(int(time.time())) + "b"
    with TestClient(app) as client:
        _register_company(client, suffix)
        token = client.post("/api/auth/request-reset", json={"identifier": f"reset.{suffix}@test.cg"}).json()["reset_token"]
        r = client.post("/api/auth/reset-password", json={"token": token, "new_password": "court"})
        assert r.status_code == 400


def test_reset_invalid_token_rejected() -> None:
    with TestClient(app) as client:
        r = client.post("/api/auth/reset-password", json={"token": "totally-invalid", "new_password": "ValidPass2026!"})
        assert r.status_code == 400
