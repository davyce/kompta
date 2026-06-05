"""
test_groups.py — Module Groupes & Organisations, Phase G1 (fondation).
Valide : création groupe, membres, assignation de rôle, changement de bureau
avec conservation de l'historique, et refus de permission.
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _auth(client, email="admin@kompta.local", password="kompta123"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _make_group(client, h, name=None):
    return client.post("/api/groups", headers=h, json={
        "name": name or f"Tontine {uuid4().hex[:6]}", "type": "tontine", "city": "Brazzaville",
    })


def test_create_group_seeds_roles_and_president():
    with TestClient(app) as client:
        h = _auth(client)
        r = _make_group(client, h)
        assert r.status_code == 201
        gid = r.json()["id"]
        roles = client.get(f"/api/groups/{gid}/roles", headers=h).json()
        names = {x["name"] for x in roles}
        assert {"Président", "Trésorier", "Secrétaire"}.issubset(names)
        # le créateur est membre + Président
        members = client.get(f"/api/groups/{gid}/members", headers=h).json()
        assert any("Président" in m["roles"] for m in members)


def test_add_member_and_assign_role():
    with TestClient(app) as client:
        h = _auth(client)
        gid = _make_group(client, h).json()["id"]
        m = client.post(f"/api/groups/{gid}/members", headers=h, json={"full_name": "Amina Tontine", "zone": "Bacongo"})
        assert m.status_code == 201
        mid = m.json()["id"]
        r = client.post(f"/api/groups/{gid}/roles/assign", headers=h, json={"member_id": mid, "role_name": "Trésorier"})
        assert r.status_code == 201
        members = client.get(f"/api/groups/{gid}/members", headers=h).json()
        treasurer = next(x for x in members if x["id"] == mid)
        assert "Trésorier" in treasurer["roles"]


def test_change_leadership_keeps_history():
    with TestClient(app) as client:
        h = _auth(client)
        gid = _make_group(client, h).json()["id"]
        m = client.post(f"/api/groups/{gid}/members", headers=h, json={"full_name": "Nouveau Président"}).json()
        # bureau initial existe (fondateur)
        before = client.get(f"/api/groups/{gid}/leadership", headers=h).json()
        assert before["current"] is not None
        # changer le bureau
        r = client.post(f"/api/groups/{gid}/leadership/change", headers=h, json={
            "president_member_id": m["id"], "elected_by": "Assemblée générale",
        })
        assert r.status_code == 201
        after = client.get(f"/api/groups/{gid}/leadership", headers=h).json()
        assert after["current"]["president_member_id"] == m["id"]
        assert len(after["history"]) >= 2  # l'ancien mandat est conservé
        assert sum(1 for x in after["history"] if x["is_current"]) == 1  # un seul mandat courant


def test_member_management_requires_permission():
    with TestClient(app) as client:
        admin_h = _auth(client)
        gid = _make_group(client, admin_h).json()["id"]
        # finance n'est ni admin société ni membre du groupe → 403
        finance_h = _auth(client, "finance@kompta.local", "kompta123")
        r = client.post(f"/api/groups/{gid}/members", headers=finance_h, json={"full_name": "Intrus"})
        assert r.status_code in (403, 404)


def test_president_can_close_group_and_remove_it_from_active_list():
    with TestClient(app) as client:
        h = _auth(client)
        gid = _make_group(client, h).json()["id"]

        r = client.post(f"/api/groups/{gid}/close", headers=h, json={"reason": "Activité terminée"})
        assert r.status_code == 200, r.text
        payload = r.json()
        assert payload["status"] == "closed"
        assert payload["is_active"] is False

        active_ids = {g["id"] for g in client.get("/api/groups", headers=h).json()}
        assert gid not in active_ids


def test_non_president_cannot_close_group():
    with TestClient(app) as client:
        admin_h = _auth(client)
        gid = _make_group(client, admin_h).json()["id"]

        finance_h = _auth(client, "finance@kompta.local", "kompta123")
        r = client.post(f"/api/groups/{gid}/close", headers=finance_h, json={"reason": "Intrus"})
        assert r.status_code in (403, 404)


def test_tenant_isolation_on_groups():
    with TestClient(app) as client:
        h = _auth(client)
        gid = _make_group(client, h).json()["id"]
        # un nouveau compte société ne doit pas voir ce groupe
        suffix = uuid4().hex[:8]
        reg = client.post("/api/auth/register-company", json={
            "company_name": f"Autre {suffix}", "legal_name": "Autre SARL", "industry": "Services",
            "organization_type": "PME", "country": "Congo",
            "admin_full_name": "Autre Admin", "admin_email": f"autre.{suffix}@kompta.local",
            "admin_phone": f"+24206{suffix[:6]}", "password": "Kompta123!",
        })
        assert reg.status_code == 201
        other_h = {"Authorization": f"Bearer {reg.json()['access_token']}"}
        assert client.get(f"/api/groups/{gid}", headers=other_h).status_code == 404
