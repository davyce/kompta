import json
from datetime import date, datetime, timedelta

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import (
    Base,
    AIGeneration,
    ChatChannel,
    Company,
    CompanyModule,
    DailyNote,
    DeclarationRecord,
    Employee,
    Invoice,
    InvoiceLine,
    LimuleInteraction,
    Meeting,
    Message,
    PaymentAccount,
    PayrollRun,
    Payslip,
    Product,
    Task,
    TerasAlert,
    Ticket,
    TicketMessage,
    User,
)
from app.db.session import engine


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_migrations()


def ensure_sqlite_migrations() -> None:
    if not engine.url.drivername.startswith("sqlite"):
        return
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    table_columns = {table: {column["name"] for column in inspector.get_columns(table)} for table in table_names}
    additions = {
        "users": {
            "phone": "VARCHAR(40) DEFAULT ''",
            "must_change_password": "BOOLEAN DEFAULT 0",
            "account_status": "VARCHAR(40) DEFAULT 'active'",
            "last_login_at": "DATETIME",
            "invited_at": "DATETIME",
            "activated_at": "DATETIME",
            "employee_id": "INTEGER",
        },
        "employees": {
            "phone": "VARCHAR(40) DEFAULT ''",
            "account_status": "VARCHAR(40) DEFAULT 'draft'",
            "access_role": "VARCHAR(80) DEFAULT 'employe'",
            "access_scope": "VARCHAR(120) DEFAULT 'self'",
            "last_login_at": "DATETIME",
            "invited_at": "DATETIME",
            "activated_at": "DATETIME",
            "created_by_user_id": "INTEGER",
                "user_id": "INTEGER",
                "payout_method": "VARCHAR(40) DEFAULT 'mobile_money'",
                "payout_phone": "VARCHAR(40) DEFAULT ''",
                "payout_bank_name": "VARCHAR(120) DEFAULT ''",
                "payout_account_number": "VARCHAR(120) DEFAULT ''",
                "payout_paypal_email": "VARCHAR(255) DEFAULT ''",
            },
        "invoices": {
            "payment_method": "VARCHAR(80) DEFAULT ''",
            "payment_account_id": "INTEGER",
            "payment_account_label": "VARCHAR(160) DEFAULT ''",
            "paid_at": "DATETIME",
        },
        "sales": {
            "payment_account_id": "INTEGER",
            "payment_account_label": "VARCHAR(160) DEFAULT ''",
        },
        "payroll_runs": {
            "payment_account_id": "INTEGER",
            "payment_account_label": "VARCHAR(160) DEFAULT ''",
        },
        "payslips": {
            "payout_method": "VARCHAR(40) DEFAULT ''",
            "payout_destination": "VARCHAR(180) DEFAULT ''",
            "payout_status": "VARCHAR(40) DEFAULT 'pending'",
        },
        "meetings": {
            "agenda": "TEXT DEFAULT ''",
        },
            "company_documents": {},
            "employability_checks": {},
            "teras_analysis_jobs": {},
            "teras_score_snapshots": {},
            "teras_sync_events": {},
        }
    with engine.begin() as connection:
        for table, columns in additions.items():
            existing = table_columns.get(table, set())
            for column, definition in columns.items():
                if column not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))


def seed_demo_data(db: Session) -> None:
    existing_user = db.scalar(select(User).where(User.email == "admin@kompta.local"))
    if existing_user:
        backfill_access_data(db)
        return

    company = Company(
        name="KOMPTA Demo",
        legal_name="KOMPTA Demo SARL",
        industry="Commerce, services et ONG",
        organization_type="PME + Programme finance",
        country="Congo",
        primary_color="#0f766e",
        accent_color="#f59e0b",
        completion_score=78,
        teras_score=84,
    )
    db.add(company)
    db.flush()

    admin = User(
        email="admin@kompta.local",
        phone="+242060000001",
        full_name="Davy Okemba",
        role="admin_entreprise",
        department="Direction",
        branch="Siege",
        password_hash=hash_password("kompta123"),
        company_id=company.id,
    )
    comptable = User(
        email="finance@kompta.local",
        phone="+242060000002",
        full_name="Amina Tamba",
        role="comptable",
        department="Finance",
        branch="Agence Centre",
        password_hash=hash_password("kompta123"),
        company_id=company.id,
    )
    caissier = User(
        email="caissier@kompta.local",
        phone="+242060000010",
        full_name="Junior Makaya",
        role="caissier_pos",
        department="POS",
        branch="Boutique Plateau",
        password_hash=hash_password("kompta123"),
        company_id=company.id,
    )
    rh_user = User(
        email="rh@kompta.local",
        phone="+242060000011",
        full_name="Mireille Ngoma",
        role="rh_entreprise",
        department="RH",
        branch="Siege",
        password_hash=hash_password("kompta123"),
        company_id=company.id,
    )
    manager_user = User(
        email="dg@kompta.local",
        phone="+242060000012",
        full_name="Serge Bilamba",
        role="manager_entreprise",
        department="Direction générale",
        branch="Agence Nord",
        password_hash=hash_password("kompta123"),
        company_id=company.id,
    )
    db.add_all([admin, comptable, caissier, rh_user, manager_user])

    payment_accounts = [
        PaymentAccount(
            provider="zola",
            label="QR Zola Boutique Plateau",
            account_name="KOMPTA Demo SARL",
            phone_number="+242060000001",
            currency="XAF",
            instructions="Afficher le QR Zola au client et valider le reçu dans la caisse.",
            use_for_pos=True,
            use_for_payroll=False,
            is_default_pos=True,
            company_id=company.id,
        ),
        PaymentAccount(
            provider="mobile_money",
            label="Mobile Money Paie",
            account_name="KOMPTA Demo SARL",
            phone_number="+242060000002",
            currency="XAF",
            instructions="Compte source pour les versements mobiles des salaires.",
            use_for_pos=True,
            use_for_payroll=True,
            is_default_payroll=True,
            company_id=company.id,
        ),
        PaymentAccount(
            provider="bank",
            label="Compte bancaire principal",
            account_name="KOMPTA Demo SARL",
            account_number="CG-001-000987654321",
            bank_name="Banque locale",
            bank_code="KOM-CG-BANK",
            currency="XAF",
            instructions="Compte de virement fournisseur, paie cadre et rapprochement bancaire.",
            use_for_pos=False,
            use_for_payroll=True,
            company_id=company.id,
        ),
        PaymentAccount(
            provider="paypal",
            label="PayPal export",
            account_name="KOMPTA Demo SARL",
            paypal_email="payments@kompta.local",
            currency="USD",
            instructions="Paiements internationaux et clients hors zone mobile money.",
            use_for_pos=True,
            use_for_payroll=False,
            company_id=company.id,
        ),
    ]
    db.add_all(payment_accounts)
    db.flush()

    employees = [
        Employee(
            first_name="Amina",
            last_name="Tamba",
            email="amina@kompta.local",
            phone="+242060000002",
            job_title="Comptable Senior",
            employment_type="CDI",
            department="Finance",
            branch="Agence Centre",
            manager_name="Davy Okemba",
            salary=1850,
            account_status="active",
            access_role="comptable",
            payout_method="bank",
            payout_bank_name="Banque locale",
            payout_account_number="CG-001-AMINA-2026",
            badge_color="#0f766e",
            company_id=company.id,
        ),
        Employee(
            first_name="Junior",
            last_name="Makaya",
            email="junior@kompta.local",
            phone="+242060000003",
            job_title="Responsable boutique",
            employment_type="CDI",
            department="POS",
            branch="Boutique Plateau",
            manager_name="Davy Okemba",
            salary=1250,
            account_status="active",
            access_role="responsable_pos",
            payout_method="mobile_money",
            payout_phone="+242060000003",
            badge_color="#7c3aed",
            company_id=company.id,
        ),
        Employee(
            first_name="Mireille",
            last_name="Ngoma",
            email="mireille@kompta.local",
            phone="+242060000004",
            job_title="Agent terrain",
            employment_type="Mission",
            department="Programme ONG",
            branch="Site Nord",
            manager_name="Amina Tamba",
            salary=900,
            account_status="pending_first_login",
            access_role="employe",
            payout_method="zola",
            payout_phone="+242060000004",
            badge_color="#dc2626",
            company_id=company.id,
        ),
    ]
    db.add_all(employees)

    products = [
        Product(
            name="Carnet de factures premium",
            sku="KOM-CAR-001",
            category="Fournitures",
            brand="KOMPTA",
            variant="A5",
            price=18,
            stock_quantity=54,
            reorder_level=10,
            qr_code="KOMPTA:1:KOM-CAR-001",
            qr_generated=True,
            company_id=company.id,
        ),
        Product(
            name="T-shirt atelier coton",
            sku="KOM-TSH-002",
            category="Textile",
            brand="Atelier Centre",
            variant="M / Bleu",
            price=32,
            stock_quantity=18,
            reorder_level=8,
            qr_code="KOMPTA:1:KOM-TSH-002",
            qr_generated=True,
            company_id=company.id,
        ),
        Product(
            name="Kit terrain ONG",
            sku="KOM-KIT-003",
            category="Programme",
            brand="KOMPTA",
            variant="Standard",
            price=45,
            stock_quantity=7,
            reorder_level=6,
            qr_code="",
            qr_generated=False,
            company_id=company.id,
        ),
    ]
    db.add_all(products)

    invoice = Invoice(
        number="INV-2026-0001",
        customer_name="Fondation Mboka",
        status="sent",
        due_date=date(2026, 5, 15),
        total_amount=620,
        company_id=company.id,
    )
    invoice.lines = [
        InvoiceLine(description="Accompagnement administratif", quantity=1, unit_price=500, total=500),
        InvoiceLine(description="Frais documents", quantity=4, unit_price=30, total=120),
    ]
    db.add(invoice)

    tasks = [
        Task(
            title="Verifier les justificatifs du projet Nord",
            description="TERAS signale deux pieces manquantes avant validation bailleur.",
            status="todo",
            priority="high",
            due_date=date(2026, 5, 3),
            assignee_name="Amina Tamba",
            source="teras",
            proof_required=True,
            company_id=company.id,
        ),
        Task(
            title="Reimprimer 20 etiquettes QR boutique",
            description="Etiquettes manquantes sur le lot textile.",
            status="doing",
            priority="normal",
            assignee_name="Junior Makaya",
            source="inventory",
            company_id=company.id,
        ),
    ]
    db.add_all(tasks)

    channel = ChatChannel(name="operations", topic="Ventes, terrain, RH et priorites du jour", company_id=company.id)
    db.add(channel)
    db.flush()
    db.add(
        Message(
            channel_id=channel.id,
            author_id=admin.id,
            body="@Amina peux-tu verifier le budget du projet Nord avant la reunion ?",
            mentions="Amina",
            ai_suggestion="Creer une tache de controle budgetaire pour Amina.",
            company_id=company.id,
        )
    )

    run = PayrollRun(
        period="Avril 2026",
        status="validated",
        payment_account_id=payment_accounts[1].id,
        payment_account_label=payment_accounts[1].label,
        company_id=company.id,
    )
    run.payslips = [
        Payslip(
            employee_id=1,
            employee_name="Amina Tamba",
            gross_pay=1850,
            deductions=185,
            net_pay=1665,
            reference="PAY-2026-04-0001",
            payout_method="bank",
            payout_destination="Banque locale · CG-•••026",
            payout_status="ready",
        ),
        Payslip(
            employee_id=2,
            employee_name="Junior Makaya",
            gross_pay=1250,
            deductions=125,
            net_pay=1125,
            reference="PAY-2026-04-0002",
            payout_method="mobile_money",
            payout_destination="+24•••003",
            payout_status="ready",
        ),
    ]
    run.gross_total = 3100
    run.net_total = 2790
    db.add(run)

    alerts = [
        TerasAlert(
            title="Contrat RH absent pour un agent terrain",
            severity="high",
            module="RH/Paie",
            confidence=88,
            recommendation="Completer le dossier avant le prochain cycle de paie.",
            company_id=company.id,
        ),
        TerasAlert(
            title="Justificatif manquant sur depense programme",
            severity="medium",
            module="Comptabilite ONG",
            confidence=82,
            recommendation="Joindre la piece ou bloquer le decaissement.",
            company_id=company.id,
        ),
    ]
    db.add_all(alerts)

    db.add(
        DeclarationRecord(
            period="Avril 2026",
            declaration_type="fiscale",
            case_reference="FISCALE-Avril 2026",
            status="draft_ready",
            confidence=86,
            missing_documents=json.dumps(["Justificatif TVA T2", "Relevé bancaire d'avril"], ensure_ascii=False),
            checklist=json.dumps(["Vérifier les pièces", "Valider les totaux", "Exporter le dossier"], ensure_ascii=False),
            provider="limule",
            created_by_user_id=admin.id,
            company_id=company.id,
        )
    )

    # ── Super Admin (cross-tenant) ──
    super_admin = User(
        email="superadmin@kompta.io",
        phone="+242060000099",
        full_name="Super Admin KOMPTA",
        role="super_admin",
        department="KOMPTA Platform",
        branch="HQ",
        password_hash=hash_password("super2026"),
        company_id=company.id,  # rattaché à la 1ère société par convention
    )
    db.add(super_admin)
    db.flush()

    # ── Tickets de support de démo ──
    tickets = [
        Ticket(
            subject="Impossible de générer la paie d'avril",
            body="Bonjour, lorsque je clique sur 'Générer bulletins' rien ne se passe. Code erreur silencieux.",
            status="open",
            priority="high",
            category="technical",
            company_id=company.id,
            requester_user_id=admin.id,
        ),
        Ticket(
            subject="Demande d'activation du module e-commerce",
            body="Notre boutique veut activer la vente en ligne. Merci de m'indiquer la procédure.",
            status="in_progress",
            priority="medium",
            category="feature",
            company_id=company.id,
            requester_user_id=admin.id,
            assignee_user_id=super_admin.id,
        ),
        Ticket(
            subject="Question sur la facturation TVA bailleur",
            body="Le justificatif TVA T2 ne s'imprime pas correctement sur le PDF. Cordialement.",
            status="resolved",
            priority="low",
            category="billing",
            company_id=company.id,
            requester_user_id=admin.id,
            assignee_user_id=super_admin.id,
            resolved_at=datetime.utcnow(),
        ),
    ]
    db.add_all(tickets)
    db.flush()
    db.add_all([
        TicketMessage(
            ticket_id=tickets[1].id,
            author_user_id=super_admin.id,
            body="Bonjour, le module e-commerce sera activable dans la prochaine version. Je vous tiens informé.",
            is_staff=True,
        ),
        TicketMessage(
            ticket_id=tickets[2].id,
            author_user_id=super_admin.id,
            body="Le bug d'export TVA T2 a été corrigé en v1.4.2. Merci de votre patience.",
            is_staff=True,
        ),
    ])

    # ── Seed enrichissement (Meetings, Notes, AI history, Modules) ──
    now = datetime.utcnow()
    today = now.replace(hour=10, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)

    db.add_all([
        Meeting(
            title="Comité de direction hebdo",
            start_at=today.replace(hour=10),
            end_at=today.replace(hour=11),
            tag="Direction",
            tag_color="violet",
            location="Salle de réunion principale",
            attendees_json=json.dumps(["Davy Okemba", "Amina Tamba", "Mireille Ngoma"]),
            ai_summary="Décisions structurantes hebdomadaires · 3 actions à suivre",
            ai_points_json=json.dumps([
                "Validation du planning de paie d'avril",
                "Lancement de la collection wax 2026 — kick-off le 15/05",
                "Suivi conformité TERAS · cible +5 points en mai",
                "Préparer le bilan trimestriel Q2 (échéance 15/05)",
            ]),
            status="scheduled",
            created_by_user_id=admin.id,
            company_id=company.id,
        ),
        Meeting(
            title="Revue paie avril",
            start_at=today.replace(hour=14),
            end_at=today.replace(hour=15),
            tag="RH/Finance",
            tag_color="rose",
            location="Bureau RH",
            attendees_json=json.dumps(["Mireille Ngoma", "Amina Tamba"]),
            ai_summary="Anomalies à trancher : 2 écarts de cotisation détectés par TERAS",
            ai_points_json=json.dumps([]),
            teras_flags_json=json.dumps(["Écart CNPS sur 2 employés", "Cotisation supérieure au plafond"]),
            status="scheduled",
            created_by_user_id=admin.id,
            company_id=company.id,
        ),
        Meeting(
            title="Stand-up boutique",
            start_at=today.replace(hour=16, minute=30),
            end_at=today.replace(hour=16, minute=45),
            tag="Vente",
            tag_color="sky",
            location="Boutique Plateau",
            attendees_json=json.dumps(["Junior Makaya"]),
            ai_summary="",
            ai_points_json=json.dumps([]),
            status="scheduled",
            created_by_user_id=admin.id,
            company_id=company.id,
        ),
        Meeting(
            title="Réunion budget Q3",
            start_at=tomorrow.replace(hour=9),
            end_at=tomorrow.replace(hour=10, minute=30),
            tag="Finance",
            tag_color="emerald",
            attendees_json=json.dumps(["Davy Okemba", "Amina Tamba", "Serge Bilamba"]),
            ai_summary="",
            ai_points_json=json.dumps([]),
            status="scheduled",
            created_by_user_id=admin.id,
            company_id=company.id,
        ),
        Meeting(
            title="Formation outil TERAS",
            start_at=(now + timedelta(days=2)).replace(hour=14, minute=0, second=0, microsecond=0),
            end_at=(now + timedelta(days=2)).replace(hour=16, minute=0, second=0, microsecond=0),
            tag="Conformité",
            tag_color="amber",
            attendees_json=json.dumps(["Toute la direction"]),
            ai_summary="",
            ai_points_json=json.dumps([]),
            status="scheduled",
            created_by_user_id=admin.id,
            company_id=company.id,
        ),
    ])

    # Notes Limule (auto-générée + 1 note utilisateur)
    db.add_all([
        DailyNote(
            note_date=date.today(),
            title="Journal Limule — aujourd'hui",
            body=(
                "# Journal du jour\n\n"
                "## Priorités\n"
                "- ⚠️ Revue paie avril (Mireille)\n"
                "- ⚠️ Comité de direction à 10h\n\n"
                "## Points de vigilance\n"
                "- 2 écarts de cotisation CNPS\n"
                "- TVA T2 : pièces justificatives à compléter\n\n"
                "_Généré par Limule._"
            ),
            ai_generated=True,
            user_id=admin.id,
            company_id=company.id,
        ),
        DailyNote(
            note_date=date.today() - timedelta(days=1),
            title="Idées vitrine boutique",
            body="Refonte vitrine Plateau : carrousel produits wax + mannequin de saison. Voir avec Junior.",
            pinned=True,
            user_id=admin.id,
            company_id=company.id,
        ),
    ])

    # Historique IA (Limule)
    db.add_all([
        AIGeneration(
            kind="email",
            title="Email · Annonce collection wax 2026",
            prompt="Annoncer le lancement de la collection wax 2026 à l'équipe boutique",
            content=(
                "Objet : Lancement collection wax 2026 — préparation\n\n"
                "Bonjour à toutes et à tous,\n\n"
                "La collection wax 2026 sera lancée le 15 mai. Merci de préparer la mise en rayon "
                "et la formation produit avant le 10 mai.\n\n"
                "— Limule, assistant rédactionnel KOMPTA"
            ),
            user_id=admin.id,
            company_id=company.id,
        ),
        AIGeneration(
            kind="declaration",
            title="Analyse · Déclaration TVA T2",
            prompt="Vérifier les pièces TVA T2",
            content=(
                "ANALYSE DÉCLARATIVE — TVA T2\n\n"
                "Pièces reçues : factures émises (12), factures fournisseurs (8)\n"
                "Pièces manquantes : 3 attestations bancaires de paiement\n"
                "Niveau de conformité : 78%\n\n"
                "Recommandation : compléter les 3 attestations avant transmission."
            ),
            teras_used=True,
            user_id=admin.id,
            company_id=company.id,
        ),
    ])

    # Modules par défaut (tous activés)
    DEFAULT_MODULES = [
        "dashboard", "rh", "payroll", "accounting", "billing", "pos", "inventory",
        "documents", "declarations", "chat", "meetings", "projects", "calendar",
        "notes", "assistants", "reports", "teras", "settings",
    ]
    db.add_all([
        CompanyModule(module_key=k, enabled=True, company_id=company.id)
        for k in DEFAULT_MODULES
    ])

    db.commit()
    backfill_access_data(db)


def ensure_super_admin_and_demo_tickets(db: Session, admin: User) -> None:
    super_admin = db.scalar(select(User).where(User.email == "superadmin@kompta.io"))
    if not super_admin:
        super_admin = User(
            email="superadmin@kompta.io",
            phone="+242060000099",
            full_name="Super Admin KOMPTA",
            role="super_admin",
            department="KOMPTA Platform",
            branch="HQ",
            password_hash=hash_password("super2026"),
            company_id=admin.company_id,
        )
        db.add(super_admin)
        db.flush()

    existing_ticket = db.scalar(select(Ticket).where(Ticket.subject == "Impossible de generer la paie d'avril"))
    existing_ticket_accent = db.scalar(select(Ticket).where(Ticket.subject == "Impossible de générer la paie d'avril"))
    if existing_ticket or existing_ticket_accent:
        db.commit()
        return

    tickets = [
        Ticket(
            subject="Impossible de generer la paie d'avril",
            body="Bonjour, lorsque je clique sur Generer bulletins rien ne se passe. Code erreur silencieux.",
            status="open",
            priority="high",
            category="technical",
            company_id=admin.company_id,
            requester_user_id=admin.id,
        ),
        Ticket(
            subject="Demande d'activation du module e-commerce",
            body="Notre boutique veut activer la vente en ligne. Merci de m'indiquer la procedure.",
            status="in_progress",
            priority="medium",
            category="feature",
            company_id=admin.company_id,
            requester_user_id=admin.id,
            assignee_user_id=super_admin.id,
        ),
        Ticket(
            subject="Question sur la facturation TVA bailleur",
            body="Le justificatif TVA T2 ne s'imprime pas correctement sur le PDF.",
            status="resolved",
            priority="low",
            category="billing",
            company_id=admin.company_id,
            requester_user_id=admin.id,
            assignee_user_id=super_admin.id,
            resolved_at=datetime.utcnow(),
        ),
    ]
    db.add_all(tickets)
    db.flush()
    db.add_all(
        [
            TicketMessage(
                ticket_id=tickets[1].id,
                author_user_id=super_admin.id,
                body="Bonjour, le module e-commerce sera activable dans la prochaine version. Je vous tiens informe.",
                is_staff=True,
            ),
            TicketMessage(
                ticket_id=tickets[2].id,
                author_user_id=super_admin.id,
                body="Le bug d'export TVA T2 a ete corrige en v1.4.2. Merci de votre patience.",
                is_staff=True,
            ),
        ]
    )
    db.commit()


def backfill_access_data(db: Session) -> None:
    admin = db.scalar(select(User).where(User.email == "admin@kompta.local"))
    if not admin:
        return
    if not admin.phone:
        admin.phone = "+242060000001"
    admin.account_status = admin.account_status or "active"

    demo_users = {
        "admin@kompta.local": ("kompta123", "admin_entreprise"),
        "finance@kompta.local": ("kompta123", "comptable"),
        "caissier@kompta.local": ("kompta123", "caissier_pos"),
        "rh@kompta.local": ("kompta123", "rh_entreprise"),
        "dg@kompta.local": ("kompta123", "manager_entreprise"),
    }
    for email, (password, role) in demo_users.items():
        user = db.scalar(select(User).where(User.email == email))
        if user:
            user.password_hash = hash_password(password)
            user.role = role
            user.account_status = "active"
            user.is_active = True
            user.must_change_password = False

    finance = db.scalar(select(User).where(User.email == "finance@kompta.local"))
    employees = db.scalars(select(Employee).where(Employee.company_id == admin.company_id)).all()
    phones = {
        "amina@kompta.local": "+242060000002",
        "junior@kompta.local": "+242060000003",
        "mireille@kompta.local": "+242060000004",
    }
    for employee in employees:
        employee.phone = employee.phone or phones.get(employee.email, "")
        employee.account_status = employee.account_status or "active"
        employee.access_role = employee.access_role or "employe"
        employee.access_scope = employee.access_scope or "self"
        if employee.email == "amina@kompta.local" and finance:
            employee.user_id = finance.id
            employee.account_status = "active"
            finance.employee_id = employee.id
            finance.phone = finance.phone or employee.phone
            finance.account_status = finance.account_status or "active"
    db.commit()
    ensure_super_admin_and_demo_tickets(db, admin)
