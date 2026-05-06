from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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

    users: Mapped[list["User"]] = relationship(back_populates="company")


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
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

    company: Mapped[Company] = relationship(back_populates="users")
    messages: Mapped[list["Message"]] = relationship(back_populates="author")


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
    salary: Mapped[float] = mapped_column(Float, default=0)
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
    status: Mapped[str] = mapped_column(String(40), default="draft")
    total_amount: Mapped[float] = mapped_column(Float, default=0)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_method: Mapped[str] = mapped_column(String(80), default="")
    payment_account_id: Mapped[int | None] = mapped_column(ForeignKey("payment_accounts.id"), nullable=True)
    payment_account_label: Mapped[str] = mapped_column(String(160), default="")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))

    lines: Mapped[list["InvoiceLine"]] = relationship(cascade="all, delete-orphan", back_populates="invoice")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))
    description: Mapped[str] = mapped_column(String(180))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)

    invoice: Mapped[Invoice] = relationship(back_populates="lines")


class Sale(TimestampMixin, Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    receipt_number: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    payment_method: Mapped[str] = mapped_column(String(80), default="cash")
    payment_account_id: Mapped[int | None] = mapped_column(ForeignKey("payment_accounts.id"), nullable=True)
    payment_account_label: Mapped[str] = mapped_column(String(160), default="")
    total_amount: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(40), default="paid")
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))

    items: Mapped[list["SaleItem"]] = relationship(cascade="all, delete-orphan", back_populates="sale")


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    product_name: Mapped[str] = mapped_column(String(160))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[float] = mapped_column(Float)
    line_total: Mapped[float] = mapped_column(Float)

    sale: Mapped[Sale] = relationship(back_populates="items")


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
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class ChatChannel(TimestampMixin, Base):
    __tablename__ = "chat_channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    topic: Mapped[str] = mapped_column(String(180), default="")
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))

    messages: Mapped[list["Message"]] = relationship(cascade="all, delete-orphan", back_populates="channel")


class Message(TimestampMixin, Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("chat_channels.id"))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    mentions: Mapped[str] = mapped_column(String(255), default="")
    ai_suggestion: Mapped[str] = mapped_column(String(255), default="")
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
    reference: Mapped[str] = mapped_column(String(80), unique=True)
    payout_method: Mapped[str] = mapped_column(String(40), default="")
    payout_destination: Mapped[str] = mapped_column(String(180), default="")
    payout_status: Mapped[str] = mapped_column(String(40), default="pending")

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
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


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
