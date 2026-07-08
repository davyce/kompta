from datetime import date, datetime, timezone

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Company(TimestampMixin, Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    legal_name: Mapped[str] = mapped_column(String(200), default="")
    industry: Mapped[str] = mapped_column(String(120), default="Services")
    organization_type: Mapped[str] = mapped_column(String(80), default="PME")
    country: Mapped[str] = mapped_column(String(80), default="Congo")
    primary_color: Mapped[str] = mapped_column(String(16), default="#0f766e")
    accent_color: Mapped[str] = mapped_column(String(16), default="#f59e0b")
    completion_score: Mapped[int] = mapped_column(Integer, default=72)
    teras_score: Mapped[int] = mapped_column(Integer, default=81)
    status: Mapped[str] = mapped_column(String(40), default="active")  # active | suspended
    # Compteurs de numérotation persistants (jamais dérivés de COUNT → ni collision ni réutilisation)
    invoice_seq: Mapped[int] = mapped_column(Integer, default=0)
    sale_seq: Mapped[int] = mapped_column(Integer, default=0)
    # Moteur comptable : "simple" (petit commerce, écritures auto invisibles) | "full" (SYSCOHADA visible)
    accounting_mode: Mapped[str] = mapped_column(String(20), default="simple")
    accounting_seq: Mapped[int] = mapped_column(Integer, default=0)  # n° séquentiel des écritures
    # Workflow d'approbation factures : si > 0, toute facture ≥ seuil exige approbation N+1.
    invoice_approval_threshold_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    # Seuil d'alerte trésorerie (Limule) : alerte si solde < seuil. Défaut 50 000 (en centimes).
    cash_low_threshold_cents: Mapped[int] = mapped_column(BigInteger, default=5_000_000)
    # Programme fidélité POS (désactivé par défaut, activable par l'entreprise).
    loyalty_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    loyalty_points_per_1000: Mapped[int] = mapped_column(Integer, default=1)

    # ── Mentions légales (entreprise réelle — zone CEMAC / OHADA) ─────────────
    legal_form: Mapped[str] = mapped_column(String(40), default="")          # SARL | SA | SAS | SUARL | EI | GIE | Association | Coopérative
    rccm: Mapped[str] = mapped_column(String(80), default="")                # Registre du Commerce et du Crédit Mobilier
    niu: Mapped[str] = mapped_column(String(60), default="")                 # Numéro d'Identification Unique (fiscal / NIF)
    cnss_number: Mapped[str] = mapped_column(String(60), default="")         # N° employeur CNSS
    patente_number: Mapped[str] = mapped_column(String(60), default="")      # N° de patente / licence
    tax_regime: Mapped[str] = mapped_column(String(40), default="")          # reel | simplifie | forfait
    share_capital: Mapped[str] = mapped_column(String(60), default="")       # Capital social (texte : "1 000 000 XAF")
    founded_date: Mapped[str] = mapped_column(String(20), default="")        # Date de création (ISO)
    # ── Coordonnées ───────────────────────────────────────────────────────────
    address: Mapped[str] = mapped_column(String(255), default="")
    city: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(60), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    website: Mapped[str] = mapped_column(String(160), default="")
    # ── Représentant légal + banque ──────────────────────────────────────────
    manager_name: Mapped[str] = mapped_column(String(160), default="")       # Gérant / représentant légal
    manager_title: Mapped[str] = mapped_column(String(80), default="")       # Gérant | Directeur Général | Président
    bank_name: Mapped[str] = mapped_column(String(120), default="")
    bank_account: Mapped[str] = mapped_column(String(80), default="")        # RIB / IBAN
    logo_path: Mapped[str] = mapped_column(String(512), default="")          # chemin disque du logo uploadé

    # ── Stripe Connect (reversement des encaissements carte à l'entreprise) ──
    # Sans ceci, TOUT paiement carte (Tap to Pay, Apple Pay, carte web) finit
    # dans le compte Stripe de la plateforme KOMPTA, jamais chez le marchand —
    # cf. audit. Compte Express : l'entreprise complète un onboarding Stripe
    # (identité + IBAN/compte bancaire), puis les futurs PaymentIntents sont
    # créés avec `transfer_data[destination]` = ce compte + une commission
    # plateforme prélevée automatiquement (`platform_fee_percent`).
    stripe_connect_account_id: Mapped[str] = mapped_column(String(80), default="")
    stripe_connect_status: Mapped[str] = mapped_column(String(20), default="not_started")  # not_started | pending | active | restricted
    stripe_connect_payouts_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Commission KOMPTA sur chaque paiement carte encaissé pour cette entreprise
    # (en %, ex: 1.5 = 1.5%). Configurable par l'entreprise elle-même dans une
    # fourchette autorisée (cf. _PLATFORM_FEE_MIN/MAX côté route) — pas de
    # commission par défaut tant qu'aucune valeur n'est explicitement définie.
    platform_fee_percent: Mapped[float] = mapped_column(Float, default=0.0)

    # ── Taux de paie configurables (défauts = anciennes constantes en dur) ────
    cnss_employee_rate: Mapped[float] = mapped_column(Float, default=0.04)
    cnss_employer_rate: Mapped[float] = mapped_column(Float, default=0.08)
    family_allowance_rate: Mapped[float] = mapped_column(Float, default=0.07)
    work_accident_rate: Mapped[float] = mapped_column(Float, default=0.02)

    users: Mapped[list["User"]] = relationship(back_populates="company")

    @property
    def has_logo(self) -> bool:
        return bool(self.logo_path)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Non-unique : un même email peut être rattaché à plusieurs entreprises
    # (une ligne User par entreprise, même email/mot de passe) — voir /auth/companies.
    email: Mapped[str] = mapped_column(String(255), unique=False, index=True)
    phone: Mapped[str] = mapped_column(String(40), default="")
    full_name: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(80), default="admin")
    department: Mapped[str] = mapped_column(String(120), default="Direction")
    branch: Mapped[str] = mapped_column(String(120), default="Siege")
    password_hash: Mapped[str] = mapped_column(String(255))
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    account_status: Mapped[str] = mapped_column(String(40), default="active")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    invited_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Révocation de jetons : tout token porte cette version ; l'incrémenter
    # (logout, suspension, changement de mot de passe) invalide tous les jetons émis avant.
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    # Visite guidée : vraie une seule fois (1ʳᵉ connexion de cet utilisateur).
    onboarding_done: Mapped[bool] = mapped_column(Boolean, default=False)
    # Photo de profil (staff/admin) — chemin disque de l'avatar uploadé.
    avatar_path: Mapped[str] = mapped_column(String(512), default="")
    # Rôle personnalisé optionnel (défini par un admin) — surclasse `role` pour les permissions.
    custom_role_id: Mapped[int | None] = mapped_column(ForeignKey("custom_roles.id"), nullable=True)
    # Coordonnées + géolocalisation de la dernière connexion (staff).
    address: Mapped[str] = mapped_column(String(255), default="")
    last_login_ip: Mapped[str] = mapped_column(String(64), default="")
    last_login_city: Mapped[str] = mapped_column(String(120), default="")

    custom_role: Mapped["CustomRole | None"] = relationship(foreign_keys=[custom_role_id])

    company: Mapped[Company] = relationship(back_populates="users")
    messages: Mapped[list["Message"]] = relationship(back_populates="author")

    @property
    def has_avatar(self) -> bool:
        return bool(self.avatar_path)

    @property
    def permissions(self) -> list[str]:
        """Permissions effectives (issues du rôle personnalisé, sinon vide)."""
        if self.custom_role and self.custom_role.permissions:
            import json as _json
            try:
                return _json.loads(self.custom_role.permissions)
            except Exception:
                return []
        return []


class CustomRole(TimestampMixin, Base):
    """Rôle personnalisé créé par un admin, avec permissions par module.

    scope : 'company' (rôles internes d'une entreprise), 'admin' (staff plateforme),
    'group' (rôles de groupe/tontine). `permissions` = JSON liste de clés modules.
    company_id null = rôle plateforme (scope admin).
    """
    __tablename__ = "custom_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(255), default="")
    scope: Mapped[str] = mapped_column(String(20), default="company")  # company | admin | group
    permissions: Mapped[str] = mapped_column(Text, default="[]")        # JSON list[str]
    color: Mapped[str] = mapped_column(String(16), default="#6366f1")
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    group_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class Employee(TimestampMixin, Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(40), default="")
    job_title: Mapped[str] = mapped_column(String(140))
    employment_type: Mapped[str] = mapped_column(String(80), default="CDI")
    department: Mapped[str] = mapped_column(String(120), default="Operations")
    branch: Mapped[str] = mapped_column(String(120), default="Siege")
    manager_name: Mapped[str] = mapped_column(String(160), default="")
    salary: Mapped[float] = mapped_column(Float, default=0)   # DEPRECATED — utiliser salary_cents
    salary_cents: Mapped[int] = mapped_column(BigInteger, default=0)  # source de vérité exacte
    salary_currency: Mapped[str] = mapped_column(String(10), default="XAF")
    status: Mapped[str] = mapped_column(String(40), default="active")
    account_status: Mapped[str] = mapped_column(String(40), default="draft")
    access_role: Mapped[str] = mapped_column(String(80), default="employe")
    access_scope: Mapped[str] = mapped_column(String(120), default="self")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    invited_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payout_method: Mapped[str] = mapped_column(String(40), default="mobile_money")
    payout_phone: Mapped[str] = mapped_column(String(40), default="")
    payout_bank_name: Mapped[str] = mapped_column(String(120), default="")
    payout_account_number: Mapped[str] = mapped_column(String(120), default="")
    payout_paypal_email: Mapped[str] = mapped_column(String(255), default="")
    badge_color: Mapped[str] = mapped_column(String(16), default="#2563eb")
    cnss_number: Mapped[str] = mapped_column(String(60), default="")
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class PaymentAccount(TimestampMixin, Base):
    __tablename__ = "payment_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    provider: Mapped[str] = mapped_column(String(40), default="mobile_money")
    label: Mapped[str] = mapped_column(String(160))
    account_name: Mapped[str] = mapped_column(String(160), default="")
    phone_number: Mapped[str] = mapped_column(String(40), default="")
    account_number: Mapped[str] = mapped_column(String(120), default="")
    bank_name: Mapped[str] = mapped_column(String(160), default="")
    bank_code: Mapped[str] = mapped_column(String(80), default="")
    paypal_email: Mapped[str] = mapped_column(String(255), default="")
    currency: Mapped[str] = mapped_column(String(12), default="XAF")
    instructions: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    use_for_pos: Mapped[bool] = mapped_column(Boolean, default=True)
    use_for_payroll: Mapped[bool] = mapped_column(Boolean, default=False)
    is_default_pos: Mapped[bool] = mapped_column(Boolean, default=False)
    is_default_payroll: Mapped[bool] = mapped_column(Boolean, default=False)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))

    @property
    def masked_identifier(self) -> str:
        value = self.phone_number or self.paypal_email or self.account_number or self.bank_code or ""
        if not value:
            return ""
        if len(value) <= 6:
            return value
        return f"{value[:3]}•••{value[-3:]}"


class TemporaryCredential(TimestampMixin, Base):
    __tablename__ = "temporary_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    password_hash: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(40), default="active")
    generated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class AccessAuditLog(TimestampMixin, Base):
    __tablename__ = "access_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    target_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(100))
    details: Mapped[str] = mapped_column(Text, default="")
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class CompanyDocument(TimestampMixin, Base):
    __tablename__ = "company_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(180))
    filename: Mapped[str] = mapped_column(String(220))
    storage_path: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    document_type: Mapped[str] = mapped_column(String(80), default="general")
    source_module: Mapped[str] = mapped_column(String(80), default="documents")
    status: Mapped[str] = mapped_column(String(40), default="classified")
    ai_summary: Mapped[str] = mapped_column(Text, default="")
    ai_tags: Mapped[str] = mapped_column(String(255), default="")
    confidence: Mapped[int] = mapped_column(Integer, default=70)
    # ── Champs d'intelligence documentaire (ajoutés v2) ─────────────────────
    raw_text: Mapped[str] = mapped_column(Text, default="")          # texte extrait (PDF/Excel/Word…)
    extracted_data: Mapped[str] = mapped_column(Text, default="{}")  # JSON structuré (montants, parties…)
    text_length: Mapped[int] = mapped_column(Integer, default=0)     # longueur du texte extrait
    parse_method: Mapped[str] = mapped_column(String(40), default="") # pdf|excel|csv|docx|text|ocr
    source_document_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # doc source si dérivé
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # texte OCR extrait
    # ───────────────────────────────────────────────────────────────────────
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class EmployabilityCheck(TimestampMixin, Base):
    __tablename__ = "employability_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    status: Mapped[str] = mapped_column(String(40), default="prepared")
    score: Mapped[int] = mapped_column(Integer, default=0)
    teras_reference: Mapped[str] = mapped_column(String(120), default="")
    payload_snapshot: Mapped[str] = mapped_column(Text, default="")
    result_summary: Mapped[str] = mapped_column(Text, default="")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class TerasAnalysisJob(TimestampMixin, Base):
    __tablename__ = "teras_analysis_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    domain: Mapped[str] = mapped_column(String(80))
    target_type: Mapped[str] = mapped_column(String(80))
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="completed")
    requested_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    payload_snapshot: Mapped[str] = mapped_column(Text, default="")
    result_snapshot: Mapped[str] = mapped_column(Text, default="")
    teras_reference: Mapped[str] = mapped_column(String(120), default="")
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class TerasScoreSnapshot(TimestampMixin, Base):
    __tablename__ = "teras_score_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    domain: Mapped[str] = mapped_column(String(80))
    score: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[int] = mapped_column(Integer, default=0)
    maturity_level: Mapped[str] = mapped_column(String(80), default="partially_structured")
    summary: Mapped[str] = mapped_column(Text, default="")
    recommendations: Mapped[str] = mapped_column(Text, default="")
    source_job_id: Mapped[int | None] = mapped_column(ForeignKey("teras_analysis_jobs.id"), nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class TerasSyncEvent(TimestampMixin, Base):
    __tablename__ = "teras_sync_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(40), default="success")
    details: Mapped[str] = mapped_column(Text, default="")
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class Product(TimestampMixin, Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    sku: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(100), default="General")
    brand: Mapped[str] = mapped_column(String(100), default="KOMPTA")
    variant: Mapped[str] = mapped_column(String(100), default="Standard")
    price: Mapped[float] = mapped_column(Float, default=0)
    price_cents: Mapped[int] = mapped_column(BigInteger, default=0)  # source de vérité exacte
    currency: Mapped[str] = mapped_column(String(10), default="XAF")
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0)
    reorder_level: Mapped[int] = mapped_column(Integer, default=5)
    qr_code: Mapped[str] = mapped_column(String(255), default="")
    qr_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))

    images: Mapped[list["ProductImage"]] = relationship(
        cascade="all, delete-orphan",
        back_populates="product",
        order_by="ProductImage.sort_order",
    )


class ProductImage(TimestampMixin, Base):
    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    filename: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))

    product: Mapped[Product] = relationship(back_populates="images")


class InventoryMovement(TimestampMixin, Base):
    __tablename__ = "inventory_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    movement_type: Mapped[str] = mapped_column(String(40))
    quantity: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(160), default="")
    reference: Mapped[str] = mapped_column(String(120), default="")
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class Invoice(TimestampMixin, Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    number: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(160))
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    status: Mapped[str] = mapped_column(String(40), default="draft")
    subtotal: Mapped[float] = mapped_column(Float, default=0)             # HT (Float compat)
    tax_amount: Mapped[float] = mapped_column(Float, default=0)           # TVA (Float compat)
    total_amount: Mapped[float] = mapped_column(Float, default=0)         # TTC (Float compat)
    subtotal_cents: Mapped[int] = mapped_column(BigInteger, default=0)    # HT exact (centimes)
    tax_amount_cents: Mapped[int] = mapped_column(BigInteger, default=0)  # TVA exacte
    total_amount_cents: Mapped[int] = mapped_column(BigInteger, default=0)# TTC exact
    currency: Mapped[str] = mapped_column(String(10), default="XAF")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_method: Mapped[str] = mapped_column(String(80), default="")
    payment_account_id: Mapped[int | None] = mapped_column(ForeignKey("payment_accounts.id"), nullable=True)
    payment_account_label: Mapped[str] = mapped_column(String(160), default="")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_relance_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    relance_count: Mapped[int] = mapped_column(Integer, default=0)
    # Workflow d'approbation : not_required (défaut) | pending | approved | rejected.
    approval_status: Mapped[str] = mapped_column(String(20), default="not_required")
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rejection_reason: Mapped[str] = mapped_column(String(500), default="")
    source_opportunity_id: Mapped[int | None] = mapped_column(ForeignKey("opportunities.id"), nullable=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    payment_requested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))

    lines: Mapped[list["InvoiceLine"]] = relationship(cascade="all, delete-orphan", back_populates="invoice")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))
    description: Mapped[str] = mapped_column(String(180))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[float] = mapped_column(Float, default=0)
    unit_price_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    tax_rate: Mapped[float] = mapped_column(Float, default=18.0)
    total: Mapped[float] = mapped_column(Float, default=0)
    total_cents: Mapped[int] = mapped_column(BigInteger, default=0)

    invoice: Mapped[Invoice] = relationship(back_populates="lines")


class Sale(TimestampMixin, Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    receipt_number: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    payment_method: Mapped[str] = mapped_column(String(80), default="cash")
    payment_account_id: Mapped[int | None] = mapped_column(ForeignKey("payment_accounts.id"), nullable=True)
    payment_account_label: Mapped[str] = mapped_column(String(160), default="")
    total_amount: Mapped[float] = mapped_column(Float, default=0)
    total_amount_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    status: Mapped[str] = mapped_column(String(40), default="paid")
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    client_name: Mapped[str] = mapped_column(String(160), default="")
    loyalty_points_earned: Mapped[int] = mapped_column(Integer, default=0)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    # Session de caisse POS active au moment de la vente (nullable : une vente
    # peut être créée hors session formelle). Permet un rattachement exact
    # session <-> ventes au lieu de l'heuristique par plage de dates (cf. POS-01).
    session_id: Mapped[int | None] = mapped_column(ForeignKey("pos_sessions.id"), nullable=True)
    # Clé d'idempotence générée côté client (UUID) : une même tentative de
    # checkout retentée après timeout réseau renvoie la vente déjà créée au
    # lieu d'en créer une seconde et de re-décrémenter le stock (cf. constat
    # test_pos_concurrency.py::test_duplicate_rapid_sale_requests_*).
    idempotency_key: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)

    items: Mapped[list["SaleItem"]] = relationship(cascade="all, delete-orphan", back_populates="sale")


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    product_name: Mapped[str] = mapped_column(String(160))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[float] = mapped_column(Float)
    unit_price_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    line_total: Mapped[float] = mapped_column(Float)
    line_total_cents: Mapped[int] = mapped_column(BigInteger, default=0)

    sale: Mapped[Sale] = relationship(back_populates="items")


class PaymentTransaction(TimestampMixin, Base):
    """Transaction de paiement via un prestataire réel (Stripe carte, MTN MoMo).

    Source de vérité pour l'encaissement : statut transactionnel, idempotence,
    et lien optionnel vers une vente POS ou une facture. Empêche les doubles
    paiements via `idempotency_key` unique et le contrôle d'unicité métier."""
    __tablename__ = "payment_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)

    provider: Mapped[str] = mapped_column(String(20))            # stripe | momo
    provider_ref: Mapped[str] = mapped_column(String(120), default="", index=True)  # PaymentIntent id / MoMo referenceId
    idempotency_key: Mapped[str] = mapped_column(String(80), unique=True, index=True)

    amount_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    currency: Mapped[str] = mapped_column(String(8), default="XAF")
    # pending | processing | succeeded | failed | cancelled
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)

    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), nullable=True)
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"), nullable=True)

    customer_phone: Mapped[str] = mapped_column(String(40), default="")   # MoMo payer
    description: Mapped[str] = mapped_column(String(255), default="")
    # But du paiement : "sale" (POS) | "invoice" | "subscription" (abonnement plateforme)
    purpose: Mapped[str] = mapped_column(String(20), default="sale", index=True)
    subscription_plan_code: Mapped[str] = mapped_column(String(40), default="")
    failure_reason: Mapped[str] = mapped_column(String(255), default="")

    raw_request: Mapped[str] = mapped_column(Text, default="")
    raw_response: Mapped[str] = mapped_column(Text, default="")
    last_event: Mapped[str] = mapped_column(Text, default="")


class CompanyPaymentMethod(TimestampMixin, Base):
    """Méthode d'encaissement déclarée par une entreprise (CEMAC).

    L'argent va DIRECTEMENT chez l'entreprise (son code marchand MoMo/Airtel,
    espèces, virement) — KOMPTA ne transite jamais les fonds. La carte (Stripe)
    sert à l'abonnement KOMPTA et à l'encaissement en ligne, validée par un
    paiement-test. L'encaissement est bloqué tant qu'aucune méthode n'est
    activée + vérifiée."""
    __tablename__ = "company_payment_methods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)

    # cash | momo_mtn | momo_airtel | momo_moov | bank_transfer | card_stripe
    provider: Mapped[str] = mapped_column(String(30), index=True)
    label: Mapped[str] = mapped_column(String(80), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # Mobile money / code marchand
    merchant_number: Mapped[str] = mapped_column(String(60), default="")   # n° / code marchand
    account_name: Mapped[str] = mapped_column(String(160), default="")     # nom du compte bénéficiaire

    # Virement bancaire
    bank_name: Mapped[str] = mapped_column(String(160), default="")
    bank_account: Mapped[str] = mapped_column(String(80), default="")      # RIB / IBAN

    # Consignes affichées au client payeur (ex: "Composez *126# puis ...")
    instructions: Mapped[str] = mapped_column(String(400), default="")

    # Vérification : carte → après paiement-test réussi ; autres → confirmée par l'entreprise
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_test_status: Mapped[str] = mapped_column(String(120), default="")

    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(180))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(40), default="todo")
    priority: Mapped[str] = mapped_column(String(40), default="normal")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    assignee_name: Mapped[str] = mapped_column(String(160), default="")
    source: Mapped[str] = mapped_column(String(100), default="manual")
    proof_required: Mapped[bool] = mapped_column(Boolean, default=False)
    proof_url: Mapped[str | None] = mapped_column(String(400), nullable=True)
    due_time: Mapped[str | None] = mapped_column(String(5), nullable=True)   # "HH:MM"
    order_index: Mapped[int] = mapped_column(Integer, default=0)  # ordre dans la colonne Kanban
    tags: Mapped[str] = mapped_column(String(255), default="")    # libellés séparés par des virgules
    project: Mapped[str] = mapped_column(String(120), default="")  # regroupement projet/board
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class ChatChannel(TimestampMixin, Base):
    __tablename__ = "chat_channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    topic: Mapped[str] = mapped_column(String(180), default="")
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))

    messages: Mapped[list["Message"]] = relationship(cascade="all, delete-orphan", back_populates="channel")


class ChatChannelMember(TimestampMixin, Base):
    """Appartenance à un canal restreint (canal 'general' toujours ouvert, jamais restreint)."""
    __tablename__ = "chat_channel_members"
    __table_args__ = (UniqueConstraint("channel_id", "user_id", name="uq_chat_channel_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("chat_channels.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)


class Message(TimestampMixin, Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("chat_channels.id"))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    mentions: Mapped[str] = mapped_column(String(255), default="")
    ai_suggestion: Mapped[str] = mapped_column(String(512), default="")
    ai_action_json: Mapped[str] = mapped_column(Text, default="")   # JSON structuré de l'action Limule
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))

    channel: Mapped[ChatChannel] = relationship(back_populates="messages")
    author: Mapped[User] = relationship(back_populates="messages")

    @property
    def author_name(self) -> str:
        return self.author.full_name if self.author else ""


class PayrollRun(TimestampMixin, Base):
    __tablename__ = "payroll_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    period: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(40), default="draft")
    gross_total: Mapped[float] = mapped_column(Float, default=0)
    net_total: Mapped[float] = mapped_column(Float, default=0)
    gross_total_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    net_total_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    payment_account_id: Mapped[int | None] = mapped_column(ForeignKey("payment_accounts.id"), nullable=True)
    payment_account_label: Mapped[str] = mapped_column(String(160), default="")
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))

    payslips: Mapped[list["Payslip"]] = relationship(cascade="all, delete-orphan", back_populates="payroll_run")


class Payslip(TimestampMixin, Base):
    __tablename__ = "payslips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    payroll_run_id: Mapped[int] = mapped_column(ForeignKey("payroll_runs.id"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    employee_name: Mapped[str] = mapped_column(String(180))
    gross_pay: Mapped[float] = mapped_column(Float)
    deductions: Mapped[float] = mapped_column(Float)
    net_pay: Mapped[float] = mapped_column(Float)
    gross_pay_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    deductions_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    net_pay_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    reference: Mapped[str] = mapped_column(String(80), unique=True)
    payout_method: Mapped[str] = mapped_column(String(40), default="")
    payout_destination: Mapped[str] = mapped_column(String(180), default="")
    payout_status: Mapped[str] = mapped_column(String(40), default="pending")
    bonus: Mapped[float] = mapped_column(Float, default=0)
    bonus_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    overtime_pay: Mapped[float] = mapped_column(Float, default=0)
    overtime_pay_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    absence_deduction: Mapped[float] = mapped_column(Float, default=0)
    absence_deduction_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    # ── Détail des charges OHADA (les colonnes ci-dessous complètent `deductions`
    # qui reste l'agrégat conservé pour compat ascendante) ────────────────────
    cnss_employee_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    cnss_employer_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    irpp_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    family_allowance_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    work_accident_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    payroll_run: Mapped[PayrollRun] = relationship(back_populates="payslips")


class TerasAlert(TimestampMixin, Base):
    __tablename__ = "teras_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(180))
    severity: Mapped[str] = mapped_column(String(40), default="medium")
    module: Mapped[str] = mapped_column(String(80), default="compliance")
    status: Mapped[str] = mapped_column(String(40), default="open")
    confidence: Mapped[int] = mapped_column(Integer, default=80)
    recommendation: Mapped[str] = mapped_column(Text, default="")
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class DeclarationRecord(TimestampMixin, Base):
    __tablename__ = "declaration_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    period: Mapped[str] = mapped_column(String(80))
    declaration_type: Mapped[str] = mapped_column(String(80), default="fiscale")
    case_reference: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(60), default="draft_ready")
    confidence: Mapped[int] = mapped_column(Integer, default=0)
    missing_documents: Mapped[str] = mapped_column(Text, default="[]")
    checklist: Mapped[str] = mapped_column(Text, default="[]")
    generated_text: Mapped[str] = mapped_column(Text, default="")   # ← texte complet généré
    provider: Mapped[str] = mapped_column(String(80), default="limule")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class Ticket(TimestampMixin, Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(40), default="open")  # open | in_progress | resolved | closed
    priority: Mapped[str] = mapped_column(String(20), default="medium")  # low | medium | high | critical
    category: Mapped[str] = mapped_column(String(60), default="general")  # general | billing | technical | feature
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    requester_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assignee_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    messages: Mapped[list["TicketMessage"]] = relationship(
        cascade="all, delete-orphan", back_populates="ticket", order_by="TicketMessage.created_at"
    )

    @property
    def requester_name(self) -> str:
        # populated lazily by route via relationship
        return getattr(self, "_requester_name", "")

    @property
    def company_name(self) -> str:
        return getattr(self, "_company_name", "")


class TicketMessage(TimestampMixin, Base):
    __tablename__ = "ticket_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id"))
    author_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    is_staff: Mapped[bool] = mapped_column(Boolean, default=False)

    ticket: Mapped[Ticket] = relationship(back_populates="messages")
    author: Mapped[User] = relationship(foreign_keys=[author_user_id])

    @property
    def author_name(self) -> str:
        return self.author.full_name if self.author else ""


class Meeting(TimestampMixin, Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    start_at: Mapped[datetime] = mapped_column(DateTime)
    end_at: Mapped[datetime] = mapped_column(DateTime)
    tag: Mapped[str] = mapped_column(String(80), default="Direction")
    tag_color: Mapped[str] = mapped_column(String(60), default="violet")
    location: Mapped[str] = mapped_column(String(200), default="")
    join_url: Mapped[str] = mapped_column(String(400), default="")
    agenda: Mapped[str] = mapped_column(Text, default="")
    attendees_json: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of names
    ai_summary: Mapped[str] = mapped_column(Text, default="")
    ai_points_json: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of bullet points
    teras_flags_json: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(40), default="scheduled")  # scheduled | done | canceled
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class AIGeneration(TimestampMixin, Base):
    __tablename__ = "ai_generations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    kind: Mapped[str] = mapped_column(String(60), default="text")  # email | note | clause | declaration | text
    title: Mapped[str] = mapped_column(String(200), default="")
    prompt: Mapped[str] = mapped_column(Text, default="")
    content: Mapped[str] = mapped_column(Text, default="")
    model: Mapped[str] = mapped_column(String(60), default="limule")
    teras_used: Mapped[bool] = mapped_column(Boolean, default=False)
    # Compteurs réels de tokens renvoyés par le fournisseur LLM (DeepSeek/OpenAI),
    # quand disponibles. Null si non mesuré (fallback local, provider sans usage, etc.).
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class LimuleInteraction(TimestampMixin, Base):
    __tablename__ = "limule_interactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    prompt: Mapped[str] = mapped_column(Text, default="")
    response: Mapped[str] = mapped_column(Text, default="")
    page_path: Mapped[str] = mapped_column(String(160), default="")
    module_key: Mapped[str] = mapped_column(String(80), default="global")
    intent: Mapped[str] = mapped_column(String(80), default="question")
    model: Mapped[str] = mapped_column(String(80), default="limule")
    provider: Mapped[str] = mapped_column(String(80), default="limule")
    context_snapshot: Mapped[str] = mapped_column(Text, default="{}")
    context_sources: Mapped[str] = mapped_column(Text, default="[]")
    detected_signals: Mapped[str] = mapped_column(Text, default="[]")
    training_tags: Mapped[str] = mapped_column(Text, default="[]")
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str] = mapped_column(Text, default="")
    # Compteurs réels de tokens renvoyés par le fournisseur LLM, quand disponibles.
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class DailyNote(TimestampMixin, Base):
    __tablename__ = "daily_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    note_date: Mapped[date] = mapped_column(Date)
    title: Mapped[str] = mapped_column(String(200), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class CompanyModule(TimestampMixin, Base):
    __tablename__ = "company_modules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    module_key: Mapped[str] = mapped_column(String(60))  # dashboard | rh | payroll | accounting | billing | pos | inventory | documents | declarations | chat | meetings | projects | calendar | notes | assistants | reports | teras | settings
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class Investment(TimestampMixin, Base):
    """Suivi des investissements boursiers de l'entreprise."""
    __tablename__ = "investments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticker: Mapped[str] = mapped_column(String(20))               # ex: "AAPL", "TSLA"
    display_name: Mapped[str] = mapped_column(String(200))        # "Apple Inc."
    exchange: Mapped[str] = mapped_column(String(50), default="") # "NASDAQ"
    currency_stock: Mapped[str] = mapped_column(String(10), default="USD")  # devise de la bourse
    shares: Mapped[float] = mapped_column(Float, default=0)
    invested_amount: Mapped[float] = mapped_column(Float, default=0)        # montant investi (devise locale)
    purchase_price_ref: Mapped[float] = mapped_column(Float, default=0)     # prix d'achat (devise stock)
    purchase_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_analysis_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class Client(TimestampMixin, Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(80), nullable=True, default="Congo")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | inactive | prospect
    # Fidélité & remises
    loyalty_points: Mapped[int] = mapped_column(Integer, default=0)
    loyalty_tier: Mapped[str] = mapped_column(String(20), default="standard")  # standard|silver|gold|vip
    global_discount_percent: Mapped[float] = mapped_column(Float, default=0.0)  # ex: 10.0 = 10%
    # Portail client : accès web léger, séparé de l'auth User de l'app.
    portal_password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    portal_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    discounts: Mapped[list["ClientDiscount"]] = relationship(back_populates="client", cascade="all, delete-orphan")


class ClientDiscount(TimestampMixin, Base):
    """Remises et programmes de fidélité par client."""
    __tablename__ = "client_discounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    label: Mapped[str] = mapped_column(String(160), default="")                    # ex: "Fidèle 2 ans"
    discount_type: Mapped[str] = mapped_column(String(30), default="percent")      # percent | fixed | points_threshold
    discount_value: Mapped[float] = mapped_column(Float, default=0.0)              # %, montant ou nb points
    min_order_amount: Mapped[float] = mapped_column(Float, default=0.0)            # montant min commande
    applies_to: Mapped[str] = mapped_column(String(40), default="all")             # all | invoice | pos
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    client: Mapped["Client"] = relationship(back_populates="discounts")


class BudgetCategory(TimestampMixin, Base):
    __tablename__ = "budget_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    icon: Mapped[str] = mapped_column(String(40), default="circle")
    color: Mapped[str] = mapped_column(String(20), default="#059669")
    planned_amount: Mapped[float] = mapped_column(Float, default=0)
    period: Mapped[str] = mapped_column(String(20), default="monthly")  # monthly | quarterly | yearly
    category_type: Mapped[str] = mapped_column(String(20), default="expense")  # expense | income | investment
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class BankTransaction(TimestampMixin, Base):
    __tablename__ = "bank_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    document_id: Mapped[int | None] = mapped_column(ForeignKey("company_documents.id"), nullable=True)

    date: Mapped[str] = mapped_column(String(20))           # YYYY-MM-DD
    label: Mapped[str] = mapped_column(String(400))         # libellé / description
    amount: Mapped[float] = mapped_column(Float, default=0) # positif = crédit, négatif = débit
    debit: Mapped[float | None] = mapped_column(Float, nullable=True)
    credit: Mapped[float | None] = mapped_column(Float, nullable=True)
    balance: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="XAF")
    category: Mapped[str] = mapped_column(String(80), default="")      # catégorie Limule
    sub_category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    counterpart: Mapped[str | None] = mapped_column(String(200), nullable=True)  # tiers
    reference: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source_type: Mapped[str] = mapped_column(String(40), default="import")  # "releve_bancaire"|"facture_externe"|"manual"|"csv"
    source_file: Mapped[str | None] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="confirmed")  # "confirmed"|"pending"|"reconciled"
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_line: Mapped[str | None] = mapped_column(Text, nullable=True)
    reconciled_with_id: Mapped[int | None] = mapped_column(ForeignKey("bank_transactions.id"), nullable=True)
    payment_account_id: Mapped[int | None] = mapped_column(ForeignKey("payment_accounts.id"), nullable=True)


class BankStatementImport(TimestampMixin, Base):
    __tablename__ = "bank_statement_imports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    payment_account_id: Mapped[int] = mapped_column(ForeignKey("payment_accounts.id"))
    filename: Mapped[str] = mapped_column(String(300), default="")
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    status: Mapped[str] = mapped_column(String(20), default="processing")  # processing|done|error
    line_count: Mapped[int] = mapped_column(Integer, default=0)
    matched_count: Mapped[int] = mapped_column(Integer, default=0)
    suggested_count: Mapped[int] = mapped_column(Integer, default=0)
    unmatched_count: Mapped[int] = mapped_column(Integer, default=0)


class BankStatementLine(TimestampMixin, Base):
    __tablename__ = "bank_statement_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    import_id: Mapped[int] = mapped_column(ForeignKey("bank_statement_imports.id"))
    date: Mapped[str] = mapped_column(String(20))  # YYYY-MM-DD
    label: Mapped[str] = mapped_column(String(400), default="")
    amount_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    raw_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    matched_transaction_id: Mapped[int | None] = mapped_column(ForeignKey("bank_transactions.id"), nullable=True)
    candidate_transaction_id: Mapped[int | None] = mapped_column(ForeignKey("bank_transactions.id"), nullable=True)
    match_status: Mapped[str] = mapped_column(String(20), default="unmatched")  # matched|suggested|unmatched|ignored


class UserPreference(TimestampMixin, Base):
    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    notify_chat: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_teras: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_payroll: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_email: Mapped[bool] = mapped_column(Boolean, default=False)
    digest_frequency: Mapped[str] = mapped_column(String(40), default="daily")  # off | daily | weekly
    language: Mapped[str] = mapped_column(String(10), default="fr")
    theme: Mapped[str] = mapped_column(String(20), default="auto")  # auto | light | dark
    currency: Mapped[str] = mapped_column(String(5), default="XAF")  # XAF | EUR | USD
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class ExchangeRate(TimestampMixin, Base):
    """Taux de change vers XAF (devise de reporting de base).

    company_id NULL = taux par défaut plateforme (fallback), sinon override par entreprise.
    rate = nombre d'unités XAF pour 1 unité de quote_currency.
    """
    __tablename__ = "exchange_rates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    base_currency: Mapped[str] = mapped_column(String(5), default="XAF")
    quote_currency: Mapped[str] = mapped_column(String(5))  # EUR | USD
    rate: Mapped[float] = mapped_column(Float, default=1.0)


class LegislationDocument(TimestampMixin, Base):
    """Documents législatifs uploadés par l'admin pour enrichir Limule."""
    __tablename__ = "legislation_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    filename: Mapped[str] = mapped_column(String(300))
    storage_path: Mapped[str] = mapped_column(String(500), default="")
    mime_type: Mapped[str] = mapped_column(String(80), default="")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    doc_category: Mapped[str] = mapped_column(String(80), default="general")  # fiscal | social | commerce | finance | general
    country_scope: Mapped[str] = mapped_column(String(80), default="Congo")   # pays ciblé
    raw_text: Mapped[str] = mapped_column(Text, default="")                   # texte extrait
    ai_summary: Mapped[str] = mapped_column(Text, default="")                 # résumé Limule
    ai_tags: Mapped[str] = mapped_column(Text, default="")                    # tags JSON
    analyzed: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class AuditLog(TimestampMixin, Base):
    """Journal d'audit des actions utilisateur."""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    user_name: Mapped[str] = mapped_column(String(160), default="")
    action: Mapped[str] = mapped_column(String(40))  # create|update|delete|login|export
    resource_type: Mapped[str] = mapped_column(String(60))  # invoice|employee|client|etc.
    resource_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[str] = mapped_column(Text, default="")
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class FiscalDeadline(TimestampMixin, Base):
    """Agenda fiscal — échéances déclaratives et fiscales."""
    __tablename__ = "fiscal_deadlines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    title: Mapped[str] = mapped_column(String(180))
    description: Mapped[str] = mapped_column(Text, default="")
    due_date: Mapped[date] = mapped_column(Date)
    tax_type: Mapped[str] = mapped_column(String(40), default="autre")  # TVA|IS|CNSS|IRpp|patente|autre
    status: Mapped[str] = mapped_column(String(40), default="upcoming")  # upcoming|done|overdue
    recurrence: Mapped[str] = mapped_column(String(40), default="once")  # monthly|quarterly|annual|once
    reminder_days: Mapped[int] = mapped_column(Integer, default=7)


class PosSession(TimestampMixin, Base):
    """Session de caisse POS."""
    __tablename__ = "pos_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    opened_by: Mapped[str] = mapped_column(String(160), default="")
    opened_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    sales_count: Mapped[int] = mapped_column(Integer, default=0)
    total_amount: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(40), default="open")  # open|closed
    notes: Mapped[str] = mapped_column(Text, default="")
    opening_balance_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class BroadcastLog(TimestampMixin, Base):
    """Journal des broadcasts admin envoyés à toute la plateforme."""
    __tablename__ = "broadcast_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[str] = mapped_column(String(40), default="info")   # info | warning | critical
    target: Mapped[str] = mapped_column(String(200), default="all") # all | company_id:123
    sent_count: Mapped[int] = mapped_column(Integer, default=0)
    sent_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class FeatureFlag(TimestampMixin, Base):
    """Feature flags système gérés par le super-admin."""
    __tablename__ = "feature_flags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    value: Mapped[str] = mapped_column(String(500), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


# ═══════════════════════════════════════════════════════════════════════════
# MOTEUR COMPTABLE — partie double (SYSCOHADA-lite)
# Montants en CENTIMES ENTIERS (minor units) : exactitude garantie, pas de Float.
# ═══════════════════════════════════════════════════════════════════════════

class Account(TimestampMixin, Base):
    """Compte du plan comptable (classe SYSCOHADA 1 à 7)."""
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    code: Mapped[str] = mapped_column(String(20), index=True)     # ex. "411", "70", "443", "571"
    name: Mapped[str] = mapped_column(String(160))
    # type normalisé : asset|liability|equity|revenue|expense
    type: Mapped[str] = mapped_column(String(20))
    syscohada_class: Mapped[int] = mapped_column(Integer, default=0)  # 1..7
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class JournalEntry(TimestampMixin, Base):
    """En-tête d'écriture comptable. Σ débits = Σ crédits (garanti au posting)."""
    __tablename__ = "journal_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    reference: Mapped[str] = mapped_column(String(40), index=True)   # EC-YYYY-NNNNN
    entry_date: Mapped[date] = mapped_column(Date, default=date.today)
    label: Mapped[str] = mapped_column(String(255), default="")
    source_type: Mapped[str] = mapped_column(String(40), default="manual")  # sale|invoice_payment|group_contribution|group_expense|payroll|manual
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount_cents: Mapped[int] = mapped_column(BigInteger, default=0)  # total débit (= total crédit)
    currency: Mapped[str] = mapped_column(String(10), default="XAF")
    posted: Mapped[bool] = mapped_column(Boolean, default=True)
    reversed_entry_id: Mapped[int | None] = mapped_column(ForeignKey("journal_entries.id"), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    lines: Mapped[list["JournalLine"]] = relationship(cascade="all, delete-orphan", back_populates="entry")


class JournalLine(Base):
    """Ligne d'écriture : un compte, un débit OU un crédit (en centimes)."""
    __tablename__ = "journal_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("journal_entries.id"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    account_code: Mapped[str] = mapped_column(String(20), default="")
    label: Mapped[str] = mapped_column(String(255), default="")
    debit_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    credit_cents: Mapped[int] = mapped_column(BigInteger, default=0)

    entry: Mapped[JournalEntry] = relationship(back_populates="lines")


# ═══════════════════════════════════════════════════════════════════════════
# MODULE GROUPES & ORGANISATIONS — fondation (G1)
# Rattaché à company_id pour réutiliser le multi-tenant + l'auth existants.
# ═══════════════════════════════════════════════════════════════════════════

class OrganizationGroup(TimestampMixin, Base):
    """Groupe / organisation : association, tontine, mutuelle, ONG, club…"""
    __tablename__ = "organization_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    type: Mapped[str] = mapped_column(String(40), default="association")
    description: Mapped[str] = mapped_column(Text, default="")
    logo: Mapped[str] = mapped_column(String(255), default="")
    country: Mapped[str] = mapped_column(String(80), default="Congo")
    city: Mapped[str] = mapped_column(String(120), default="")
    address: Mapped[str] = mapped_column(String(255), default="")
    currency: Mapped[str] = mapped_column(String(10), default="XAF")
    default_language: Mapped[str] = mapped_column(String(10), default="fr")
    linked_company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="active")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class GroupMember(TimestampMixin, Base):
    __tablename__ = "group_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    full_name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(40), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    photo: Mapped[str] = mapped_column(String(255), default="")
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    joined_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="active")
    member_number: Mapped[str] = mapped_column(String(40), default="")
    zone: Mapped[str] = mapped_column(String(120), default="")
    profession: Mapped[str] = mapped_column(String(120), default="")
    emergency_contact: Mapped[str] = mapped_column(String(160), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class GroupRole(TimestampMixin, Base):
    __tablename__ = "group_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    permissions: Mapped[str] = mapped_column(Text, default="[]")  # JSON liste de clés de permission


class GroupMemberRole(TimestampMixin, Base):
    """Affectation d'un rôle interne à un membre (un membre peut avoir plusieurs rôles)."""
    __tablename__ = "group_member_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("group_members.id"), index=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("group_roles.id"))
    role_name: Mapped[str] = mapped_column(String(80), default="")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    assigned_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reason: Mapped[str] = mapped_column(String(255), default="")
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)


class GroupLeadershipHistory(TimestampMixin, Base):
    """Historique des mandats du bureau : conserve chaque composition du directoire."""
    __tablename__ = "group_leadership_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    president_member_id: Mapped[int | None] = mapped_column(ForeignKey("group_members.id"), nullable=True)
    vice_president_member_id: Mapped[int | None] = mapped_column(ForeignKey("group_members.id"), nullable=True)
    secretary_member_id: Mapped[int | None] = mapped_column(ForeignKey("group_members.id"), nullable=True)
    treasurer_member_id: Mapped[int | None] = mapped_column(ForeignKey("group_members.id"), nullable=True)
    mandate_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    mandate_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    elected_by: Mapped[str] = mapped_column(String(160), default="")
    election_notes: Mapped[str] = mapped_column(Text, default="")
    official_document: Mapped[str] = mapped_column(String(255), default="")
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)


class GroupAuditLog(TimestampMixin, Base):
    """Traçabilité des actions sensibles d'un groupe (rôles, bureau, finances)."""
    __tablename__ = "group_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(60))
    target_type: Mapped[str] = mapped_column(String(60), default="")
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    old_value: Mapped[str] = mapped_column(Text, default="")
    new_value: Mapped[str] = mapped_column(Text, default="")
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)


# ═══════════════════════════════════════════════════════════════════════════
# MODULE GROUPES — G2 : Cotisations, paiements, caisse, dépenses
# Montants en CENTIMES ENTIERS (cohérent avec le moteur comptable).
# ═══════════════════════════════════════════════════════════════════════════

class ContributionPlan(TimestampMixin, Base):
    """Plan de cotisation : définit montant, fréquence, échéance, membres cibles."""
    __tablename__ = "group_contribution_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    amount_cents: Mapped[int] = mapped_column(BigInteger, default=0)   # montant dû en centimes
    currency: Mapped[str] = mapped_column(String(10), default="XAF")
    frequency: Mapped[str] = mapped_column(String(20), default="mensuelle")  # unique|hebdomadaire|mensuelle|trimestrielle|annuelle|personnalisee
    due_day: Mapped[int | None] = mapped_column(Integer, nullable=True)  # jour du mois (1-31) pour échéance mensuelle
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=True)
    target_amount_cents: Mapped[int] = mapped_column(BigInteger, default=0)  # objectif total
    status: Mapped[str] = mapped_column(String(40), default="active")   # active|paused|closed
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class ContributionPayment(TimestampMixin, Base):
    """Paiement (complet, partiel, en retard) d'un membre pour un plan de cotisation."""
    __tablename__ = "group_contribution_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("group_members.id"), index=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("group_contribution_plans.id"), index=True)
    amount_due_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    amount_paid_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    late_fee_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_method: Mapped[str] = mapped_column(String(40), default="cash")
    transaction_reference: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(40), default="pending")  # paid|partial|late|cancelled|refunded|pending
    proof_file: Mapped[str] = mapped_column(String(255), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    recorded_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    validated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Lien vers l'écriture comptable générée automatiquement
    journal_entry_id: Mapped[int | None] = mapped_column(ForeignKey("journal_entries.id"), nullable=True)


class GroupTransaction(TimestampMixin, Base):
    """Toutes les entrées/sorties financières de la caisse du groupe."""
    __tablename__ = "group_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    type: Mapped[str] = mapped_column(String(20), default="in")   # in|out|internal_transfer|adjustment|refund
    category: Mapped[str] = mapped_column(String(80), default="")
    amount_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    currency: Mapped[str] = mapped_column(String(10), default="XAF")
    description: Mapped[str] = mapped_column(String(255), default="")
    transaction_date: Mapped[date] = mapped_column(Date, default=date.today)
    member_id: Mapped[int | None] = mapped_column(ForeignKey("group_members.id"), nullable=True)
    contribution_payment_id: Mapped[int | None] = mapped_column(ForeignKey("group_contribution_payments.id"), nullable=True)
    payment_method: Mapped[str] = mapped_column(String(40), default="cash")
    reference: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(40), default="confirmed")  # confirmed|pending|cancelled
    attachment: Mapped[str] = mapped_column(String(255), default="")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    validated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    journal_entry_id: Mapped[int | None] = mapped_column(ForeignKey("journal_entries.id"), nullable=True)


class GroupExpense(TimestampMixin, Base):
    """Dépense du groupe (validée par bureau avant paiement)."""
    __tablename__ = "group_expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(80), default="")
    amount_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    currency: Mapped[str] = mapped_column(String(10), default="XAF")
    expense_date: Mapped[date] = mapped_column(Date, default=date.today)
    paid_to: Mapped[str] = mapped_column(String(160), default="")
    payment_method: Mapped[str] = mapped_column(String(40), default="cash")
    proof_file: Mapped[str] = mapped_column(String(255), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(40), default="pending")  # pending|approved|paid|cancelled
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    journal_entry_id: Mapped[int | None] = mapped_column(ForeignKey("journal_entries.id"), nullable=True)


# ═══════════════════════════════════════════════════════════════════════════
# MODULE GROUPES — G3 : Réunions, activités, calendrier, anniversaires, votes
# ═══════════════════════════════════════════════════════════════════════════

class GroupMeeting(TimestampMixin, Base):
    __tablename__ = "group_meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(String(255), default="")
    start_datetime: Mapped[datetime] = mapped_column(DateTime)
    end_datetime: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    meeting_type: Mapped[str] = mapped_column(String(40), default="ordinaire")  # ordinaire|extraordinaire|bilan|election
    agenda: Mapped[str] = mapped_column(Text, default="")
    minutes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(40), default="scheduled")  # scheduled|done|cancelled
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class GroupActivity(TimestampMixin, Base):
    __tablename__ = "group_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    activity_type: Mapped[str] = mapped_column(String(80), default="")
    location: Mapped[str] = mapped_column(String(255), default="")
    start_datetime: Mapped[datetime] = mapped_column(DateTime)
    end_datetime: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    budget_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    responsible_member_id: Mapped[int | None] = mapped_column(ForeignKey("group_members.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="planned")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class GroupReminder(TimestampMixin, Base):
    __tablename__ = "group_reminders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    target_type: Mapped[str] = mapped_column(String(40), default="")  # meeting|payment|activity|birthday|custom
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(Text, default="")
    remind_at: Mapped[datetime] = mapped_column(DateTime)
    channels: Mapped[str] = mapped_column(String(120), default="app")  # JSON list: app,email,sms
    status: Mapped[str] = mapped_column(String(40), default="pending")  # pending|sent|cancelled
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class GroupVote(TimestampMixin, Base):
    __tablename__ = "group_votes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    options: Mapped[str] = mapped_column(Text, default="[]")  # JSON list
    start_datetime: Mapped[datetime] = mapped_column(DateTime)
    end_datetime: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(40), default="open")  # open|closed|cancelled
    visibility: Mapped[str] = mapped_column(String(40), default="members")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class GroupVoteResponse(TimestampMixin, Base):
    __tablename__ = "group_vote_responses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    vote_id: Mapped[int] = mapped_column(ForeignKey("group_votes.id"), index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("group_members.id"), index=True)
    selected_option: Mapped[str] = mapped_column(String(160))


# ═══════════════════════════════════════════════════════════════════════════
# MODULE GROUPES — G4 : Chat, médias, documents
# ═══════════════════════════════════════════════════════════════════════════

class GroupChatRoom(TimestampMixin, Base):
    __tablename__ = "group_chat_rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(String(40), default="general")  # general|bureau|finance|event|private
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    messages: Mapped[list["GroupChatMessage"]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )


class GroupChatMessage(TimestampMixin, Base):
    __tablename__ = "group_chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("group_chat_rooms.id"), index=True)
    sender_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    sender_name: Mapped[str] = mapped_column(String(160), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    message_type: Mapped[str] = mapped_column(String(40), default="text")
    # text|image|video|audio|document|gif|system|payment_alert|meeting_alert|ai_summary
    media_url: Mapped[str] = mapped_column(String(512), default="")
    gif_url: Mapped[str] = mapped_column(String(512), default="")
    reply_to_id: Mapped[int | None] = mapped_column(ForeignKey("group_chat_messages.id"), nullable=True)
    reactions: Mapped[str] = mapped_column(Text, default="{}")  # JSON {"👍":2,"❤️":1}
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ai_suggestion: Mapped[str] = mapped_column(String(512), default="")

    room: Mapped[GroupChatRoom] = relationship(back_populates="messages")


class GroupDocument(TimestampMixin, Base):
    __tablename__ = "group_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("organization_groups.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    filename: Mapped[str] = mapped_column(String(255), default="")
    storage_path: Mapped[str] = mapped_column(String(512), default="")
    category: Mapped[str] = mapped_column(String(80), default="autre")
    # statut|reglement|rapport_financier|pv|recu|facture|contrat|preuve_paiement|autre
    uploaded_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    visibility: Mapped[str] = mapped_column(String(40), default="members")  # members|bureau|public
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    mime_type: Mapped[str] = mapped_column(String(120), default="")


class PasswordResetToken(TimestampMixin, Base):
    """Jeton de réinitialisation de mot de passe — persisté en DB.

    Le token est stocké HASHÉ (sha256) : même un accès lecture à la base ne
    permet pas de réutiliser un jeton. Usage unique, expiration, traçabilité IP.
    """
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    request_ip: Mapped[str] = mapped_column(String(64), default="")


# ══════════════════════════════════════════════════════════════════════════════
# ABONNEMENTS — plans, promotions, abonnement par entreprise
# (gérés par le super-admin ; payés par chaque entreprise)
# ══════════════════════════════════════════════════════════════════════════════
class SubscriptionPlan(TimestampMixin, Base):
    __tablename__ = "subscription_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)   # starter | pro | business
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(400), default="")
    price_cents: Mapped[int] = mapped_column(BigInteger, default=0)          # prix période, en centimes
    currency: Mapped[str] = mapped_column(String(8), default="XAF")
    period: Mapped[str] = mapped_column(String(10), default="month")         # month | year
    features: Mapped[str] = mapped_column(Text, default="[]")                # JSON : liste de fonctionnalités (marketing)
    # Entitlements réels (éditables par le super-admin) :
    included_modules: Mapped[str] = mapped_column(Text, default="[]")        # JSON : modules premium débloqués par ce plan
    max_users: Mapped[int] = mapped_column(Integer, default=0)               # 0 = illimité
    trial_days: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # Identifiant du produit App Store Connect correspondant (StoreKit 2 IAP),
    # ex. "com.adansonia.kompta.subscription.pro.monthly". Vide = pas encore
    # mappé (le plan ne peut pas être acheté via IAP tant que ce champ est vide).
    apple_product_id: Mapped[str] = mapped_column(String(200), default="")


class Promotion(TimestampMixin, Base):
    __tablename__ = "promotions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)   # code promo (MAJUSCULES)
    description: Mapped[str] = mapped_column(String(300), default="")
    percent_off: Mapped[int] = mapped_column(Integer, default=0)             # 0..100
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    plan_code: Mapped[str] = mapped_column(String(40), default="")           # "" = tous les plans
    max_redemptions: Mapped[int] = mapped_column(Integer, default=0)         # 0 = illimité
    times_redeemed: Mapped[int] = mapped_column(Integer, default=0)


class CompanySubscription(TimestampMixin, Base):
    __tablename__ = "company_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), unique=True, index=True)
    plan_code: Mapped[str] = mapped_column(String(40), default="")
    # none | trialing | active | past_due | suspended | cancelled
    status: Mapped[str] = mapped_column(String(20), default="none", index=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    last_payment_id: Mapped[int | None] = mapped_column(ForeignKey("payment_transactions.id"), nullable=True)
    applied_promo_code: Mapped[str] = mapped_column(String(40), default="")
    # Marque un forfait accordé manuellement par le super-admin (offert,
    # illimité, partenariat, etc.) — protège plan_code/current_period_end
    # d'un renouvellement de paiement réel (Stripe/MoMo/Apple) tant que ce
    # dernier n'étend pas la période au-delà de ce qui a été accordé.
    admin_granted: Mapped[bool] = mapped_column(Boolean, default=False)
    admin_granted_note: Mapped[str] = mapped_column(String(255), default="")


# ══════════════════════════════════════════════════════════════════════════════
# CRM LÉGER — pipeline d'opportunités (prospects → devis → facture)
# ══════════════════════════════════════════════════════════════════════════════
class Opportunity(TimestampMixin, Base):
    """Entrée de pipeline commercial : un prospect/lead suivi jusqu'à conversion
    en facture. Peut référencer un Client existant ou capturer un contact
    inline (nom/téléphone/email) avant qu'il ne devienne un Client."""
    __tablename__ = "opportunities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    contact_name: Mapped[str] = mapped_column(String(160), default="")
    contact_phone: Mapped[str] = mapped_column(String(40), default="")
    contact_email: Mapped[str] = mapped_column(String(160), default="")
    title: Mapped[str] = mapped_column(String(200))
    # nouveau | qualifie | proposition | negociation | gagne | perdu
    stage: Mapped[str] = mapped_column(String(20), default="nouveau", index=True)
    estimated_amount_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    probability_percent: Mapped[int] = mapped_column(Integer, default=20)
    expected_close_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    assigned_to_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
