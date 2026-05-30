"""
business.py — Services métier KOMPTA
Inclut la détection intelligente d'actions Limule dans le chat.
"""
import re
from datetime import date, datetime, timedelta, timezone

from app.models import Employee, Product

# ── Constantes NLP francais ────────────────────────────────────────────────

_WEEKDAY_FR: dict[str, int] = {
    "lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3,
    "vendredi": 4, "samedi": 5, "dimanche": 6,
}
_MONTH_FR: dict[str, int] = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12,
}

# ── Helpers produit / paie ─────────────────────────────────────────────────

def product_qr_payload(company_id: int, product: Product) -> str:
    return f"KOMPTA:{company_id}:{product.sku}:{product.id}"


def label_preview(product: Product) -> dict[str, str | float]:
    return {
        "title": product.name[:32],
        "sku": product.sku,
        "variant": product.variant,
        "price": product.price,
        "qr": product.qr_code,
        "print_formats": "A4, thermique 58mm, thermique 80mm",
    }


def payslip_reference(period: str, employee: Employee, index: int) -> str:
    compact_period = "".join(ch for ch in period.upper() if ch.isalnum())[:10]
    suffix = datetime.now(timezone.utc).strftime("%H%M%S%f")
    return f"PAY-{compact_period}-{employee.id:04d}-{index:03d}-{suffix}"


def extract_mentions(body: str) -> str:
    mentions = []
    for part in body.split():
        if part.startswith("@") and len(part) > 1:
            mentions.append(part[1:].strip(".,;:!?"))
    return ",".join(dict.fromkeys(mentions))


# ── Détection d'actions Limule ─────────────────────────────────────────────

def _next_weekday(weekday: int) -> date:
    """Prochaine occurrence d'un jour de la semaine (0=lundi)."""
    today = date.today()
    days_ahead = weekday - today.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return today + timedelta(days=days_ahead)


def _extract_date_time(text: str) -> tuple[str | None, str | None]:
    """Extrait date ISO et heure HH:MM du texte en français."""
    lower = text.lower()
    today = date.today()
    extracted_date: str | None = None
    extracted_time: str | None = None

    # Heure : "à 15h", "15h30", "avant 17h", "à 9h00"
    time_match = re.search(
        r'\b(?:à|avant|après|a partir de)?\s*(\d{1,2})[hH](\d{2})?\b', lower
    )
    if time_match:
        hour = int(time_match.group(1))
        minute = int(time_match.group(2) or 0)
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            extracted_time = f"{hour:02d}:{minute:02d}"

    # Dates relatives
    if "aujourd'hui" in lower or "aujoud'hui" in lower:
        extracted_date = today.isoformat()
    elif "demain" in lower:
        extracted_date = (today + timedelta(days=1)).isoformat()
    elif re.search(r'\baprès[- ]?demain\b', lower):
        extracted_date = (today + timedelta(days=2)).isoformat()
    elif re.search(r'\bfin de semaine\b|\bfin semaine\b', lower):
        extracted_date = _next_weekday(4).isoformat()
    elif re.search(r'\bsemaine prochaine\b', lower):
        extracted_date = (today + timedelta(weeks=1)).isoformat()
    elif re.search(r'\bmois prochain\b', lower):
        if today.month == 12:
            extracted_date = date(today.year + 1, 1, today.day).isoformat()
        else:
            extracted_date = date(today.year, today.month + 1, today.day).isoformat()
    else:
        # "dans X jours/semaines"
        m = re.search(r'dans\s+(\d+)\s+(jour|semaine)', lower)
        if m:
            n = int(m.group(1))
            delta = timedelta(days=n) if "jour" in m.group(2) else timedelta(weeks=n)
            extracted_date = (today + delta).isoformat()

    # Jours nommés : "vendredi", "lundi prochain"
    if not extracted_date:
        for day_name, weekday_num in _WEEKDAY_FR.items():
            if re.search(rf'\b{day_name}\b', lower):
                extracted_date = _next_weekday(weekday_num).isoformat()
                break

    # "avant le 15", "le 15"
    if not extracted_date:
        m = re.search(r'(?:avant\s+le\s+|le\s+)(\d{1,2})\b(?!\s*h)', lower)
        if m:
            day = int(m.group(1))
            if 1 <= day <= 31:
                try:
                    d = date(today.year, today.month, day)
                    if d <= today:
                        nm = today.month + 1 if today.month < 12 else 1
                        ny = today.year if today.month < 12 else today.year + 1
                        d = date(ny, nm, day)
                    extracted_date = d.isoformat()
                except ValueError:
                    pass

    # "15 mai", "3 octobre"
    if not extracted_date:
        for month_name, month_num in _MONTH_FR.items():
            m = re.search(rf'(\d{{1,2}})\s+{month_name}', lower)
            if m:
                try:
                    d = date(today.year, month_num, int(m.group(1)))
                    if d < today:
                        d = date(today.year + 1, month_num, int(m.group(1)))
                    extracted_date = d.isoformat()
                    break
                except ValueError:
                    pass

    return extracted_date, extracted_time


def _detect_action_type(text: str) -> str:
    lower = text.lower()
    if re.search(r'\b(réunion|reunion|meeting|rdv|rendez-vous|conférence|conference|appel vidéo|visio)\b', lower):
        return "meeting"
    if re.search(r'\b(document|contrat|facture|justificatif|dossier|rapport|pièce jointe|piece jointe|fichier|devis)\b', lower):
        return "document"
    if re.search(r'\b(valider|approuver|signer|autoriser|validation|approbation|signature)\b', lower):
        return "approval"
    if re.search(r'\b(payer|virement|paiement|règlement|reglement|remboursement|factur)\b', lower):
        return "payment"
    if re.search(r'\b(rappel|rappelle|n\'oublie|penser à|pense à|relance|relancer)\b', lower):
        return "reminder"
    return "task"


def _detect_priority(text: str) -> str:
    lower = text.lower()
    if re.search(
        r'\b(urgent|urgence|critique|bloqué|bloque|important|prioritaire|asap|immédiatement|tout de suite|rapidement|vite|dès que possible|des que possible|impératif|imperatif)\b',
        lower,
    ):
        return "high"
    return "normal"


def _build_title(text: str, action_type: str) -> str:
    """Génère un titre propre pour la tâche depuis le corps du message."""
    # Supprimer les mentions @
    clean = re.sub(r'@\w+', '', text).strip()
    # Supprimer références de temps déjà extraites
    clean = re.sub(r'\b\d{1,2}[hH]\d*\b', '', clean)
    clean = re.sub(
        r'\b(demain|aujourd\'hui|vendredi|lundi|mardi|mercredi|jeudi|samedi|dimanche|'
        r'dans \d+ jours?|avant le \d+|semaine prochaine|mois prochain|fin de semaine)\b',
        '', clean, flags=re.IGNORECASE,
    )
    clean = re.sub(r'\s{2,}', ' ', clean).strip(' .,;:-')

    prefixes = {
        "meeting": "Organiser réunion : ",
        "document": "Document requis : ",
        "approval": "Validation requise : ",
        "payment": "Paiement à traiter : ",
        "reminder": "Rappel : ",
        "task": "",
    }
    prefix = prefixes.get(action_type, "")

    # Couper proprement si trop long
    if len(clean) > 90:
        for sep in [". ", ", ", " - ", " "]:
            idx = clean[:90].rfind(sep)
            if idx > 20:
                clean = clean[:idx]
                break
        else:
            clean = clean[:90]

    title = f"{prefix}{clean}".strip()
    if not title:
        defaults = {
            "meeting": "Organiser une réunion",
            "document": "Soumettre un document",
            "approval": "Demande de validation",
            "payment": "Traiter un paiement",
            "reminder": "Rappel à planifier",
            "task": "Tâche à traiter",
        }
        title = defaults.get(action_type, "Tâche à traiter")

    return title[:140]


def _compute_confidence(text: str, action_type: str, has_date: bool, has_assignee: bool) -> float:
    lower = text.lower()
    score = 0.25

    # Mots-clés d'action par catégorie
    kw_map: dict[str, list[str]] = {
        "task": ["faire", "créer", "envoyer", "vérifier", "préparer", "relancer", "appeler",
                 "contacter", "finaliser", "terminer", "compléter", "soumettre", "traiter",
                 "gérer", "mettre à jour", "corriger", "analyser", "suivre"],
        "meeting": ["réunion", "meeting", "rdv", "rendez-vous", "visio"],
        "document": ["document", "contrat", "justificatif", "dossier", "rapport", "facture"],
        "approval": ["valider", "approuver", "signer", "autoriser"],
        "payment": ["payer", "virement", "paiement", "règlement"],
        "reminder": ["rappel", "relancer", "n'oublie"],
    }
    keywords = kw_map.get(action_type, [])
    hits = sum(1 for kw in keywords if kw in lower)
    score += min(hits * 0.12, 0.30)

    # Bonus contextuels
    if has_date:
        score += 0.15
    if has_assignee:
        score += 0.12
    if re.search(r'\b(urgent|critique|bloqué|important|asap)\b', lower):
        score += 0.12
    # Verbe impératif
    if re.search(
        r'\b(fais|faites|envoi|envoie|prépare|préparez|crée|créez|appelle|appelez|'
        r'vérifie|vérifiez|mets|mettez|traite|traitez|signe|signez|valide|validez)\b', lower
    ):
        score += 0.10
    # Phrase impérative sans sujet (commence par verbe)
    first_word = lower.split()[0] if lower.split() else ""
    if re.match(r'^(il faut|on doit|faudrait|peux-tu|pourras-tu|pense à)', lower):
        score += 0.08

    return min(round(score, 2), 1.0)


def chat_ai_action(body: str) -> dict:
    """
    Analyse intelligente d'un message de chat pour détecter des actions à créer.

    Retourne un dict structuré avec :
      detected  : bool  — action détectée ou non
      type      : str   — task | meeting | document | approval | payment | reminder
      title     : str   — titre propre pour la tâche
      description: str  — corps original (contexte)
      priority  : str   — high | normal | low
      due_date  : str|None — date ISO
      due_time  : str|None — HH:MM
      assignee  : str   — nom suggéré (depuis @mention)
      confidence: float — 0.0–1.0
    """
    # Mentions
    raw_mentions = [p[1:].strip(".,;:!?") for p in body.split() if p.startswith("@") and len(p) > 1]
    mentions = list(dict.fromkeys(raw_mentions))

    action_type = _detect_action_type(body)
    priority = _detect_priority(body)
    due_date, due_time = _extract_date_time(body)
    assignee = mentions[0].replace("_", " ").title() if mentions else ""
    title = _build_title(body, action_type)
    confidence = _compute_confidence(body, action_type, due_date is not None, bool(assignee))

    # Mot d'action explicite = seuil plus bas
    has_action_word = bool(re.search(
        r'\b(faire|créer|envoyer|vérifier|préparer|relancer|appeler|valider|approuver|'
        r'signer|payer|urgent|réunion|meeting|rdv|document|contrat|fais|faites|envoi|'
        r'prépare|terminer|compléter|soumettre|il faut|on doit|faudrait|peux-tu|'
        r'traiter|corriger|analyser|gérer|bloqué|bloque)\b',
        body.lower(),
    ))
    detected = confidence >= 0.42 or (has_action_word and confidence >= 0.30)

    return {
        "detected": detected,
        "type": action_type,
        "title": title,
        "description": body[:500],
        "priority": priority,
        "due_date": due_date,
        "due_time": due_time,
        "assignee": assignee,
        "confidence": confidence,
    }


def chat_ai_suggestion(body: str) -> str:
    """Compat legacy — retourne le titre de l'action ou message neutre."""
    action = chat_ai_action(body)
    if action["detected"]:
        return action["title"]
    return "Aucune action critique detectee, message archive dans le contexte entreprise."


# ── Compliance snapshot ────────────────────────────────────────────────────

def compliance_snapshot() -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "checks": [
            {"label": "Identite entreprise", "status": "ok"},
            {"label": "Dossiers RH", "status": "warning"},
            {"label": "Pieces justificatives", "status": "warning"},
            {"label": "Paie", "status": "ok"},
            {"label": "Facturation", "status": "ok"},
        ],
    }
