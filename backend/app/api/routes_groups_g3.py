"""
routes_groups_g3.py — Réunions, activités, calendrier, anniversaires, rappels, votes.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes_groups import (
    MANAGER_ROLE_NAMES,
    _get_group,
    _group_audit,
    _user_group_roles,
    _company_admin,
)
from app.db.session import get_db
from app.models import (
    GroupActivity,
    GroupMember,
    GroupMeeting,
    GroupReminder,
    GroupVote,
    GroupVoteResponse,
    OrganizationGroup,
    User,
)

router = APIRouter(prefix="/groups", tags=["groups-g3"])


def _can_manage(db: Session, group: OrganizationGroup, user: User) -> bool:
    return _company_admin(user) or bool(_user_group_roles(db, group, user) & MANAGER_ROLE_NAMES)


def _require_manage(db: Session, group: OrganizationGroup, user: User) -> None:
    if not _can_manage(db, group, user):
        raise HTTPException(status_code=403, detail="Permission insuffisante sur ce groupe")


# ── Schemas ─────────────────────────────────────────────────────────────────
class MeetingCreate(BaseModel):
    title: str
    description: str = ""
    location: str = ""
    start_datetime: datetime
    end_datetime: datetime | None = None
    meeting_type: str = "ordinaire"
    agenda: str = ""
    reminder_enabled: bool = True


class ActivityCreate(BaseModel):
    title: str
    description: str = ""
    activity_type: str = ""
    location: str = ""
    start_datetime: datetime
    end_datetime: datetime | None = None
    budget: float = 0
    responsible_member_id: int | None = None


class VoteCreate(BaseModel):
    title: str
    description: str = ""
    options: list[str]
    start_datetime: datetime
    end_datetime: datetime
    visibility: str = "members"


class VoteSubmit(BaseModel):
    selected_option: str


class MinutesUpdate(BaseModel):
    minutes: str


# ── Réunions ─────────────────────────────────────────────────────────────────
@router.post("/{group_id}/meetings", status_code=201)
def create_meeting(group_id: int, payload: MeetingCreate, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _require_manage(db, group, current_user)
    meeting = GroupMeeting(
        group_id=group.id, title=payload.title, description=payload.description,
        location=payload.location, start_datetime=payload.start_datetime,
        end_datetime=payload.end_datetime, meeting_type=payload.meeting_type,
        agenda=payload.agenda, reminder_enabled=payload.reminder_enabled,
        created_by_user_id=current_user.id,
    )
    db.add(meeting)
    if payload.reminder_enabled:
        remind_at = payload.start_datetime - timedelta(hours=24)
        db.add(GroupReminder(
            group_id=group.id, target_type="meeting", target_id=meeting.id if hasattr(meeting, 'id') else None,
            title=f"Rappel réunion : {payload.title}",
            message=f"Réunion « {payload.title} » demain à {payload.start_datetime.strftime('%H:%M')} — {payload.location or 'lieu non précisé'}",
            remind_at=remind_at, channels="app,email",
            created_by_user_id=current_user.id,
        ))
    db.commit()
    db.refresh(meeting)
    return _ser_meeting(meeting)


@router.get("/{group_id}/meetings")
def list_meetings(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    group = _get_group(db, group_id, current_user)
    meetings = db.scalars(select(GroupMeeting).where(GroupMeeting.group_id == group.id)
                          .order_by(GroupMeeting.start_datetime.desc())).all()
    return [_ser_meeting(m) for m in meetings]


@router.patch("/{group_id}/meetings/{meeting_id}/minutes")
def update_minutes(group_id: int, meeting_id: int, payload: MinutesUpdate, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _require_manage(db, group, current_user)
    meeting = db.get(GroupMeeting, meeting_id)
    if not meeting or meeting.group_id != group.id:
        raise HTTPException(status_code=404, detail="Réunion introuvable")
    meeting.minutes = payload.minutes
    meeting.status = "done"
    db.commit()
    db.refresh(meeting)
    return _ser_meeting(meeting)


def _ser_meeting(m: GroupMeeting) -> dict:
    return {
        "id": m.id, "title": m.title, "description": m.description,
        "location": m.location, "start_datetime": m.start_datetime,
        "end_datetime": m.end_datetime, "meeting_type": m.meeting_type,
        "agenda": m.agenda, "minutes": m.minutes, "status": m.status,
        "reminder_enabled": m.reminder_enabled, "created_at": m.created_at,
    }


# ── Activités ─────────────────────────────────────────────────────────────────
@router.post("/{group_id}/activities", status_code=201)
def create_activity(group_id: int, payload: ActivityCreate, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _require_manage(db, group, current_user)
    from app.services.accounting import to_cents
    activity = GroupActivity(
        group_id=group.id, title=payload.title, description=payload.description,
        activity_type=payload.activity_type, location=payload.location,
        start_datetime=payload.start_datetime, end_datetime=payload.end_datetime,
        budget_cents=to_cents(payload.budget),
        responsible_member_id=payload.responsible_member_id,
        created_by_user_id=current_user.id,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return _ser_activity(activity)


@router.get("/{group_id}/activities")
def list_activities(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    group = _get_group(db, group_id, current_user)
    activities = db.scalars(select(GroupActivity).where(GroupActivity.group_id == group.id)
                             .order_by(GroupActivity.start_datetime.desc())).all()
    return [_ser_activity(a) for a in activities]


def _ser_activity(a: GroupActivity) -> dict:
    from app.services.accounting import from_cents
    return {
        "id": a.id, "title": a.title, "activity_type": a.activity_type,
        "location": a.location, "start_datetime": a.start_datetime,
        "end_datetime": a.end_datetime, "budget": from_cents(a.budget_cents),
        "status": a.status, "created_at": a.created_at,
    }


# ── Calendrier agrégé ────────────────────────────────────────────────────────
@router.get("/{group_id}/calendar")
def get_calendar(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    """Calendrier unifié : réunions + activités + anniversaires du mois + rappels."""
    group = _get_group(db, group_id, current_user)
    events = []
    now = datetime.now(timezone.utc)
    # Réunions
    for m in db.scalars(select(GroupMeeting).where(GroupMeeting.group_id == group.id, GroupMeeting.status != "cancelled")).all():
        events.append({"type": "meeting", "id": m.id, "title": m.title, "start": m.start_datetime,
                        "location": m.location, "status": m.status})
    # Activités
    for a in db.scalars(select(GroupActivity).where(GroupActivity.group_id == group.id)).all():
        events.append({"type": "activity", "id": a.id, "title": a.title, "start": a.start_datetime,
                        "status": a.status})
    # Votes en cours
    for v in db.scalars(select(GroupVote).where(GroupVote.group_id == group.id, GroupVote.status == "open")).all():
        events.append({"type": "vote", "id": v.id, "title": v.title,
                        "start": v.start_datetime, "end": v.end_datetime})
    # Anniversaires ce mois
    for anniversary in _upcoming_birthdays(db, group.id, days=30):
        events.append(anniversary)
    events.sort(key=lambda e: (e["start"] if isinstance(e["start"], datetime) else datetime.combine(e["start"], datetime.min.time())) if e.get("start") else datetime.max)
    return {"group_id": group.id, "events": events}


def _upcoming_birthdays(db: Session, group_id: int, days: int = 30) -> list[dict]:
    today = date.today()
    members = db.scalars(select(GroupMember).where(
        GroupMember.group_id == group_id, GroupMember.date_of_birth != None  # noqa: E711
    )).all()
    result = []
    for m in members:
        dob = m.date_of_birth
        try:
            next_bday = dob.replace(year=today.year)
        except ValueError:  # 29 fév
            next_bday = dob.replace(year=today.year, day=28)
        if next_bday < today:
            try:
                next_bday = next_bday.replace(year=today.year + 1)
            except ValueError:
                next_bday = next_bday.replace(year=today.year + 1, day=28)
        if (next_bday - today).days <= days:
            result.append({
                "type": "birthday", "member_id": m.id, "member_name": m.full_name,
                "start": next_bday, "title": f"🎂 Anniversaire de {m.full_name}",
                "days_until": (next_bday - today).days,
            })
    return sorted(result, key=lambda x: x["days_until"])


@router.get("/{group_id}/birthdays")
def list_birthdays(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    group = _get_group(db, group_id, current_user)
    return _upcoming_birthdays(db, group.id, days=365)


# ── Rappels ─────────────────────────────────────────────────────────────────
@router.get("/{group_id}/reminders")
def list_reminders(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    group = _get_group(db, group_id, current_user)
    reminders = db.scalars(select(GroupReminder).where(GroupReminder.group_id == group.id)
                            .order_by(GroupReminder.remind_at.asc())).all()
    return [{"id": r.id, "title": r.title, "message": r.message, "remind_at": r.remind_at,
             "target_type": r.target_type, "status": r.status} for r in reminders]


# ── Votes ────────────────────────────────────────────────────────────────────
@router.post("/{group_id}/votes", status_code=201)
def create_vote(group_id: int, payload: VoteCreate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _require_manage(db, group, current_user)
    vote = GroupVote(
        group_id=group.id, title=payload.title, description=payload.description,
        options=json.dumps(payload.options, ensure_ascii=False),
        start_datetime=payload.start_datetime, end_datetime=payload.end_datetime,
        visibility=payload.visibility, created_by_user_id=current_user.id,
    )
    db.add(vote)
    db.commit()
    db.refresh(vote)
    return _ser_vote(vote)


@router.post("/{group_id}/votes/{vote_id}/respond", status_code=201)
def respond_to_vote(group_id: int, vote_id: int, payload: VoteSubmit, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    vote = db.get(GroupVote, vote_id)
    if not vote or vote.group_id != group.id:
        raise HTTPException(status_code=404, detail="Vote introuvable")
    if vote.status != "open":
        raise HTTPException(status_code=409, detail="Ce vote est clos")
    member = db.scalar(select(GroupMember).where(GroupMember.group_id == group.id, GroupMember.user_id == current_user.id))
    if not member:
        raise HTTPException(status_code=403, detail="Vous n'êtes pas membre de ce groupe")
    # vérifier qu'il n'a pas déjà voté
    existing = db.scalar(select(GroupVoteResponse).where(GroupVoteResponse.vote_id == vote.id, GroupVoteResponse.member_id == member.id))
    if existing:
        raise HTTPException(status_code=409, detail="Vous avez déjà voté")
    options = json.loads(vote.options or "[]")
    if payload.selected_option not in options:
        raise HTTPException(status_code=400, detail=f"Option invalide. Choix : {options}")
    resp = GroupVoteResponse(vote_id=vote.id, member_id=member.id, selected_option=payload.selected_option)
    db.add(resp)
    db.commit()
    return {"vote_id": vote_id, "selected": payload.selected_option}


@router.get("/{group_id}/votes/{vote_id}/results")
def vote_results(group_id: int, vote_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    vote = db.get(GroupVote, vote_id)
    if not vote or vote.group_id != group.id:
        raise HTTPException(status_code=404, detail="Vote introuvable")
    responses = db.scalars(select(GroupVoteResponse).where(GroupVoteResponse.vote_id == vote.id)).all()
    tally: dict[str, int] = {}
    for r in responses:
        tally[r.selected_option] = tally.get(r.selected_option, 0) + 1
    total = sum(tally.values())
    options = json.loads(vote.options or "[]")
    return {
        "vote_id": vote.id, "title": vote.title, "status": vote.status,
        "total_votes": total,
        "results": [{"option": o, "count": tally.get(o, 0),
                      "percent": round(100 * tally.get(o, 0) / total, 1) if total else 0} for o in options],
    }


@router.get("/{group_id}/votes")
def list_votes(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    group = _get_group(db, group_id, current_user)
    votes = db.scalars(select(GroupVote).where(GroupVote.group_id == group.id)
                        .order_by(GroupVote.start_datetime.desc())).all()
    return [_ser_vote(v) for v in votes]


def _ser_vote(v: GroupVote) -> dict:
    return {
        "id": v.id, "title": v.title, "options": json.loads(v.options or "[]"),
        "start_datetime": v.start_datetime, "end_datetime": v.end_datetime,
        "status": v.status, "created_at": v.created_at,
    }
