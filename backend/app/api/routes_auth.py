"""
routes_auth.py — Authentification à deux facteurs (TOTP).

Endpoints :
  POST /auth/2fa/setup   — génère un secret TOTP et le stocke dans le User
  POST /auth/2fa/verify  — vérifie un code TOTP
  POST /auth/2fa/enable  — active le 2FA pour le user courant
  POST /auth/2fa/disable — désactive le 2FA pour le user courant
"""

from __future__ import annotations

import pyotp

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User

router = APIRouter(tags=["auth"])


class TotpVerifyRequest(BaseModel):
    code: str


@router.post("/auth/2fa/setup")
def setup_2fa(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Génère un nouveau secret TOTP et retourne l'URI OTP pour QR code."""
    secret = pyotp.random_base32()
    current_user.totp_secret = secret
    db.commit()
    totp = pyotp.TOTP(secret)
    qr_uri = totp.provisioning_uri(
        name=current_user.email,
        issuer_name="KOMPTA",
    )
    return {"secret": secret, "qr_uri": qr_uri}


@router.post("/auth/2fa/verify")
def verify_2fa(
    payload: TotpVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Vérifie un code TOTP 6 chiffres contre le secret stocké."""
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA non configuré. Appelez /auth/2fa/setup d'abord.")
    totp = pyotp.TOTP(current_user.totp_secret)
    verified = totp.verify(payload.code, valid_window=1)
    return {"verified": verified}


@router.post("/auth/2fa/enable")
def enable_2fa(
    payload: TotpVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Active le 2FA pour le user après validation d'un code TOTP."""
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA non configuré. Appelez /auth/2fa/setup d'abord.")
    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Code TOTP invalide")
    current_user.totp_enabled = True
    db.commit()
    return {"message": "2FA activé avec succès", "totp_enabled": True}


@router.post("/auth/2fa/disable")
def disable_2fa(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Désactive le 2FA pour le user courant."""
    current_user.totp_enabled = False
    current_user.totp_secret = None
    db.commit()
    return {"message": "2FA désactivé", "totp_enabled": False}
