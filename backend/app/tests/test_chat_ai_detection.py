"""
test_chat_ai_detection.py — Tuning 2026-07 de la détection Limule dans le chat.

Vérifie que chat_ai_action() ne se déclenche plus sur les messages anodins
(politesse, accusés de réception) tout en continuant à détecter les messages
réellement actionnables (échéance + intention forte + éventuellement @mention).
"""
from app.services.business import chat_ai_action

CASUAL_MESSAGES = [
    "Salut ça va ?",
    "Merci beaucoup",
    "D'accord, à demain",
    "Bonne journée à tous",
    "Ok super, merci !",
]

ACTIONABLE_MESSAGES = [
    "Peux-tu envoyer le contrat signé avant vendredi 15h @Marie, c'est urgent",
    "Il faut valider le paiement du fournisseur avant demain 10h @Paul",
    "@Jean merci de préparer la réunion de lundi 9h, c'est prioritaire",
    "Confirme-moi la livraison du matériel avant jeudi, c'est urgent",
    "@Sophie peux-tu signer le document avant vendredi ?",
]


def test_casual_messages_do_not_trigger_limule():
    for msg in CASUAL_MESSAGES:
        action = chat_ai_action(msg)
        assert action["detected"] is False, f"Faux positif sur message anodin: {msg!r} (confiance={action['confidence']})"


def test_actionable_messages_still_trigger_limule():
    for msg in ACTIONABLE_MESSAGES:
        action = chat_ai_action(msg)
        assert action["detected"] is True, f"Action manquée sur message actionnable: {msg!r} (confiance={action['confidence']})"
