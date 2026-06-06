import csv
import io
import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

logger = logging.getLogger(__name__)

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, Response, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, or_, select, text, update
from sqlalchemy.orm import Session, selectinload

from app.api.deps import company_scope, get_current_user
from app.core.rate_limit import limiter as _limiter
from app.core.security import (
    clear_auth_cookie,
    create_access_token,
    decode_access_token,
    hash_password,
    set_auth_cookie,
    verify_password,
)
from app.db.session import SessionLocal, get_db
from app.models import (
    AccessAuditLog,
    AIGeneration,
    BankTransaction,
    ChatChannel,
    Company,
    CompanyDocument,
    CompanyModule,
    DailyNote,
    DeclarationRecord,
    Employee,
    EmployabilityCheck,
    InventoryMovement,
    Invoice,
    InvoiceLine,
    LimuleInteraction,
    Meeting,
    Message,
    PaymentAccount,
    PaymentTransaction,
    PayrollRun,
    Payslip,
    Product,
    ProductImage,
    Sale,
    SaleItem,
    Task,
    TemporaryCredential,
    TerasAlert,
    TerasAnalysisJob,
    TerasScoreSnapshot,
    Ticket,
    TicketMessage,
    User,
    UserPreference,
)
from app.schemas import (
    AIRouterDecision,
    AIRouterRequest,
    ChatChannelCreate,
    ChatChannelDetail,
    ChatChannelRead,
    CompanyDocumentRead,
    CompanyDocumentReadFull,
    CompanyRead,
    CompanyUpdate,
    DeclarationRequest,
    DeclarationRecordCreate,
    DeclarationRecordRead,
    AccountInfoRead,
    AccountStatusUpdate,
    CompanyRegistrationRequest,
    GroupRegistrationRequest,
    EmployeeCreate,
    EmployeeCreateWithAccount,
    EmployeePayoutUpdate,
    EmployeeProvisioningResult,
    EmployeeQuickCreate,
    EmployeeRead,
    EmployabilityCheckRead,
    EmployabilitySubmitRequest,
    FirstLoginChangePasswordRequest,
    InvoiceCreate,
    InvoicePaymentCreate,
    InvoiceRead,
    InvoiceRejectPayload,
    LoginRequest,
    MessageCreate,
    MessageRead,
    PaymentAccountCreate,
    PaymentAccountRead,
    PaymentAccountUpdate,
    EmployeePayrollOverride,
    PayrollRunCreate,
    PayrollRunRead,
    PayrollRunStatusUpdate,
    PayslipRead,
    PayslipUpdate,
    PermissionsUpdate,
    ProductCreate,
    ProductRead,
    SaleCreate,
    SecurityAuditRead,
    TaskCreate,
    TaskRead,
    TerasAlertRead,
    TerasAnalysisJobRead,
    TerasScoreSnapshotRead,
    TicketCreate,
    TicketRead,
    TicketReplyCreate,
    TicketUpdate,
    TokenResponse,
    UserRead,
    WritingRequest,
)
from app.services.access import (
    assert_can_manage_employee_access,
    audit_access,
    change_first_login_password,
    create_complete_employee_with_account,
    normalize_phone,
    quick_create_employee_with_account,
    regenerate_temporary_password,
    render_contract_html,
)
from app.services.business import (
    chat_ai_action,
    chat_ai_suggestion,
    compliance_snapshot,
    extract_mentions,
    label_preview,
    payslip_reference,
    product_qr_payload,
)
from app.services import accounting as _accounting
from app.services.deepseek import generate_declaration, generate_writing
from app.services.deepseek import generate_contract_clauses
from app.services.documents import create_document_from_upload, create_document_record, reanalyze_document
from app.services.teras import latest_score_snapshots, route_ai_request, run_teras_analysis, submit_employability_to_teras
from app.services.email import send_relance_email

router = APIRouter()

# ── RBAC helpers ───────────────────────────────────────────────────────────────

_HR_ROLES = {"admin_entreprise", "manager_entreprise", "rh_entreprise", "super_admin"}
_FINANCE_ROLES = {"admin_entreprise", "manager_entreprise", "comptable", "super_admin"}
_ADMIN_ROLES = {"admin_entreprise", "manager_entreprise", "super_admin"}


def _require_hr(current_user: User) -> None:
    """Exige un rôle RH ou admin pour accéder aux données employés/paie."""
    if current_user.role not in _HR_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : rôle rh_entreprise, manager_entreprise ou admin_entreprise requis.",
        )


def _require_finance(current_user: User) -> None:
    """Exige un rôle finance/admin pour accéder aux données comptables sensibles."""
    if current_user.role not in _FINANCE_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : rôle comptable, manager_entreprise ou admin_entreprise requis.",
        )


def _require_admin(current_user: User) -> None:
    """Exige un rôle admin pour les opérations destructives ou sensibles."""
    if current_user.role not in _ADMIN_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : rôle admin_entreprise ou manager_entreprise requis.",
        )


def _login_lookup_conditions(identifier: str):
    """Construit la condition SQL pour trouver un user par email OU téléphone.

    Discrimination stricte pour éviter les collisions :
    - Si l'identifiant contient '@' → on cherche UNIQUEMENT par email.
    - Sinon → on cherche UNIQUEMENT par téléphone (toutes variantes acceptées).

    Sans cette discrimination, un téléphone partagé entre deux comptes
    (membre de groupe + admin d'entreprise par exemple) pouvait faire
    matcher le mauvais user et bloquer le login avec 401.
    """
    raw_identifier = identifier.strip()
    if "@" in raw_identifier:
        # Identifiant = email → match strict insensible à la casse
        return func.lower(User.email) == raw_identifier.lower()

    # Identifiant = téléphone → toutes les variantes connues
    normalized_phone = normalize_phone(raw_identifier)
    digits = normalized_phone[1:] if normalized_phone.startswith("+") else normalized_phone
    phone_variants = {raw_identifier, normalized_phone}
    if digits:
        phone_variants.update({digits, f"+{digits}"})
        if digits.startswith("0"):
            phone_variants.update({f"+242{digits}", f"242{digits}", f"+242{digits[1:]}", f"242{digits[1:]}"})
        if digits.startswith("242"):
            phone_variants.add(f"+{digits}")
    phone_variants = {variant for variant in phone_variants if variant}
    if not phone_variants:
        # identifiant ni email ni phone valide → renvoyer une condition fausse
        return User.id == -1
    return User.phone.in_(phone_variants)


    # ── Anti-brute-force login (compteur d'échecs en mémoire + verrouillage) ──
_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_WINDOW_SECONDS = 300   # 5 minutes glissantes
_LOGIN_LOCKOUT_SECONDS = 900  # 15 minutes de blocage


def _login_rate_key(identifier: str, request: "Request | None") -> str:
    ip = ""
    if request is not None and request.client:
        ip = request.client.host or ""
    return f"{ip}::{identifier.strip().lower()}"


def _check_login_rate(key: str) -> None:
    import time as _t
    now = _t.time()
    attempts = [t for t in _LOGIN_ATTEMPTS.get(key, []) if now - t < _LOGIN_LOCKOUT_SECONDS]
    _LOGIN_ATTEMPTS[key] = attempts
    recent = [t for t in attempts if now - t < _LOGIN_WINDOW_SECONDS]
    if len(recent) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Trop de tentatives. Réessayez dans quelques minutes.",
        )


def _record_login_failure(key: str) -> None:
    import time as _t
    _LOGIN_ATTEMPTS.setdefault(key, []).append(_t.time())


def _reset_login_attempts(key: str) -> None:
    _LOGIN_ATTEMPTS.pop(key, None)


def _next_invoice_number(db: Session, company_id: int) -> str:
    """Numéro de facture séquentiel, atomique, sans trou ni réutilisation.

    On incrémente un compteur persistant sur la société (UPDATE ... RETURNING)
    au lieu de dériver de COUNT(*) — ce qui évitait à la fois les collisions
    concurrentes et la réutilisation de numéros après suppression.
    """
    seq = db.execute(
        text("UPDATE companies SET invoice_seq = invoice_seq + 1 WHERE id = :cid RETURNING invoice_seq"),
        {"cid": company_id},
    ).scalar_one()
    return f"INV-{date.today().year}-C{company_id:04d}-{seq:04d}"


def _next_receipt_number(db: Session, company_id: int) -> str:
    """Numéro de ticket POS séquentiel et atomique (même logique que les factures)."""
    seq = db.execute(
        text("UPDATE companies SET sale_seq = sale_seq + 1 WHERE id = :cid RETURNING sale_seq"),
        {"cid": company_id},
    ).scalar_one()
    return f"POS-{date.today().year}-C{company_id:04d}-{seq:05d}"


TASK_MANAGER_ROLES = {"rh_entreprise", "manager_entreprise", "super_admin"}


def _normalize_task_actor(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def _can_manage_tasks(user: User) -> bool:
    return user.role.startswith("admin") or user.role in TASK_MANAGER_ROLES


def _employee_display_name(employee: Employee | None, user: User) -> str:
    if employee:
        return f"{employee.first_name} {employee.last_name}".strip()
    return user.full_name.strip()


def _task_subjects_for_user(db: Session, user: User) -> tuple[set[str], Employee | None]:
    employee = db.get(Employee, user.employee_id) if user.employee_id else None
    values = {user.full_name, user.email, user.phone}
    if employee:
        values.update(
            {
                f"{employee.first_name} {employee.last_name}".strip(),
                employee.email,
                employee.phone,
            }
        )
    return {_normalize_task_actor(value) for value in values if value}, employee


def _task_assigned_to_user(task: Task, subjects: set[str]) -> bool:
    assignee = _normalize_task_actor(task.assignee_name)
    return bool(assignee and assignee in subjects)


def _task_assignee_employee(db: Session, task: Task) -> Employee | None:
    assignee = _normalize_task_actor(task.assignee_name)
    if not assignee:
        return None
    employees = db.scalars(select(Employee).where(Employee.company_id == task.company_id)).all()
    for employee in employees:
        candidates = {
            _normalize_task_actor(f"{employee.first_name} {employee.last_name}".strip()),
            _normalize_task_actor(employee.email),
            _normalize_task_actor(employee.phone),
        }
        if assignee in candidates:
            return employee
    return None


def _serialize_task(db: Session, task: Task, current_user: User, subjects: set[str] | None = None) -> dict:
    user_subjects = subjects if subjects is not None else _task_subjects_for_user(db, current_user)[0]
    is_manager = _can_manage_tasks(current_user)
    assigned_to_me = _task_assigned_to_user(task, user_subjects)
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date,
        "assignee_name": task.assignee_name,
        "source": task.source,
        "proof_required": task.proof_required,
        "company_id": task.company_id,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "assigned_to_me": assigned_to_me,
        "can_update": is_manager or assigned_to_me,
        "can_delete": is_manager,
        "proof_url": task.proof_url,
        "due_time": task.due_time,
    }


class ConnectionManager:
    def __init__(self) -> None:
        self.active: dict[int, list[WebSocket]] = {}

    async def connect(self, channel_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.setdefault(channel_id, []).append(websocket)

    def disconnect(self, channel_id: int, websocket: WebSocket) -> None:
        sockets = self.active.get(channel_id, [])
        if websocket in sockets:
            sockets.remove(websocket)

    async def broadcast(self, channel_id: int, payload: dict) -> None:
        for websocket in list(self.active.get(channel_id, [])):
            await websocket.send_json(payload)


manager = ConnectionManager()
notifier = ConnectionManager()  # company_id → websockets for live notifications

DEFAULT_MODULES = [
    "dashboard",
    "rh",
    "payroll",
    "accounting",
    "billing",
    "pos",
    "inventory",
    "documents",
    "declarations",
    "chat",
    "meetings",
    "projects",
    "calendar",
    "notes",
    "assistants",
    "reports",
    "teras",
    "settings",
]


def ensure_default_modules(db: Session, company_id: int) -> None:
    existing = {
        module_key
        for module_key in db.scalars(
            select(CompanyModule.module_key).where(CompanyModule.company_id == company_id)
        ).all()
    }
    for key in DEFAULT_MODULES:
        if key not in existing:
            db.add(CompanyModule(module_key=key, enabled=True, company_id=company_id))


async def broadcast_notification(company_id: int, title: str, detail: str = "", notif_type: str = "info", count: int = 1) -> None:
    try:
        await notifier.broadcast(company_id, {"type": notif_type, "title": title, "detail": detail, "count": count})
    except Exception:
        pass


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "kompta-api"}


@router.post("/auth/login", response_model=TokenResponse)
@_limiter.limit("20/minute")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    # Strip défensif sur identifiant ET mot de passe : iOS/Android ajoutent souvent
    # un espace par auto-correction, surtout lors du copier-coller depuis un SMS
    # ou un email contenant le mot de passe temporaire.
    identifier = payload.email.strip()
    password = payload.password.strip()
    rate_key = _login_rate_key(identifier, request)
    _check_login_rate(rate_key)
    # Plusieurs users peuvent partager un numéro (collision historique).
    # On essaie tous les matchs et on prend celui dont le password matche.
    candidates = db.scalars(select(User).where(_login_lookup_conditions(identifier))).all()
    user = None
    for candidate in candidates:
        if verify_password(password, candidate.password_hash):
            user = candidate
            break
    if not user:
        _record_login_failure(rate_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe invalide")
    if user.account_status in {"suspended", "disabled", "archived"} or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compte suspendu ou desactive")
    # 2FA réellement appliqué : si le compte a activé le TOTP, exiger un code valide.
    if getattr(user, "totp_enabled", False) and user.totp_secret:
        if not payload.totp_code:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="2fa_required")
        import pyotp
        if not pyotp.TOTP(user.totp_secret).verify(payload.totp_code.strip(), valid_window=1):
            _record_login_failure(rate_key)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Code 2FA invalide")
    _reset_login_attempts(rate_key)
    if not user.must_change_password:
        user.last_login_at = datetime.now(timezone.utc)
        if user.employee_id:
            employee = db.get(Employee, user.employee_id)
            if employee:
                employee.last_login_at = user.last_login_at
        db.commit()
        db.refresh(user)
    token = create_access_token(str(user.id), {"role": user.role, "company_id": user.company_id, "ver": user.token_version})
    set_auth_cookie(response, token)
    return TokenResponse(access_token=token, user=UserRead.model_validate(user), must_change_password=user.must_change_password)


@router.post("/auth/refresh", response_model=TokenResponse)
def refresh_token(response: Response, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> TokenResponse:
    """Issue a new token for an authenticated user (silent refresh)."""
    token = create_access_token(str(current_user.id), {"role": current_user.role, "company_id": current_user.company_id, "ver": current_user.token_version})
    set_auth_cookie(response, token)
    return TokenResponse(access_token=token, user=UserRead.model_validate(current_user), must_change_password=current_user.must_change_password)


@router.post("/auth/logout")
def logout(response: Response, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Révoque tous les jetons actifs de l'utilisateur en incrémentant token_version."""
    current_user.token_version = (current_user.token_version or 0) + 1
    db.commit()
    clear_auth_cookie(response)
    return {"status": "logged_out", "revoked": True}


@router.post("/auth/register-company", response_model=TokenResponse, status_code=201)
def register_company(payload: CompanyRegistrationRequest, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.admin_email.strip().lower()
    phone = payload.admin_phone.strip()
    duplicate_filter = User.email == email
    if phone:
        duplicate_filter = or_(duplicate_filter, User.phone == phone)
    if db.scalar(select(User).where(duplicate_filter)):
        raise HTTPException(status_code=409, detail="Un compte existe deja avec cet email ou telephone")

    company = Company(
        name=payload.company_name.strip(),
        legal_name=payload.legal_name.strip() or payload.company_name.strip(),
        industry=payload.industry.strip() or "Services",
        organization_type=payload.organization_type.strip() or "PME",
        country=payload.country.strip() or "Congo",
        completion_score=35,
        teras_score=0,
    )
    db.add(company)
    db.flush()

    admin = User(
        email=email,
        phone=phone,
        full_name=payload.admin_full_name.strip(),
        role="admin_entreprise",
        department="Direction générale",
        branch="Siège",
        password_hash=hash_password(payload.password),
        company_id=company.id,
        account_status="active",
        is_active=True,
    )
    db.add(admin)
    db.flush()
    db.add(ChatChannel(name="general", topic="Canal de depart de votre entreprise", company_id=company.id))
    ensure_default_modules(db, company.id)
    db.commit()
    db.refresh(admin)

    token = create_access_token(str(admin.id), {"role": admin.role, "company_id": admin.company_id, "ver": admin.token_version})
    set_auth_cookie(response, token)
    return TokenResponse(access_token=token, user=UserRead.model_validate(admin), must_change_password=False)


@router.post("/auth/register-group", response_model=TokenResponse, status_code=201)
def register_group(payload: GroupRegistrationRequest, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    """Crée un compte utilisateur (admin du groupe) + un groupe en une seule étape.
    L'utilisateur n'a pas besoin d'avoir une entreprise — il est rattaché à la KOMPTA Platform.
    """
    email = payload.email.strip().lower()
    phone = normalize_phone(payload.phone.strip()) if payload.phone.strip() else ""

    # Vérifier doublon
    dup_filter = User.email == email
    if phone:
        dup_filter = or_(dup_filter, User.phone == phone)
    if db.scalar(select(User).where(dup_filter)):
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec cet email ou téléphone.")

    # Rattacher à la compagnie KOMPTA Platform (société de référence pour les groupes)
    platform = db.scalar(select(Company).where(Company.name == "KOMPTA Platform"))
    if not platform:
        platform = Company(
            name="KOMPTA Platform", legal_name="KOMPTA Platform",
            industry="Plateforme", organization_type="SaaS", country="Congo",
            completion_score=100, teras_score=0,
        )
        db.add(platform)
        db.flush()

    # Créer le compte utilisateur avec rôle membre_groupe
    user = User(
        email=email,
        phone=phone,
        full_name=payload.full_name.strip(),
        role="membre_groupe",
        department="Groupes & Organisations",
        branch="Plateforme",
        password_hash=hash_password(payload.password),
        company_id=platform.id,
        account_status="active",
        is_active=True,
    )
    db.add(user)
    db.flush()

    # Créer le groupe
    from app.models.domain import OrganizationGroup, GroupMember, GroupRole, GroupMemberRole, GroupLeadershipHistory
    from datetime import date as _date
    group = OrganizationGroup(
        company_id=platform.id,
        name=payload.group_name.strip(),
        type=payload.group_type,
        description=payload.group_description,
        country=payload.country,
        city=payload.city,
        currency=payload.currency,
        created_by_user_id=user.id,
        status="active",
        is_active=True,
    )
    db.add(group)
    db.flush()

    # Rôles par défaut du groupe
    DEFAULT_ROLES = ["Président", "Vice-Président", "Secrétaire", "Trésorier", "Membre", "Administrateur"]
    role_map: dict[str, GroupRole] = {}
    for role_name in DEFAULT_ROLES:
        r = GroupRole(group_id=group.id, name=role_name, permissions="[]")
        db.add(r)
        db.flush()
        role_map[role_name] = r

    # Fondateur = Président
    membre = GroupMember(
        group_id=group.id, user_id=user.id,
        full_name=user.full_name, email=user.email, phone=user.phone,
        joined_at=_date.today(),
    )
    db.add(membre)
    db.flush()

    db.add(GroupMemberRole(
        group_id=group.id, member_id=membre.id,
        role_id=role_map["Président"].id, role_name="Président",
        assigned_by_user_id=user.id, is_current=True,
    ))
    db.add(GroupLeadershipHistory(
        group_id=group.id, president_member_id=membre.id,
        mandate_start=_date.today(), elected_by="Fondateur", is_current=True,
    ))
    # Salon "Général" par défaut
    from app.api.routes_groups_g4 import seed_default_room
    seed_default_room(db, group.id, user.id)

    db.commit()
    db.refresh(user)

    token = create_access_token(
        str(user.id),
        {"role": user.role, "company_id": user.company_id, "ver": user.token_version, "group_id": group.id}
    )
    set_auth_cookie(response, token)
    return TokenResponse(access_token=token, user=UserRead.model_validate(user), must_change_password=False)


@router.post("/auth/realtime-ticket")
def create_realtime_ticket(current_user: User = Depends(get_current_user)) -> dict:
    """Délivre un ticket éphémère (60s, usage temps réel) pour SSE/WebSocket.

    Évite de transmettre le JWT long (8h) dans les URLs (logs/proxies/historique).
    Le ticket porte purpose="realtime", expire en 60s et ne sert qu'à ouvrir un flux.
    """
    import time as _time
    ticket = create_access_token(
        str(current_user.id),
        {
            "role": current_user.role,
            "company_id": current_user.company_id,
            "ver": current_user.token_version,
            "purpose": "realtime",
            "exp": int(_time.time()) + 60,
        },
    )
    return {"ticket": ticket, "expires_in": 60}


def _user_from_realtime_ticket(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload or payload.get("purpose") != "realtime":
        return None
    user = db.get(User, int(payload.get("sub", 0) or 0))
    if not user or not user.is_active:
        return None
    if int(payload.get("ver", 0)) != int(getattr(user, "token_version", 0) or 0):
        return None
    return user


@router.get("/auth/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/auth/first-login-change-password", response_model=UserRead)
def first_login_change_password(
    payload: FirstLoginChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> User:
    return change_first_login_password(db, user=current_user, current_password=payload.current_password, new_password=payload.new_password)


@router.get("/company/profile", response_model=CompanyRead)
def company_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Company:
    company = db.get(Company, current_user.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.patch("/company/profile", response_model=CompanyRead)
def update_company(
    payload: CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Company:
    company = db.get(Company, current_user.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    # Garde-fou : le seuil de trésorerie ne peut pas être négatif.
    if getattr(company, "cash_low_threshold_cents", 0) and company.cash_low_threshold_cents < 0:
        company.cash_low_threshold_cents = 0
    db.commit()
    db.refresh(company)
    return company


@router.post("/workspace/reset")
def reset_current_workspace(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Réinitialise les données de démonstration/test d'un espace.

    ⚠️ PROTECTIONS C5 :
    - Les logs d'audit (AccessAuditLog) ne sont JAMAIS supprimés — trace légale obligatoire.
    - Les factures et bulletins de paie VALIDÉS/PAYÉS ne sont pas supprimés.
    - Interdit en production si des pièces comptables validées existent.
    - Réservé à l'admin entreprise uniquement.
    """
    if current_user.role not in {"admin_entreprise", "super_admin"}:
        raise HTTPException(status_code=403, detail="Seul un administrateur peut remettre l'espace à zéro")

    company_id = current_user.company_id

    # Bloquer si des factures payées existent (données financières réelles)
    paid_invoices_count = db.scalar(
        select(func.count()).select_from(
            select(Invoice.id).where(
                Invoice.company_id == company_id,
                Invoice.status == "paid",
            ).subquery()
        )
    ) or 0
    validated_payroll_count = db.scalar(
        select(func.count()).select_from(
            select(PayrollRun.id).where(
                PayrollRun.company_id == company_id,
                PayrollRun.status == "validated",
            ).subquery()
        )
    ) or 0

    if paid_invoices_count > 0 or validated_payroll_count > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Impossible de réinitialiser : {paid_invoices_count} facture(s) payée(s) et "
                f"{validated_payroll_count} cycle(s) de paie validé(s) existent. "
                "Exportez vos données d'abord. Cette opération est réservée aux espaces de test/démo."
            ),
        )

    removable_user_ids = select(User.id).where(
        User.company_id == company_id,
        User.id != current_user.id,
        User.role != "super_admin",
    )
    sale_ids = select(Sale.id).where(Sale.company_id == company_id)
    invoice_ids = select(Invoice.id).where(Invoice.company_id == company_id)
    payroll_ids = select(PayrollRun.id).where(PayrollRun.company_id == company_id)
    product_ids = select(Product.id).where(Product.company_id == company_id)
    ticket_ids = select(Ticket.id).where(Ticket.company_id == company_id)

    db.execute(delete(TicketMessage).where(TicketMessage.ticket_id.in_(ticket_ids)))
    db.execute(delete(Ticket).where(Ticket.company_id == company_id))
    db.execute(delete(Message).where(Message.company_id == company_id))
    db.execute(delete(ChatChannel).where(ChatChannel.company_id == company_id))
    db.execute(delete(AIGeneration).where(AIGeneration.company_id == company_id))
    db.execute(delete(LimuleInteraction).where(LimuleInteraction.company_id == company_id))
    db.execute(delete(DailyNote).where(DailyNote.company_id == company_id))
    db.execute(delete(DeclarationRecord).where(DeclarationRecord.company_id == company_id))
    db.execute(delete(Meeting).where(Meeting.company_id == company_id))
    db.execute(delete(TerasAlert).where(TerasAlert.company_id == company_id))
    db.execute(delete(TerasScoreSnapshot).where(TerasScoreSnapshot.company_id == company_id))
    db.execute(delete(TerasAnalysisJob).where(TerasAnalysisJob.company_id == company_id))
    db.execute(delete(EmployabilityCheck).where(EmployabilityCheck.company_id == company_id))
    db.execute(delete(CompanyDocument).where(CompanyDocument.company_id == company_id))
    # ✅ C5 : AccessAuditLog JAMAIS supprimé — trace légale non effaçable
    db.execute(delete(TemporaryCredential).where(TemporaryCredential.company_id == company_id))
    db.execute(delete(Task).where(Task.company_id == company_id))

    db.execute(delete(SaleItem).where(SaleItem.sale_id.in_(sale_ids)))
    db.execute(delete(Sale).where(Sale.company_id == company_id))
    db.execute(delete(InvoiceLine).where(InvoiceLine.invoice_id.in_(invoice_ids)))
    db.execute(delete(Invoice).where(Invoice.company_id == company_id))
    db.execute(delete(Payslip).where(Payslip.payroll_run_id.in_(payroll_ids)))
    db.execute(delete(PayrollRun).where(PayrollRun.company_id == company_id))
    db.execute(delete(PaymentAccount).where(PaymentAccount.company_id == company_id))
    db.execute(delete(InventoryMovement).where(InventoryMovement.company_id == company_id))
    db.execute(delete(ProductImage).where(ProductImage.product_id.in_(product_ids)))
    db.execute(delete(Product).where(Product.company_id == company_id))

    db.execute(update(User).where(User.company_id == company_id).values(employee_id=None))
    db.execute(delete(Employee).where(Employee.company_id == company_id))
    db.execute(delete(User).where(User.id.in_(removable_user_ids)))

    company = db.get(Company, company_id)
    if company:
        company.completion_score = 35
        company.teras_score = 0
    ensure_default_modules(db, company_id)
    db.add(ChatChannel(name="general", topic="Canal de depart vide", company_id=company_id))
    db.commit()
    return {
        "status": "reset",
        "company_id": company_id,
        "kept_user_id": current_user.id,
        "message": "Espace remis a zero. Les donnees metier ont ete supprimees, le canal general vide a ete recree.",
    }


@router.get("/onboarding")
def onboarding(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    company = db.get(Company, current_user.company_id)
    employees_count = db.scalar(select(func.count()).select_from(Employee).where(Employee.company_id == current_user.company_id))
    products_count = db.scalar(select(func.count()).select_from(Product).where(Product.company_id == current_user.company_id))
    return {
        "completion_score": company.completion_score if company else 0,
        "steps": [
            {"key": "company", "label": "Informations entreprise", "done": bool(company and company.legal_name)},
            {"key": "structure", "label": "Structure interne", "done": employees_count > 0},
            {"key": "payroll", "label": "Parametres paie", "done": True},
            {"key": "inventory", "label": "Produits et QR", "done": products_count > 0},
            {"key": "teras", "label": "Controle TERAS", "done": (company.teras_score if company else 0) >= 70},
        ],
    }


@router.get("/employees")
def list_employees(
    page: int = 1,
    per_page: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_hr(current_user)
    per_page = min(per_page, 200)
    stmt = select(Employee).where(Employee.company_id == current_user.company_id).order_by(Employee.created_at.desc())
    if per_page == 0:
        return db.scalars(stmt).all()
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.offset((page - 1) * per_page).limit(per_page)).all()
    import math
    return {"items": items, "total": total, "page": page, "per_page": per_page, "pages": math.ceil(total / per_page) if per_page else 1}


@router.post("/employees/quick-create", response_model=EmployeeProvisioningResult, status_code=201)
def quick_create_employee(
    payload: EmployeeQuickCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmployeeProvisioningResult:
    _require_hr(current_user)
    employee, login_identifier, temporary_password = quick_create_employee_with_account(db, payload=payload, current_user=current_user)
    return EmployeeProvisioningResult(
        employee=EmployeeRead.model_validate(employee),
        login_identifier=login_identifier,
        temporary_password=temporary_password,
        account_status=employee.account_status,
        must_change_password=True,
        access_note="Mot de passe affiche uniquement maintenant. L'employe devra le changer au premier login.",
    )


@router.post("/employees/create-with-account", response_model=EmployeeProvisioningResult, status_code=201)
def create_employee_with_account(
    payload: EmployeeCreateWithAccount,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmployeeProvisioningResult:
    _require_hr(current_user)
    employee, login_identifier, temporary_password = create_complete_employee_with_account(
        db,
        payload=payload,
        current_user=current_user,
    )
    return EmployeeProvisioningResult(
        employee=EmployeeRead.model_validate(employee),
        login_identifier=login_identifier,
        temporary_password=temporary_password,
        account_status=employee.account_status,
        must_change_password=bool(temporary_password),
        access_note="Compte cree. Conservez ces identifiants dans un canal securise.",
    )


@router.post("/employees", response_model=EmployeeRead, status_code=201)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Employee:
    _require_hr(current_user)
    existing = db.scalar(select(Employee).where(Employee.email == payload.email))
    if existing:
        raise HTTPException(status_code=409, detail="Employee email already exists")
    employee = Employee(**payload.model_dump(), company_id=current_user.company_id)
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


def _get_scoped_employee(db: Session, employee_id: int, current_user: User) -> Employee:
    employee = db.get(Employee, employee_id)
    if not employee or employee.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee


def _get_current_company(db: Session, current_user: User) -> Company:
    company = db.get(Company, current_user.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


PAYMENT_PROVIDERS = {"mobile_money", "zola", "bank", "paypal", "card", "cash"}
POS_PAYMENT_TRANSACTION_PROVIDERS = {
    "card": "stripe",
    "mobile_money": "momo",
}


def _normalize_payment_provider(provider: str) -> str:
    normalized = provider.strip().lower()
    aliases = {
        "mobile": "mobile_money",
        "mobile-money": "mobile_money",
        "qr": "zola",
        "qr_zola": "zola",
        "bancaire": "bank",
        "banque": "bank",
    }
    normalized = aliases.get(normalized, normalized)
    if normalized not in PAYMENT_PROVIDERS:
        raise HTTPException(status_code=400, detail="Moyen de paiement non supporte")
    return normalized


def _mask_identifier(value: str) -> str:
    clean = value.strip()
    if len(clean) <= 6:
        return clean
    return f"{clean[:3]}•••{clean[-3:]}"


def _payment_identifier(account: PaymentAccount) -> str:
    value = account.phone_number or account.paypal_email or account.account_number or account.bank_code or ""
    return _mask_identifier(value)


def _apply_payment_defaults(db: Session, account: PaymentAccount) -> None:
    if account.is_default_pos:
        account.use_for_pos = True
        db.execute(
            update(PaymentAccount)
            .where(PaymentAccount.company_id == account.company_id, PaymentAccount.id != account.id)
            .values(is_default_pos=False)
        )
    if account.is_default_payroll:
        account.use_for_payroll = True
        db.execute(
            update(PaymentAccount)
            .where(PaymentAccount.company_id == account.company_id, PaymentAccount.id != account.id)
            .values(is_default_payroll=False)
        )


def _get_payment_account(db: Session, account_id: int, current_user: User) -> PaymentAccount:
    account = db.get(PaymentAccount, account_id)
    if not account or account.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Compte de paiement introuvable")
    return account


def _default_payment_account(db: Session, company_id: int, *, use_case: str) -> PaymentAccount | None:
    field = PaymentAccount.is_default_payroll if use_case == "payroll" else PaymentAccount.is_default_pos
    use_field = PaymentAccount.use_for_payroll if use_case == "payroll" else PaymentAccount.use_for_pos
    return db.scalar(
        select(PaymentAccount).where(
            PaymentAccount.company_id == company_id,
            PaymentAccount.enabled == True,  # noqa: E712
            use_field == True,  # noqa: E712
            field == True,  # noqa: E712
        )
    )


def _payment_account_for_method(
    db: Session,
    company_id: int,
    provider: str,
    *,
    use_case: str,
) -> PaymentAccount | None:
    provider = _normalize_payment_provider(provider)
    if provider in {"cash", "card"}:
        return None
    use_field = PaymentAccount.use_for_payroll if use_case == "payroll" else PaymentAccount.use_for_pos
    default_field = PaymentAccount.is_default_payroll if use_case == "payroll" else PaymentAccount.is_default_pos
    return db.scalar(
        select(PaymentAccount)
        .where(
            PaymentAccount.company_id == company_id,
            PaymentAccount.enabled == True,  # noqa: E712
            use_field == True,  # noqa: E712
            PaymentAccount.provider == provider,
        )
        .order_by(default_field.desc(), PaymentAccount.created_at.asc())
        .limit(1)
    )


def _resolve_payment_account(
    db: Session,
    current_user: User,
    *,
    payment_method: str,
    payment_account_id: int | None,
    use_case: str,
) -> tuple[str, PaymentAccount | None]:
    method = _normalize_payment_provider(payment_method)
    account: PaymentAccount | None = None
    if payment_account_id:
        account = _get_payment_account(db, payment_account_id, current_user)
        allowed = account.use_for_payroll if use_case == "payroll" else account.use_for_pos
        if not account.enabled or not allowed:
            raise HTTPException(status_code=400, detail="Ce compte n'est pas active pour ce paiement")
        method = account.provider
    elif method not in {"cash", "card"}:
        account = _payment_account_for_method(db, current_user.company_id, method, use_case=use_case)
        if not account:
            raise HTTPException(
                status_code=400,
                detail=f"Aucun compte {method} actif n'est configure pour ce paiement",
            )
    return method, account


@router.get("/payment-accounts", response_model=list[PaymentAccountRead])
def list_payment_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PaymentAccount]:
    return db.scalars(
        select(PaymentAccount)
        .where(PaymentAccount.company_id == current_user.company_id)
        .order_by(PaymentAccount.enabled.desc(), PaymentAccount.is_default_pos.desc(), PaymentAccount.label.asc())
    ).all()


@router.post("/payment-accounts", response_model=PaymentAccountRead, status_code=201)
def create_payment_account(
    payload: PaymentAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaymentAccount:
    provider = _normalize_payment_provider(payload.provider)
    data = payload.model_dump()
    data["provider"] = provider
    existing_count = db.scalar(
        select(func.count()).select_from(PaymentAccount).where(PaymentAccount.company_id == current_user.company_id)
    ) or 0
    if existing_count == 0:
        data["is_default_pos"] = True
    account = PaymentAccount(**data, company_id=current_user.company_id)
    db.add(account)
    db.flush()
    _apply_payment_defaults(db, account)
    db.commit()
    db.refresh(account)
    return account


@router.patch("/payment-accounts/{account_id}", response_model=PaymentAccountRead)
def update_payment_account(
    account_id: int,
    payload: PaymentAccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaymentAccount:
    account = _get_payment_account(db, account_id, current_user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "provider" and value is not None:
            value = _normalize_payment_provider(value)
        setattr(account, field, value)
    _apply_payment_defaults(db, account)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/payment-accounts/{account_id}", status_code=204)
def delete_payment_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    account = _get_payment_account(db, account_id, current_user)
    db.delete(account)
    db.commit()
    return Response(status_code=204)


@router.get("/employees/me/payout", response_model=EmployeeRead)
def get_my_employee_payout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Employee:
    if not current_user.employee_id:
        raise HTTPException(status_code=404, detail="Aucun profil employe lie a ce compte")
    employee = db.get(Employee, current_user.employee_id)
    if not employee or employee.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Profil employe introuvable")
    return employee


@router.patch("/employees/me/payout", response_model=EmployeeRead)
def update_my_employee_payout(
    payload: EmployeePayoutUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Employee:
    if not current_user.employee_id:
        raise HTTPException(status_code=404, detail="Aucun profil employe lie a ce compte")
    employee = db.get(Employee, current_user.employee_id)
    if not employee or employee.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Profil employe introuvable")

    method = _normalize_payment_provider(payload.payout_method)
    if method not in {"mobile_money", "zola", "bank", "paypal"}:
        raise HTTPException(status_code=400, detail="Methode de paiement paie invalide")
    if method in {"mobile_money", "zola"} and not payload.payout_phone.strip():
        raise HTTPException(status_code=400, detail="Numero mobile money requis")
    if method == "bank" and not payload.payout_account_number.strip():
        raise HTTPException(status_code=400, detail="Numero de compte bancaire requis")
    if method == "paypal" and not payload.payout_paypal_email.strip():
        raise HTTPException(status_code=400, detail="Email PayPal requis")

    employee.payout_method = method
    employee.payout_phone = payload.payout_phone.strip()
    employee.payout_bank_name = payload.payout_bank_name.strip()
    employee.payout_account_number = payload.payout_account_number.strip()
    employee.payout_paypal_email = payload.payout_paypal_email.strip()
    if method in {"mobile_money", "zola"} and payload.payout_phone.strip():
        employee.phone = employee.phone or payload.payout_phone.strip()

    audit_access(
        db,
        actor=current_user,
        company_id=current_user.company_id,
        action="self_payout_updated",
        employee=employee,
        target_user=current_user,
        details=f"method={method}; confirmed={payload.confirm}",
    )
    db.commit()
    db.refresh(employee)
    return employee


@router.get("/employees/{employee_id}", response_model=EmployeeRead)
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Employee:
    return _get_scoped_employee(db, employee_id, current_user)


@router.post("/employees/{employee_id}/generate-temp-password", response_model=EmployeeProvisioningResult)
def generate_employee_temp_password(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmployeeProvisioningResult:
    employee = _get_scoped_employee(db, employee_id, current_user)
    login_identifier, temporary_password = regenerate_temporary_password(db, employee=employee, current_user=current_user)
    db.refresh(employee)
    return EmployeeProvisioningResult(
        employee=EmployeeRead.model_validate(employee),
        login_identifier=login_identifier,
        temporary_password=temporary_password,
        account_status=employee.account_status,
        must_change_password=True,
        access_note="Nouveau mot de passe temporaire genere. Il ne sera plus affiche automatiquement.",
    )


@router.post("/employees/{employee_id}/reset-access", response_model=EmployeeProvisioningResult)
def reset_employee_access(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmployeeProvisioningResult:
    return generate_employee_temp_password(employee_id, db, current_user)


@router.patch("/employees/{employee_id}/permissions", response_model=EmployeeRead)
def update_employee_permissions(
    employee_id: int,
    payload: PermissionsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Employee:
    assert_can_manage_employee_access(current_user)
    employee = _get_scoped_employee(db, employee_id, current_user)
    employee.access_role = payload.access_role
    employee.access_scope = payload.access_scope
    user = db.get(User, employee.user_id) if employee.user_id else None
    if user:
        user.role = payload.access_role
    audit_access(
        db,
        actor=current_user,
        company_id=current_user.company_id,
        action="permissions_updated",
        employee=employee,
        target_user=user,
        details=f"role={payload.access_role}; scope={payload.access_scope}",
    )
    db.commit()
    db.refresh(employee)
    return employee


@router.patch("/employees/{employee_id}/account-status", response_model=EmployeeRead)
def update_employee_account_status(
    employee_id: int,
    payload: AccountStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Employee:
    assert_can_manage_employee_access(current_user)
    allowed = {"draft", "created", "pending_first_login", "active", "suspended", "disabled", "archived"}
    if payload.account_status not in allowed:
        raise HTTPException(status_code=400, detail="Statut de compte invalide")
    employee = _get_scoped_employee(db, employee_id, current_user)
    employee.account_status = payload.account_status
    user = db.get(User, employee.user_id) if employee.user_id else None
    if user:
        user.account_status = payload.account_status
        user.is_active = payload.account_status not in {"suspended", "disabled", "archived"}
    audit_access(
        db,
        actor=current_user,
        company_id=current_user.company_id,
        action="account_status_updated",
        employee=employee,
        target_user=user,
        details=payload.account_status,
    )
    db.commit()
    db.refresh(employee)
    return employee


@router.get("/employees/{employee_id}/account-info", response_model=AccountInfoRead)
def employee_account_info(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AccountInfoRead:
    assert_can_manage_employee_access(current_user)
    employee = _get_scoped_employee(db, employee_id, current_user)
    user = db.get(User, employee.user_id) if employee.user_id else None
    active_credential = False
    if user:
        active_credential = bool(
            db.scalar(
                select(TemporaryCredential).where(
                    TemporaryCredential.user_id == user.id,
                    TemporaryCredential.status == "active",
                )
            )
        )
    audit_access(
        db,
        actor=current_user,
        company_id=current_user.company_id,
        action="account_info_viewed",
        employee=employee,
        target_user=user,
        details="Consultation statut acces employe.",
    )
    db.commit()
    return AccountInfoRead(
        employee_id=employee.id,
        user_id=user.id if user else None,
        login_identifier=(user.phone or user.email) if user else employee.phone or employee.email,
        phone=employee.phone,
        role=employee.access_role,
        account_status=employee.account_status,
        must_change_password=user.must_change_password if user else False,
        last_login_at=user.last_login_at if user else employee.last_login_at,
        invited_at=user.invited_at if user else employee.invited_at,
        activated_at=user.activated_at if user else employee.activated_at,
        has_active_temporary_credential=active_credential,
    )


@router.get("/employees/{employee_id}/security-audit", response_model=list[SecurityAuditRead])
def employee_security_audit(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AccessAuditLog]:
    assert_can_manage_employee_access(current_user)
    employee = _get_scoped_employee(db, employee_id, current_user)
    return db.scalars(
        select(AccessAuditLog)
        .where(AccessAuditLog.company_id == current_user.company_id, AccessAuditLog.employee_id == employee.id)
        .order_by(AccessAuditLog.created_at.desc())
    ).all()


@router.get("/employees/{employee_id}/contract")
async def employee_contract(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    employee = _get_scoped_employee(db, employee_id, current_user)
    company = db.get(Company, current_user.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    ai_contract = await generate_contract_clauses(
        company.legal_name or company.name,
        {
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "job_title": employee.job_title,
            "employment_type": employee.employment_type,
            "department": employee.department,
            "branch": employee.branch,
            "salary": employee.salary,
        },
    )
    html_contract = render_contract_html(
        company,
        employee,
        ai_clauses=[str(clause) for clause in ai_contract.get("clauses", [])],
        provider=str(ai_contract.get("provider", "deepseek")),
    )
    filename = f"contrat-{employee.first_name.lower()}-{employee.last_name.lower()}.html"
    await create_document_record(
        db,
        title=f"Contrat de travail - {employee.first_name} {employee.last_name}",
        filename=filename,
        content=html_contract.encode("utf-8"),
        mime_type="text/html",
        current_user=current_user,
        source_module="rh_contracts",
        employee_id=employee.id,
        content_preview=html_contract[:3000],
    )
    return Response(
        content=html_contract,
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/products", response_model=list[ProductRead])
def list_products(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[Product]:
    return db.scalars(
        select(Product)
        .options(selectinload(Product.images))
        .where(Product.company_id == current_user.company_id)
        .order_by(Product.created_at.desc())
    ).all()


@router.post("/products", response_model=ProductRead, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Product:
    existing = db.scalar(select(Product).where(Product.sku == payload.sku))
    if existing:
        raise HTTPException(status_code=409, detail="Product SKU already exists")
    product = Product(**payload.model_dump(), company_id=current_user.company_id)
    product.price_cents = _accounting.to_cents(payload.price)
    db.add(product)
    db.flush()
    product.qr_code = product_qr_payload(current_user.company_id, product)
    product.qr_generated = True
    db.add(
        InventoryMovement(
            product_id=product.id,
            movement_type="in",
            quantity=product.stock_quantity,
            reason="Stock initial",
            reference=product.sku,
            company_id=current_user.company_id,
        )
    )
    db.commit()
    db.refresh(product)
    return product


@router.post("/products/{product_id}/qr-label")
def generate_qr_label(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    product = db.get(Product, product_id)
    if not product or product.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    product.qr_code = product_qr_payload(current_user.company_id, product)
    product.qr_generated = True
    db.commit()
    db.refresh(product)
    return {"product": ProductRead.model_validate(product), "label": label_preview(product)}


@router.get("/products/scan/{qr_token}", response_model=ProductRead)
def scan_product_qr(
    qr_token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Product:
    token = qr_token.strip()
    product: Product | None = None
    parts = token.split(":")
    if len(parts) >= 4 and parts[0] == "KOMPTA":
        try:
            product_id = int(parts[-1])
        except ValueError:
            product_id = 0
        if product_id:
            product = db.get(Product, product_id)
    if not product:
        product = db.scalar(
            select(Product).where(
                Product.company_id == current_user.company_id,
                or_(Product.qr_code == token, Product.sku == token),
            )
        )
    if not product or product.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Produit introuvable pour ce QR")
    return product


@router.post("/products/import-csv", status_code=201)
async def import_products_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import products from CSV. Expected columns: name, sku, category, price, stock_quantity, reorder_level, unit"""
    content = await file.read()
    text = content.decode("utf-8-sig")  # handle BOM
    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    errors = []
    for i, row in enumerate(reader, 1):
        try:
            name = row.get("name", "").strip()
            if not name:
                continue
            # Check if SKU already exists
            sku = row.get("sku", "").strip()
            if sku:
                existing = db.scalar(select(Product).where(Product.company_id == current_user.company_id, Product.sku == sku))
                if existing:
                    # Update stock instead
                    if row.get("stock_quantity"):
                        existing.stock_quantity = int(float(row["stock_quantity"]))
                    db.commit()
                    continue

            product = Product(
                company_id=current_user.company_id,
                name=name,
                sku=sku or str(uuid4())[:8].upper(),
                category=row.get("category", "").strip() or "Général",
                price=float(row.get("price", 0) or 0),
                stock_quantity=int(float(row.get("stock_quantity", 0) or 0)),
                reorder_level=int(float(row.get("reorder_level", 5) or 5)),
            )
            db.add(product)
            imported += 1
        except Exception as e:
            errors.append(f"Ligne {i}: {e}")

    db.commit()
    return {"imported": imported, "errors": errors}


@router.post("/employees/import-csv", status_code=201)
async def import_employees_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import employees from CSV. Expected: first_name, last_name, job_title, department, branch, salary, employment_type, phone, email"""
    if current_user.role not in {"admin_entreprise", "super_admin", "rh_entreprise"}:
        raise HTTPException(status_code=403, detail="Accès refusé")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    errors = []
    for i, row in enumerate(reader, 1):
        try:
            first_name = row.get("first_name", "").strip()
            last_name = row.get("last_name", "").strip()
            if not first_name or not last_name:
                continue

            employee = Employee(
                company_id=current_user.company_id,
                first_name=first_name,
                last_name=last_name,
                job_title=row.get("job_title", "").strip() or "Employé",
                department=row.get("department", "").strip() or "Général",
                branch=row.get("branch", "").strip() or "Siège",
                salary=float(row.get("salary", 0) or 0),
                employment_type=row.get("employment_type", "CDI").strip() or "CDI",
                phone=row.get("phone", "").strip() or "",
                email=row.get("email", "").strip() or None,
                account_status="draft",
                access_role="employe",
                payout_method="mobile_money",
            )
            db.add(employee)
            imported += 1
        except Exception as e:
            errors.append(f"Ligne {i}: {e}")

    db.commit()
    return {"imported": imported, "errors": errors}


@router.get("/inventory/movements")
def inventory_movements(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    movements = company_scope(db, current_user, InventoryMovement, InventoryMovement.created_at.desc())
    return [
        {
            "id": movement.id,
            "product_id": movement.product_id,
            "movement_type": movement.movement_type,
            "quantity": movement.quantity,
            "reason": movement.reason,
            "reference": movement.reference,
            "created_at": movement.created_at,
        }
        for movement in movements
    ]


@router.post("/inventory/movements", status_code=201)
def create_inventory_movement(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Crée un mouvement de stock manuel (entrée ou sortie) et met à jour la quantité du produit."""
    product_id = payload.get("product_id")
    movement_type = payload.get("movement_type", "in")  # "in" | "out"
    quantity = int(payload.get("quantity", 0))
    reason = payload.get("reason", "")
    reference = payload.get("reference", "")

    if not product_id or quantity <= 0:
        raise HTTPException(status_code=400, detail="product_id et quantity (> 0) sont requis")
    if movement_type not in ("in", "out"):
        raise HTTPException(status_code=400, detail="movement_type doit être 'in' ou 'out'")

    product = db.get(Product, product_id)
    if not product or product.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Produit introuvable")

    # Update stock
    if movement_type == "in":
        product.stock_quantity += quantity
    else:
        if product.stock_quantity < quantity:
            raise HTTPException(status_code=400, detail=f"Stock insuffisant ({product.stock_quantity} disponibles)")
        product.stock_quantity -= quantity

    movement = InventoryMovement(
        product_id=product_id,
        movement_type=movement_type,
        quantity=quantity,
        reason=reason,
        reference=reference,
        company_id=current_user.company_id,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    db.refresh(product)
    return {
        "id": movement.id,
        "product_id": movement.product_id,
        "movement_type": movement.movement_type,
        "quantity": movement.quantity,
        "reason": movement.reason,
        "reference": movement.reference,
        "created_at": movement.created_at,
        "new_stock": product.stock_quantity,
    }


@router.post("/pos/sales", status_code=201)
def create_sale(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not payload.items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    payment_method, payment_account = _resolve_payment_account(
        db,
        current_user,
        payment_method=payload.payment_method,
        payment_account_id=payload.payment_account_id,
        use_case="pos",
    )
    sale = Sale(
        receipt_number=_next_receipt_number(db, current_user.company_id),
        payment_method=payment_method,
        payment_account_id=payment_account.id if payment_account else None,
        payment_account_label=payment_account.label if payment_account else "",
        company_id=current_user.company_id,
    )
    total = 0.0
    db.add(sale)
    db.flush()
    response_items = []
    for item in payload.items:
        product = db.get(Product, item.product_id)
        if not product or product.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        # Décrément atomique anti-TOCTOU : l'UPDATE ne réussit que si le stock est
        # suffisant. Deux ventes simultanées ne peuvent plus passer le stock négatif.
        affected = db.execute(
            update(Product)
            .where(
                Product.id == product.id,
                Product.company_id == current_user.company_id,
                Product.stock_quantity >= item.quantity,
            )
            .values(stock_quantity=Product.stock_quantity - item.quantity)
        ).rowcount
        if not affected:
            raise HTTPException(status_code=409, detail=f"Stock insuffisant pour {product.name}")
        db.refresh(product)
        line_total = product.price * item.quantity
        total += line_total
        sale_item = SaleItem(
            sale_id=sale.id,
            product_id=product.id,
            product_name=product.name,
            quantity=item.quantity,
            unit_price=product.price,
            line_total=line_total,
        )
        movement = InventoryMovement(
            product_id=product.id,
            movement_type="out",
            quantity=item.quantity,
            reason="Vente POS",
            reference=sale.receipt_number,
            company_id=current_user.company_id,
        )
        sale_item.unit_price_cents = _accounting.to_cents(product.price)
        sale_item.line_total_cents = _accounting.to_cents(line_total)
        db.add_all([sale_item, movement])
        response_items.append({"product_id": product.id, "name": product.name, "quantity": item.quantity, "total": line_total})
    # ── Remise + TVA : recalcul EXACT, identique au POS ───────────────────────
    # Le client (caisse) charge : (sous-total − remise) + TVA. Le serveur doit
    # obtenir le MÊME montant au centime près, sinon le paiement carte/MoMo est
    # rejeté (montant ≠ total). Arrondi "half-up" pour matcher JS Math.round.
    import math as _math

    def _round_half_up(x: float) -> int:
        return int(_math.floor(float(x) + 0.5))

    subtotal = total
    discount_amount = _round_half_up(subtotal * (payload.discount_percent / 100.0)) if payload.discount_percent else 0
    after_discount = subtotal - discount_amount
    tax = _round_half_up(after_discount * (payload.tax_rate / 100.0)) if payload.tva_enabled else 0
    grand_total = after_discount + tax
    sale.total_amount = grand_total
    sale.total_amount_cents = _round_half_up(grand_total * 100)
    total = grand_total  # le reste de la fonction (transaction bancaire, réponse) utilise le total final

    if payload.payment_transaction_id is not None:
        payment_txn = db.get(PaymentTransaction, payload.payment_transaction_id)
        if not payment_txn or payment_txn.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Transaction de paiement introuvable")
        if payment_txn.status != "succeeded":
            raise HTTPException(status_code=409, detail="La transaction de paiement n'est pas confirmée")
        if payment_txn.sale_id is not None or payment_txn.invoice_id is not None:
            raise HTTPException(status_code=409, detail="Cette transaction est déjà rattachée")
        expected_provider = POS_PAYMENT_TRANSACTION_PROVIDERS.get(payment_method)
        if not expected_provider or payment_txn.provider != expected_provider:
            raise HTTPException(status_code=400, detail="Transaction incompatible avec le mode de paiement")
        if payment_txn.amount_cents != sale.total_amount_cents:
            raise HTTPException(status_code=400, detail="Montant de transaction différent du total de vente")
        payment_txn.sale_id = sale.id

    # ── Créer la transaction bancaire correspondante ──────────────────────
    _pref_pos = db.scalars(select(UserPreference).where(UserPreference.user_id == current_user.id)).first()
    _currency_pos = (_pref_pos.currency if _pref_pos and _pref_pos.currency else "XAF")
    _method_labels = {
        "cash": "Espèces", "card": "Carte bancaire", "mobile_money": "Mobile Money",
        "zola": "Zola QR", "bank": "Virement bancaire", "paypal": "PayPal",
        "wave": "Wave", "orange_money": "Orange Money", "mtn": "MTN MoMo", "airtel": "Airtel Money",
    }
    _item_summary = ", ".join(f"{i['quantity']}× {i['name']}" for i in response_items[:3])
    if len(response_items) > 3:
        _item_summary += f" (+{len(response_items) - 3})"
    _account_label = payment_account.label if payment_account else _method_labels.get(payment_method, payment_method)
    pos_txn = BankTransaction(
        company_id=current_user.company_id,
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        label=f"Vente {sale.receipt_number} — {_item_summary} ({_account_label})",
        amount=float(total),
        credit=float(total),
        currency=_currency_pos,
        category="ventes",
        reference=sale.receipt_number,
        source_type="pos",
        status="confirmed",
    )
    db.add(pos_txn)
    # ── Écriture comptable automatique (partie double) ──
    try:
        company = db.get(Company, current_user.company_id)
        _accounting.record_sale(
            db, company, sale_id=sale.id, total=total,
            payment_method=payment_method, tax_amount=0.0, user_id=current_user.id,
        )
    except Exception:  # une vente ne doit jamais échouer à cause de la compta
        logging.getLogger("kompta").exception("Échec écriture comptable vente #%s", sale.id)
    db.commit()
    db.refresh(sale)
    return {
        "id": sale.id,
        "receipt_number": sale.receipt_number,
        "payment_method": sale.payment_method,
        "payment_account_id": sale.payment_account_id,
        "payment_account_label": sale.payment_account_label,
        "status": sale.status,
        "total_amount": sale.total_amount,
        "items": response_items,
        "transaction_id": pos_txn.id,
    }


@router.get("/pos/sales")
def list_sales(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 50,
) -> list[dict]:
    from sqlalchemy.orm import selectinload as _sil
    sales = db.scalars(
        select(Sale)
        .options(_sil(Sale.items))
        .where(Sale.company_id == current_user.company_id)
        .order_by(Sale.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": s.id,
            "receipt_number": s.receipt_number,
            "payment_method": s.payment_method,
            "payment_account_id": s.payment_account_id,
            "payment_account_label": s.payment_account_label,
            "total_amount": s.total_amount,
            "status": s.status,
            "created_at": s.created_at,
            "items": [
                {
                    "product_name": it.product_name,
                    "quantity": it.quantity,
                    "unit_price": it.unit_price,
                    "line_total": it.line_total,
                }
                for it in s.items
            ],
        }
        for s in sales
    ]


@router.get("/invoices", response_model=list[InvoiceRead])
def list_invoices(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[Invoice]:
    return db.scalars(
        select(Invoice)
        .options(selectinload(Invoice.lines))
        .where(Invoice.company_id == current_user.company_id)
        .order_by(Invoice.created_at.desc())
    ).all()


@router.post("/invoices", response_model=InvoiceRead, status_code=201)
def create_invoice(
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Invoice:
    invoice = Invoice(
        number=_next_invoice_number(db, current_user.company_id),
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        status=payload.status,
        due_date=payload.due_date,
        company_id=current_user.company_id,
    )
    subtotal = 0.0   # HT
    tax_total = 0.0  # TVA
    for line in payload.lines:
        line_ht = round(line.quantity * line.unit_price, 2)
        line_tax = round(line_ht * (line.tax_rate / 100.0), 2)
        subtotal += line_ht
        tax_total += line_tax
        invoice.lines.append(
            InvoiceLine(
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
                unit_price_cents=_accounting.to_cents(line.unit_price),
                tax_rate=line.tax_rate,
                total=line_ht,
                total_cents=_accounting.to_cents(line_ht),
            )
        )
    invoice.subtotal = round(subtotal, 2)
    invoice.tax_amount = round(tax_total, 2)
    invoice.total_amount = round(subtotal + tax_total, 2)
    # Valeurs exactes en centimes (source de vérité monétaire)
    invoice.subtotal_cents = _accounting.to_cents(subtotal)
    invoice.tax_amount_cents = _accounting.to_cents(tax_total)
    invoice.total_amount_cents = _accounting.to_cents(subtotal + tax_total)
    # ── Workflow d'approbation : seuil entreprise > 0 ET total ≥ seuil → pending
    company = db.get(Company, current_user.company_id)
    threshold = int(getattr(company, "invoice_approval_threshold_cents", 0) or 0)
    if threshold > 0 and invoice.total_amount_cents >= threshold:
        invoice.approval_status = "pending"
    else:
        invoice.approval_status = "not_required"
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.patch("/invoices/{invoice_id}", response_model=InvoiceRead)
def update_invoice(
    invoice_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Invoice:
    invoice = db.get(Invoice, invoice_id)
    if not invoice or invoice.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    # Immutabilité comptable : une facture payée ne peut plus être modifiée.
    # Pour corriger, il faut émettre un avoir (note de crédit).
    if invoice.status == "paid":
        raise HTTPException(
            status_code=409,
            detail="Facture payée : non modifiable. Émettez un avoir pour corriger.",
        )
    # C4 — Bloquer toute tentative de marquer une facture payée via PATCH.
    # Le paiement doit passer par /invoices/{id}/pay (transactionnel + comptable).
    if "status" in payload and payload["status"] == "paid":
        raise HTTPException(
            status_code=422,
            detail="Impossible de marquer une facture payée via PATCH. "
                   "Utilisez l'endpoint POST /invoices/{id}/pay avec le montant et la méthode de paiement.",
        )
    allowed_fields = {"customer_name", "customer_email", "due_date", "notes"}
    for field, value in payload.items():
        if field in allowed_fields:
            setattr(invoice, field, value)
    # Une facture rejetée peut être re-soumise après édition → repasse en pending.
    if invoice.approval_status == "rejected":
        invoice.approval_status = "pending"
        invoice.rejection_reason = ""
        invoice.approved_by_user_id = None
        invoice.approved_at = None
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/invoices/{invoice_id}/credit-note", response_model=InvoiceRead, status_code=201)
def create_credit_note(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Invoice:
    """Émet un avoir (note de crédit) : nouvelle pièce miroir à montants négatifs
    référençant la facture d'origine. La facture d'origine reste immuable."""
    origin = db.get(Invoice, invoice_id)
    if not origin or origin.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    credit = Invoice(
        number=_next_invoice_number(db, current_user.company_id),
        customer_name=origin.customer_name,
        customer_email=origin.customer_email,
        status="credit_note",
        due_date=origin.due_date,
        company_id=current_user.company_id,
    )
    subtotal = 0.0
    tax_total = 0.0
    for line in origin.lines:
        rate = getattr(line, "tax_rate", 18.0) or 0.0
        neg_ht = -abs(line.total)
        neg_tax = round(neg_ht * (rate / 100.0), 2)
        subtotal += neg_ht
        tax_total += neg_tax
        credit.lines.append(
            InvoiceLine(
                description=f"Avoir s/ {origin.number} — {line.description}",
                quantity=line.quantity,
                unit_price=-abs(line.unit_price),
                tax_rate=rate,
                total=neg_ht,
            )
        )
    credit.subtotal = round(subtotal, 2)
    credit.tax_amount = round(tax_total, 2)
    credit.total_amount = round(subtotal + tax_total, 2)
    # Centimes — source de vérité monétaire (symétrique avec create_invoice)
    credit.subtotal_cents = _accounting.to_cents(subtotal)
    credit.tax_amount_cents = _accounting.to_cents(tax_total)
    credit.total_amount_cents = _accounting.to_cents(subtotal + tax_total)
    db.add(credit)
    db.commit()
    db.refresh(credit)
    return credit


@router.post("/invoices/{invoice_id}/pay", response_model=InvoiceRead)
def pay_invoice(
    invoice_id: int,
    payload: InvoicePaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Invoice:
    invoice = db.get(Invoice, invoice_id)
    if not invoice or invoice.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status == "paid":
        return invoice
    # Workflow d'approbation : pending/rejected → paiement interdit.
    if invoice.approval_status in {"pending", "rejected"}:
        raise HTTPException(
            status_code=409,
            detail=f"Facture en attente d'approbation ({invoice.approval_status}) : paiement bloqué.",
        )
    payment_method, payment_account = _resolve_payment_account(
        db,
        current_user,
        payment_method=payload.payment_method,
        payment_account_id=payload.payment_account_id,
        use_case="pos",
    )
    invoice.status = "paid"
    invoice.payment_method = payment_method
    invoice.payment_account_id = payment_account.id if payment_account else None
    invoice.payment_account_label = payment_account.label if payment_account else ""
    invoice.paid_at = datetime.now(timezone.utc)

    # Récupérer la devise de l'entreprise
    _pref = db.scalars(select(UserPreference).where(UserPreference.user_id == current_user.id)).first()
    _currency = (_pref.currency if _pref and _pref.currency else "XAF")

    # Créer une transaction bancaire correspondante
    method_labels = {
        "cash": "Espèces", "card": "Carte bancaire", "mobile_money": "Mobile Money",
        "zola": "Zola QR", "bank": "Virement bancaire", "paypal": "PayPal",
    }
    txn_label_parts = [f"Facture {invoice.number}"]
    if invoice.customer_name:
        txn_label_parts.append(invoice.customer_name)
    account_part = payment_account.label if payment_account else method_labels.get(payment_method, payment_method)
    txn_label_parts.append(f"({account_part})")
    txn = BankTransaction(
        company_id=current_user.company_id,
        date=invoice.paid_at.strftime("%Y-%m-%d"),
        label=" — ".join(txn_label_parts),
        amount=float(invoice.total_amount or 0),
        credit=float(invoice.total_amount or 0),
        currency=_currency,
        category="ventes",
        counterpart=invoice.customer_name or "",
        reference=invoice.number,
        source_type="facture",
        status="confirmed",
    )
    db.add(txn)
    # ── Écriture comptable automatique : Dr Trésorerie / Cr Clients ──
    try:
        company = db.get(Company, current_user.company_id)
        _accounting.record_invoice_payment(
            db, company, invoice_id=invoice.id, total=float(invoice.total_amount or 0),
            payment_method=payment_method, user_id=current_user.id,
        )
    except Exception:
        logging.getLogger("kompta").exception("Échec écriture comptable règlement facture #%s", invoice.id)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/invoices/pending-approval", response_model=list[InvoiceRead])
def list_invoices_pending_approval(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Invoice]:
    """Factures de la société en attente d'approbation N+1."""
    return db.scalars(
        select(Invoice)
        .options(selectinload(Invoice.lines))
        .where(
            Invoice.company_id == current_user.company_id,
            Invoice.approval_status == "pending",
        )
        .order_by(Invoice.created_at.desc())
    ).all()


def _can_approve_invoices(user: User) -> bool:
    """Seuls super_admin et admin_entreprise peuvent approuver/rejeter."""
    return user.role in {"super_admin", "admin_entreprise"}


@router.post("/invoices/{invoice_id}/approve", response_model=InvoiceRead)
def approve_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Invoice:
    if not _can_approve_invoices(current_user):
        raise HTTPException(status_code=403, detail="Seul un admin entreprise peut approuver une facture.")
    invoice = db.get(Invoice, invoice_id)
    if not invoice or invoice.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.approval_status not in {"pending", "rejected"}:
        raise HTTPException(
            status_code=409,
            detail=f"Facture non approuvable dans l'état '{invoice.approval_status}'.",
        )
    invoice.approval_status = "approved"
    invoice.approved_by_user_id = current_user.id
    invoice.approved_at = datetime.now(timezone.utc)
    invoice.rejection_reason = ""
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/invoices/{invoice_id}/reject", response_model=InvoiceRead)
def reject_invoice(
    invoice_id: int,
    payload: InvoiceRejectPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Invoice:
    if not _can_approve_invoices(current_user):
        raise HTTPException(status_code=403, detail="Seul un admin entreprise peut rejeter une facture.")
    invoice = db.get(Invoice, invoice_id)
    if not invoice or invoice.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.approval_status not in {"pending", "approved"}:
        raise HTTPException(
            status_code=409,
            detail=f"Facture non rejetable dans l'état '{invoice.approval_status}'.",
        )
    invoice.approval_status = "rejected"
    invoice.rejection_reason = payload.reason.strip()
    invoice.approved_by_user_id = current_user.id
    invoice.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/invoices/{invoice_id}/relance")
def relance_invoice(
    invoice_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    invoice = db.get(Invoice, invoice_id)
    if not invoice or invoice.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice.last_relance_at = datetime.now(timezone.utc)
    invoice.relance_count = (invoice.relance_count or 0) + 1
    db.commit()
    db.refresh(invoice)

    # Envoi email en arrière-plan si le client a un email
    customer_email = invoice.customer_email
    if customer_email:
        company = db.get(Company, invoice.company_id)
        company_name = company.name if company else "KOMPTA"
        due_date_str = invoice.due_date.strftime("%d/%m/%Y") if invoice.due_date else "N/A"
        background_tasks.add_task(
            send_relance_email,
            to=customer_email,
            client_name=invoice.customer_name,
            invoice_number=invoice.number,
            invoice_amount=invoice.total_amount,
            due_date=due_date_str,
            company_name=company_name,
            relance_count=invoice.relance_count,
        )
    else:
        logger.info(f"[RELANCE] Invoice {invoice.number}: pas d'email client, envoi ignoré")

    return {
        "message": "Relance envoyée",
        "relance_count": invoice.relance_count,
        "last_relance_at": invoice.last_relance_at.isoformat() if invoice.last_relance_at else None,
    }


@router.get("/tasks", response_model=list[TaskRead])
def list_tasks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    subjects, _ = _task_subjects_for_user(db, current_user)
    tasks = company_scope(db, current_user, Task, Task.created_at.desc())
    return [_serialize_task(db, task, current_user, subjects) for task in tasks]


@router.post("/tasks", response_model=TaskRead, status_code=201)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    data = payload.model_dump()
    subjects, employee = _task_subjects_for_user(db, current_user)
    if not _can_manage_tasks(current_user):
        if not data.get("assignee_name"):
            data["assignee_name"] = _employee_display_name(employee, current_user)
        if _normalize_task_actor(data["assignee_name"]) not in subjects:
            raise HTTPException(status_code=403, detail="Vous ne pouvez creer que des taches assignees a vous-meme")
    task = Task(**data, company_id=current_user.company_id)
    db.add(task)
    db.flush()
    audit_access(
        db,
        actor=current_user,
        company_id=current_user.company_id,
        action="task_created",
        employee=_task_assignee_employee(db, task),
        target_user=current_user,
        details=json.dumps(
            {"task_id": task.id, "title": task.title, "assignee_name": task.assignee_name, "source": task.source},
            ensure_ascii=False,
        ),
    )
    db.commit()
    db.refresh(task)
    return _serialize_task(db, task, current_user, subjects)


@router.patch("/tasks/{task_id}", response_model=TaskRead)
def update_task(
    task_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    task = db.get(Task, task_id)
    if not task or task.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Task not found")
    subjects, _ = _task_subjects_for_user(db, current_user)
    is_manager = _can_manage_tasks(current_user)
    assigned_to_me = _task_assigned_to_user(task, subjects)
    if not is_manager and not assigned_to_me:
        raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que les taches qui vous sont assignees")

    allowed_fields = {"status", "title", "description", "priority", "assignee_name", "due_date", "due_time", "proof_required", "source"} if is_manager else {"status"}
    blocked_fields = [field for field in payload if field not in allowed_fields]
    if blocked_fields:
        raise HTTPException(status_code=403, detail="Modification non autorisee pour ce profil")
    changes = {}
    for field, value in payload.items():
        if field in allowed_fields:
            if field == "due_date" and isinstance(value, str):
                value = date.fromisoformat(value) if value else None
            old_value = getattr(task, field)
            if old_value != value:
                changes[field] = {"old": str(old_value), "new": str(value)}
            setattr(task, field, value)
    if changes:
        audit_access(
            db,
            actor=current_user,
            company_id=current_user.company_id,
            action="task_updated",
            employee=_task_assignee_employee(db, task),
            target_user=current_user,
            details=json.dumps({"task_id": task.id, "title": task.title, "changes": changes}, ensure_ascii=False),
        )
    db.commit()
    db.refresh(task)
    return _serialize_task(db, task, current_user, subjects)


@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not _can_manage_tasks(current_user):
        raise HTTPException(status_code=403, detail="Seuls admin, DG et RH peuvent supprimer une tache")
    task = db.get(Task, task_id)
    if not task or task.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Task not found")
    assignee_employee = _task_assignee_employee(db, task)
    task_snapshot = {
        "task_id": task.id,
        "title": task.title,
        "status": task.status,
        "priority": task.priority,
        "assignee_name": task.assignee_name,
        "source": task.source,
    }
    audit_access(
        db,
        actor=current_user,
        company_id=current_user.company_id,
        action="task_deleted",
        employee=assignee_employee,
        target_user=current_user,
        details=json.dumps(task_snapshot, ensure_ascii=False),
    )
    db.delete(task)
    db.commit()
    return {"status": "deleted", "task": task_snapshot}


@router.post("/tasks/{task_id}/proof", response_model=TaskRead)
async def upload_task_proof(
    task_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    task = db.get(Task, task_id)
    if not task or task.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Task not found")
    subjects, _ = _task_subjects_for_user(db, current_user)
    is_manager = _can_manage_tasks(current_user)
    assigned_to_me = _task_assigned_to_user(task, subjects)
    if not is_manager and not assigned_to_me:
        raise HTTPException(status_code=403, detail="Vous ne pouvez déposer une preuve que pour vos propres tâches")
    allowed_types = {
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "video/mp4", "video/quicktime", "video/webm", "video/mpeg",
        "application/pdf",
    }
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Type de fichier non supporté (image, vidéo ou PDF uniquement)")
    max_size = 50 * 1024 * 1024  # 50 MB
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="Fichier trop lourd (max 50 Mo)")
    ext = Path(file.filename or "proof").suffix or ".bin"
    upload_dir = Path("storage/task_proofs")
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{current_user.company_id}-{task_id}-{uuid4().hex[:12]}{ext}"
    dest = upload_dir / filename
    dest.write_bytes(content)
    task.proof_url = f"/storage/task_proofs/{filename}"
    if task.status == "doing":
        task.status = "done"
    db.commit()
    db.refresh(task)
    return _serialize_task(db, task, current_user, subjects)


@router.delete("/products/{product_id}", status_code=204)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    product = db.get(Product, product_id)
    if not product or product.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return Response(status_code=204)


@router.patch("/products/{product_id}", response_model=ProductRead)
def update_product(
    product_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Product:
    product = db.get(Product, product_id)
    if not product or product.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    allowed_fields = {"name", "price", "stock_quantity", "reorder_level", "category", "brand", "variant"}
    for field, value in payload.items():
        if field in allowed_fields:
            setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


@router.post("/products/{product_id}/images", response_model=ProductRead)
async def upload_product_images(
    product_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Product:
    product = db.scalar(
        select(Product).options(selectinload(Product.images)).where(Product.id == product_id)
    )
    if not product or product.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if not files:
        raise HTTPException(status_code=400, detail="No image uploaded")

    upload_dir = Path("storage/products")
    upload_dir.mkdir(parents=True, exist_ok=True)
    existing_count = len(product.images)
    for index, file in enumerate(files):
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"{file.filename or 'file'} is not an image")
        safe_name = Path(file.filename or "product-image").name.replace(" ", "-").lower()
        storage_path = upload_dir / f"{current_user.company_id}-{product.id}-{uuid4().hex[:12]}-{safe_name}"
        content = await file.read()
        storage_path.write_bytes(content)
        db.add(
            ProductImage(
                product_id=product.id,
                filename=file.filename or safe_name,
                storage_path=str(storage_path),
                mime_type=file.content_type,
                is_primary=existing_count == 0 and index == 0,
                sort_order=existing_count + index,
                company_id=current_user.company_id,
            )
        )
    db.commit()
    return db.scalar(
        select(Product).options(selectinload(Product.images)).where(Product.id == product_id)
    )


@router.get("/chat/channels", response_model=list[ChatChannelRead])
def list_channels(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[ChatChannel]:
    return company_scope(db, current_user, ChatChannel, ChatChannel.created_at.asc())


@router.post("/chat/channels", response_model=ChatChannelRead, status_code=201)
def create_channel(
    payload: ChatChannelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatChannel:
    cleaned_name = "-".join(payload.name.strip().lower().split())
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="Channel name is required")
    existing = db.scalar(
        select(ChatChannel).where(
            ChatChannel.company_id == current_user.company_id,
            func.lower(ChatChannel.name) == cleaned_name.lower(),
        )
    )
    if existing:
        return existing
    channel = ChatChannel(
        name=cleaned_name,
        topic=payload.topic.strip(),
        company_id=current_user.company_id,
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)
    return channel


@router.get("/chat/channels/{channel_id}/detail", response_model=ChatChannelDetail)
def channel_detail(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    channel = db.get(ChatChannel, channel_id)
    if not channel or channel.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Channel not found")

    employees = db.scalars(
        select(Employee)
        .where(Employee.company_id == current_user.company_id, Employee.status == "active")
        .order_by(Employee.first_name.asc(), Employee.last_name.asc())
    ).all()
    users = db.scalars(
        select(User)
        .where(User.company_id == current_user.company_id, User.is_active.is_(True))
        .order_by(User.full_name.asc())
    ).all()

    members = [
        {
            "id": employee.id,
            "name": f"{employee.first_name} {employee.last_name}".strip(),
            "role": employee.job_title,
            "department": employee.department,
            "branch": employee.branch,
            "avatar": employee.badge_color,
            "status": employee.account_status,
        }
        for employee in employees[:12]
    ]
    if not members:
        members = [
            {
                "id": user.id,
                "name": user.full_name,
                "role": user.role,
                "department": user.department,
                "branch": user.branch,
                "avatar": "",
                "status": user.account_status,
            }
            for user in users[:12]
        ]

    linked_tasks = db.scalars(
        select(Task)
        .where(Task.company_id == current_user.company_id, Task.status != "done")
        .order_by(Task.created_at.desc())
        .limit(4)
    ).all()
    online_count = min(len(members), len([user for user in users if user.account_status == "active"]))
    return {
        "channel": channel,
        "members": members,
        "tasks": linked_tasks,
        "member_count": len(members),
        "online_count": online_count,
    }


@router.get("/chat/channels/{channel_id}/messages", response_model=list[MessageRead])
def list_messages(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Message]:
    channel = db.get(ChatChannel, channel_id)
    if not channel or channel.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    return db.scalars(
        select(Message)
        .where(Message.channel_id == channel_id)
        .options(selectinload(Message.author))
        .order_by(Message.created_at.asc())
    ).all()


@router.post("/chat/channels/{channel_id}/messages", response_model=MessageRead, status_code=201)
async def post_message(
    channel_id: int,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Message:
    channel = db.get(ChatChannel, channel_id)
    if not channel or channel.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    import json as _json
    action = chat_ai_action(payload.body)
    message = Message(
        channel_id=channel_id,
        author_id=current_user.id,
        body=payload.body,
        mentions=extract_mentions(payload.body),
        ai_suggestion=action["title"] if action["detected"] else "Aucune action critique detectee, message archive dans le contexte entreprise.",
        ai_action_json=_json.dumps(action, ensure_ascii=False) if action["detected"] else "",
        company_id=current_user.company_id,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    db.refresh(message, attribute_names=["author"])
    await manager.broadcast(channel_id, {
        "type": "message",
        "body": message.body,
        "author": current_user.full_name,
        "has_action": action["detected"],
    })
    return MessageRead.from_orm_with_action(message)


@router.post("/chat/messages/{message_id}/quick-task", response_model=TaskRead, status_code=201)
def quick_task_from_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Crée une tâche directement depuis l'action détectée dans un message de chat.
    Utilise les données structurées ai_action_json — pas de modal côté frontend.
    """
    import json as _json
    from datetime import date as _date

    msg = db.get(Message, message_id)
    if not msg or msg.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Message introuvable")

    # Charger l'action structurée
    action: dict = {}
    if msg.ai_action_json:
        try:
            action = _json.loads(msg.ai_action_json)
        except Exception:
            pass

    if not action or not action.get("detected"):
        raise HTTPException(status_code=422, detail="Aucune action Limule détectée dans ce message")

    # Convertir la date si présente
    due = None
    if action.get("due_date"):
        try:
            due = _date.fromisoformat(action["due_date"])
        except ValueError:
            pass

    task = Task(
        title=action.get("title") or msg.body[:120],
        description=action.get("description") or msg.body[:500],
        priority=action.get("priority", "normal"),
        due_date=due,
        due_time=action.get("due_time"),
        assignee_name=action.get("assignee") or current_user.full_name,
        source=f"chat:message:{message_id}:limule",
        status="todo",
        proof_required=False,
        company_id=current_user.company_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # Audit
    db.add(AuditLog(
        actor=current_user.full_name,
        action="task.created_from_chat",
        employee=action.get("assignee") or "",
        details=f"Tâche '{task.title}' créée depuis message #{message_id} (confiance {action.get('confidence', 0):.0%})",
        company_id=current_user.company_id,
    ))
    db.commit()
    return {
        "id": task.id, "title": task.title, "status": task.status,
        "priority": task.priority, "due_date": task.due_date,
        "assignee_name": task.assignee_name, "source": task.source,
        "description": task.description, "proof_required": task.proof_required,
        "created_at": task.created_at, "updated_at": task.updated_at,
        "due_time": task.due_time, "proof_url": None, "company_id": task.company_id,
        "assigned_to_me": False, "can_update": True, "can_delete": False,
    }


@router.websocket("/ws/chat/{channel_id}")
async def chat_websocket(websocket: WebSocket, channel_id: int, token: str = ""):
    with SessionLocal() as db:
        user = _user_from_realtime_ticket(db, token)
        if not user:
            await websocket.close(code=4001)
            return
        channel = db.get(ChatChannel, channel_id)
        if not channel or channel.company_id != user.company_id:
            await websocket.close(code=4003)
            return
    await manager.connect(channel_id, websocket)
    try:
        while True:
            payload = await websocket.receive_json()
            await manager.broadcast(channel_id, {"type": "ephemeral", "channel_id": channel_id, **payload})
    except WebSocketDisconnect:
        manager.disconnect(channel_id, websocket)


@router.websocket("/ws/notifications/{company_id}")
async def notifications_websocket(websocket: WebSocket, company_id: int, token: str = ""):
    with SessionLocal() as db:
        user = _user_from_realtime_ticket(db, token)
        if not user:
            await websocket.close(code=4001)
            return
        if user.company_id != company_id:
            await websocket.close(code=4003)
            return
    await notifier.connect(company_id, websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive ping
    except WebSocketDisconnect:
        notifier.disconnect(company_id, websocket)


@router.get("/payroll/runs", response_model=list[PayrollRunRead])
def list_payroll_runs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[PayrollRun]:
    _require_hr(current_user)
    return db.scalars(
        select(PayrollRun)
        .options(selectinload(PayrollRun.payslips))
        .where(PayrollRun.company_id == current_user.company_id)
        .order_by(PayrollRun.created_at.desc())
    ).all()


# ── Barème social & fiscal (Congo / CEMAC, paramétrable) ───────────────────
# Cotisation CNSS part salariale (~4 %). La part patronale (~à 8 %) est calculée
# pour information mais ne réduit pas le net du salarié.
CNSS_EMPLOYEE_RATE = 0.04
CNSS_EMPLOYER_RATE = 0.08
# Barème IRPP progressif par tranches mensuelles (XAF) — valeurs indicatives.
IRPP_BRACKETS = [
    (0, 0.00),
    (464_000, 0.01),
    (1_000_000, 0.10),
    (3_000_000, 0.25),
    (8_000_000, 0.40),
]


def _compute_irpp(taxable: float) -> float:
    """IRPP progressif : chaque tranche n'est taxée que sur sa fraction."""
    tax = 0.0
    for index, (floor, rate) in enumerate(IRPP_BRACKETS):
        if taxable <= floor:
            break
        ceiling = IRPP_BRACKETS[index + 1][0] if index + 1 < len(IRPP_BRACKETS) else float("inf")
        portion = min(taxable, ceiling) - floor
        if portion > 0:
            tax += portion * rate
    return round(tax, 2)


def _compute_payslip_amounts(gross: float) -> dict[str, float]:
    """Décompose un brut en cotisations + IRPP + net (au lieu d'un forfait 10 %)."""
    cnss_employee = round(gross * CNSS_EMPLOYEE_RATE, 2)
    taxable = max(gross - cnss_employee, 0.0)
    irpp = _compute_irpp(taxable)
    cnss_employer = round(gross * CNSS_EMPLOYER_RATE, 2)
    deductions = round(cnss_employee + irpp, 2)
    net = round(gross - deductions, 2)
    return {
        "cnss_employee": cnss_employee,
        "cnss_employer": cnss_employer,
        "irpp": irpp,
        "deductions": deductions,
        "net": net,
    }


@router.post("/payroll/runs", response_model=PayrollRunRead, status_code=201)
def create_payroll_run(
    payload: PayrollRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PayrollRun:
    _require_hr(current_user)
    # Idempotence : une seule paie validée par période et par société (évite les doublons / double-paiement).
    existing_run = db.scalar(
        select(PayrollRun).where(
            PayrollRun.company_id == current_user.company_id,
            PayrollRun.period == payload.period,
        )
    )
    if existing_run:
        raise HTTPException(
            status_code=409,
            detail=f"Une paie existe déjà pour la période {payload.period}.",
        )
    employees = db.scalars(select(Employee).where(Employee.company_id == current_user.company_id, Employee.status == "active")).all()
    payment_account: PaymentAccount | None = None
    if payload.payment_account_id:
        payment_account = _get_payment_account(db, payload.payment_account_id, current_user)
        if not payment_account.enabled or not payment_account.use_for_payroll:
            raise HTTPException(status_code=400, detail="Ce compte n'est pas active pour la paie")
    else:
        payment_account = _default_payment_account(db, current_user.company_id, use_case="payroll")
    run = PayrollRun(
        period=payload.period,
        status="validated",
        payment_account_id=payment_account.id if payment_account else None,
        payment_account_label=payment_account.label if payment_account else "",
        company_id=current_user.company_id,
    )
    # Build a quick lookup for overrides
    overrides_map: dict[int, EmployeePayrollOverride] = {o.employee_id: o for o in (payload.overrides or [])}

    gross_total = 0.0
    net_total = 0.0
    WORKING_DAYS = 26      # jours ouvrés par mois
    WORKING_HOURS = 173    # heures mensuelles standard
    OVERTIME_RATE = 1.5    # coefficient heures sup

    for index, employee in enumerate(employees, start=1):
        override = overrides_map.get(employee.id)
        base = employee.salary or 0.0

        # Variable components
        overtime_pay = 0.0
        bonus = 0.0
        absence_deduction = 0.0
        if override:
            if override.overtime_hours > 0:
                hourly = base / WORKING_HOURS
                overtime_pay = round(hourly * override.overtime_hours * OVERTIME_RATE, 2)
            if override.bonus > 0:
                bonus = round(override.bonus, 2)
            if override.absence_days > 0:
                daily = base / WORKING_DAYS
                absence_deduction = round(daily * override.absence_days, 2)

        gross = round(base + overtime_pay + bonus - absence_deduction, 2)
        amounts = _compute_payslip_amounts(gross)   # CNSS salarié + IRPP progressif
        deductions = amounts["deductions"]
        net_pay = amounts["net"]
        gross_total += gross
        net_total += net_pay

        payout_method = employee.payout_method or (payment_account.provider if payment_account else "mobile_money")
        if payout_method in {"mobile_money", "zola"}:
            payout_destination = employee.payout_phone or employee.phone
        elif payout_method == "bank":
            bank = employee.payout_bank_name or "Banque"
            payout_destination = f"{bank} · {_mask_identifier(employee.payout_account_number)}".strip(" ·")
        elif payout_method == "paypal":
            payout_destination = _mask_identifier(employee.payout_paypal_email)
        else:
            payout_destination = ""
        run.payslips.append(
            Payslip(
                employee_id=employee.id,
                employee_name=f"{employee.first_name} {employee.last_name}",
                gross_pay=gross,
                gross_pay_cents=_accounting.to_cents(gross),
                deductions=deductions,
                deductions_cents=_accounting.to_cents(deductions),
                net_pay=net_pay,
                net_pay_cents=_accounting.to_cents(net_pay),
                bonus=bonus,
                bonus_cents=_accounting.to_cents(bonus),
                overtime_pay=overtime_pay,
                overtime_pay_cents=_accounting.to_cents(overtime_pay),
                absence_deduction=absence_deduction,
                absence_deduction_cents=_accounting.to_cents(absence_deduction),
                reference=payslip_reference(payload.period, employee, index),
                payout_method=payout_method,
                payout_destination=payout_destination,
                payout_status="ready" if payout_destination else "missing_destination",
            )
        )
    run.gross_total = round(gross_total, 2)
    run.net_total = round(net_total, 2)
    run.gross_total_cents = _accounting.to_cents(gross_total)
    run.net_total_cents = _accounting.to_cents(net_total)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


@router.get("/reports/overview")
def reports_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    branch: str | None = None,
) -> dict:
    company = db.get(Company, current_user.company_id)
    emp_filter = [Employee.company_id == current_user.company_id]
    if branch:
        emp_filter.append(Employee.branch == branch)
    employees = db.scalar(select(func.count()).select_from(Employee).where(*emp_filter)) or 0
    products = db.scalars(select(Product).where(Product.company_id == current_user.company_id)).all()
    invoice_filter = [Invoice.company_id == current_user.company_id]
    sale_filter = [Sale.company_id == current_user.company_id]
    invoices_total   = db.scalar(select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(*invoice_filter)) or 0
    invoices_paid    = db.scalar(select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(
        Invoice.company_id == current_user.company_id, Invoice.status == "paid")) or 0
    invoices_pending = db.scalar(select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(
        Invoice.company_id == current_user.company_id, Invoice.status.in_(["sent", "overdue"]))) or 0
    invoices_paid_count = db.scalar(select(func.count()).select_from(Invoice).where(
        Invoice.company_id == current_user.company_id, Invoice.status == "paid")) or 0
    sales_total = db.scalar(select(func.coalesce(func.sum(Sale.total_amount), 0)).where(*sale_filter)) or 0
    open_tasks = db.scalar(select(func.count()).select_from(Task).where(Task.company_id == current_user.company_id, Task.status != "done")) or 0
    low_stock = [product for product in products if product.stock_quantity <= product.reorder_level]
    branches = sorted({e.branch for e in db.scalars(select(Employee).where(Employee.company_id == current_user.company_id)).all() if e.branch})

    # ── Bank transactions: real treasury balance ─────────────────────────────
    tx_rows = db.scalars(
        select(BankTransaction).where(BankTransaction.company_id == current_user.company_id)
    ).all()
    tx_credits = sum(r.credit if r.credit is not None else max(r.amount, 0) for r in tx_rows)
    tx_debits  = sum(r.debit  if r.debit  is not None else max(-r.amount, 0) for r in tx_rows)
    tx_balance = round(tx_credits - tx_debits, 2)
    # Transactions from invoices only (source_type = "facture")
    tx_invoice_rows = [r for r in tx_rows if r.source_type == "facture"]
    tx_invoice_total = round(sum(r.credit if r.credit is not None else max(r.amount, 0) for r in tx_invoice_rows), 2)
    # Monthly average of last 3 months (for treasury prediction)
    from datetime import date as _date, timedelta as _td
    cutoff = (_date.today() - _td(days=90)).isoformat()
    tx_recent = [r for r in tx_rows if r.date >= cutoff]
    tx_monthly_in  = round(sum(r.credit if r.credit is not None else max(r.amount, 0) for r in tx_recent) / 3, 2)
    tx_monthly_out = round(sum(r.debit  if r.debit  is not None else max(-r.amount, 0) for r in tx_recent) / 3, 2)

    return {
        "company": company.name if company else "KOMPTA",
        "branch": branch,
        "branches": branches,
        "kpis": {
            "employees": employees,
            "products": len(products),
            "invoices_total":       round(invoices_total, 2),
            "invoices_paid":        round(invoices_paid, 2),
            "invoices_pending":     round(invoices_pending, 2),
            "invoices_paid_count":  invoices_paid_count,
            "sales_total":          round(sales_total, 2),
            "open_tasks":           open_tasks,
            "teras_score":          company.teras_score if company else 0,
            # Real bank data from BankTransaction
            "tx_count":             len(tx_rows),
            "tx_credits":           round(tx_credits, 2),
            "tx_debits":            round(tx_debits, 2),
            "tx_balance":           tx_balance,
            "tx_monthly_in":        tx_monthly_in,
            "tx_monthly_out":       tx_monthly_out,
            "tx_invoice_total":     tx_invoice_total,
        },
        "low_stock": [{"id": item.id, "name": item.name, "stock_quantity": item.stock_quantity} for item in low_stock],
        "compliance": compliance_snapshot(),
    }


@router.get("/invoices/{invoice_id}/export")
def export_invoice_html(
    invoice_id: int,
    format: str = "html",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    invoice = db.scalar(select(Invoice).options(selectinload(Invoice.lines)).where(Invoice.id == invoice_id, Invoice.company_id == current_user.company_id))
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    company = db.get(Company, current_user.company_id)

    if format.lower() == "pdf":
        from app.services.pdf_export import render_invoice_pdf
        pdf_bytes = render_invoice_pdf(invoice, company)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="facture-{invoice.number}.pdf"'},
        )
    lines_html = "".join(
        f"<tr><td>{l.description}</td><td style='text-align:center'>{l.quantity}</td><td style='text-align:right'>{l.unit_price:,.0f} XAF</td><td style='text-align:right'>{l.total:,.0f} XAF</td></tr>"
        for l in invoice.lines
    )
    html = f"""<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<title>Facture {invoice.number}</title>
<style>
  body{{font-family:system-ui,sans-serif;max-width:780px;margin:40px auto;padding:0 24px;color:#17211f}}
  .header{{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}}
  .logo{{font-size:28px;font-weight:900;color:#0f766e}}
  .badge{{background:#f0faf9;border:1px solid #0f766e;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;color:#0f766e}}
  h2{{font-size:20px;margin:0 0 4px}}
  table{{width:100%;border-collapse:collapse;margin-top:24px}}
  th{{background:#f5f5f0;text-align:left;padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em}}
  td{{padding:10px 12px;border-bottom:1px solid #eee;font-size:14px}}
  .total{{font-size:18px;font-weight:900;text-align:right;margin-top:20px;color:#0f766e}}
  .footer{{margin-top:48px;text-align:center;font-size:12px;color:#888}}
  @media print{{body{{margin:0}}}}
</style></head><body>
<div class="header">
  <div><div class="logo">{company.name if company else "KOMPTA"}</div>
  <div style="margin-top:8px;font-size:13px;color:#666">{company.legal_name if company else ""} · {company.country if company else ""}</div></div>
  <div class="badge">FACTURE</div>
</div>
<div style="display:flex;justify-content:space-between">
  <div><h2>{invoice.number}</h2>
  <p style="color:#666;margin:4px 0">Client : <strong>{invoice.customer_name}</strong></p>
  <p style="color:#666;margin:4px 0">Statut : <strong>{invoice.status.upper()}</strong></p></div>
  <div style="text-align:right;font-size:13px;color:#666">
    <p>Créé le : {str(invoice.created_at)[:10]}</p>
    {"<p>Échéance : " + str(invoice.due_date)[:10] + "</p>" if invoice.due_date else ""}
  </div>
</div>
<table><thead><tr><th>Description</th><th style="text-align:center">Qté</th><th style="text-align:right">Prix unit.</th><th style="text-align:right">Total</th></tr></thead>
<tbody>{lines_html}</tbody></table>
<div class="total">Total TTC : {invoice.total_amount:,.0f} XAF</div>
<div class="footer">KOMPTA · Référentiel SYSCEMAC Révisé · Document généré automatiquement<br>
<button onclick="window.print()" style="margin-top:12px;padding:8px 20px;background:#0f766e;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700">Imprimer / Enregistrer en PDF</button></div>
</body></html>"""
    return Response(content=html, media_type="text/html", headers={"Content-Disposition": f'inline; filename="facture-{invoice.number}.html"'})


@router.get("/payroll/runs/{run_id}/export")
def export_payroll_html(
    run_id: int,
    format: str = "html",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    run = db.scalar(select(PayrollRun).options(selectinload(PayrollRun.payslips)).where(PayrollRun.id == run_id, PayrollRun.company_id == current_user.company_id))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    company = db.get(Company, current_user.company_id)

    if format.lower() == "pdf":
        from app.services.pdf_export import render_payroll_pdf
        pdf_bytes = render_payroll_pdf(run, company)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="bulletins-{run.period}.pdf"'},
        )
    slips_html = "".join(
        f"""<div style="page-break-inside:avoid;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
          <div><strong style="font-size:16px">{s.employee_name}</strong><br><span style="color:#666;font-size:12px">{s.reference}</span></div>
          <div style="text-align:right"><span style="background:#f0faf9;color:#0f766e;padding:4px 10px;border-radius:6px;font-weight:700;font-size:13px">BULLETIN DE PAIE</span></div>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#666">Salaire brut</td><td style="text-align:right;font-weight:600">{s.gross_pay:,.0f} XAF</td></tr>
          <tr><td style="padding:6px 0;color:#666">Cotisations (10%)</td><td style="text-align:right;color:#e05252">-{s.deductions:,.0f} XAF</td></tr>
          <tr style="border-top:2px solid #0f766e"><td style="padding:8px 0;font-weight:900">Net à payer</td><td style="text-align:right;font-weight:900;color:#0f766e;font-size:16px">{s.net_pay:,.0f} XAF</td></tr>
        </table></div>"""
        for s in run.payslips
    )
    html = f"""<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<title>Bulletins de paie – {run.period}</title>
<style>body{{font-family:system-ui,sans-serif;max-width:780px;margin:40px auto;padding:0 24px;color:#17211f}} @media print{{body{{margin:0}}}}</style>
</head><body>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:32px;border-bottom:2px solid #0f766e;padding-bottom:16px">
  <div><div style="font-size:26px;font-weight:900;color:#0f766e">{company.name if company else "KOMPTA"}</div>
  <div style="color:#666;font-size:13px">Paie – Période : <strong>{run.period}</strong></div></div>
  <div style="text-align:right;font-size:13px">
    <div>Brut total : <strong>{run.gross_total:,.0f} XAF</strong></div>
    <div>Net total : <strong style="color:#0f766e">{run.net_total:,.0f} XAF</strong></div>
    <div style="color:#666">{len(run.payslips)} bulletin(s)</div>
  </div>
</div>
{slips_html}
<div style="text-align:center;margin-top:32px;font-size:12px;color:#888">
  KOMPTA · SYSCEMAC Révisé · Généré le {str(date.today())}
  <br><button onclick="window.print()" style="margin-top:12px;padding:8px 20px;background:#0f766e;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700">Imprimer / Enregistrer en PDF</button>
</div></body></html>"""
    return Response(content=html, media_type="text/html", headers={"Content-Disposition": f'inline; filename="paie-{run.period}.html"'})


@router.patch("/payroll/runs/{run_id}", response_model=PayrollRunRead)
def update_payroll_run(
    run_id: int,
    payload: PayrollRunStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PayrollRun:
    """Met à jour le statut d'un cycle de paie (draft → validated, etc.)."""
    _require_hr(current_user)
    run = db.scalar(
        select(PayrollRun)
        .options(selectinload(PayrollRun.payslips))
        .where(PayrollRun.id == run_id, PayrollRun.company_id == current_user.company_id)
    )
    if not run:
        raise HTTPException(status_code=404, detail="Cycle de paie introuvable")
    run.status = payload.status
    db.commit()
    db.refresh(run)
    return run


@router.patch("/payroll/payslips/{payslip_id}", response_model=PayslipRead)
def update_payslip(
    payslip_id: int,
    payload: PayslipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Payslip:
    """Met à jour un bulletin de paie individuel (primes, ajustements, statut)."""
    _require_hr(current_user)
    slip = db.scalar(
        select(Payslip)
        .join(PayrollRun, Payslip.payroll_run_id == PayrollRun.id)
        .where(Payslip.id == payslip_id, PayrollRun.company_id == current_user.company_id)
    )
    if not slip:
        raise HTTPException(status_code=404, detail="Bulletin introuvable")

    if payload.gross_pay is not None:
        slip.gross_pay = payload.gross_pay
    if payload.deductions is not None:
        slip.deductions = payload.deductions
    if payload.net_pay is not None:
        slip.net_pay = payload.net_pay
    if payload.payout_status is not None:
        slip.payout_status = payload.payout_status
    if payload.payout_destination is not None:
        slip.payout_destination = payload.payout_destination
    if payload.payout_method is not None:
        slip.payout_method = payload.payout_method
    if payload.bonus is not None:
        slip.bonus = payload.bonus
    if payload.overtime_pay is not None:
        slip.overtime_pay = payload.overtime_pay
    if payload.absence_deduction is not None:
        slip.absence_deduction = payload.absence_deduction

    # Recalculate totals on the parent run
    run = db.scalar(
        select(PayrollRun).options(selectinload(PayrollRun.payslips)).where(PayrollRun.id == slip.payroll_run_id)
    )
    if run:
        run.gross_total = round(sum(s.gross_pay for s in run.payslips), 2)
        run.net_total   = round(sum(s.net_pay   for s in run.payslips), 2)

    db.commit()
    db.refresh(slip)
    return slip


@router.get("/documents", response_model=list[CompanyDocumentRead])
def list_documents(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[CompanyDocument]:
    """Liste les documents avec filtrage RBAC :
    - admin / manager / RH / comptable : tous les documents de l'entreprise
    - autres rôles : uniquement les documents non rattachés à un employé (généraux),
      plus ceux rattachés à leur propre fiche employé.
    """
    stmt = (
        select(CompanyDocument)
        .where(CompanyDocument.company_id == current_user.company_id)
        .order_by(CompanyDocument.created_at.desc())
    )
    privileged = {"admin_entreprise", "manager_entreprise", "rh_entreprise", "comptable", "super_admin"}
    if current_user.role not in privileged:
        # Documents généraux (sans employee_id) OU rattachés à l'employé courant
        own_employee_id = current_user.employee_id
        stmt = stmt.where(
            or_(
                CompanyDocument.employee_id.is_(None),
                CompanyDocument.employee_id == own_employee_id,
            )
        )
    return db.scalars(stmt).all()


@router.post("/documents/upload", response_model=CompanyDocumentRead, status_code=201)
async def upload_document(
    title: str = Form(default=""),
    employee_id: int | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CompanyDocument:
    if employee_id:
        _get_scoped_employee(db, employee_id, current_user)
    return await create_document_from_upload(db, upload=file, title=title, current_user=current_user, employee_id=employee_id)


@router.post("/documents/{document_id}/analyze", response_model=CompanyDocumentRead)
async def analyze_company_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CompanyDocument:
    document = db.get(CompanyDocument, document_id)
    if not document or document.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    preview = ""
    path = Path(document.storage_path)
    if path.exists() and document.mime_type.startswith("text/"):
        preview = path.read_text(encoding="utf-8", errors="ignore")[:5000]
    return await reanalyze_document(db, document=document, content_preview=preview)


_DOCUMENT_FULL_ROLES = {"admin_entreprise", "manager_entreprise", "comptable", "super_admin"}


@router.get("/documents/{document_id}/full", response_model=CompanyDocumentReadFull)
def get_document_full(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CompanyDocument:
    """Retourne un document avec raw_text et extracted_data.
    Réservé aux rôles admin/comptable — journalise l'accès.
    """
    if current_user.role not in _DOCUMENT_FULL_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : le contenu brut des documents est réservé aux administrateurs et comptables.",
        )
    document = db.get(CompanyDocument, document_id)
    if not document or document.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    # Journalisation de l'accès aux données sensibles
    db.add(AccessAuditLog(
        company_id=current_user.company_id,
        actor_user_id=current_user.id,
        employee_id=document.employee_id,
        action="document.full_read",
        details=f"CompanyDocument#{document_id} contenu brut : {document.title} ({document.filename})",
    ))
    db.commit()
    return document


@router.get("/documents/{document_id}/download")
def download_company_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    document = db.get(CompanyDocument, document_id)
    if not document or document.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(document.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Document file missing")
    return FileResponse(path, media_type=document.mime_type, filename=document.filename)


@router.post("/documents/{document_id}/ocr")
def ocr_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    document = db.get(CompanyDocument, document_id)
    if not document or document.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(document.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Document file missing")

    extracted_text = ""
    confidence = "low"
    try:
        import pdfplumber  # type: ignore
        if document.mime_type == "application/pdf" or str(path).lower().endswith(".pdf"):
            with pdfplumber.open(str(path)) as pdf:
                pages_text = []
                for page in pdf.pages:
                    t = page.extract_text()
                    if t:
                        pages_text.append(t)
                extracted_text = "\n".join(pages_text)
                confidence = "high" if extracted_text else "low"
        else:
            raise HTTPException(status_code=400, detail="OCR uniquement supporté pour les PDF actuellement")
    except ImportError:
        raise HTTPException(status_code=500, detail="pdfplumber non installé")

    if extracted_text:
        document.ocr_text = extracted_text
        db.commit()

    word_count = len(extracted_text.split()) if extracted_text else 0
    if word_count < 10:
        confidence = "low"
    elif word_count < 100:
        confidence = "medium"
    else:
        confidence = "high"

    return {"text": extracted_text, "words": word_count, "confidence": confidence}


@router.post("/teras/employability", response_model=EmployabilityCheckRead, status_code=201)
def submit_employability(
    payload: EmployabilitySubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmployabilityCheck:
    assert_can_manage_employee_access(current_user)
    employee = _get_scoped_employee(db, payload.employee_id, current_user)
    company = db.get(Company, current_user.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return submit_employability_to_teras(
        db,
        company=company,
        employee=employee,
        include_documents=payload.include_documents,
    )


@router.get("/teras/employability", response_model=list[EmployabilityCheckRead])
def list_employability_checks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[EmployabilityCheck]:
    return db.scalars(
        select(EmployabilityCheck)
        .where(EmployabilityCheck.company_id == current_user.company_id)
        .order_by(EmployabilityCheck.created_at.desc())
    ).all()


@router.post("/teras/analyze/company", response_model=TerasAnalysisJobRead, status_code=201)
async def analyze_company_with_teras(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TerasAnalysisJob:
    company = _get_current_company(db, current_user)
    job = run_teras_analysis(db, company=company, domain="company", requested_by_user_id=current_user.id)
    new_alerts = db.scalar(select(func.count()).select_from(TerasAlert).where(TerasAlert.company_id == current_user.company_id, TerasAlert.status == "open")) or 0
    await broadcast_notification(current_user.company_id, "Analyse TERAS terminée", f"{new_alerts} alerte(s) active(s)", "teras_alert", new_alerts)
    return job


@router.post("/teras/analyze/company/{company_id}", response_model=TerasAnalysisJobRead, status_code=201)
def analyze_scoped_company_with_teras(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TerasAnalysisJob:
    if company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Company not found")
    company = _get_current_company(db, current_user)
    return run_teras_analysis(db, company=company, domain="company", requested_by_user_id=current_user.id)


@router.post("/teras/analyze/rh", response_model=TerasAnalysisJobRead, status_code=201)
def analyze_rh_with_teras(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TerasAnalysisJob:
    company = _get_current_company(db, current_user)
    return run_teras_analysis(db, company=company, domain="rh", requested_by_user_id=current_user.id)


@router.post("/teras/analyze/payroll", response_model=TerasAnalysisJobRead, status_code=201)
def analyze_payroll_domain_with_teras(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TerasAnalysisJob:
    company = _get_current_company(db, current_user)
    return run_teras_analysis(db, company=company, domain="payroll", target_type="payroll", requested_by_user_id=current_user.id)


@router.post("/teras/analyze/payroll/{payroll_run_id}", response_model=TerasAnalysisJobRead, status_code=201)
def analyze_payroll_run_with_teras(
    payroll_run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TerasAnalysisJob:
    payroll_run = db.get(PayrollRun, payroll_run_id)
    if not payroll_run or payroll_run.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    company = _get_current_company(db, current_user)
    return run_teras_analysis(
        db,
        company=company,
        domain="payroll",
        target_type="payroll_run",
        target_id=payroll_run.id,
        requested_by_user_id=current_user.id,
    )


@router.post("/teras/analyze/declaration", response_model=TerasAnalysisJobRead, status_code=201)
def analyze_declaration_with_teras(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TerasAnalysisJob:
    company = _get_current_company(db, current_user)
    return run_teras_analysis(db, company=company, domain="declaration", target_type="declaration", requested_by_user_id=current_user.id)


@router.post("/teras/analyze/declaration/{declaration_id}", response_model=TerasAnalysisJobRead, status_code=201)
def analyze_declaration_record_with_teras(
    declaration_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TerasAnalysisJob:
    company = _get_current_company(db, current_user)
    return run_teras_analysis(
        db,
        company=company,
        domain="declaration",
        target_type="declaration",
        target_id=declaration_id,
        requested_by_user_id=current_user.id,
    )


@router.post("/teras/analyze/documents", response_model=TerasAnalysisJobRead, status_code=201)
def analyze_documents_domain_with_teras(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TerasAnalysisJob:
    company = _get_current_company(db, current_user)
    return run_teras_analysis(db, company=company, domain="documents", target_type="documents", requested_by_user_id=current_user.id)


@router.post("/teras/analyze/document/{document_id}", response_model=TerasAnalysisJobRead, status_code=201)
async def analyze_document_with_teras(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TerasAnalysisJob:
    document = db.get(CompanyDocument, document_id)
    if not document or document.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    preview = ""
    path = Path(document.storage_path)
    if path.exists() and document.mime_type.startswith("text/"):
        preview = path.read_text(encoding="utf-8", errors="ignore")[:5000]
    await reanalyze_document(db, document=document, content_preview=preview)
    company = _get_current_company(db, current_user)
    return run_teras_analysis(
        db,
        company=company,
        domain="documents",
        target_type="document",
        target_id=document.id,
        requested_by_user_id=current_user.id,
    )


@router.get("/teras/scores", response_model=list[TerasScoreSnapshotRead])
def list_teras_scores(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TerasScoreSnapshot]:
    return latest_score_snapshots(db, current_user.company_id)


@router.get("/teras/company/{company_id}/scores", response_model=list[TerasScoreSnapshotRead])
def list_company_teras_scores(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TerasScoreSnapshot]:
    if company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Company not found")
    return latest_score_snapshots(db, current_user.company_id)


@router.get("/teras/recommendations")
def list_teras_recommendations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    snapshots = latest_score_snapshots(db, current_user.company_id)
    return [
        {
            "domain": snapshot.domain,
            "score": snapshot.score,
            "confidence": snapshot.confidence,
            "summary": snapshot.summary,
            "recommendations": [item.strip() for item in snapshot.recommendations.split("|") if item.strip()],
        }
        for snapshot in snapshots
    ]


@router.get("/teras/company/{company_id}/recommendations")
def list_company_teras_recommendations(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    if company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Company not found")
    return list_teras_recommendations(db, current_user)


@router.get("/teras/alerts", response_model=list[TerasAlertRead])
def list_teras_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[TerasAlert]:
    return company_scope(db, current_user, TerasAlert, TerasAlert.created_at.desc())


@router.get("/teras/company/{company_id}/alerts", response_model=list[TerasAlertRead])
def list_company_teras_alerts(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TerasAlert]:
    if company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Company not found")
    return company_scope(db, current_user, TerasAlert, TerasAlert.created_at.desc())


@router.post("/teras/alerts/{alert_id}/create-task", response_model=TaskRead, status_code=201)
def create_task_from_teras(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Task:
    alert = db.get(TerasAlert, alert_id)
    if not alert or alert.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="TERAS alert not found")
    task = Task(
        title=f"Action TERAS: {alert.title}",
        description=alert.recommendation,
        priority="high" if alert.severity == "high" else "normal",
        assignee_name=current_user.full_name,
        source="teras",
        proof_required=True,
        company_id=current_user.company_id,
    )
    alert.status = "converted"
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.post("/ai/router", response_model=AIRouterDecision)
def ai_router(payload: AIRouterRequest, current_user: User = Depends(get_current_user)) -> AIRouterDecision:
    del current_user
    return AIRouterDecision(**route_ai_request(payload.prompt, payload.context_domain))


@router.post("/assistants/writing")
async def writing_assistant(payload: WritingRequest, current_user: User = Depends(get_current_user)) -> dict:
    return await generate_writing(payload, current_user.full_name)


@router.post("/assistants/declarations")
async def declaration_assistant(payload: DeclarationRequest, current_user: User = Depends(get_current_user)) -> dict:
    return await generate_declaration(payload)


@router.get("/declarations", response_model=list[DeclarationRecordRead])
def list_declarations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DeclarationRecord]:
    return db.scalars(
        select(DeclarationRecord)
        .where(DeclarationRecord.company_id == current_user.company_id)
        .order_by(DeclarationRecord.created_at.desc())
    ).all()


@router.post("/declarations/prepare", response_model=DeclarationRecordRead, status_code=201)
async def prepare_declaration(
    payload: DeclarationRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DeclarationRecord:
    result = await generate_declaration(
        DeclarationRequest(period=payload.period, declaration_type=payload.declaration_type)
    )
    missing_documents = result.get("missing_documents") or []
    checklist = result.get("checklist") or []
    record = DeclarationRecord(
        period=payload.period,
        declaration_type=payload.declaration_type,
        case_reference=str(result.get("case") or f"{payload.declaration_type.upper()}-{payload.period}"),
        status=str(result.get("status") or "draft_ready"),
        confidence=int(result.get("confidence") or 0),
        missing_documents=json.dumps(missing_documents, ensure_ascii=False),
        checklist=json.dumps(checklist, ensure_ascii=False),
        provider=str(result.get("provider") or "limule"),
        created_by_user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.post("/declarations/generate", response_model=DeclarationRecordRead, status_code=201)
async def generate_full_declaration(
    payload: DeclarationRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DeclarationRecord:
    """Génère une déclaration complète via Limule avec données réelles de l'entreprise."""
    from app.services.limule import limule_generate
    from app.services.limule_context import build_limule_context, render_context_for_prompt

    company = db.get(Company, current_user.company_id)

    # Construire le contexte complet de l'entreprise
    ctx = build_limule_context(
        db=db,
        company_id=current_user.company_id,
        user=current_user,
        page_path="/declarations",
        focus_module="declarations",
    )
    ctx_text = render_context_for_prompt(ctx)

    # Labels détaillés par type
    type_labels = {
        "fiscale": "Déclaration fiscale (TVA, IS, acomptes provisionnels, IRPP)",
        "sociale": "Déclaration sociale CNPS (cotisations patronales et salariales)",
        "bailleur": "Rapport bailleur / ONG / agence de financement",
        "statistique": "Rapport statistique (ANSS/INS)",
        "tva": "Déclaration de TVA mensuelle",
        "is": "Déclaration d'Impôt sur les Sociétés (IS)",
        "cnps": "Déclaration CNPS trimestrielle",
        "daf": "Déclaration Annuelle des Finances",
    }
    type_label = type_labels.get(payload.declaration_type, payload.declaration_type)

    prompt = (
        f"Génère une DÉCLARATION COMPLÈTE de type : {type_label}\n"
        f"Période : {payload.period}\n"
        f"Entreprise : {company.name if company else 'N/A'} ({company.country if company else 'N/A'})\n\n"
        f"La déclaration doit être EXHAUSTIVE et inclure :\n"
        f"1. En-tête officiel avec identité de l'entreprise et référence\n"
        f"2. Tableau des montants calculés (base imposable, taux, montant dû)\n"
        f"3. Détail ligne par ligne des éléments déclarés\n"
        f"4. Récapitulatif des pièces justificatives à joindre\n"
        f"5. Analyse des risques et points d'attention pour cette période\n"
        f"6. Instructions de dépôt (délais, modalités, pénalités en cas de retard)\n"
        f"7. Recommandations Limule pour optimiser la déclaration\n\n"
        f"Utilise les données réelles de l'entreprise du contexte. "
        f"Format professionnel exploitable par un comptable ou DAF."
    )

    content, _ = await limule_generate(
        kind="declaration",
        prompt=prompt,
        context=ctx_text,
        structured_context=ctx,
        db=db,
        company_id=current_user.company_id,
        user=current_user,
        max_tokens=4000,
        temperature=0.2,
    )

    # Aussi préparer l'audit (checklist + pièces manquantes)
    audit_result = await generate_declaration(
        DeclarationRequest(period=payload.period, declaration_type=payload.declaration_type)
    )
    missing_documents = audit_result.get("missing_documents") or []
    checklist = audit_result.get("checklist") or []

    record = DeclarationRecord(
        period=payload.period,
        declaration_type=payload.declaration_type,
        case_reference=f"{payload.declaration_type.upper()}-{payload.period}-GEN",
        status="generated",
        confidence=int(audit_result.get("confidence") or 85),
        missing_documents=json.dumps(missing_documents, ensure_ascii=False),
        checklist=json.dumps(checklist, ensure_ascii=False),
        generated_text=content or "",
        provider="limule",
        created_by_user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/declarations/{record_id}/pdf")
def download_declaration_pdf(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Télécharge la déclaration générée en PDF."""
    from app.services.pdf_export import build_limule_pdf

    record = db.scalar(
        select(DeclarationRecord).where(
            DeclarationRecord.id == record_id,
            DeclarationRecord.company_id == current_user.company_id,
        )
    )
    if not record:
        raise HTTPException(status_code=404, detail="Déclaration introuvable")
    if not record.generated_text:
        raise HTTPException(status_code=400, detail="Aucun document généré pour cette déclaration")

    company = db.get(Company, current_user.company_id)
    type_labels = {
        "fiscale": "Déclaration fiscale", "sociale": "Déclaration sociale CNPS",
        "bailleur": "Rapport bailleur", "statistique": "Rapport statistique",
        "tva": "Déclaration TVA", "is": "Déclaration IS", "cnps": "Déclaration CNPS",
    }
    title = f"{type_labels.get(record.declaration_type, 'Déclaration')} — {record.period}"
    pdf_bytes = build_limule_pdf(
        content=record.generated_text,
        title=title,
        kind="declaration",
        company_name=company.name if company else "KOMPTA",
        generated_at=record.created_at.strftime("%d/%m/%Y %H:%M"),
    )
    filename = f"declaration-{record.declaration_type}-{record.period}-{record.id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/declarations/optimize", response_model=DeclarationRecordRead, status_code=201)
async def optimize_declaration(
    payload: DeclarationRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DeclarationRecord:
    """Génère un plan d'optimisation fiscale complet via Limule."""
    from app.services.limule import limule_generate
    from app.services.limule_context import build_limule_context, render_context_for_prompt
    from app.models.domain import LegislationDocument

    company = db.get(Company, current_user.company_id)
    ctx = build_limule_context(
        db=db, company_id=current_user.company_id, user=current_user,
        page_path="/declarations", focus_module="declarations",
    )
    ctx_text = render_context_for_prompt(ctx)

    # Enrichissement avec la base législative interne
    leg_docs = db.scalars(
        select(LegislationDocument).where(
            LegislationDocument.company_id == current_user.company_id,
            LegislationDocument.analyzed == True,
        ).order_by(LegislationDocument.created_at.desc()).limit(5)
    ).all()
    leg_context = ""
    if leg_docs:
        leg_parts = [f"[{d.doc_category.upper()} — {d.title}]\n{(d.ai_summary or '')[:600]}" for d in leg_docs]
        leg_context = "\n\nBASE LÉGISLATIVE INTERNE :\n" + "\n---\n".join(leg_parts)

    type_labels = {
        "fiscale": "fiscale (TVA, IS, IRPP)", "sociale": "sociale CNPS",
        "tva": "TVA", "is": "IS (Impôt sur les Sociétés)",
        "bailleur": "bailleur / financement", "statistique": "statistique",
    }
    type_label = type_labels.get(payload.declaration_type, payload.declaration_type)
    country = company.country if company else "Congo"

    prompt = (
        f"Génère un PLAN D'OPTIMISATION FISCALE ET COMPTABLE complet pour :\n"
        f"- Type de déclaration : {type_label}\n"
        f"- Période : {payload.period}\n"
        f"- Pays : {country} (zone CEMAC)\n"
        f"- Entreprise : {company.name if company else 'N/A'}\n\n"
        f"Le plan doit inclure :\n"
        f"1. CALENDRIER FISCAL — toutes les dates et échéances légales pour {payload.period} "
        f"(dépôts, paiements, délais de grâce, pénalités de retard)\n"
        f"2. STRATÉGIES D'OPTIMISATION — déductions légales, crédits d'impôt, régimes préférentiels "
        f"applicables aux PME en zone CEMAC, amortissements accélérés, provisions déductibles\n"
        f"3. POSTES À REVOIR — charges déductibles souvent oubliées, frais généraux optimisables, "
        f"structure salariale optimale pour réduire la charge fiscale\n"
        f"4. CONFORMITÉ PRÉVENTIVE — points de contrôle DGI, risques de redressement courants, "
        f"documents à conserver et durées légales\n"
        f"5. ACTIONS IMMÉDIATES — liste priorisée d'actions à mener dans les 30/60/90 jours\n"
        f"6. REGARD CEMAC — impact de la conjoncture CEMAC sur la fiscalité de l'entreprise\n\n"
        f"Cite des taux et seuils réels applicables au {country}. Sois précis et actionnable."
        f"{leg_context}"
    )

    content, _ = await limule_generate(
        kind="declaration",
        prompt=prompt,
        context=ctx_text,
        structured_context=ctx,
        db=db,
        company_id=current_user.company_id,
        user=current_user,
        max_tokens=4000,
        temperature=0.2,
    )

    record = DeclarationRecord(
        period=payload.period,
        declaration_type=payload.declaration_type,
        case_reference=f"{payload.declaration_type.upper()}-{payload.period}-OPT",
        status="optimized",
        confidence=92,
        missing_documents=json.dumps([], ensure_ascii=False),
        checklist=json.dumps([], ensure_ascii=False),
        generated_text=content or "",
        provider="limule",
        created_by_user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/settings/modules")
def modules_settings(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "role": current_user.role,
        "enabled_modules": [
            "dashboard",
            "company",
            "hr",
            "employee-space",
            "payroll",
            "accounting",
            "nonprofit-finance",
            "billing",
            "inventory",
            "pos",
            "projects",
            "chat",
            "meetings",
            "reports",
            "declarations",
            "writing-assistant",
            "teras",
            "settings",
        ],
    }


# ─── Super-Admin (cross-tenant) ─────────────────────────────────────────────

def _require_super_admin(current_user: User) -> None:
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super-admin access required")


def _hydrate_ticket(ticket: Ticket, db: Session) -> Ticket:
    """Attach computed names so Pydantic schemas pick them up."""
    if ticket.requester_user_id:
        requester = db.get(User, ticket.requester_user_id)
        ticket._requester_name = requester.full_name if requester else ""
    if ticket.company_id:
        company = db.get(Company, ticket.company_id)
        ticket._company_name = company.name if company else ""
    return ticket


@router.get("/admin/overview")
def admin_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _require_super_admin(current_user)
    companies_count = db.scalar(select(func.count()).select_from(Company)) or 0
    users_count = db.scalar(select(func.count()).select_from(User)) or 0
    employees_count = db.scalar(select(func.count()).select_from(Employee)) or 0
    invoices_count = db.scalar(select(func.count()).select_from(Invoice)) or 0
    tickets_open = db.scalar(
        select(func.count()).select_from(Ticket).where(Ticket.status.in_(["open", "in_progress"]))
    ) or 0
    tickets_critical = db.scalar(
        select(func.count()).select_from(Ticket).where(Ticket.priority == "critical", Ticket.status != "closed")
    ) or 0
    alerts_open = db.scalar(
        select(func.count()).select_from(TerasAlert).where(TerasAlert.status == "open")
    ) or 0
    sales_total = db.scalar(select(func.coalesce(func.sum(Sale.total_amount), 0))) or 0
    return {
        "companies": int(companies_count),
        "users": int(users_count),
        "employees": int(employees_count),
        "invoices": int(invoices_count),
        "tickets_open": int(tickets_open),
        "tickets_critical": int(tickets_critical),
        "alerts_open": int(alerts_open),
        "sales_total": float(sales_total),
    }


@router.get("/admin/companies")
def admin_list_companies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    _require_super_admin(current_user)
    companies = db.scalars(select(Company).order_by(Company.created_at.desc())).all()
    out = []
    for c in companies:
        users_count = db.scalar(
            select(func.count()).select_from(User).where(User.company_id == c.id)
        ) or 0
        employees_count = db.scalar(
            select(func.count()).select_from(Employee).where(Employee.company_id == c.id)
        ) or 0
        out.append({
            "id": c.id,
            "name": c.name,
            "legal_name": c.legal_name,
            "industry": c.industry,
            "country": c.country,
            "completion_score": c.completion_score,
            "teras_score": c.teras_score,
            "users_count": int(users_count),
            "employees_count": int(employees_count),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })
    return out


@router.get("/admin/companies/{company_id}")
def admin_company_detail(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _require_super_admin(current_user)
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    users = db.scalars(select(User).where(User.company_id == company_id)).all()
    invoices_count = db.scalar(
        select(func.count()).select_from(Invoice).where(Invoice.company_id == company_id)
    ) or 0
    sales_total = db.scalar(
        select(func.coalesce(func.sum(Sale.total_amount), 0)).where(Sale.company_id == company_id)
    ) or 0
    alerts = db.scalars(
        select(TerasAlert).where(TerasAlert.company_id == company_id).order_by(TerasAlert.created_at.desc())
    ).all()
    return {
        "company": {
            "id": company.id,
            "name": company.name,
            "legal_name": company.legal_name,
            "industry": company.industry,
            "country": company.country,
            "completion_score": company.completion_score,
            "teras_score": company.teras_score,
        },
        "users": [
            {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "account_status": u.account_status}
            for u in users
        ],
        "stats": {
            "invoices": int(invoices_count),
            "sales_total": float(sales_total),
            "users_count": len(users),
        },
        "alerts": [
            {"id": a.id, "title": a.title, "severity": a.severity, "status": a.status, "module": a.module}
            for a in alerts
        ],
    }


@router.get("/admin/users")
def admin_list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    company_id: int | None = None,
    search: str | None = None,
) -> list[dict]:
    _require_super_admin(current_user)
    stmt = select(User).order_by(User.created_at.desc())
    if company_id:
        stmt = stmt.where(User.company_id == company_id)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(or_(func.lower(User.email).like(like), func.lower(User.full_name).like(like)))
    users = db.scalars(stmt).all()
    company_names = {c.id: c.name for c in db.scalars(select(Company)).all()}
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "department": u.department,
            "branch": u.branch,
            "account_status": u.account_status,
            "must_change_password": bool(u.must_change_password),
            "company_id": u.company_id,
            "company_name": company_names.get(u.company_id, ""),
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.patch("/admin/users/{user_id}/status")
def admin_update_user_status(
    user_id: int,
    payload: AccountStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _require_super_admin(current_user)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.account_status = payload.account_status
    db.commit()
    return {"id": user.id, "account_status": user.account_status}


# ─── Tickets ─────────────────────────────────────────────────────────────────


@router.get("/admin/tickets", response_model=list[TicketRead])
def admin_list_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status: str | None = None,
    priority: str | None = None,
) -> list[Ticket]:
    _require_super_admin(current_user)
    stmt = select(Ticket).options(selectinload(Ticket.messages)).order_by(Ticket.created_at.desc())
    if status:
        stmt = stmt.where(Ticket.status == status)
    if priority:
        stmt = stmt.where(Ticket.priority == priority)
    tickets = db.scalars(stmt).all()
    for t in tickets:
        _hydrate_ticket(t, db)
    return tickets


@router.get("/admin/tickets/{ticket_id}", response_model=TicketRead)
def admin_get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ticket:
    _require_super_admin(current_user)
    ticket = db.scalar(
        select(Ticket).options(selectinload(Ticket.messages).selectinload(TicketMessage.author)).where(Ticket.id == ticket_id)
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return _hydrate_ticket(ticket, db)


@router.patch("/admin/tickets/{ticket_id}", response_model=TicketRead)
def admin_update_ticket(
    ticket_id: int,
    payload: TicketUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ticket:
    _require_super_admin(current_user)
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if payload.status is not None:
        ticket.status = payload.status
        if payload.status in ("resolved", "closed") and not ticket.resolved_at:
            ticket.resolved_at = datetime.now(timezone.utc)
    if payload.priority is not None:
        ticket.priority = payload.priority
    if payload.category is not None:
        ticket.category = payload.category
    if payload.assignee_user_id is not None:
        ticket.assignee_user_id = payload.assignee_user_id
    db.commit()
    db.refresh(ticket)
    return _hydrate_ticket(ticket, db)


@router.post("/admin/tickets/{ticket_id}/reply", response_model=TicketRead)
def admin_reply_ticket(
    ticket_id: int,
    payload: TicketReplyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ticket:
    _require_super_admin(current_user)
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    msg = TicketMessage(
        ticket_id=ticket.id,
        author_user_id=current_user.id,
        body=payload.body,
        is_staff=True,
    )
    db.add(msg)
    if ticket.status == "open":
        ticket.status = "in_progress"
        ticket.assignee_user_id = current_user.id
    db.commit()
    refreshed = db.scalar(
        select(Ticket).options(selectinload(Ticket.messages).selectinload(TicketMessage.author)).where(Ticket.id == ticket_id)
    )
    return _hydrate_ticket(refreshed, db)


@router.post("/admin/tickets", response_model=TicketRead, status_code=201)
def admin_create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ticket:
    _require_super_admin(current_user)
    ticket = Ticket(
        subject=payload.subject,
        body=payload.body,
        priority=payload.priority,
        category=payload.category,
        company_id=current_user.company_id,
        requester_user_id=current_user.id,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return _hydrate_ticket(ticket, db)


# ─── Tickets utilisateur (côté tenant pour ouvrir un ticket) ────────────────


@router.get("/tickets", response_model=list[TicketRead])
def user_list_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Ticket]:
    tickets = db.scalars(
        select(Ticket)
        .options(selectinload(Ticket.messages))
        .where(Ticket.requester_user_id == current_user.id)
        .order_by(Ticket.created_at.desc())
    ).all()
    for t in tickets:
        _hydrate_ticket(t, db)
    return tickets


@router.post("/tickets", response_model=TicketRead, status_code=201)
def user_create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Ticket:
    ticket = Ticket(
        subject=payload.subject,
        body=payload.body,
        priority=payload.priority,
        category=payload.category,
        company_id=current_user.company_id,
        requester_user_id=current_user.id,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return _hydrate_ticket(ticket, db)


# ─── Audit logs ─────────────────────────────────────────────────────────────


@router.get("/admin/audit-logs")
def admin_audit_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 100,
) -> list[dict]:
    _require_super_admin(current_user)
    logs = db.scalars(
        select(AccessAuditLog).order_by(AccessAuditLog.created_at.desc()).limit(limit)
    ).all()
    user_names = {u.id: u.full_name for u in db.scalars(select(User)).all()}
    return [
        {
            "id": log.id,
            "actor_user_id": log.actor_user_id,
            "actor_name": user_names.get(log.actor_user_id, "système"),
            "target_user_id": log.target_user_id,
            "target_name": user_names.get(log.target_user_id, ""),
            "action": log.action,
            "details": log.details,
            "company_id": log.company_id,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]
