import pytest
from fastapi.testclient import TestClient
from uuid import uuid4

from app.main import app


def login_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def auth_headers(client: TestClient) -> dict[str, str]:
    return login_headers(client, "admin@kompta.local", "kompta123")


def super_admin_headers(client: TestClient) -> dict[str, str]:
    return login_headers(client, "superadmin@kompta.io", "super2026")


def test_core_product_flow() -> None:
    with TestClient(app) as client:
        headers = auth_headers(client)
        suffix = uuid4().hex[:8]

        dashboard = client.get("/api/reports/overview", headers=headers)
        assert dashboard.status_code == 200
        assert dashboard.json()["kpis"]["employees"] >= 1

        employee = client.post(
            "/api/employees",
            headers=headers,
            json={
                "first_name": "Test",
                "last_name": "Employe",
                "email": f"test.employee.{suffix}@kompta.local",
                "job_title": "Agent QA",
                "salary": 700,
            },
        )
        assert employee.status_code == 201

        product = client.post(
            "/api/products",
            headers=headers,
            json={
                "name": "Produit test POS",
                "sku": f"TEST-POS-{suffix}",
                "category": "Tests",
                "price": 10,
                "stock_quantity": 5,
            },
        )
        assert product.status_code == 201
        payment_account = client.post(
            "/api/payment-accounts",
            headers=headers,
            json={
                "provider": "zola",
                "label": f"Zola test {suffix}",
                "account_name": "KOMPTA Test",
                "phone_number": f"+24206{suffix[:6]}",
                "use_for_pos": True,
                "is_default_pos": True,
            },
        )
        assert payment_account.status_code == 201
        assert payment_account.json()["masked_identifier"]
        image_upload = client.post(
            f"/api/products/{product.json()['id']}/images",
            headers=headers,
            files=[
                ("files", ("face.png", b"\x89PNG\r\n\x1a\nproduct-image-one", "image/png")),
                ("files", ("pack.png", b"\x89PNG\r\n\x1a\nproduct-image-two", "image/png")),
            ],
        )
        assert image_upload.status_code == 200
        assert len(image_upload.json()["images"]) == 2
        products = client.get("/api/products", headers=headers).json()
        selected = next(item for item in products if item["stock_quantity"] > 0)

        label = client.post(f"/api/products/{selected['id']}/qr-label", headers=headers)
        assert label.status_code == 200
        assert label.json()["label"]["qr"]
        scanned = client.get(f"/api/products/scan/{label.json()['label']['qr']}", headers=headers)
        assert scanned.status_code == 200
        assert scanned.json()["id"] == selected["id"]

        sale = client.post(
            "/api/pos/sales",
            headers=headers,
            json={
                "payment_method": "zola",
                "payment_account_id": payment_account.json()["id"],
                "items": [{"product_id": selected["id"], "quantity": 1}],
            },
        )
        assert sale.status_code == 201
        assert sale.json()["total_amount"] > 0
        assert sale.json()["payment_account_label"] == payment_account.json()["label"]

        invoice = client.post(
            "/api/invoices",
            headers=headers,
            json={
                "customer_name": "Client test",
                "status": "sent",
                "lines": [{"description": "Service test", "quantity": 2, "unit_price": 25}],
            },
        )
        assert invoice.status_code == 201
        # Depuis l'ajout de la TVA : 2×25 = 50 HT, TVA 18% = 9, TTC = 59
        assert invoice.json()["subtotal"] == 50
        assert invoice.json()["total_amount"] == 59
        paid_invoice = client.post(
            f"/api/invoices/{invoice.json()['id']}/pay",
            headers=headers,
            json={"payment_method": "zola", "payment_account_id": payment_account.json()["id"]},
        )
        assert paid_invoice.status_code == 200
        assert paid_invoice.json()["status"] == "paid"
        assert paid_invoice.json()["payment_account_label"] == payment_account.json()["label"]


def test_collaboration_payroll_teras_flow() -> None:
    with TestClient(app) as client:
        headers = auth_headers(client)
        suffix = uuid4().hex[:6]

        task = client.post(
            "/api/tasks",
            headers=headers,
            json={"title": "Verifier une action critique", "priority": "high", "assignee_name": "Amina Tamba"},
        )
        assert task.status_code == 201
        task_id = task.json()["id"]
        finance_headers = login_headers(client, "finance@kompta.local", "kompta123")
        employee_task_list = client.get("/api/tasks", headers=finance_headers)
        assert employee_task_list.status_code == 200
        employee_task = next(item for item in employee_task_list.json() if item["id"] == task_id)
        assert employee_task["assigned_to_me"] is True
        assert employee_task["can_update"] is True
        assert employee_task["can_delete"] is False
        employee_status = client.patch(f"/api/tasks/{task_id}", headers=finance_headers, json={"status": "doing"})
        assert employee_status.status_code == 200
        forbidden_title = client.patch(f"/api/tasks/{task_id}", headers=finance_headers, json={"title": "Renommer hors scope"})
        assert forbidden_title.status_code == 403
        forbidden_create = client.post(
            "/api/tasks",
            headers=finance_headers,
            json={"title": "Tache pour une autre personne", "assignee_name": "Mireille Ngoma"},
        )
        assert forbidden_create.status_code == 403
        forbidden_delete = client.delete(f"/api/tasks/{task_id}", headers=finance_headers)
        assert forbidden_delete.status_code == 403
        admin_update = client.patch(
            f"/api/tasks/{task_id}",
            headers=headers,
            json={"title": "Verifier une action critique RH", "assignee_name": "Mireille Ngoma"},
        )
        assert admin_update.status_code == 200
        assert admin_update.json()["assignee_name"] == "Mireille Ngoma"

        channels = client.get("/api/chat/channels", headers=headers)
        assert channels.status_code == 200
        channel_id = channels.json()[0]["id"]
        new_channel = client.post(
            "/api/chat/channels",
            headers=headers,
            json={"name": f"qa sync {suffix}", "topic": "Coordination test backend"},
        )
        assert new_channel.status_code == 201
        channel_detail = client.get(f"/api/chat/channels/{new_channel.json()['id']}/detail", headers=headers)
        assert channel_detail.status_code == 200
        assert channel_detail.json()["member_count"] >= 1
        assert isinstance(channel_detail.json()["tasks"], list)
        message = client.post(
            f"/api/chat/channels/{channel_id}/messages",
            headers=headers,
            json={"body": "@Amina urgent: ajouter les justificatifs avant vendredi"},
        )
        assert message.status_code == 201
        assert "Amina" in message.json()["mentions"]
        deleted = client.delete(f"/api/tasks/{task_id}", headers=headers)
        assert deleted.status_code == 200
        audit = client.get("/api/audit-logs?limit=20", headers=headers)
        assert audit.status_code == 200
        _audit_body = audit.json()
        _audit_items = _audit_body["items"] if isinstance(_audit_body, dict) else _audit_body
        actions = [item["action"] for item in _audit_items]
        assert "task_updated" in actions
        assert "task_deleted" in actions

        payroll = client.post("/api/payroll/runs", headers=headers, json={"period": f"Mai 2026 {suffix}"})
        assert payroll.status_code == 201
        assert payroll.json()["net_total"] > 0
        assert len(payroll.json()["payslips"]) >= 1
        assert "payout_status" in payroll.json()["payslips"][0]

        alerts = client.get("/api/teras/alerts", headers=headers)
        assert alerts.status_code == 200
        converted = client.post(f"/api/teras/alerts/{alerts.json()[0]['id']}/create-task", headers=headers)
        assert converted.status_code == 201
        assert converted.json()["source"] == "teras"


def test_demo_secondary_accounts_can_login() -> None:
    with TestClient(app) as client:
        for email in [
            "finance@kompta.local",
            "caissier@kompta.local",
            "rh@kompta.local",
            "dg@kompta.local",
        ]:
            response = client.post("/api/auth/login", json={"email": email, "password": "kompta123"})
            assert response.status_code == 200
            assert response.json()["user"]["account_status"] == "active"


def test_assistant_endpoints_are_wired(monkeypatch) -> None:
    limule_messages = []

    async def fake_writing(payload, signer_name: str):
        return {
            "draft": f"DeepSeek test pour {signer_name}: {payload.notes}",
            "confidence": 90,
            "sources": ["DeepSeek"],
            "provider": "deepseek-test",
        }

    async def fake_declaration(payload):
        return {
            "case": f"{payload.declaration_type.upper()}-{payload.period}",
            "status": "draft_ready",
            "confidence": 90,
            "missing_documents": [],
            "checklist": ["Validation humaine"],
            "provider": "deepseek-test",
        }

    async def fake_limule(messages, max_tokens=1200, temperature=0.35):
        limule_messages.append(messages)
        return "Diagnostic rapide\n\nDonnées utilisées: contexte KOMPTA de test.\n\nActions recommandées: valider les éléments."

    monkeypatch.setattr("app.api.routes.generate_writing", fake_writing)
    monkeypatch.setattr("app.api.routes.generate_declaration", fake_declaration)
    monkeypatch.setattr("app.services.limule._call_llm", fake_limule)

    with TestClient(app) as client:
        headers = auth_headers(client)
        writing = client.post(
            "/api/assistants/writing",
            headers=headers,
            json={"content_type": "email", "tone": "professionnel", "audience": "client", "notes": "Relance facture"},
        )
        assert writing.status_code == 200
        assert writing.json()["provider"] == "deepseek-test"

        declaration = client.post(
            "/api/assistants/declarations",
            headers=headers,
            json={"period": "Avril 2026", "declaration_type": "fiscale"},
        )
        assert declaration.status_code == 200
        assert declaration.json()["provider"] == "deepseek-test"

        prepared = client.post(
            "/api/declarations/prepare",
            headers=headers,
            json={"period": "Mai 2026", "declaration_type": "sociale"},
        )
        assert prepared.status_code == 201
        assert prepared.json()["case_reference"] == "SOCIALE-Mai 2026"
        records = client.get("/api/declarations", headers=headers)
        assert records.status_code == 200
        assert any(item["case_reference"] == "SOCIALE-Mai 2026" for item in records.json())

        ai_status = client.get("/api/ai/status", headers=headers)
        assert ai_status.status_code == 200
        assert "provider" in ai_status.json()

        variables = client.get("/api/ai/variables", headers=headers)
        assert variables.status_code == 200
        assert "salaire_moyen" in variables.json()["resolved"]

        limule_context = client.get("/api/limule/context?page_path=/payroll", headers=headers)
        assert limule_context.status_code == 200
        assert limule_context.json()["context_version"].startswith("kompta-limule-context")
        assert limule_context.json()["module"] == "payroll"
        assert "Version contexte" in limule_context.json()["ai_context"]
        assert "payroll" in limule_context.json()["modules"]

        limule_chat = client.post(
            "/api/limule/chat",
            headers=headers,
            json={"prompt": "Resume la paie et les risques TERAS", "page_path": "/payroll"},
        )
        assert limule_chat.status_code == 201
        assert limule_chat.json()["interaction_id"] > 0
        assert limule_chat.json()["context_version"].startswith("kompta-limule-context")
        assert "payroll" in limule_chat.json()["sources"]

        limule_followup = client.post(
            "/api/limule/chat",
            headers=headers,
            json={"prompt": "Continue avec les actions prioritaires", "page_path": "/payroll"},
        )
        assert limule_followup.status_code == 201
        assert len(limule_messages) >= 2
        assert "Mémoire Limule" in limule_messages[-1][1]["content"]
        assert "Resume la paie et les risques TERAS" in limule_messages[-1][1]["content"]

        limule_context_after = client.get("/api/limule/context?page_path=/payroll", headers=headers)
        assert limule_context_after.status_code == 200
        assert limule_context_after.json()["memory"]["count"] >= 1

        feedback = client.patch(
            f"/api/limule/interactions/{limule_chat.json()['interaction_id']}/feedback",
            headers=headers,
            json={"rating": 5, "feedback": "utile"},
        )
        assert feedback.status_code == 200
        assert feedback.json()["rating"] == 5


def test_company_registration_and_workspace_reset_flow() -> None:
    with TestClient(app) as client:
        suffix = uuid4().hex[:8]
        registration = client.post(
            "/api/auth/register-company",
            json={
                "company_name": f"Nouvelle Societe {suffix}",
                "legal_name": f"Nouvelle Societe {suffix} SARL",
                "industry": "Services",
                "organization_type": "PME",
                "country": "Congo",
                "admin_full_name": "Diane DG",
                "admin_email": f"diane.dg.{suffix}@kompta.local",
                "admin_phone": f"+24207{suffix[:6]}",
                "password": "Kompta2026!",
            },
        )
        assert registration.status_code == 201
        payload = registration.json()
        assert payload["user"]["role"] == "admin_entreprise"
        assert payload["user"]["department"] == "Direction générale"
        headers = {"Authorization": f"Bearer {payload['access_token']}"}

        empty_employees = client.get("/api/employees", headers=headers)
        assert empty_employees.status_code == 200
        _emp_body = empty_employees.json()
        _emp_items = _emp_body["items"] if isinstance(_emp_body, dict) else _emp_body
        assert _emp_items == []

        product = client.post(
            "/api/products",
            headers=headers,
            json={"name": "Produit reset", "sku": f"RESET-{suffix}", "price": 100, "stock_quantity": 3},
        )
        assert product.status_code == 201
        account = client.post(
            "/api/payment-accounts",
            headers=headers,
            json={"provider": "mobile_money", "label": "Mobile reset", "phone_number": "+242060000000"},
        )
        assert account.status_code == 201
        reset = client.post("/api/workspace/reset", headers=headers)
        assert reset.status_code == 200
        assert reset.json()["status"] == "reset"
        assert client.get("/api/products", headers=headers).json() == []
        assert client.get("/api/payment-accounts", headers=headers).json() == []
        channels = client.get("/api/chat/channels", headers=headers)
        assert channels.status_code == 200
        assert channels.json()[0]["name"] == "general"


def test_employee_account_access_and_contract_flow() -> None:
    with TestClient(app) as client:
        headers = auth_headers(client)
        suffix = uuid4().hex[:8]
        phone = f"+24206{str(uuid4().int)[-6:]}"
        quick = client.post(
            "/api/employees/quick-create",
            headers=headers,
            json={
                "first_name": "Nadia",
                "last_name": "Support",
                "job_title": "Assistante RH",
                "phone": phone,
                "email": f"nadia.{suffix}@kompta.local",
                "employment_type": "CDD",
                "department": "RH",
                "branch": "Siege",
                "salary": 800,
                "access_role": "employe",
            },
        )
        assert quick.status_code == 201
        payload = quick.json()
        assert payload["temporary_password"]
        assert payload["must_change_password"] is True
        employee_id = payload["employee"]["id"]

        contract = client.get(f"/api/employees/{employee_id}/contract", headers=headers)
        assert contract.status_code == 200
        assert "Contrat de travail" in contract.text
        documents_after_contract = client.get("/api/documents", headers=headers)
        assert documents_after_contract.status_code == 200
        assert any(item["employee_id"] == employee_id for item in documents_after_contract.json())

        temp_login = client.post(
            "/api/auth/login",
            json={"email": payload["login_identifier"], "password": payload["temporary_password"]},
        )
        assert temp_login.status_code == 200
        assert temp_login.json()["must_change_password"] is True

        for login_identifier in [
            payload["employee"]["email"].upper(),
            phone.replace("+242", "242 ", 1),
            phone.removeprefix("+242"),
        ]:
            flexible_login = client.post(
                "/api/auth/login",
                json={"email": login_identifier, "password": payload["temporary_password"]},
            )
            assert flexible_login.status_code == 200

        employee_headers = {"Authorization": f"Bearer {temp_login.json()['access_token']}"}
        short_password = client.post(
            "/api/auth/first-login-change-password",
            headers=employee_headers,
            json={"current_password": payload["temporary_password"], "new_password": "court"},
        )
        assert short_password.status_code == 400
        assert "au moins 8" in short_password.json()["detail"]

        activated = client.post(
            "/api/auth/first-login-change-password",
            headers=employee_headers,
            json={"current_password": payload["temporary_password"], "new_password": f"Kompta{suffix}!"},
        )
        assert activated.status_code == 200
        assert activated.json()["must_change_password"] is False

        payout = client.patch(
            "/api/employees/me/payout",
            headers=employee_headers,
            json={"payout_method": "mobile_money", "payout_phone": "+242069990000", "confirm": True},
        )
        assert payout.status_code == 200
        assert payout.json()["payout_phone"] == "+242069990000"
        assert client.get("/api/employees/me/payout", headers=employee_headers).json()["payout_method"] == "mobile_money"

        reset = client.post(f"/api/employees/{employee_id}/reset-access", headers=headers)
        assert reset.status_code == 200
        assert reset.json()["temporary_password"] != payload["temporary_password"]

        suspended = client.patch(
            f"/api/employees/{employee_id}/account-status",
            headers=headers,
            json={"account_status": "suspended"},
        )
        assert suspended.status_code == 200
        assert suspended.json()["account_status"] == "suspended"

        audit = client.get(f"/api/employees/{employee_id}/security-audit", headers=headers)
        assert audit.status_code == 200
        assert len(audit.json()) >= 1

        upload = client.post(
            "/api/documents/upload",
            headers=headers,
            data={"title": "Attestation test", "employee_id": str(employee_id)},
            files={"file": ("attestation.txt", b"Attestation de service et confirmation RH", "text/plain")},
        )
        assert upload.status_code == 201
        assert upload.json()["document_type"] in {
            "general", "contrat_travail", "declaration",
            "bulletin_paie", "facture", "attestation",
        }

        teras = client.post(
            "/api/teras/employability",
            headers=headers,
            json={"employee_id": employee_id, "include_documents": True},
        )
        assert teras.status_code == 201
        assert teras.json()["teras_reference"].startswith("TERAS-EMP-")

        teras_document = client.post(f"/api/teras/analyze/document/{upload.json()['id']}", headers=headers)
        assert teras_document.status_code == 201
        assert teras_document.json()["domain"] == "documents"


def test_teras_analysis_layer_and_ai_router_flow() -> None:
    with TestClient(app) as client:
        headers = auth_headers(client)
        company = client.get("/api/company/profile", headers=headers)
        assert company.status_code == 200
        company_id = company.json()["id"]

        company_analysis = client.post("/api/teras/analyze/company", headers=headers)
        assert company_analysis.status_code == 201
        assert company_analysis.json()["teras_reference"].startswith("TERAS-JOB-")

        scoped_company_analysis = client.post(f"/api/teras/analyze/company/{company_id}", headers=headers)
        assert scoped_company_analysis.status_code == 201
        assert scoped_company_analysis.json()["domain"] == "company"

        payroll_analysis = client.post("/api/teras/analyze/payroll", headers=headers)
        assert payroll_analysis.status_code == 201
        assert payroll_analysis.json()["domain"] == "payroll"

        declaration_analysis = client.post("/api/teras/analyze/declaration/42", headers=headers)
        assert declaration_analysis.status_code == 201
        assert declaration_analysis.json()["target_id"] == 42

        scores = client.get("/api/teras/scores", headers=headers)
        assert scores.status_code == 200
        assert {"company", "payroll", "declaration"}.issubset({item["domain"] for item in scores.json()})

        recommendations = client.get("/api/teras/recommendations", headers=headers)
        assert recommendations.status_code == 200
        assert all("recommendations" in item for item in recommendations.json())

        router = client.post(
            "/api/ai/router",
            headers=headers,
            json={"prompt": "Controle le risque et la conformite de ma paie", "context_domain": "payroll"},
        )
        assert router.status_code == 200
        assert router.json()["route"] == "limule_with_teras_context"


def test_super_admin_console_and_ticket_flow(monkeypatch) -> None:
    async def fake_limule(messages, max_tokens=1200, temperature=0.35):
        return "Diagnostic rapide\n\nDonnées utilisées: contexte TERAS de test.\n\nActions recommandées: suivre les tickets."

    monkeypatch.setattr("app.services.limule._call_llm", fake_limule)

    with TestClient(app) as client:
        admin_headers = auth_headers(client)
        forbidden = client.get("/api/admin/overview", headers=admin_headers)
        assert forbidden.status_code == 403
        seeded_interaction = client.post(
            "/api/limule/chat",
            headers=admin_headers,
            json={"prompt": "Analyse les tickets et la conformite", "page_path": "/reports-teras"},
        )
        assert seeded_interaction.status_code == 201

        headers = super_admin_headers(client)
        me = client.get("/api/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["role"] == "super_admin"

        overview = client.get("/api/admin/overview", headers=headers)
        assert overview.status_code == 200
        assert overview.json()["companies"] >= 1

        companies = client.get("/api/admin/companies", headers=headers)
        assert companies.status_code == 200
        assert companies.json()
        company_id = companies.json()[0]["id"]

        detail = client.get(f"/api/admin/companies/{company_id}", headers=headers)
        assert detail.status_code == 200
        assert detail.json()["company"]["id"] == company_id

        users = client.get("/api/admin/users", headers=headers)
        assert users.status_code == 200
        assert any(user["role"] == "super_admin" for user in users.json())

        tickets = client.get("/api/admin/tickets", headers=headers)
        assert tickets.status_code == 200
        assert tickets.json()
        ticket_id = tickets.json()[0]["id"]

        reply = client.post(
            f"/api/admin/tickets/{ticket_id}/reply",
            headers=headers,
            json={"body": "Reponse support de validation automatique."},
        )
        assert reply.status_code == 200
        assert any(message["is_staff"] for message in reply.json()["messages"])

        updated = client.patch(
            f"/api/admin/tickets/{ticket_id}",
            headers=headers,
            json={"status": "resolved", "priority": "medium", "category": "technical"},
        )
        assert updated.status_code == 200
        assert updated.json()["status"] == "resolved"

        logs = client.get("/api/admin/audit-logs", headers=headers)
        assert logs.status_code == 200
        assert isinstance(logs.json(), list)

        limule_insights = client.get("/api/admin/limule/insights", headers=headers)
        assert limule_insights.status_code == 200
        assert limule_insights.json()["total_interactions"] >= 1

        limule_dataset = client.get("/api/admin/limule/dataset?limit=10", headers=headers)
        assert limule_dataset.status_code == 200
        assert limule_dataset.json()
        assert {"input", "output", "context", "tags"}.issubset(limule_dataset.json()[0].keys())

        limule_export = client.get("/api/admin/limule/dataset/export?limit=10", headers=headers)
        assert limule_export.status_code == 200
        assert "application/x-ndjson" in limule_export.headers["content-type"]
