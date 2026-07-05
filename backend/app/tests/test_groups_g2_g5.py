"""
test_groups_g2_g5.py — Tests des phases G2-G5 du module Groupes.

G2 : cotisations (plan, paiement, validation, écriture comptable auto),
     dépenses (approbation, écriture comptable auto), dashboard financier.
G3 : réunions (création, compte-rendu), activités, calendrier, anniversaires, votes.
G4 : chat (salon, messages, réactions, suppression), documents.
G5 : permissions IA (membre sans accès finance), rapport paiements, rapport dépenses.
"""
from __future__ import annotations

from datetime import datetime, timedelta, date, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _auth(client, email="admin@kompta.local", password="kompta123") -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _setup_group(client, h) -> tuple[int, int]:
    """Crée un groupe + un membre. Retourne (group_id, member_id)."""
    suffix = uuid4().hex[:6]
    gid = client.post("/api/groups", headers=h, json={"name": f"Groupe {suffix}", "type": "tontine"}).json()["id"]
    m = client.post(f"/api/groups/{gid}/members", headers=h, json={"full_name": "Amina Test", "phone": "+24206111111"}).json()
    return gid, m["id"]


# ── G2 : Cotisations ─────────────────────────────────────────────────────────
def test_g2_contribution_plan_and_payment_flow():
    with TestClient(app) as client:
        h = _auth(client)
        gid, mid = _setup_group(client, h)
        # Créer un plan de cotisation
        plan = client.post(f"/api/groups/{gid}/contributions/plans", headers=h, json={
            "title": "Cotisation mensuelle", "amount": 5000, "frequency": "mensuelle",
        }).json()
        assert plan["amount"] == 5000.0
        assert plan["frequency"] == "mensuelle"
        # Enregistrer un paiement complet
        pay = client.post(f"/api/groups/{gid}/contributions/payments", headers=h, json={
            "member_id": mid, "plan_id": plan["id"], "amount_paid": 5000, "payment_method": "mobile_money",
        }).json()
        assert pay["status"] == "paid"
        assert pay["amount_paid"] == 5000.0
        # Paiement partiel
        pay2 = client.post(f"/api/groups/{gid}/contributions/payments", headers=h, json={
            "member_id": mid, "plan_id": plan["id"], "amount_paid": 2000, "payment_method": "cash",
        }).json()
        assert pay2["status"] == "partial"


def test_g2_payment_validation_triggers_accounting():
    with TestClient(app) as client:
        h = _auth(client)
        gid, mid = _setup_group(client, h)
        plan = client.post(f"/api/groups/{gid}/contributions/plans", headers=h, json={
            "title": "Cotisation annuelle", "amount": 12000, "frequency": "annuelle",
        }).json()
        pay = client.post(f"/api/groups/{gid}/contributions/payments", headers=h, json={
            "member_id": mid, "plan_id": plan["id"], "amount_paid": 12000, "payment_method": "cash",
        }).json()
        # Valider → doit créer l'écriture comptable
        validated = client.post(f"/api/groups/{gid}/contributions/payments/{pay['id']}/validate", headers=h).json()
        assert validated["validated_at"] is not None
        # Vérifier qu'une écriture a été créée dans le journal
        journal = client.get("/api/accounting/journal?limit=5", headers=h).json()
        contrib_entries = [e for e in journal if e.get("source_type") == "group_contribution"]
        assert contrib_entries


def test_g2_expense_approval_triggers_accounting():
    with TestClient(app) as client:
        h = _auth(client)
        gid, _ = _setup_group(client, h)
        exp = client.post(f"/api/groups/{gid}/expenses", headers=h, json={
            "title": "Achat chaises", "amount": 25000, "category": "matériel",
            "payment_method": "cash",
        }).json()
        assert exp["status"] == "pending"
        approved = client.post(f"/api/groups/{gid}/expenses/{exp['id']}/approve", headers=h).json()
        assert approved["status"] == "paid"
        assert approved["approved_at"] is not None
        # Vérifier l'écriture comptable
        journal = client.get("/api/accounting/journal?limit=5", headers=h).json()
        expense_entries = [e for e in journal if e.get("source_type") == "group_expense"]
        assert expense_entries


def test_g2_finance_dashboard():
    with TestClient(app) as client:
        h = _auth(client)
        gid, _ = _setup_group(client, h)
        dash = client.get(f"/api/groups/{gid}/dashboard/finance", headers=h).json()
        assert "balance" in dash
        assert "members_count" in dash
        assert isinstance(dash["balance"], float)


# ── G3 : Réunions, calendrier, votes ─────────────────────────────────────────
def test_g3_meeting_creation_and_minutes():
    with TestClient(app) as client:
        h = _auth(client)
        gid, _ = _setup_group(client, h)
        start = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        meeting = client.post(f"/api/groups/{gid}/meetings", headers=h, json={
            "title": "AG mensuelle", "location": "Salle 1", "start_datetime": start, "meeting_type": "ordinaire",
        }).json()
        assert meeting["status"] == "scheduled"
        # Ajouter un PV
        updated = client.patch(f"/api/groups/{gid}/meetings/{meeting['id']}/minutes", headers=h,
                                json={"minutes": "Présents : 12 membres. Décision : augmentation cotisation à 6000 XAF."}).json()
        assert updated["status"] == "done"
        assert "augmentation" in updated["minutes"]


def test_g3_calendar_contains_meeting_and_activity():
    with TestClient(app) as client:
        h = _auth(client)
        gid, _ = _setup_group(client, h)
        start = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        client.post(f"/api/groups/{gid}/meetings", headers=h, json={"title": "Réunion test", "start_datetime": start})
        client.post(f"/api/groups/{gid}/activities", headers=h, json={"title": "Activité test", "start_datetime": start})
        cal = client.get(f"/api/groups/{gid}/calendar", headers=h).json()
        types = {e["type"] for e in cal["events"]}
        assert "meeting" in types
        assert "activity" in types


def test_g3_birthdays_detected():
    with TestClient(app) as client:
        h = _auth(client)
        gid, _ = _setup_group(client, h)
        # Ajouter un membre avec anniversaire dans 5 jours
        bday = (date.today() + timedelta(days=5)).replace(year=1990)
        client.post(f"/api/groups/{gid}/members", headers=h, json={"full_name": "Bday Test", "date_of_birth": str(bday)})
        birthdays = client.get(f"/api/groups/{gid}/birthdays", headers=h).json()
        upcoming = [b for b in birthdays if b["days_until"] <= 10]
        assert upcoming


def test_g3_vote_create_respond_results():
    with TestClient(app) as client:
        h = _auth(client)
        gid, _ = _setup_group(client, h)
        start = datetime.now(timezone.utc).isoformat()
        end = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        vote = client.post(f"/api/groups/{gid}/votes", headers=h, json={
            "title": "Lieu de la prochaine réunion ?", "options": ["Salle A", "Salle B", "En ligne"],
            "start_datetime": start, "end_datetime": end,
        }).json()
        assert vote["status"] == "open"
        # Voter
        r = client.post(f"/api/groups/{gid}/votes/{vote['id']}/respond", headers=h, json={"selected_option": "Salle A"})
        assert r.status_code == 201
        # Voter une deuxième fois → 409
        r2 = client.post(f"/api/groups/{gid}/votes/{vote['id']}/respond", headers=h, json={"selected_option": "Salle B"})
        assert r2.status_code == 409
        # Résultats
        results = client.get(f"/api/groups/{gid}/votes/{vote['id']}/results", headers=h).json()
        assert results["total_votes"] == 1
        assert results["results"][0]["option"] == "Salle A"
        assert results["results"][0]["count"] == 1


# ── G4 : Chat (simplifié 2026-07 — aligné sur le chat entreprise) ─────────────
def test_g4_chat_room_and_messages():
    with TestClient(app) as client:
        h = _auth(client)
        gid, _ = _setup_group(client, h)
        # Le salon général est créé automatiquement (via la création du groupe…
        # sinon on en crée un)
        rooms = client.get(f"/api/groups/{gid}/chat/rooms", headers=h).json()
        # Créer un salon si vide
        if not rooms:
            room = client.post(f"/api/groups/{gid}/chat/rooms", headers=h,
                               json={"name": "Général"}).json()
            room_id = room["id"]
        else:
            room_id = rooms[0]["id"]
        # Envoyer un message
        msg = client.post(f"/api/groups/{gid}/chat/rooms/{room_id}/messages", headers=h,
                           json={"content": "Bonjour tout le monde !"}).json()
        assert msg["content"] == "Bonjour tout le monde !"
        assert msg["message_type"] == "text"
        # Supprimer
        deleted = client.delete(f"/api/groups/{gid}/chat/rooms/{room_id}/messages/{msg['id']}", headers=h).json()
        assert deleted["deleted"] is True
        # Vérifier dans la liste
        msgs = client.get(f"/api/groups/{gid}/chat/rooms/{room_id}/messages", headers=h).json()
        assert not any(m["id"] == msg["id"] and m.get("content") == "Bonjour tout le monde !" for m in msgs)


def test_g4_chat_message_triggers_limule_action():
    """Le message de groupe doit désormais déclencher chat_ai_action() comme
    le chat entreprise (auparavant, ai_suggestion n'était jamais renseigné)."""
    with TestClient(app) as client:
        h = _auth(client)
        gid, _ = _setup_group(client, h)
        rooms = client.get(f"/api/groups/{gid}/chat/rooms", headers=h).json()
        room_id = rooms[0]["id"] if rooms else client.post(
            f"/api/groups/{gid}/chat/rooms", headers=h, json={"name": "Général"}
        ).json()["id"]
        clear_trigger = "Peux-tu envoyer le contrat signé avant vendredi 15h @Marie, c'est urgent"
        msg = client.post(f"/api/groups/{gid}/chat/rooms/{room_id}/messages", headers=h,
                           json={"content": clear_trigger}).json()
        assert msg["ai_action"] is not None
        assert msg["ai_action"]["detected"] is True
        assert msg["ai_suggestion"]


def test_g4_room_listing_no_longer_filters_by_role_or_type():
    """Tous les salons du groupe sont visibles à tout membre — la distinction
    bureau/finance/private a été supprimée (simplification 2026-07)."""
    with TestClient(app) as client:
        h = _auth(client)
        gid, _ = _setup_group(client, h)
        room = client.post(f"/api/groups/{gid}/chat/rooms", headers=h, json={"name": "Autre salon"})
        assert room.status_code == 201
        assert room.json()["type"] == "general"
        rooms = client.get(f"/api/groups/{gid}/chat/rooms", headers=h).json()
        assert any(r["name"] == "Autre salon" for r in rooms)


def test_g4_removed_reaction_route_is_gone():
    with TestClient(app) as client:
        h = _auth(client)
        gid, _ = _setup_group(client, h)
        rooms = client.get(f"/api/groups/{gid}/chat/rooms", headers=h).json()
        room_id = rooms[0]["id"] if rooms else client.post(
            f"/api/groups/{gid}/chat/rooms", headers=h, json={"name": "Général"}
        ).json()["id"]
        msg = client.post(f"/api/groups/{gid}/chat/rooms/{room_id}/messages", headers=h,
                           json={"content": "test"}).json()
        r = client.post(f"/api/groups/{gid}/chat/rooms/{room_id}/messages/{msg['id']}/react",
                        headers=h, json={"emoji": "👍"})
        assert r.status_code in (404, 405)


# ── G5 : IA permissions ───────────────────────────────────────────────────────
def test_g5_member_cannot_ask_finance_questions():
    """Un utilisateur non-membre ou sans rôle finance ne doit pas accéder aux données financières."""
    with TestClient(app) as client:
        admin_h = _auth(client)
        gid, _ = _setup_group(client, admin_h)
        # finance@kompta.local n'est pas membre du groupe
        finance_h = _auth(client, "finance@kompta.local", "kompta123")
        r = client.post(f"/api/groups/{gid}/ai/ask", headers=finance_h,
                         json={"question": "Quel est le solde de la caisse ?"})
        assert r.status_code in (403, 404)


def test_g5_reports_accessible_to_finance_roles():
    with TestClient(app) as client:
        h = _auth(client)
        gid, mid = _setup_group(client, h)
        # Créer un peu de données
        plan = client.post(f"/api/groups/{gid}/contributions/plans", headers=h,
                            json={"title": "Cotis report test", "amount": 1000, "frequency": "mensuelle"}).json()
        client.post(f"/api/groups/{gid}/contributions/payments", headers=h,
                     json={"member_id": mid, "plan_id": plan["id"], "amount_paid": 1000})
        report = client.get(f"/api/groups/{gid}/reports/payments", headers=h).json()
        assert "total_due" in report
        assert "rows" in report
        assert isinstance(report["rows"], list)
