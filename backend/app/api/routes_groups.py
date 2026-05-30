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
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import (
    GroupAuditLog,
    GroupLeadershipHistory,
    GroupMember,
    GroupMemberRole,
    GroupRole,
    OrganizationGroup,
    User,
)

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


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    city: str | None = None
    address: str | None = None
    status: str | None = None


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
        "status": g.status, "is_active": g.is_active, "created_at": g.created_at,
    }


def _serialize_member(m: GroupMember, roles: list[str] | None = None) -> dict:
    return {
        "id": m.id, "full_name": m.full_name, "phone": m.phone, "email": m.email,
        "date_of_birth": m.date_of_birth, "zone": m.zone, "profession": m.profession,
        "member_number": m.member_number, "status": m.status, "is_active": m.is_active,
        "roles": roles or [],
    }


# ── Groupes ─────────────────────────────────────────────────────────────────
@router.post("", status_code=201)
def create_group(payload: GroupCreate, request: Request, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)) -> dict:
    group = OrganizationGroup(
        company_id=current_user.company_id,
        name=payload.name, type=payload.type, description=payload.description,
        country=payload.country, city=payload.city, address=payload.address, currency=payload.currency,
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
    return [_serialize_group(g) for g in groups]


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


# ── Membres ─────────────────────────────────────────────────────────────────
@router.post("/{group_id}/members", status_code=201)
def add_member(group_id: int, payload: MemberCreate, request: Request, db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _require_manage(db, group, current_user)
    member = GroupMember(group_id=group.id, joined_at=date.today(), **payload.model_dump())
    db.add(member)
    db.flush()
    _group_audit(db, group.id, current_user, "member_added", target_type="member", target_id=member.id,
                 new=member.full_name, request=request)
    db.commit()
    db.refresh(member)
    return _serialize_member(member)


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
