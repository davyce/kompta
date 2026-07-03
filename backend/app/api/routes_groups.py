"""
routes_groups.py — Module Groupes & Organisations (Phase G1).

Fondation : groupes, membres, rôles internes, bureau & mandats (avec historique),
permissions, traçabilité. Réutilise l'auth (get_current_user) et le multi-tenant
(company_id) existants. Les phases suivantes (cotisations, calendrier, chat, IA,
frontend) se branchent par-dessus ces modèles.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import (
    Company,
    GroupAuditLog,
    GroupLeadershipHistory,
    GroupMember,
    GroupMemberRole,
    GroupRole,
    OrganizationGroup,
    User,
)
from app.services.access import (
    generate_temporary_password,
    generated_email_from_phone,
    normalize_phone,
)
from app.services.readiness import build_group_portfolio

router = APIRouter(prefix="/groups", tags=["groups"])

# Rôles internes par défaut créés à la création d'un groupe
DEFAULT_GROUP_ROLES = [
    "Président", "Vice-président", "Secrétaire", "Trésorier",
    "Commissaire aux comptes", "Administrateur", "Modérateur",
    "Membre simple", "Auditeur", "Responsable événement", "Responsable communication",
]
# Rôles autorisés à gérer le groupe (membres, rôles, paramètres)
MANAGER_ROLE_NAMES = {"Président", "Administrateur"}
# Rôles donnant accès aux données financières sensibles (cf. permissions IA plus tard)
FINANCE_ROLE_NAMES = {"Président", "Trésorier", "Commissaire aux comptes", "Administrateur"}


# ── Schemas ─────────────────────────────────────────────────────────────────
class GroupCreate(BaseModel):
    name: str
    type: str = "association"
    description: str = ""
    country: str = "Congo"
    city: str = ""
    address: str = ""
    currency: str = "XAF"
    linked_company_id: int | None = None


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    city: str | None = None
    address: str | None = None
    status: str | None = None
    linked_company_id: int | None = None


class GroupClose(BaseModel):
    reason: str = ""


class MemberCreate(BaseModel):
    full_name: str
    phone: str = ""
    email: str = ""
    date_of_birth: date | None = None
    zone: str = ""
    profession: str = ""
    emergency_contact: str = ""
    member_number: str = ""
    notes: str = ""


class RoleAssign(BaseModel):
    member_id: int
    role_name: str
    reason: str = ""


class LeadershipChange(BaseModel):
    president_member_id: int | None = None
    vice_president_member_id: int | None = None
    secretary_member_id: int | None = None
    treasurer_member_id: int | None = None
    mandate_start: date | None = None
    mandate_end: date | None = None
    elected_by: str = ""
    election_notes: str = ""


# ── Helpers permissions & audit ─────────────────────────────────────────────
def _company_admin(user: User) -> bool:
    return user.role.startswith("admin") or user.role in {"super_admin", "manager_entreprise"}


def _platform_company_id(db: Session) -> int:
    """ID de la société neutre "KOMPTA Platform" utilisée pour les comptes
    membre_groupe purs (sans entreprise). Évite de rattacher un membre de
    groupe à l'entreprise réelle de l'admin qui l'a invité, ce qui le ferait
    apparaître dans les canaux de chat / listes d'employés de cette entreprise."""
    platform = db.scalar(select(Company).where(Company.name == "KOMPTA Platform"))
    if not platform:
        platform = Company(
            name="KOMPTA Platform", legal_name="KOMPTA Platform",
            industry="Plateforme", organization_type="SaaS", country="Congo",
            completion_score=100, teras_score=0,
        )
        db.add(platform)
        db.flush()
    return platform.id


def _get_group(db: Session, group_id: int, user: User) -> OrganizationGroup:
    group = db.get(OrganizationGroup, group_id)
    if not group or group.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Groupe introuvable")
    return group


def _user_group_roles(db: Session, group: OrganizationGroup, user: User) -> set[str]:
    """Rôles internes courants de l'utilisateur dans ce groupe (via son membre lié)."""
    member = db.scalar(
        select(GroupMember).where(GroupMember.group_id == group.id, GroupMember.user_id == user.id)
    )
    if not member:
        return set()
    rows = db.scalars(
        select(GroupMemberRole).where(
            GroupMemberRole.group_id == group.id,
            GroupMemberRole.member_id == member.id,
            GroupMemberRole.is_current == True,  # noqa: E712
        )
    ).all()
    return {r.role_name for r in rows}


def _can_manage(db: Session, group: OrganizationGroup, user: User) -> bool:
    return _company_admin(user) or bool(_user_group_roles(db, group, user) & MANAGER_ROLE_NAMES)


def _can_close_group(db: Session, group: OrganizationGroup, user: User) -> bool:
    # La fermeture est plus sensible que la gestion courante : seul le Président
    # du groupe ou un admin société peut l'exécuter.
    return _company_admin(user) or "Président" in _user_group_roles(db, group, user)


def _require_manage(db: Session, group: OrganizationGroup, user: User) -> None:
    if not _can_manage(db, group, user):
        raise HTTPException(status_code=403, detail="Permission insuffisante sur ce groupe")


def _group_audit(db: Session, group_id: int, user: User, action: str, *,
                 target_type: str = "", target_id: int | None = None,
                 old: str = "", new: str = "", request: Request | None = None) -> None:
    ip = request.client.host if (request and request.client) else None
    db.add(GroupAuditLog(
        group_id=group_id, actor_user_id=user.id, action=action,
        target_type=target_type, target_id=target_id, old_value=old, new_value=new, ip_address=ip,
    ))


def _serialize_group(g: OrganizationGroup) -> dict:
    return {
        "id": g.id, "name": g.name, "type": g.type, "description": g.description,
        "country": g.country, "city": g.city, "address": g.address, "currency": g.currency,
        "linked_company_id": g.linked_company_id,
        "status": g.status, "is_active": g.is_active, "created_at": g.created_at,
    }


def _serialize_member(m: GroupMember, roles: list[str] | None = None) -> dict:
    return {
        "id": m.id, "full_name": m.full_name, "phone": m.phone, "email": m.email,
        "date_of_birth": m.date_of_birth, "zone": m.zone, "profession": m.profession,
        "member_number": m.member_number, "status": m.status, "is_active": m.is_active,
        "roles": roles or [],
        # Compte de connexion lié (None = aucun accès généré) : permet à l'app
        # d'afficher « Accès actif » et de proposer « Réinitialiser » vs « Générer ».
        "user_id": m.user_id,
    }


# ── Groupes ─────────────────────────────────────────────────────────────────
@router.post("", status_code=201)
def create_group(payload: GroupCreate, request: Request, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)) -> dict:
    group = OrganizationGroup(
        company_id=current_user.company_id,
        name=payload.name, type=payload.type, description=payload.description,
        country=payload.country, city=payload.city, address=payload.address, currency=payload.currency,
        linked_company_id=payload.linked_company_id,
        created_by_user_id=current_user.id,
    )
    db.add(group)
    db.flush()
    # Rôles internes par défaut
    role_by_name: dict[str, GroupRole] = {}
    for name in DEFAULT_GROUP_ROLES:
        role = GroupRole(group_id=group.id, name=name, permissions="[]")
        db.add(role)
        db.flush()
        role_by_name[name] = role
    # Le créateur devient membre + Président
    creator = GroupMember(group_id=group.id, user_id=current_user.id, full_name=current_user.full_name,
                          email=current_user.email, phone=current_user.phone, joined_at=date.today())
    db.add(creator)
    db.flush()
    db.add(GroupMemberRole(group_id=group.id, member_id=creator.id, role_id=role_by_name["Président"].id,
                           role_name="Président", assigned_by_user_id=current_user.id, is_current=True))
    db.add(GroupLeadershipHistory(group_id=group.id, president_member_id=creator.id,
                                  mandate_start=date.today(), elected_by="Fondateur", is_current=True))
    # Salon "Général" par défaut — créé à chaque nouveau groupe
    from app.api.routes_groups_g4 import seed_default_room
    seed_default_room(db, group.id, current_user.id)
    _group_audit(db, group.id, current_user, "group_created", target_type="group", target_id=group.id, request=request)
    db.commit()
    db.refresh(group)
    return _serialize_group(group)


@router.get("")
def list_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    groups = db.scalars(
        select(OrganizationGroup).where(
            OrganizationGroup.company_id == current_user.company_id,
            OrganizationGroup.is_active == True,  # noqa: E712
        ).order_by(OrganizationGroup.created_at.desc())
    ).all()

    if not groups:
        return []

    group_ids = [g.id for g in groups]

    # member counts (single query)
    count_rows = db.execute(
        select(GroupMember.group_id, func.count(GroupMember.id).label("cnt"))
        .where(GroupMember.group_id.in_(group_ids))
        .group_by(GroupMember.group_id)
    ).all()
    member_counts = {r.group_id: r.cnt for r in count_rows}

    # current user roles per group (single query)
    role_rows = db.execute(
        select(GroupMemberRole.group_id, GroupRole.name)
        .join(GroupRole, GroupRole.id == GroupMemberRole.role_id)
        .where(
            GroupMemberRole.group_id.in_(group_ids),
            GroupMemberRole.member_id.in_(
                select(GroupMember.id).where(
                    GroupMember.group_id.in_(group_ids),
                    GroupMember.user_id == current_user.id,
                )
            ),
        )
    ).all()
    my_roles: dict[int, list[str]] = {}
    for r in role_rows:
        my_roles.setdefault(r.group_id, []).append(r.name)

    result = []
    for g in groups:
        d = _serialize_group(g)
        d["member_count"] = member_counts.get(g.id, 0)
        d["my_roles"] = sorted(my_roles.get(g.id, []))
        d["can_manage"] = _can_manage(db, g, current_user)
        result.append(d)
    return result


@router.get("/portfolio/summary")
def group_portfolio_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    """Vue multi-organisation : groupes, membres, rattachements d'entités/filiales."""
    return build_group_portfolio(db, current_user.company_id)


@router.get("/{group_id}")
def get_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    members = db.scalars(select(GroupMember).where(GroupMember.group_id == group.id)).all()
    data = _serialize_group(group)
    data["member_count"] = len(members)
    data["my_roles"] = sorted(_user_group_roles(db, group, current_user))
    data["can_manage"] = _can_manage(db, group, current_user)
    return data


@router.put("/{group_id}")
def update_group(group_id: int, payload: GroupUpdate, request: Request, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _require_manage(db, group, current_user)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(group, field, value)
    _group_audit(db, group.id, current_user, "group_updated", target_type="group", target_id=group.id, request=request)
    db.commit()
    db.refresh(group)
    return _serialize_group(group)


@router.post("/{group_id}/close")
def close_group(group_id: int, payload: GroupClose, request: Request, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    if not _can_close_group(db, group, current_user):
        raise HTTPException(status_code=403, detail="Seul le Président du groupe peut le fermer")
    if group.status == "closed" and not group.is_active:
        return _serialize_group(group)

    old_value = json.dumps({"status": group.status, "is_active": group.is_active}, ensure_ascii=False)
    group.status = "closed"
    group.is_active = False
    new_value = json.dumps(
        {
            "status": group.status,
            "is_active": group.is_active,
            "reason": payload.reason.strip()[:500],
        },
        ensure_ascii=False,
    )
    _group_audit(
        db,
        group.id,
        current_user,
        "group_closed",
        target_type="group",
        target_id=group.id,
        old=old_value,
        new=new_value,
        request=request,
    )
    db.commit()
    db.refresh(group)
    return _serialize_group(group)


# ── Membres ─────────────────────────────────────────────────────────────────
@router.post("/{group_id}/members", status_code=201)
def add_member(group_id: int, payload: MemberCreate, request: Request, db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _require_manage(db, group, current_user)

    # ── Détection de compte KOMPTA existant (par email ou téléphone) ─────────
    # Si la personne a déjà un compte, on lie le membre à ce compte sans recréer.
    # Le membre apparaît directement dans la liste avec son compte associé.
    data = payload.model_dump()
    member = GroupMember(group_id=group.id, joined_at=date.today(), **data)

    # ── Détection prudente d'un compte existant ─────────────────────────────
    # On lie UNIQUEMENT si le compte trouvé a un rôle compatible avec un membre
    # de groupe (membre_groupe ou employé sans accès entreprise sensible). Sinon
    # on AJOUTE le membre comme nouveau et on laisse le président cliquer sur
    # "Générer un accès" pour créer un compte dédié. Ça évite d'écraser l'admin
    # d'une entreprise ou le compte d'un autre groupe.
    existing_user = None
    email_lookup = (data.get("email") or "").strip().lower()
    phone_lookup = normalize_phone(data.get("phone") or "")
    if email_lookup:
        existing_user = db.scalar(select(User).where(func.lower(User.email) == email_lookup))
    if not existing_user and phone_lookup:
        existing_user = db.scalar(select(User).where(User.phone == phone_lookup))

    SAFE_LINK_ROLES = {"membre_groupe"}
    if existing_user and existing_user.role in SAFE_LINK_ROLES:
        member.user_id = existing_user.id
        if not member.full_name and existing_user.full_name:
            member.full_name = existing_user.full_name
        if not member.email and existing_user.email:
            member.email = existing_user.email
        if not member.phone and existing_user.phone:
            member.phone = existing_user.phone
    elif existing_user:
        # Compte existant mais d'un autre type (admin entreprise, employé, etc.)
        # → on N'ÉCRASE PAS. Le président devra utiliser "Générer un accès" pour
        # créer un compte de groupe dédié si nécessaire.
        existing_user = None  # Ne pas signaler la liaison dans la réponse

    db.add(member)
    db.flush()
    _group_audit(db, group.id, current_user, "member_added", target_type="member", target_id=member.id,
                 new=member.full_name, request=request)
    db.commit()
    db.refresh(member)
    result = _serialize_member(member)
    if existing_user:
        result["linked_account"] = True
        result["message"] = f"{member.full_name} a déjà un compte KOMPTA — automatiquement lié au groupe"
    return result


@router.post("/{group_id}/members/{member_id}/provision-account", status_code=201)
def provision_member_account(
    group_id: int, member_id: int, request: Request,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
) -> dict:
    """Crée un compte utilisateur pour un membre du groupe.

    Si le membre a déjà un compte (user_id non null), retourne le compte existant.
    Sinon : crée un User avec rôle 'membre_groupe', interface minimale,
    mot de passe temporaire à transmettre au membre.

    Interface membre_groupe : dashboard, investissements, rédaction IA,
    documents, groupes, projets, chat, agenda.
    """
    group = _get_group(db, group_id, current_user)
    _require_manage(db, group, current_user)
    member = db.get(GroupMember, member_id)
    if not member or member.group_id != group.id:
        raise HTTPException(status_code=404, detail="Membre introuvable")

    # Si le membre est déjà lié à un compte
    if member.user_id:
        existing = db.get(User, member.user_id)
        if existing:
            return {
                "created": False,
                "user_id": existing.id,
                "login_identifier": existing.phone or existing.email,
                "account_status": existing.account_status,
                "message": "Compte déjà existant",
            }

    # Déduire l'identifiant de connexion
    phone = normalize_phone(member.phone or "")
    email = (member.email or "").strip().lower()
    if not email and phone:
        email = generated_email_from_phone(phone)
    if not email:
        raise HTTPException(status_code=400, detail="Email ou téléphone requis pour créer un compte")

    # Vérifier doublon par email ET par téléphone (les deux sont des identifiants
    # de connexion possibles, on ne peut PAS avoir 2 users avec le même).
    existing_user = db.scalar(select(User).where(User.email == email))
    if not existing_user and phone:
        existing_user = db.scalar(select(User).where(User.phone == phone))
    if existing_user:
        # SÉCURITÉ : on ne lie que si le compte existant est un membre_groupe.
        # Sinon (admin, employé…), on refuse pour ne pas écraser un compte
        # sensible avec un mot de passe temporaire.
        if existing_user.role != "membre_groupe":
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Un compte KOMPTA existe déjà avec cet email/téléphone "
                    f"(rôle: {existing_user.role}). Pour éviter d'écraser ce compte, "
                    f"demandez à ce membre de se connecter avec son compte existant — "
                    f"il sera automatiquement reconnu comme membre du groupe."
                ),
            )
        # Compte membre_groupe existant → liaison sûre
        member.user_id = existing_user.id
        db.commit()
        return {
            "created": False,
            "user_id": existing_user.id,
            "login_identifier": existing_user.phone or existing_user.email,
            "account_status": existing_user.account_status,
            "message": "Compte existant associé au membre",
        }

    from app.core.security import hash_password
    from datetime import timezone
    temp_password = generate_temporary_password()
    new_user = User(
        email=email,
        phone=phone,
        full_name=member.full_name,
        # Rôle dédié : interface minimale (dashboard/groupes/chat/docs/investissements/IA)
        role="membre_groupe",
        department=group.name,
        branch=group.city or group.country or "Groupe",
        password_hash=hash_password(temp_password),
        must_change_password=True,
        account_status="pending_first_login",
        invited_at=datetime.now(timezone.utc),
        is_active=True,
        # Rattaché à la société neutre "KOMPTA Platform", PAS à l'entreprise de
        # l'admin qui provisionne le compte — sinon ce membre de groupe
        # apparaîtrait dans les canaux de chat / listes d'employés de cette
        # entreprise (fuite de périmètre entre groupes et entreprises).
        company_id=_platform_company_id(db),
    )
    db.add(new_user)
    db.flush()
    member.user_id = new_user.id
    _group_audit(db, group.id, current_user, "member_account_provisioned",
                 target_type="member", target_id=member.id,
                 new=f"user_id={new_user.id}", request=request)
    db.commit()
    db.refresh(new_user)
    return {
        "created": True,
        "user_id": new_user.id,
        "login_identifier": phone or email,
        "temporary_password": temp_password,
        "account_status": new_user.account_status,
        "must_change_password": True,
        "message": f"Compte créé — transmets le mot de passe temporaire à {member.full_name}",
    }


@router.post("/{group_id}/leave", status_code=200)
def leave_group(
    group_id: int, request: Request,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
) -> dict:
    """L'utilisateur courant quitte volontairement le groupe.

    Refusé si le membre est le SEUL président (élire un successeur d'abord).
    Le compte KOMPTA n'est PAS désactivé — l'utilisateur garde l'accès à ses
    autres groupes (et entreprise si applicable).
    """
    group = _get_group(db, group_id, current_user)
    member = db.scalar(
        select(GroupMember).where(
            GroupMember.group_id == group.id,
            GroupMember.user_id == current_user.id,
        )
    )
    if not member:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas membre de ce groupe")

    # Vérifier qu'il n'est pas le dernier président
    from app.models.domain import GroupLeadershipHistory
    is_current_president = db.scalar(
        select(GroupLeadershipHistory).where(
            GroupLeadershipHistory.group_id == group.id,
            GroupLeadershipHistory.president_member_id == member.id,
            GroupLeadershipHistory.is_current == True,  # noqa: E712
        )
    )
    if is_current_president:
        raise HTTPException(
            status_code=409,
            detail="Vous êtes président de ce groupe — désignez un successeur avant de quitter.",
        )

    # Retirer rôles + membre (sans toucher au compte KOMPTA)
    db.execute(
        delete(GroupMemberRole).where(
            GroupMemberRole.group_id == group.id,
            GroupMemberRole.member_id == member.id,
        )
    )
    _group_audit(db, group.id, current_user, "member_left", target_type="member",
                 target_id=member.id, new=member.full_name, request=request)
    db.delete(member)
    db.commit()
    return {"left": True, "message": f"Vous avez quitté {group.name}."}


@router.delete("/{group_id}/members/{member_id}", status_code=204)
def delete_member(
    group_id: int, member_id: int, request: Request,
    also_delete_account: bool = True,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
) -> None:
    """Retire un membre du groupe.

    Si `also_delete_account=true` (défaut) et que le membre possède un compte
    KOMPTA (user_id non null), le compte est **désactivé** (pas supprimé : les
    données comptables restent) et marqué `account_status='archived'` pour
    permettre une réactivation ultérieure.

    Le président peut ensuite utiliser `provision-account` pour recréer un
    accès avec un nouveau mot de passe temporaire.
    """
    group = _get_group(db, group_id, current_user)
    _require_manage(db, group, current_user)
    member = db.get(GroupMember, member_id)
    if not member or member.group_id != group.id:
        raise HTTPException(status_code=404, detail="Membre introuvable")

    # Désactiver le compte KOMPTA lié (non-destructif — permet réactivation)
    if also_delete_account and member.user_id:
        linked_user = db.get(User, member.user_id)
        if linked_user:
            linked_user.is_active = False
            linked_user.account_status = "archived"
            # Révoquer toutes les sessions en cours
            linked_user.token_version = (linked_user.token_version or 0) + 1

    # Supprimer les rôles du membre
    db.execute(
        delete(GroupMemberRole).where(
            GroupMemberRole.group_id == group.id,
            GroupMemberRole.member_id == member.id,
        )
    )
    _group_audit(db, group.id, current_user, "member_removed",
                 target_type="member", target_id=member.id,
                 new=member.full_name, request=request)
    db.delete(member)
    db.commit()


@router.post("/{group_id}/members/{member_id}/reset-access", status_code=201)
def reset_member_access(
    group_id: int, member_id: int, request: Request,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
) -> dict:
    """Réinitialise l'accès d'un membre (mot de passe oublié / compte bloqué).

    Génère un nouveau mot de passe temporaire, réactive le compte si archivé,
    et force le changement au prochain login. Utiliser quand le membre a oublié
    son mot de passe ou que le compte a été désactivé par erreur.
    """
    group = _get_group(db, group_id, current_user)
    _require_manage(db, group, current_user)
    member = db.get(GroupMember, member_id)
    if not member or member.group_id != group.id:
        raise HTTPException(status_code=404, detail="Membre introuvable")

    if not member.user_id:
        raise HTTPException(status_code=400, detail="Ce membre n'a pas encore de compte KOMPTA. Utilisez 'Générer un accès'.")

    linked_user = db.get(User, member.user_id)
    if not linked_user:
        raise HTTPException(status_code=404, detail="Compte KOMPTA introuvable")

    # Garde-fou : un président ne peut RÉINITIALISER que les comptes de type
    # 'membre_groupe' (créés via Générer un accès). Refuser pour tout autre rôle
    # (admin entreprise, employé, super_admin…) — l'admin doit passer par la
    # procédure entreprise/admin pour ces comptes.
    if linked_user.role != "membre_groupe":
        raise HTTPException(
            status_code=403,
            detail=(
                "Ce membre est lié à un compte d'un autre type (entreprise/admin). "
                "Réinitialisation refusée pour protéger ce compte. Demandez à "
                "l'administrateur de l'entreprise de réinitialiser son mot de passe."
            ),
        )

    from app.core.security import hash_password
    temp_password = generate_temporary_password()
    linked_user.password_hash = hash_password(temp_password)
    linked_user.must_change_password = True
    linked_user.account_status = "pending_first_login"
    linked_user.is_active = True
    # Révoquer les sessions existantes (force reconnexion avec nouveau mdp)
    linked_user.token_version = (linked_user.token_version or 0) + 1

    _group_audit(db, group.id, current_user, "member_access_reset",
                 target_type="member", target_id=member.id,
                 new=f"user_id={linked_user.id}", request=request)
    db.commit()

    return {
        "user_id": linked_user.id,
        "login_identifier": linked_user.phone or linked_user.email,
        "temporary_password": temp_password,
        "must_change_password": True,
        "message": f"Accès réinitialisé pour {member.full_name} — nouveau mot de passe temporaire généré",
    }


@router.get("/{group_id}/members")
def list_members(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    group = _get_group(db, group_id, current_user)
    members = db.scalars(select(GroupMember).where(GroupMember.group_id == group.id).order_by(GroupMember.full_name)).all()
    # Rôles courants par membre
    role_rows = db.scalars(
        select(GroupMemberRole).where(GroupMemberRole.group_id == group.id, GroupMemberRole.is_current == True)  # noqa: E712
    ).all()
    roles_by_member: dict[int, list[str]] = {}
    for r in role_rows:
        roles_by_member.setdefault(r.member_id, []).append(r.role_name)
    return [_serialize_member(m, roles_by_member.get(m.id, [])) for m in members]


# ── Rôles ───────────────────────────────────────────────────────────────────
@router.get("/{group_id}/roles")
def list_roles(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    group = _get_group(db, group_id, current_user)
    roles = db.scalars(select(GroupRole).where(GroupRole.group_id == group.id)).all()
    return [{"id": r.id, "name": r.name, "permissions": json.loads(r.permissions or "[]")} for r in roles]


@router.post("/{group_id}/roles/assign", status_code=201)
def assign_role(group_id: int, payload: RoleAssign, request: Request, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _require_manage(db, group, current_user)
    member = db.get(GroupMember, payload.member_id)
    if not member or member.group_id != group.id:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    role = db.scalar(select(GroupRole).where(GroupRole.group_id == group.id, GroupRole.name == payload.role_name))
    if not role:
        raise HTTPException(status_code=404, detail="Rôle introuvable")
    db.add(GroupMemberRole(group_id=group.id, member_id=member.id, role_id=role.id, role_name=role.name,
                           assigned_by_user_id=current_user.id, reason=payload.reason, is_current=True))
    _group_audit(db, group.id, current_user, "role_assigned", target_type="member", target_id=member.id,
                 new=role.name, request=request)
    db.commit()
    return {"member_id": member.id, "role": role.name}


# ── Bureau & mandats ────────────────────────────────────────────────────────
@router.post("/{group_id}/leadership/change", status_code=201)
def change_leadership(group_id: int, payload: LeadershipChange, request: Request, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)) -> dict:
    """Change le bureau en conservant l'historique : clôture le mandat courant,
    ouvre un nouveau, et réaffecte les rôles Président/Trésorier/Secrétaire/VP."""
    group = _get_group(db, group_id, current_user)
    _require_manage(db, group, current_user)

    # Clôturer le mandat courant
    current = db.scalar(
        select(GroupLeadershipHistory).where(
            GroupLeadershipHistory.group_id == group.id,
            GroupLeadershipHistory.is_current == True,  # noqa: E712
        )
    )
    old_label = ""
    if current:
        current.is_current = False
        current.mandate_end = payload.mandate_start or date.today()
        old_label = f"president={current.president_member_id}"

    # Nouveau mandat
    mandate = GroupLeadershipHistory(
        group_id=group.id,
        president_member_id=payload.president_member_id,
        vice_president_member_id=payload.vice_president_member_id,
        secretary_member_id=payload.secretary_member_id,
        treasurer_member_id=payload.treasurer_member_id,
        mandate_start=payload.mandate_start or date.today(),
        mandate_end=payload.mandate_end,
        elected_by=payload.elected_by,
        election_notes=payload.election_notes,
        is_current=True,
    )
    db.add(mandate)

    # Réaffecter les rôles : clôturer les anciens titulaires, nommer les nouveaux
    role_map = {
        "Président": payload.president_member_id,
        "Vice-président": payload.vice_president_member_id,
        "Secrétaire": payload.secretary_member_id,
        "Trésorier": payload.treasurer_member_id,
    }
    for role_name, member_id in role_map.items():
        if member_id is None:
            continue
        # clôturer les titulaires actuels de ce rôle
        for prev in db.scalars(select(GroupMemberRole).where(
            GroupMemberRole.group_id == group.id, GroupMemberRole.role_name == role_name,
            GroupMemberRole.is_current == True,  # noqa: E712
        )).all():
            prev.is_current = False
            prev.ended_at = datetime.now(timezone.utc)
        role = db.scalar(select(GroupRole).where(GroupRole.group_id == group.id, GroupRole.name == role_name))
        if role:
            db.add(GroupMemberRole(group_id=group.id, member_id=member_id, role_id=role.id, role_name=role_name,
                                   assigned_by_user_id=current_user.id, reason="Changement de bureau", is_current=True))

    _group_audit(db, group.id, current_user, "leadership_changed", target_type="leadership",
                 target_id=mandate.id, old=old_label, new=f"president={payload.president_member_id}", request=request)
    db.commit()
    db.refresh(mandate)
    return {"id": mandate.id, "mandate_start": mandate.mandate_start, "is_current": True}


@router.get("/{group_id}/leadership")
def get_leadership(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    history = db.scalars(
        select(GroupLeadershipHistory).where(GroupLeadershipHistory.group_id == group.id)
        .order_by(GroupLeadershipHistory.mandate_start.desc())
    ).all()

    def _ser(h: GroupLeadershipHistory) -> dict:
        return {
            "id": h.id, "president_member_id": h.president_member_id,
            "vice_president_member_id": h.vice_president_member_id,
            "secretary_member_id": h.secretary_member_id, "treasurer_member_id": h.treasurer_member_id,
            "mandate_start": h.mandate_start, "mandate_end": h.mandate_end,
            "elected_by": h.elected_by, "is_current": h.is_current,
        }

    current = next((h for h in history if h.is_current), None)
    return {"current": _ser(current) if current else None, "history": [_ser(h) for h in history]}
