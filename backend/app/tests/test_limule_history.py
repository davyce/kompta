"""Test : historique Q&A Limule persisté (mission 1)."""
from __future__ import annotations

import time
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import SessionLocal
from app.models import LimuleInteraction, User


def _login(client: TestClient, email: str = "admin@kompta.local", password: str = "kompta123") -> dict:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_limule_history_returns_recent_questions_desc() -> None:
    with TestClient(app) as client:
        headers = _login(client)

        # Seed 2 interactions Limule directement (la route /limule/chat appellerait le LLM)
        db = SessionLocal()
        try:
            admin = db.query(User).filter(User.email == "admin@kompta.local").first()
            assert admin is not None
            i1 = LimuleInteraction(
                prompt="Quel est mon CA du mois ?",
                response="Votre CA est de 1 000 000 XAF.",
                module_key="dashboard",
                intent="question",
                user_id=admin.id,
                company_id=admin.company_id,
            )
            db.add(i1)
            db.commit()
            time.sleep(0.01)  # garantir un ordre temporel
            i2 = LimuleInteraction(
                prompt="Stock du produit A ?",
                response="Stock = 5 unités.",
                module_key="inventory",
                intent="question",
                user_id=admin.id,
                company_id=admin.company_id,
            )
            db.add(i2)
            db.commit()
        finally:
            db.close()

        response = client.get("/api/limule/history?limit=30", headers=headers)
        assert response.status_code == 200, response.text
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2

        # Ordre décroissant : la plus récente en premier
        questions = [row["question"] for row in data]
        assert "Stock du produit A ?" in questions
        assert "Quel est mon CA du mois ?" in questions
        idx_recent = questions.index("Stock du produit A ?")
        idx_old = questions.index("Quel est mon CA du mois ?")
        assert idx_recent < idx_old

        # Structure attendue
        row = data[idx_recent]
        for key in ("id", "question", "answer", "created_at", "module", "intent"):
            assert key in row, f"clé manquante : {key}"
