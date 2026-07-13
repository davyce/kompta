"""
email.py
--------
Service d'envoi d'emails async pour KOMPTA.
Utilise aiosmtplib + templates HTML inline.
"""

import logging
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
import certifi

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Contexte TLS basé sur le bundle de CA `certifi` (à jour) — évite les erreurs
# « CERTIFICATE_VERIFY_FAILED » du Python framework macOS et fonctionne sur Linux.
_TLS_CONTEXT = ssl.create_default_context(cafile=certifi.where())


# ─────────────────────────────────────────────────────────────────────────────
# Fonction de base
# ─────────────────────────────────────────────────────────────────────────────

async def send_email(to: str, subject: str, html_body: str) -> bool:
    """Envoie un email. Retourne True si succès, False sinon (ne raise pas)."""
    settings = get_settings()
    if not settings.email_enabled:
        logger.info(f"[EMAIL DISABLED] To: {to} | Subject: {subject}")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            start_tls=settings.smtp_tls,
            tls_context=_TLS_CONTEXT,
        )
        logger.info(f"[EMAIL SENT] To: {to} | Subject: {subject}")
        return True
    except Exception as e:
        logger.error(f"[EMAIL ERROR] To: {to} | {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Helper : wrapper HTML commun
# ─────────────────────────────────────────────────────────────────────────────

def _wrap_email(header_color: str, header_content: str, body_content: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>KOMPTA</title>
</head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;box-shadow:0 8px 32px rgba(15,23,42,0.10);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:{header_color};background-image:linear-gradient(135deg,{header_color},rgba(0,0,0,0.18));padding:34px 40px 30px;text-align:center;">
              {header_content}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:34px 40px 30px;color:#334155;font-size:15px;line-height:1.65;">
              {body_content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e7ecf2;padding:24px 40px;text-align:center;">
              <div style="font-size:15px;font-weight:800;letter-spacing:1px;color:#0f766e;">KOMPTA</div>
              <div style="margin:4px 0 12px;font-size:11px;color:#94a3b8;">ERP IA pour PME · CEMAC · SYSCOHADA</div>
              <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
                © 2026 KOMPTA · Tous droits réservés<br />
                Email automatique — merci de ne pas y répondre.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _logo_header(title: str, subtitle: str = "") -> str:
    """En-tête : vrai logo KOMPTA (image publique servie par le frontend) + wordmark.
    Remplace l'ancien badge « K » en CSS pur, qui rendait mal (juste une lettre, pas
    le logo réel de l'app). Alt text si le client mail bloque les images distantes."""
    sub_html = (
        f'<p style="margin:10px 0 0;color:rgba(255,255,255,0.9);font-size:14px;font-weight:500;">{subtitle}</p>'
        if subtitle else ""
    )
    return f"""
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 18px;">
        <tr>
          <td style="vertical-align:middle;padding-right:12px;position:relative;">
            <div style="width:52px;height:52px;background:#ffffff;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,0.18);text-align:center;line-height:52px;">
              <img src="https://kompta0.com/branding/logo-512.png" alt="KOMPTA" width="40" height="40" style="vertical-align:middle;border-radius:10px;display:inline-block;">
            </div>
          </td>
          <td style="vertical-align:middle;text-align:left;padding-right:10px;">
            <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:2px;line-height:1;">KOMPTA</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.8);letter-spacing:0.5px;margin-top:3px;">ERP IA pour PME</div>
          </td>
          <td style="vertical-align:middle;padding-left:8px;border-left:1px solid rgba(255,255,255,0.25);">
            <img src="https://kompta0.com/assets/limule-avatar-40.png" alt="Limule" width="34" height="34" style="display:inline-block;border-radius:50%;background:rgba(255,255,255,0.14);padding:3px;box-shadow:0 1px 4px rgba(0,0,0,0.15);">
          </td>
        </tr>
      </table>
      <h1 style="margin:0;font-size:21px;font-weight:700;color:#ffffff;line-height:1.3;">{title}</h1>
      {sub_html}
    """


# ─────────────────────────────────────────────────────────────────────────────
# 2a. Email relance client
# ─────────────────────────────────────────────────────────────────────────────

async def send_relance_email(
    to: str,
    client_name: str,
    invoice_number: str,
    invoice_amount: float,
    due_date: str,
    company_name: str,
    relance_count: int,
) -> bool:
    relance_note = ""
    if relance_count > 1:
        suffix = "ème" if relance_count > 2 else "nd" if relance_count == 2 else "er"
        relance_note = f'<p style="margin:0 0 16px;color:#b45309;background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;font-size:14px;">Il s\'agit de notre <strong>{relance_count}{suffix} rappel</strong> concernant cette facture.</p>'

    header = _logo_header("Rappel de paiement", f"Facture {invoice_number}")
    body = f"""
      <p style="margin:0 0 20px;">Cher(e) <strong>{client_name}</strong>,</p>
      <p style="margin:0 0 16px;">Nous vous rappelons que la facture suivante est arrivée à échéance :</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
            <span style="color:#6b7280;font-size:13px;">Numéro de facture</span><br />
            <strong style="font-size:15px;">{invoice_number}</strong>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
            <span style="color:#6b7280;font-size:13px;">Montant dû</span><br />
            <strong style="font-size:20px;color:#059669;">{invoice_amount:,.0f} XAF</strong>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 20px;">
            <span style="color:#6b7280;font-size:13px;">Date d'échéance</span><br />
            <strong style="font-size:15px;color:#dc2626;">{due_date}</strong>
          </td>
        </tr>
      </table>

      {relance_note}

      <p style="margin:0 0 24px;color:#374151;">Nous vous invitons à régulariser votre situation dans les meilleurs délais. En cas de paiement déjà effectué, veuillez ignorer ce message.</p>

      <div style="text-align:center;margin-bottom:28px;">
        <a href="{get_settings().public_url}" style="display:inline-block;background:#059669;color:#ffffff;font-weight:700;font-size:15px;padding:14px 34px;border-radius:10px;text-decoration:none;box-shadow:0 2px 8px rgba(5,150,105,0.3);">Régulariser ma situation</a>
      </div>

      <p style="margin:0;color:#6b7280;font-size:13px;">Pour toute question, contactez votre responsable chez <strong>{company_name}</strong>.</p>
    """

    html = _wrap_email("#059669", header, body)
    return await send_email(to, f"Rappel de paiement – Facture {invoice_number}", html)


# ─────────────────────────────────────────────────────────────────────────────
# 2b. Email reset password
# ─────────────────────────────────────────────────────────────────────────────

async def send_reset_password_email(
    to: str,
    full_name: str,
    temp_password: str,
    company_name: str,
) -> bool:
    header = _logo_header("Réinitialisation de votre mot de passe")
    body = f"""
      <p style="margin:0 0 20px;">Bonjour <strong>{full_name}</strong>,</p>
      <p style="margin:0 0 16px;">Votre mot de passe a été <strong>réinitialisé par un administrateur</strong> de <strong>{company_name}</strong>.</p>
      <p style="margin:0 0 12px;color:#374151;">Votre mot de passe temporaire :</p>

      <div style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:8px;padding:20px 24px;text-align:center;margin-bottom:24px;">
        <code style="font-family:'Courier New',Courier,monospace;font-size:24px;font-weight:700;letter-spacing:3px;color:#1f2937;background:none;">{temp_password}</code>
      </div>

      <p style="margin:0 0 16px;color:#374151;">Vous serez invité(e) à <strong>changer ce mot de passe</strong> à votre prochaine connexion.</p>

      <div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;padding:14px 18px;margin-bottom:24px;">
        <p style="margin:0;color:#b91c1c;font-size:14px;">⚠️ Si vous n'avez pas demandé cette réinitialisation, contactez immédiatement votre administrateur.</p>
      </div>

      <p style="margin:0;color:#6b7280;font-size:13px;">Cet email a été généré automatiquement par KOMPTA pour le compte <em>{company_name}</em>.</p>
    """

    html = _wrap_email("#7c3aed", header, body)
    return await send_email(to, "Réinitialisation de votre mot de passe KOMPTA", html)


# ─────────────────────────────────────────────────────────────────────────────
# 2c. Email broadcast
# ─────────────────────────────────────────────────────────────────────────────

_BROADCAST_COLORS = {
    "info": "#3b82f6",
    "warning": "#f59e0b",
    "critical": "#ef4444",
}

_BROADCAST_ICONS = {
    "info": "ℹ️",
    "warning": "⚠️",
    "critical": "🚨",
}

_BROADCAST_LABELS = {
    "info": "Information",
    "warning": "Avertissement",
    "critical": "Alerte critique",
}


async def send_broadcast_email(
    to: str,
    full_name: str,
    title: str,
    message: str,
    msg_type: str,
) -> bool:
    color = _BROADCAST_COLORS.get(msg_type, "#3b82f6")
    icon = _BROADCAST_ICONS.get(msg_type, "ℹ️")
    label = _BROADCAST_LABELS.get(msg_type, "Information")

    header = _logo_header(f"{icon} {label}", title)
    body = f"""
      <p style="margin:0 0 20px;">Bonjour <strong>{full_name}</strong>,</p>

      <div style="background:#f9fafb;border-left:4px solid {color};border-radius:6px;padding:20px 24px;margin-bottom:24px;">
        <h2 style="margin:0 0 12px;font-size:18px;color:#1f2937;">{title}</h2>
        <p style="margin:0;color:#374151;font-size:15px;line-height:1.7;">{message}</p>
      </div>

      <p style="margin:0;color:#6b7280;font-size:13px;">Ce message vous a été envoyé via la plateforme <strong>KOMPTA</strong>. Pour toute question, contactez votre administrateur.</p>
    """

    html = _wrap_email(color, header, body)
    subject_prefix = {"info": "[Info]", "warning": "[Avertissement]", "critical": "[URGENT]"}.get(msg_type, "[Info]")
    return await send_email(to, f"{subject_prefix} {title}", html)


# ─────────────────────────────────────────────────────────────────────────────
# 2d. Email de bienvenue
# ─────────────────────────────────────────────────────────────────────────────

async def send_welcome_email(
    to: str,
    full_name: str,
    company_name: str,
    temp_password: str | None = None,
) -> bool:
    password_block = ""
    if temp_password:
        password_block = f"""
        <p style="margin:0 0 12px;color:#374151;">Votre mot de passe temporaire :</p>
        <div style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:8px;padding:20px 24px;text-align:center;margin-bottom:24px;">
          <code style="font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:700;letter-spacing:3px;color:#1f2937;">{temp_password}</code>
        </div>
        <p style="margin:0 0 24px;color:#374151;">Vous serez invité(e) à changer ce mot de passe à votre première connexion.</p>
        """

    header = _logo_header("Bienvenue sur KOMPTA 🎉", f"Votre compte est prêt")
    body = f"""
      <p style="margin:0 0 20px;">Bonjour <strong>{full_name}</strong>,</p>
      <p style="margin:0 0 16px;">Votre compte KOMPTA pour <strong>{company_name}</strong> a été créé avec succès.</p>

      {password_block}

      <p style="margin:0 0 16px;">KOMPTA vous permet de gérer facilement :</p>
      <ul style="margin:0 0 24px;padding-left:20px;color:#374151;">
        <li style="margin-bottom:6px;">Facturation et suivi des paiements</li>
        <li style="margin-bottom:6px;">Paie et gestion des employés</li>
        <li style="margin-bottom:6px;">Inventaire et ventes</li>
        <li style="margin-bottom:6px;">Déclarations fiscales et sociales</li>
      </ul>

      <p style="margin:0;color:#6b7280;font-size:13px;">Bienvenue dans l'équipe <strong>{company_name}</strong> !</p>
    """

    html = _wrap_email("#0f766e", header, body)
    return await send_email(to, f"Bienvenue sur KOMPTA – {company_name}", html)


# ─────────────────────────────────────────────────────────────────────────────
# 2e. Email notification 2FA
# ─────────────────────────────────────────────────────────────────────────────

async def send_2fa_enabled_email(to: str, full_name: str) -> bool:
    header = _logo_header("Double authentification activée", "Sécurité de votre compte")
    body = f"""
      <p style="margin:0 0 20px;">Bonjour <strong>{full_name}</strong>,</p>

      <div style="background:#ecfdf5;border-left:4px solid #10b981;border-radius:6px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0;color:#065f46;font-size:15px;">✅ La <strong>double authentification (2FA)</strong> a été activée avec succès sur votre compte KOMPTA.</p>
      </div>

      <p style="margin:0 0 16px;color:#374151;">Votre compte bénéficie désormais d'une couche de sécurité supplémentaire. À chaque connexion, un code temporaire vous sera demandé en plus de votre mot de passe.</p>

      <div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;padding:14px 18px;margin-bottom:24px;">
        <p style="margin:0;color:#b91c1c;font-size:14px;">⚠️ Si vous n'avez pas activé cette fonctionnalité, contactez immédiatement votre administrateur.</p>
      </div>

      <p style="margin:0;color:#6b7280;font-size:13px;">Merci de faire confiance à <strong>KOMPTA</strong> pour la sécurité de vos données.</p>
    """

    html = _wrap_email("#10b981", header, body)
    return await send_email(to, "Double authentification activée – KOMPTA", html)


# ─────────────────────────────────────────────────────────────────────────────
# Email de test
# ─────────────────────────────────────────────────────────────────────────────

async def send_test_email(to: str) -> bool:
    header = _logo_header("Test de configuration email", "Configuration SMTP")
    body = """
      <p style="margin:0 0 20px;">Bonjour,</p>
      <p style="margin:0 0 16px;">Cet email confirme que votre configuration SMTP est <strong>opérationnelle</strong>.</p>

      <div style="background:#ecfdf5;border-left:4px solid #10b981;border-radius:6px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0;color:#065f46;font-size:15px;">✅ La configuration email de KOMPTA fonctionne correctement.</p>
      </div>

      <p style="margin:0;color:#6b7280;font-size:13px;">Vous pouvez maintenant envoyer des emails depuis la plateforme KOMPTA.</p>
    """

    html = _wrap_email("#0f766e", header, body)
    return await send_email(to, "KOMPTA — Test de configuration email", html)
