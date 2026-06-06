"""Test : profil entreprise enrichi (mentions légales CEMAC/OHADA) + complétion."""
from fastapi.testclient import TestClient

from app.main import app


def _auth(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": "admin@kompta.local", "password": "kompta123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_company_profile_legal_fields_persist_and_completion() -> None:
    with TestClient(app) as client:
        headers = _auth(client)
        payload = {
            "legal_form": "SARL", "rccm": "CG-BZV-01-2024-B12-00123", "niu": "M2024CG12345",
            "cnss_number": "CNSS-998877", "patente_number": "PAT-2024-55", "tax_regime": "reel",
            "share_capital": "1 000 000 XAF", "founded_date": "2024-01-15",
            "address": "12 av. de la Paix", "city": "Brazzaville", "phone": "+242060000000",
            "email": "contact@adansonia.cg", "website": "https://adansonia.cg",
            "manager_name": "Davy Okemba", "manager_title": "Gérant",
            "bank_name": "BGFIBank Congo", "bank_account": "CG12345678901234567890",
        }
        r = client.patch("/api/company/profile", headers=headers, json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        # Tous les champs sont persistés
        for k, v in payload.items():
            assert body[k] == v, f"{k}: {body[k]!r} != {v!r}"
        # La complétion remonte (beaucoup de champs renseignés)
        assert body["completion_score"] >= 80, body["completion_score"]

        # Persistance vérifiée via GET
        g = client.get("/api/company/profile", headers=headers).json()
        assert g["rccm"] == payload["rccm"]
        assert g["legal_form"] == "SARL"
