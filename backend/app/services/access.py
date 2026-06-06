import html
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models import AccessAuditLog, Company, Employee, TemporaryCredential, User
from app.schemas import EmployeeCreateWithAccount, EmployeeQuickCreate


SENSITIVE_ROLES = {"admin_entreprise", "rh_entreprise"}


def normalize_phone(phone: str) -> str:
    return re.sub(r"[^0-9+]", "", phone.strip())


def generated_email_from_phone(phone: str) -> str:
    digits = re.sub(r"[^0-9]", "", phone)
    return f"{digits or secrets.token_hex(4)}@phone.kompta.local"


def generate_temporary_password(length: int = 14) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    token = "".join(secrets.choice(alphabet) for _ in range(max(length, 12)))
    groups = [token[index : index + 4] for index in range(0, 12, 4)]
    return "KPT-" + "-".join(groups)


def can_manage_employee_access(user: User) -> bool:
    return user.role in SENSITIVE_ROLES or user.role.startswith("admin")


def assert_can_manage_employee_access(user: User) -> None:
    if not can_manage_employee_access(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission RH insuffisante")


def audit_access(
    db: Session,
    *,
    actor: User | None,
    company_id: int,
    action: str,
    employee: Employee | None = None,
    target_user: User | None = None,
    details: str = "",
) -> None:
    db.add(
        AccessAuditLog(
            actor_user_id=actor.id if actor else None,
            employee_id=employee.id if employee else None,
            target_user_id=target_user.id if target_user else None,
            action=action,
            details=details,
            company_id=company_id,
        )
    )


def _find_duplicate_user(db: Session, email: str, phone: str) -> User | None:
    filters = [User.email == email]
    if phone:
        filters.append(User.phone == phone)
    return db.scalar(select(User).where(or_(*filters)))


def _create_employee_account(
    db: Session,
    *,
    employee: Employee,
    login_email: str,
    phone: str,
    role: str,
    current_user: User,
) -> tuple[User, str, str]:
    temporary_password = generate_temporary_password()
    user = User(
        email=login_email,
        phone=phone,
        full_name=f"{employee.first_name} {employee.last_name}",
        role=role,
        department=employee.department,
        branch=employee.branch,
        password_hash=hash_password(temporary_password),
        must_change_password=True,
        account_status="pending_first_login",
        invited_at=datetime.now(timezone.utc),
        is_active=True,
        company_id=current_user.company_id,
        employee_id=employee.id,
    )
    db.add(user)
    db.flush()

    employee.user_id = user.id
    employee.account_status = "pending_first_login"
    employee.invited_at = user.invited_at
    credential = TemporaryCredential(
        employee_id=employee.id,
        user_id=user.id,
        password_hash=hash_password(temporary_password),
        status="active",
        generated_by_user_id=current_user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=14),
        company_id=current_user.company_id,
    )
    db.add(credential)
    audit_access(
        db,
        actor=current_user,
        company_id=current_user.company_id,
        action="employee_account_created",
        employee=employee,
        target_user=user,
        details="Compte employe cree avec mot de passe temporaire.",
    )
    login_identifier = phone or login_email
    return user, temporary_password, login_identifier


def quick_create_employee_with_account(
    db: Session,
    *,
    payload: EmployeeQuickCreate,
    current_user: User,
) -> tuple[Employee, str, str]:
    assert_can_manage_employee_access(current_user)
    phone = normalize_phone(payload.phone)
    login_email = payload.email.strip().lower() or generated_email_from_phone(phone)
    if not phone and not payload.email.strip():
        raise HTTPException(status_code=400, detail="Telephone ou email requis")
    if _find_duplicate_user(db, login_email, phone):
        raise HTTPException(status_code=409, detail="Un compte existe deja avec cet email ou telephone")
    if db.scalar(select(Employee).where(Employee.email == login_email)):
        raise HTTPException(status_code=409, detail="Un employe existe deja avec cet identifiant")

    employee = Employee(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=login_email,
        phone=phone,
        job_title=payload.job_title,
        employment_type=payload.employment_type,
        department=payload.department,
        branch=payload.branch,
        salary=payload.salary,
        status="profile_incomplete",
        account_status="created",
        access_role=payload.access_role,
        access_scope="self",
        payout_method=payload.payout_method,
        payout_phone=payload.payout_phone or phone,
        payout_bank_name=payload.payout_bank_name,
        payout_account_number=payload.payout_account_number,
        payout_paypal_email=payload.payout_paypal_email,
        created_by_user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(employee)
    db.flush()
    _, temporary_password, login_identifier = _create_employee_account(
        db,
        employee=employee,
        login_email=login_email,
        phone=phone,
        role=payload.access_role,
        current_user=current_user,
    )
    db.commit()
    db.refresh(employee)
    return employee, login_identifier, temporary_password


def create_complete_employee_with_account(
    db: Session,
    *,
    payload: EmployeeCreateWithAccount,
    current_user: User,
) -> tuple[Employee, str, str]:
    assert_can_manage_employee_access(current_user)
    phone = normalize_phone(payload.phone)
    login_email = payload.email.strip().lower()
    if not login_email:
        raise HTTPException(status_code=400, detail="Email requis pour la creation complete")
    if _find_duplicate_user(db, login_email, phone):
        raise HTTPException(status_code=409, detail="Un compte existe deja avec cet email ou telephone")
    if db.scalar(select(Employee).where(Employee.email == login_email)):
        raise HTTPException(status_code=409, detail="Un employe existe deja avec cet email")

    employee = Employee(**payload.model_dump(exclude={"create_user_account"}), created_by_user_id=current_user.id, company_id=current_user.company_id)
    employee.account_status = "created"
    db.add(employee)
    db.flush()
    if payload.create_user_account:
        _, temporary_password, login_identifier = _create_employee_account(
            db,
            employee=employee,
            login_email=login_email,
            phone=phone,
            role=payload.access_role,
            current_user=current_user,
        )
    else:
        temporary_password = ""
        login_identifier = login_email
    db.commit()
    db.refresh(employee)
    return employee, login_identifier, temporary_password


def regenerate_temporary_password(db: Session, *, employee: Employee, current_user: User) -> tuple[str, str]:
    assert_can_manage_employee_access(current_user)
    user = db.get(User, employee.user_id) if employee.user_id else None
    if not user or user.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Compte employe introuvable")
    temporary_password = generate_temporary_password()
    user.password_hash = hash_password(temporary_password)
    user.must_change_password = True
    user.account_status = "pending_first_login"
    user.is_active = True
    employee.account_status = "pending_first_login"

    db.query(TemporaryCredential).filter(
        TemporaryCredential.user_id == user.id,
        TemporaryCredential.status == "active",
    ).update({"status": "revoked"})
    db.add(
        TemporaryCredential(
            employee_id=employee.id,
            user_id=user.id,
            password_hash=hash_password(temporary_password),
            status="active",
            generated_by_user_id=current_user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=14),
            company_id=current_user.company_id,
        )
    )
    audit_access(
        db,
        actor=current_user,
        company_id=current_user.company_id,
        action="temporary_password_regenerated",
        employee=employee,
        target_user=user,
        details="Nouveau mot de passe temporaire genere.",
    )
    db.commit()
    login_identifier = user.phone or user.email
    return login_identifier, temporary_password


def change_first_login_password(db: Session, *, user: User, current_password: str, new_password: str) -> User:
    if user.account_status in {"suspended", "disabled", "archived"}:
        raise HTTPException(status_code=403, detail="Compte suspendu ou desactive")
    current_password = current_password.strip()
    new_password = new_password.strip()
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit contenir au moins 8 caracteres")
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Mot de passe temporaire invalide")
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    user.account_status = "active"
    # NB : on ne bump PAS token_version ici — l'activation se fait en session,
    # révoquer le jeton courant casserait le flux. La révocation se fait au logout
    # explicite et lors d'une réinitialisation administrateur (reset-access).
    user.activated_at = datetime.now(timezone.utc)
    user.last_login_at = datetime.now(timezone.utc)
    employee = db.get(Employee, user.employee_id) if user.employee_id else None
    if employee:
        employee.account_status = "active"
        employee.activated_at = user.activated_at
        employee.last_login_at = user.last_login_at
    db.query(TemporaryCredential).filter(
        TemporaryCredential.user_id == user.id,
        TemporaryCredential.status == "active",
    ).update({"status": "used", "viewed_at": datetime.now(timezone.utc)})
    audit_access(
        db,
        actor=user,
        company_id=user.company_id,
        action="first_login_password_changed",
        employee=employee,
        target_user=user,
        details="Activation employee finalisee.",
    )
    db.commit()
    db.refresh(user)
    return user


def _provider_label(provider: str) -> str:
    """Libellé lisible et honnête de l'origine des clauses (jamais « mock »)."""
    p = (provider or "").lower()
    if p in {"deepseek", "openai", "ollama"}:
        return "l'assistant IA Limule"
    # local_template / mock / inconnu → modèle standard sans IA
    return "un modèle standard KOMPTA (sans IA)"


def render_contract_html(company: Company, employee: Employee, ai_clauses: list[str] | None = None, provider: str = "local_template") -> str:
    employee_name = html.escape(f"{employee.first_name} {employee.last_name}")
    company_name = html.escape(company.legal_name or company.name)
    job_title = html.escape(employee.job_title)
    branch = html.escape(employee.branch)
    department = html.escape(employee.department)
    employment_type = html.escape(employee.employment_type)
    salary = f"{employee.salary:,.2f}".replace(",", " ")
    # Devise issue de l'entreprise (défaut régional XAF — CEMAC/SYSCOHADA), jamais USD codé en dur
    currency = html.escape(getattr(company, "currency", None) or getattr(company, "default_currency", None) or "XAF")
    today = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    phone = html.escape(employee.phone or "Non renseigne")
    email = html.escape(employee.email)
    clauses = ai_clauses or [
        f"L'employe exercera la fonction de {job_title} au sein du service {department}.",
        f"Le lieu principal d'affectation est {branch}.",
        f"La remuneration de reference est de {salary} {currency}.",
        "L'employe s'engage a proteger les informations de l'entreprise et a utiliser ses acces KOMPTA de maniere personnelle.",
    ]
    rendered_clauses = "\n".join(
        f"<h2>Article {index}</h2><p>{html.escape(str(clause))}</p>" for index, clause in enumerate(clauses, start=1)
    )
    return f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Contrat de travail - {employee_name}</title>
  <style>
    body {{ font-family: Arial, sans-serif; color: #17211f; margin: 40px; line-height: 1.55; }}
    .header {{ display: flex; justify-content: space-between; border-bottom: 2px solid #0f766e; padding-bottom: 16px; }}
    h1 {{ color: #0f766e; margin: 28px 0 8px; }}
    .box {{ border: 1px solid #d6ddd8; border-radius: 8px; padding: 16px; margin: 18px 0; }}
    .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
    .label {{ color: #65736d; font-size: 12px; text-transform: uppercase; font-weight: bold; }}
    .signature {{ margin-top: 70px; display: grid; grid-template-columns: 1fr 1fr; gap: 64px; }}
    @media print {{ body {{ margin: 18mm; }} button {{ display: none; }} }}
  </style>
</head>
<body>
  <button onclick="window.print()">Imprimer</button>
  <div class="header">
    <div><strong>{company_name}</strong><br />Document genere par KOMPTA</div>
    <div>Date: {today}</div>
  </div>
  <h1>Contrat de travail</h1>
  <p>Entre <strong>{company_name}</strong>, ci-apres denommee l'entreprise, et <strong>{employee_name}</strong>, ci-apres denommee l'employe.</p>
  <div class="box grid">
    <div><div class="label">Employe</div>{employee_name}</div>
    <div><div class="label">Poste</div>{job_title}</div>
    <div><div class="label">Type de contrat</div>{employment_type}</div>
    <div><div class="label">Service / Agence</div>{department} / {branch}</div>
    <div><div class="label">Telephone</div>{phone}</div>
    <div><div class="label">Email / identifiant</div>{email}</div>
    <div><div class="label">Remuneration mensuelle indicatrice</div>{salary} {currency}</div>
    <div><div class="label">Statut compte</div>{html.escape(employee.account_status)}</div>
  </div>
  <p><em>Clauses generees par {html.escape(_provider_label(provider))} et a valider par un responsable habilite avant signature.</em></p>
  {rendered_clauses}
  <div class="signature">
    <div>Signature entreprise<br /><br />________________________</div>
    <div>Signature employe<br /><br />________________________</div>
  </div>
</body>
</html>"""
