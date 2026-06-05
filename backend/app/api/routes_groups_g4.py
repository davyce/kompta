"""
routes_groups_g4.py — Chat de groupe, médias, documents.

Chat temps réel via WebSocket (réutilise le ConnectionManager existant).
Médias : upload sécurisé stocké dans storage/groups/{group_id}/.
Documents : PDF, images, contrats, PV, reçus — visibilité members|bureau|public.
"""
from __future__ import annotations

import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.api.routes_groups import _get_group, _user_group_roles, _company_admin, MANAGER_ROLE_NAMES
from app.core.security import decode_access_token
from app.db.session import SessionLocal, get_db
from app.models import GroupChatMessage, GroupChatRoom, GroupDocument, GroupMember, OrganizationGroup, User

router = APIRouter(prefix="/groups", tags=["groups-g4"])

STORAGE_ROOT = Path(os.getenv("DOCUMENT_STORAGE_DIR", "storage/documents")).parent / "groups"
STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

ALLOWED_MIME = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/webm",
    "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


class MessageCreate(BaseModel):
    content: str = ""
    message_type: str = "text"
    gif_url: str = ""
    reply_to_id: int | None = None


class ReactionUpdate(BaseModel):
    emoji: str


class RoomCreate(BaseModel):
    name: str
    room_type: str = "general"


# ── Salons de chat ───────────────────────────────────────────────────────────
@router.post("/{group_id}/chat/rooms", status_code=201)
def create_room(group_id: int, payload: RoomCreate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    # Le président / bureau / admin entreprise peuvent créer des salons.
    user_roles = _user_group_roles(db, group, current_user)
    ALLOWED = MANAGER_ROLE_NAMES | {"Président", "Secrétaire", "Trésorier"}
    if not (_company_admin(current_user) or user_roles & ALLOWED):
        raise HTTPException(status_code=403, detail="Permission insuffisante")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom du salon est requis")
    room = GroupChatRoom(group_id=group.id, name=name, type=payload.room_type,
                         created_by_user_id=current_user.id)
    db.add(room)
    db.commit()
    db.refresh(room)
    return _ser_room(room)


def seed_default_room(db: Session, group_id: int, creator_user_id: int) -> GroupChatRoom:
    """Crée le salon 'Général' par défaut pour un nouveau groupe."""
    existing = db.scalar(select(GroupChatRoom).where(GroupChatRoom.group_id == group_id))
    if existing:
        return existing
    room = GroupChatRoom(group_id=group_id, name="Général", type="general",
                         created_by_user_id=creator_user_id)
    db.add(room)
    db.flush()
    return room


@router.get("/{group_id}/chat/rooms")
def list_rooms(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    group = _get_group(db, group_id, current_user)
    user_roles = _user_group_roles(db, group, current_user)
    rooms = db.scalars(select(GroupChatRoom).where(GroupChatRoom.group_id == group.id)).all()
    visible = []
    for r in rooms:
        if r.type == "bureau" and not (user_roles & (MANAGER_ROLE_NAMES | {"Secrétaire", "Trésorier"})):
            continue
        if r.type == "finance" and not (user_roles & (MANAGER_ROLE_NAMES | {"Trésorier", "Commissaire aux comptes"})):
            continue
        visible.append(_ser_room(r))
    return visible


def _ser_room(r: GroupChatRoom) -> dict:
    return {"id": r.id, "name": r.name, "type": r.type, "created_at": r.created_at}


# ── Messages ─────────────────────────────────────────────────────────────────
@router.get("/{group_id}/chat/rooms/{room_id}/messages")
def list_messages(group_id: int, room_id: int, limit: int = 60, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)) -> list[dict]:
    group = _get_group(db, group_id, current_user)
    room = _get_room(db, room_id, group.id)
    msgs = db.scalars(
        select(GroupChatMessage).where(GroupChatMessage.room_id == room.id, GroupChatMessage.deleted_at == None)  # noqa: E711
        .order_by(GroupChatMessage.created_at.desc()).limit(min(limit, 200))
    ).all()
    return [_ser_msg(m) for m in reversed(msgs)]


@router.post("/{group_id}/chat/rooms/{room_id}/messages", status_code=201)
def post_message(group_id: int, room_id: int, payload: MessageCreate, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _assert_is_member(db, group, current_user)
    room = _get_room(db, room_id, group.id)
    msg = GroupChatMessage(
        room_id=room.id, sender_user_id=current_user.id, sender_name=current_user.full_name,
        content=payload.content, message_type=payload.message_type,
        gif_url=payload.gif_url, reply_to_id=payload.reply_to_id,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _ser_msg(msg)


@router.post("/{group_id}/chat/rooms/{room_id}/messages/upload", status_code=201)
async def upload_media_message(
    group_id: int, room_id: int, file: UploadFile = File(...),
    message_type: str = Form("image"), reply_to_id: int | None = Form(None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
) -> dict:
    group = _get_group(db, group_id, current_user)
    _assert_is_member(db, group, current_user)
    room = _get_room(db, room_id, group.id)
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=415, detail=f"Type {file.content_type} non autorisé")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 50 MB)")
    folder = STORAGE_ROOT / str(group.id)
    folder.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "file").suffix
    fname = f"{uuid.uuid4().hex}{ext}"
    fpath = folder / fname
    fpath.write_bytes(content)
    media_url = f"/groups/{group.id}/media/{fname}"
    msg = GroupChatMessage(
        room_id=room.id, sender_user_id=current_user.id, sender_name=current_user.full_name,
        content=file.filename or "", message_type=message_type,
        media_url=media_url, reply_to_id=reply_to_id,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _ser_msg(msg)


@router.post("/{group_id}/chat/rooms/{room_id}/messages/{msg_id}/react")
def react_to_message(group_id: int, room_id: int, msg_id: int, payload: ReactionUpdate,
                     db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    msg = db.get(GroupChatMessage, msg_id)
    if not msg or msg.room_id != room_id:
        raise HTTPException(status_code=404, detail="Message introuvable")
    reactions = json.loads(msg.reactions or "{}")
    reactions[payload.emoji] = reactions.get(payload.emoji, 0) + 1
    msg.reactions = json.dumps(reactions, ensure_ascii=False)
    db.commit()
    return {"reactions": reactions}


@router.delete("/{group_id}/chat/rooms/{room_id}/messages/{msg_id}")
def delete_message(group_id: int, room_id: int, msg_id: int, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    msg = db.get(GroupChatMessage, msg_id)
    if not msg or msg.room_id != room_id:
        raise HTTPException(status_code=404, detail="Message introuvable")
    is_own = msg.sender_user_id == current_user.id
    can_mod = _company_admin(current_user) or bool(_user_group_roles(db, group, current_user) & (MANAGER_ROLE_NAMES | {"Modérateur"}))
    if not is_own and not can_mod:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas supprimer ce message")
    msg.deleted_at = datetime.now(timezone.utc)
    msg.content = ""
    db.commit()
    return {"deleted": True}


def _ser_msg(m: GroupChatMessage) -> dict:
    return {
        "id": m.id, "room_id": m.room_id, "sender_name": m.sender_name,
        "content": m.content, "message_type": m.message_type,
        "media_url": m.media_url, "gif_url": m.gif_url,
        "reply_to_id": m.reply_to_id, "reactions": json.loads(m.reactions or "{}"),
        "pinned": m.pinned, "created_at": m.created_at,
        "edited_at": m.edited_at, "deleted_at": m.deleted_at,
    }


# ── Documents ─────────────────────────────────────────────────────────────────
@router.post("/{group_id}/documents", status_code=201)
async def upload_document(
    group_id: int, file: UploadFile = File(...),
    title: str = Form(""), category: str = Form("autre"), visibility: str = Form("members"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
) -> dict:
    group = _get_group(db, group_id, current_user)
    _assert_is_member(db, group, current_user)
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 50 MB)")
    folder = STORAGE_ROOT / str(group.id) / "docs"
    folder.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "file").suffix
    fname = f"{uuid.uuid4().hex}{ext}"
    (folder / fname).write_bytes(content)
    doc = GroupDocument(
        group_id=group.id, title=title or (file.filename or "Document"),
        filename=file.filename or "", storage_path=str(folder / fname),
        category=category, visibility=visibility,
        uploaded_by_user_id=current_user.id,
        size_bytes=len(content), mime_type=file.content_type or "",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return _ser_doc(doc)


@router.get("/{group_id}/documents")
def list_documents(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    group = _get_group(db, group_id, current_user)
    user_roles = _user_group_roles(db, group, current_user)
    can_bureau = _company_admin(current_user) or bool(user_roles & (MANAGER_ROLE_NAMES | {"Trésorier", "Secrétaire"}))
    docs = db.scalars(select(GroupDocument).where(GroupDocument.group_id == group.id)
                       .order_by(GroupDocument.created_at.desc())).all()
    visible = [d for d in docs if d.visibility == "members" or (d.visibility == "bureau" and can_bureau) or d.visibility == "public"]
    return [_ser_doc(d) for d in visible]


def _ser_doc(d: GroupDocument) -> dict:
    return {
        "id": d.id, "title": d.title, "filename": d.filename, "category": d.category,
        "visibility": d.visibility, "size_bytes": d.size_bytes, "mime_type": d.mime_type,
        "created_at": d.created_at,
    }


# ── WebSocket temps réel ──────────────────────────────────────────────────────
class GroupWSManager:
    def __init__(self):
        self._rooms: dict[int, list[WebSocket]] = {}

    async def connect(self, room_id: int, ws: WebSocket):
        await ws.accept()
        self._rooms.setdefault(room_id, []).append(ws)

    def disconnect(self, room_id: int, ws: WebSocket):
        self._rooms.get(room_id, []).discard if hasattr(self._rooms.get(room_id, []), 'discard') else None
        try:
            self._rooms.get(room_id, []).remove(ws)
        except ValueError:
            pass

    async def broadcast(self, room_id: int, data: dict):
        payload = json.dumps(data, default=str)
        dead = []
        for ws in list(self._rooms.get(room_id, [])):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(room_id, ws)


_group_ws_manager = GroupWSManager()


@router.websocket("/{group_id}/chat/rooms/{room_id}/ws")
async def group_chat_ws(group_id: int, room_id: int, websocket: WebSocket, token: str = ""):
    """WebSocket temps réel du chat de groupe.

    Authentification par ticket temps réel court-vécu, pas par JWT de session long.
    """
    payload = decode_access_token(token) if token else None
    if not payload or payload.get("purpose") != "realtime":
        await websocket.close(code=4001)
        return
    with SessionLocal() as db:
        user = db.get(User, int(payload["sub"]))
        if not user or not user.is_active:
            await websocket.close(code=4001)
            return
        if int(payload.get("ver", 0)) != int(getattr(user, "token_version", 0) or 0):
            await websocket.close(code=4001)
            return
        group = db.scalar(select(OrganizationGroup).where(
            OrganizationGroup.id == group_id, OrganizationGroup.company_id == user.company_id
        ))
        if not group:
            await websocket.close(code=4003)
            return
        is_member = db.scalar(select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user.id))
        if not is_member and not _company_admin(user):
            await websocket.close(code=4003)
            return
        room = db.get(GroupChatRoom, room_id)
        if not room or room.group_id != group_id:
            await websocket.close(code=4003)
            return
    await _group_ws_manager.connect(room_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await _group_ws_manager.broadcast(room_id, {"type": "message", "room_id": room_id, **data})
    except WebSocketDisconnect:
        _group_ws_manager.disconnect(room_id, websocket)


# ── Helpers ───────────────────────────────────────────────────────────────────
def _get_room(db: Session, room_id: int, group_id: int) -> GroupChatRoom:
    room = db.get(GroupChatRoom, room_id)
    if not room or room.group_id != group_id:
        raise HTTPException(status_code=404, detail="Salon introuvable")
    return room


def _assert_is_member(db: Session, group: OrganizationGroup, user: User) -> None:
    if _company_admin(user):
        return
    member = db.scalar(select(GroupMember).where(GroupMember.group_id == group.id, GroupMember.user_id == user.id))
    if not member or not member.is_active:
        raise HTTPException(status_code=403, detail="Vous n'êtes pas membre de ce groupe")


# ── Serveur de médias chat (accès restreint aux membres du groupe) ───────────
import mimetypes
from fastapi.responses import FileResponse


@router.get("/{group_id}/media/{filename}")
def serve_group_media(
    group_id: int,
    filename: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """Sert un fichier média uploadé dans un salon de chat de groupe.

    Sécurité : seul un membre actif du groupe (ou un admin entreprise) peut
    récupérer un média — l'URL n'est pas devinable mais on vérifie quand même
    l'appartenance pour les liens partagés inter-membres."""
    group = _get_group(db, group_id, current_user)
    _assert_is_member(db, group, current_user)

    # Refus traversal "../"
    safe_name = Path(filename).name
    if safe_name != filename or not safe_name:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")

    fpath = STORAGE_ROOT / str(group.id) / safe_name
    if not fpath.exists():
        raise HTTPException(status_code=404, detail="Média introuvable")

    media_type, _ = mimetypes.guess_type(str(fpath))
    return FileResponse(
        path=str(fpath),
        media_type=media_type or "application/octet-stream",
        filename=safe_name,
    )
