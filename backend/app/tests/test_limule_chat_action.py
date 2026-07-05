"""Test : détection d'action Limule sur les messages de chat — seuils resserrés.

Avant le resserrement, `chat_ai_action` se déclenchait sur quasiment tous les
messages (liste de ~50 verbes courants suffisant à elle seule, à 0.30 de
confiance). Ce test verrouille le nouveau comportement : les messages anodins
ne doivent plus déclencher Limule, seuls les messages clairement actionnables
doivent le faire.
"""
from __future__ import annotations

from app.services.business import chat_ai_action


CASUAL_MESSAGES = [
    "Salut ça va ?",
    "Merci beaucoup",
    "D'accord, à demain",
    "Haha trop bien, merci pour l'info",
    "Bonne journée à tous",
    "Ok super, je regarde ça plus tard",
    "On se voit bientôt",
]

CLEAR_TRIGGER_MESSAGES = [
    "Peux-tu envoyer le contrat signé avant vendredi 15h @Marie, c'est urgent",
    "Il faut valider le paiement du fournisseur avant le 12/08 @Paul",
    "@Jean peux-tu préparer le rapport pour la réunion de lundi 10h, c'est bloqué sinon",
    "On doit signer le document urgent avant demain @Sophie",
    "Rappel : il faut relancer le client @Marc avant le 05/09, c'est important",
]


def test_casual_messages_do_not_trigger_limule() -> None:
    for msg in CASUAL_MESSAGES:
        result = chat_ai_action(msg)
        assert result["detected"] is False, f"Faux positif sur message anodin : {msg!r} (confiance={result['confidence']})"


def test_clear_actionable_messages_trigger_limule() -> None:
    for msg in CLEAR_TRIGGER_MESSAGES:
        result = chat_ai_action(msg)
        assert result["detected"] is True, f"Action manquée sur message clair : {msg!r} (confiance={result['confidence']})"


def test_confidence_score_is_bounded() -> None:
    for msg in CASUAL_MESSAGES + CLEAR_TRIGGER_MESSAGES:
        result = chat_ai_action(msg)
        assert 0.0 <= result["confidence"] <= 1.0
