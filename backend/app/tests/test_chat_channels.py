"""
test_chat_channels.py — Chat entreprise : membership de canal restreint.

Vérifie :
- un non-admin ne peut pas créer de canal restreint (403)
- un admin peut créer un canal avec des membres explicites
- un non-membre reçoit 403 sur GET messages / POST message d'un canal restreint
- un membre peut lire/écrire dans un canal restreint
- le canal "general" reste toujours accessible, quelles que soient les lignes
  de membership
- PATCH /chat/channels/{id}/members fonctionne et refuse sur "general"
"""
from fastapi.testclient import TestClient

from app.main import app


def _auth(client, email="admin@kompta.local", password="kompta123"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _user_id(client, h) -> int:
    me = client.get("/api/auth/me", headers=h)
    assert me.status_code == 200, me.text
    return me.json()["id"]


def test_non_admin_cannot_create_restricted_channel():
    with TestClient(app) as client:
        finance_h = _auth(client, "finance@kompta.local", "kompta123")
        r = client.post("/api/chat/channels", headers=finance_h, json={"name": "projet-secret", "topic": ""})
        assert r.status_code == 403


def test_admin_can_create_channel_with_members():
    with TestClient(app) as client:
        admin_h = _auth(client)
        finance_uid = _user_id(client, _auth(client, "finance@kompta.local", "kompta123"))
        r = client.post(
            "/api/chat/channels",
            headers=admin_h,
            json={"name": "projet-x", "topic": "Suivi projet X", "member_user_ids": [finance_uid]},
        )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["is_restricted"] is True
        assert finance_uid in data["member_ids"]


def test_non_member_gets_403_on_restricted_channel():
    with TestClient(app) as client:
        admin_h = _auth(client)
        # admin crée un canal restreint sans y ajouter caissier
        r = client.post(
            "/api/chat/channels",
            headers=admin_h,
            json={"name": "bureau-direction", "topic": "", "member_user_ids": []},
        )
        assert r.status_code == 201, r.text
        channel_id = r.json()["id"]
        # sans membres explicites -> ouvert à tous (comportement par défaut) :
        # on ajoute donc un membre pour forcer la restriction
        rh_uid = _user_id(client, _auth(client, "rh@kompta.local", "kompta123"))
        patch = client.patch(
            f"/api/chat/channels/{channel_id}/members", headers=admin_h, json={"member_user_ids": [rh_uid]}
        )
        assert patch.status_code == 200, patch.text
        assert patch.json()["is_restricted"] is True

        caissier_h = _auth(client, "caissier@kompta.local", "kompta123")
        r_get = client.get(f"/api/chat/channels/{channel_id}/messages", headers=caissier_h)
        assert r_get.status_code == 403
        r_post = client.post(f"/api/chat/channels/{channel_id}/messages", headers=caissier_h, json={"body": "salut"})
        assert r_post.status_code == 403


def test_member_can_access_restricted_channel():
    with TestClient(app) as client:
        admin_h = _auth(client)
        rh_h = _auth(client, "rh@kompta.local", "kompta123")
        rh_uid = _user_id(client, rh_h)
        r = client.post(
            "/api/chat/channels",
            headers=admin_h,
            json={"name": "rh-only", "topic": "", "member_user_ids": [rh_uid]},
        )
        assert r.status_code == 201, r.text
        channel_id = r.json()["id"]
        r_get = client.get(f"/api/chat/channels/{channel_id}/messages", headers=rh_h)
        assert r_get.status_code == 200
        r_post = client.post(f"/api/chat/channels/{channel_id}/messages", headers=rh_h, json={"body": "bonjour"})
        assert r_post.status_code == 201


def test_general_channel_always_open_regardless_of_membership():
    with TestClient(app) as client:
        admin_h = _auth(client)
        # Créer/obtenir le canal "general" (déjà auto-créé à l'init entreprise normalement)
        r = client.post("/api/chat/channels", headers=admin_h, json={"name": "general", "topic": ""})
        assert r.status_code == 201, r.text
        channel_id = r.json()["id"]

        # Essayer de le restreindre via PATCH -> refusé
        rh_uid = _user_id(client, _auth(client, "rh@kompta.local", "kompta123"))
        patch = client.patch(
            f"/api/chat/channels/{channel_id}/members", headers=admin_h, json={"member_user_ids": [rh_uid]}
        )
        assert patch.status_code == 400

        # N'importe quel user de la société y accède toujours
        caissier_h = _auth(client, "caissier@kompta.local", "kompta123")
        r_get = client.get(f"/api/chat/channels/{channel_id}/messages", headers=caissier_h)
        assert r_get.status_code == 200
        r_post = client.post(f"/api/chat/channels/{channel_id}/messages", headers=caissier_h, json={"body": "yo"})
        assert r_post.status_code == 201


def test_patch_members_replaces_full_set():
    with TestClient(app) as client:
        admin_h = _auth(client)
        rh_uid = _user_id(client, _auth(client, "rh@kompta.local", "kompta123"))
        finance_uid = _user_id(client, _auth(client, "finance@kompta.local", "kompta123"))
        r = client.post(
            "/api/chat/channels",
            headers=admin_h,
            json={"name": "restreint-2", "topic": "", "member_user_ids": [rh_uid]},
        )
        channel_id = r.json()["id"]
        patch = client.patch(
            f"/api/chat/channels/{channel_id}/members", headers=admin_h, json={"member_user_ids": [finance_uid]}
        )
        assert patch.status_code == 200, patch.text
        member_ids = patch.json()["member_ids"]
        assert finance_uid in member_ids
        assert rh_uid not in member_ids
