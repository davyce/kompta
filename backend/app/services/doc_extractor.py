"""
doc_extractor.py — Extraction structurée de données financières/RH/opérationnelles
depuis le texte brut d'un document, via le LLM DeepSeek.

Étapes :
  1. extract_structured_data()  → LLM analyse le texte → JSON structuré
  2. ingest_extracted_data()    → crée/met à jour les enregistrements DB
  3. build_dashboard_signals()  → produit des signaux KPI pour le contexte Limule
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# 1. Extraction LLM
# ──────────────────────────────────────────────────────────────────────────────

EXTRACTION_SYSTEM = """Tu es l'agent d'extraction documentaire KOMPTA.
Tu reçois le texte brut d'un document d'entreprise et tu dois en extraire TOUTES les données structurées utiles.

Retourne UNIQUEMENT un objet JSON valide avec cette structure (omets les clés sans valeur) :

{
  "document_type": "facture|bulletin_paie|contrat_travail|declaration|bilan|releve_bancaire|devis|rapport|general",
  "periode": "YYYY-MM ou YYYY ou YYYY-T1 etc.",
  "parties": {
    "emetteur":  { "nom": "", "siret": "", "adresse": "", "email": "", "telephone": "" },
    "destinataire": { "nom": "", "siret": "", "adresse": "" }
  },
  "montants": {
    "total_ht": 0.0,
    "tva": 0.0,
    "total_ttc": 0.0,
    "net_a_payer": 0.0,
    "devise": "XAF",
    "acompte": 0.0,
    "reste_a_payer": 0.0
  },
  "references": {
    "numero": "",
    "date_emission": "YYYY-MM-DD",
    "date_echeance": "YYYY-MM-DD",
    "date_paiement": "YYYY-MM-DD",
    "mode_paiement": ""
  },
  "employe": {
    "nom": "",
    "prenom": "",
    "poste": "",
    "salaire_brut": 0.0,
    "salaire_net": 0.0,
    "cotisations_patronales": 0.0,
    "cotisations_salariales": 0.0,
    "cnps": 0.0,
    "periode_paie": ""
  },
  "lignes": [
    { "description": "", "quantite": 0.0, "prix_unitaire": 0.0, "montant": 0.0 }
  ],
  "stock": [
    { "produit": "", "quantite": 0.0, "unite": "", "valeur_unitaire": 0.0 }
  ],
  "ratios_financiers": {
    "chiffre_affaires": 0.0,
    "resultat_net": 0.0,
    "marge_brute": 0.0,
    "tresorerie": 0.0,
    "dettes": 0.0,
    "creances": 0.0
  },
  "risques": ["liste de risques identifiés dans le document"],
  "actions_requises": ["liste d'actions recommandées"],
  "tags": ["facture", "TVA", "fournisseur", ...],
  "resume": "résumé court en 2-3 phrases",
  "confidence": 85
}

Sois précis sur les montants. Convertis les formats locaux (FCFA, F CFA → XAF).
Si tu identifies une facture ou bulletin de paie, remplis TOUS les champs correspondants.
"""


async def extract_structured_data(
    text: str,
    doc_type: str = "general",
    title: str = "",
) -> dict[str, Any]:
    """
    Appelle le LLM pour extraire les données structurées du texte du document.
    Retourne un dict normalisé.
    """
    from app.services.deepseek import _deepseek_chat, _extract_json

    if not text or len(text.strip()) < 20:
        return _fallback_extraction(title, doc_type)

    # On tronque à 12 000 caractères (≈ 3 000 tokens) pour rester dans les limites
    truncated = text[:12_000]

    prompt = (
        f"Type de document attendu : {doc_type}\n"
        f"Titre : {title}\n\n"
        f"=== TEXTE DU DOCUMENT ===\n{truncated}\n=== FIN ===\n\n"
        "Extrait toutes les données selon le format JSON demandé."
    )

    raw = await _deepseek_chat(
        [
            {"role": "system", "content": EXTRACTION_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1800,
    )

    if not raw:
        return _fallback_extraction(title, doc_type)

    parsed = _extract_json(raw)
    if not parsed:
        return {
            **_fallback_extraction(title, doc_type),
            "resume": raw[:500],
            "provider": "deepseek",
        }

    return _normalize_extracted(parsed, doc_type)


def _fallback_extraction(title: str, doc_type: str) -> dict[str, Any]:
    return {
        "document_type": doc_type,
        "resume": f"Document analysé localement — {title}",
        "tags": [doc_type],
        "confidence": 50,
        "provider": "fallback",
    }


def _safe_float(val: Any) -> float:
    """Convertit une valeur en float de manière sécurisée."""
    if val is None:
        return 0.0
    try:
        cleaned = re.sub(r"[^\d.,]", "", str(val)).replace(",", ".")
        return float(cleaned) if cleaned else 0.0
    except (ValueError, TypeError):
        return 0.0


def _normalize_extracted(data: dict[str, Any], fallback_type: str) -> dict[str, Any]:
    """Normalise et nettoie le dict retourné par le LLM."""
    # Normalise les montants
    for section_key in ("montants", "ratios_financiers"):
        section = data.get(section_key)
        if isinstance(section, dict):
            for k, v in section.items():
                if k != "devise":
                    section[k] = _safe_float(v)

    # Normalise les lignes
    lignes = data.get("lignes")
    if isinstance(lignes, list):
        for ligne in lignes:
            if isinstance(ligne, dict):
                for k in ("quantite", "prix_unitaire", "montant"):
                    if k in ligne:
                        ligne[k] = _safe_float(ligne[k])

    # Normalise les données employé
    employe = data.get("employe")
    if isinstance(employe, dict):
        for k in ("salaire_brut", "salaire_net", "cotisations_patronales", "cotisations_salariales", "cnps"):
            if k in employe:
                employe[k] = _safe_float(employe[k])

    # Type de document
    if not data.get("document_type"):
        data["document_type"] = fallback_type

    # Confidence
    if "confidence" not in data:
        data["confidence"] = 75

    data["provider"] = "deepseek"
    return data


# ──────────────────────────────────────────────────────────────────────────────
# 2. Ingestion automatique dans la DB
# ──────────────────────────────────────────────────────────────────────────────

def ingest_extracted_data(
    db: Session,
    *,
    document_id: int,
    company_id: int,
    extracted: dict[str, Any],
    created_by_user_id: int | None = None,
) -> dict[str, Any]:
    """
    À partir des données extraites, crée ou met à jour les enregistrements DB.
    Retourne un résumé des actions effectuées.
    """
    from app.models import Invoice, InvoiceLine, Employee

    actions: list[str] = []
    doc_type = extracted.get("document_type", "general")

    # ── Facture / devis → Invoice ──────────────────────────────────────────────
    if doc_type in {"facture", "devis"}:
        refs = extracted.get("references") or {}
        montants = extracted.get("montants") or {}
        parties = extracted.get("parties") or {}
        destinataire = parties.get("destinataire") or {}
        emetteur = parties.get("emetteur") or {}

        numero = refs.get("numero") or f"DOC-{document_id}"
        total_ttc = _safe_float(montants.get("total_ttc")) or _safe_float(montants.get("net_a_payer"))

        date_echeance_str = refs.get("date_echeance")

        def _parse_date(s: str | None) -> date | None:
            if not s:
                return None
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
                try:
                    return datetime.strptime(s, fmt).date()
                except ValueError:
                    continue
            return None

        due_date = _parse_date(date_echeance_str)
        customer_name = destinataire.get("nom") or emetteur.get("nom") or "Client"

        # Vérifie si un Invoice avec ce numéro existe déjà
        existing = db.scalar(
            select(Invoice).where(
                Invoice.company_id == company_id,
                Invoice.number == numero,
            )
        )

        # ── C6 : L'IA ne crée JAMAIS une facture réelle automatiquement.
        # Elle crée une suggestion (DocumentExtractionSuggestion) qui doit être
        # validée manuellement par un utilisateur autorisé.
        if not existing and total_ttc > 0:
            suggestion = {
                "source": "ai_extraction",
                "document_id": document_id if "document_id" in dir() else None,
                "numero": numero,
                "customer_name": customer_name,
                "due_date": str(due_date) if due_date else None,
                "total_ttc": total_ttc,
                "lignes": extracted.get("lignes") or [],
                "status": "pending_validation",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "warning": "Suggestion IA — validation humaine obligatoire avant création de facture.",
            }
            # Stocker la suggestion dans les métadonnées du document (pas de création d'Invoice)
            actions.append(
                f"suggestion facture générée: #{numero} — {total_ttc:,.0f} XAF "
                f"(en attente de validation humaine)"
            )
            # Retourner la suggestion dans les métadonnées du document
            if hasattr(db, "_kompta_suggestions"):
                db._kompta_suggestions.append(suggestion)
        elif existing:
            actions.append(f"facture #{numero} déjà présente (id={existing.id})")

    # ── Bulletin de paie → mise à jour Employee ────────────────────────────────
    elif doc_type == "bulletin_paie":
        employe_data = extracted.get("employe") or {}
        nom = employe_data.get("nom", "")
        prenom = employe_data.get("prenom", "")
        salaire_net = _safe_float(employe_data.get("salaire_net"))

        if nom and salaire_net > 0:
            emp = db.scalar(
                select(Employee).where(
                    Employee.company_id == company_id,
                    Employee.last_name.ilike(f"%{nom}%"),
                )
            )
            if emp:
                actions.append(f"employé trouvé: {emp.first_name} {emp.last_name} — net {salaire_net:,.0f} XAF")
            else:
                actions.append(f"employé non trouvé pour '{nom} {prenom}' dans la DB")

    # ── Pas d'ingestion auto pour les autres types (rapport, bilan, etc.) ──────
    else:
        actions.append(f"type '{doc_type}' — pas d'ingestion automatique")

    return {"actions": actions, "doc_type": doc_type}


# ──────────────────────────────────────────────────────────────────────────────
# 3. Signaux KPI pour le contexte Limule
# ──────────────────────────────────────────────────────────────────────────────

def build_dashboard_signals(extracted: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Produit des signaux KPI à partir des données extraites d'un document.
    Ces signaux enrichissent le contexte Limule et le tableau de bord.
    """
    signals: list[dict[str, Any]] = []
    doc_type = extracted.get("document_type", "general")
    montants = extracted.get("montants") or {}
    risques = extracted.get("risques") or []
    refs = extracted.get("references") or {}

    # Facture impayée ?
    net_a_payer = _safe_float(montants.get("net_a_payer") or montants.get("total_ttc"))
    echeance_str = refs.get("date_echeance")
    if doc_type in {"facture", "devis"} and net_a_payer > 0 and echeance_str:
        try:
            echeance = datetime.strptime(echeance_str, "%Y-%m-%d").date()
            if echeance < date.today():
                signals.append({
                    "type": "facture_echeance_depassee",
                    "severity": "high",
                    "label": f"Facture #{refs.get('numero', '?')} échue — {net_a_payer:,.0f} XAF",
                    "module": "billing",
                    "value": net_a_payer,
                })
        except ValueError:
            pass

    # Risques signalés
    for risque in risques[:3]:
        signals.append({
            "type": "document_risk",
            "severity": "medium",
            "label": str(risque)[:120],
            "module": "documents",
        })

    # Faible trésorerie signalée
    treso = _safe_float((extracted.get("ratios_financiers") or {}).get("tresorerie"))
    if treso > 0 and treso < 500_000:
        signals.append({
            "type": "tresorerie_faible",
            "severity": "high",
            "label": f"Trésorerie faible détectée: {treso:,.0f} XAF",
            "module": "accounting",
            "value": treso,
        })

    return signals


# ──────────────────────────────────────────────────────────────────────────────
# 4. Résumé lisible pour le contexte Limule
# ──────────────────────────────────────────────────────────────────────────────

def format_extracted_for_context(extracted: dict[str, Any], title: str = "") -> str:
    """
    Produit un bloc texte compact à injecter dans le prompt Limule
    quand l'utilisateur pose une question sur ce document.
    """
    if not extracted:
        return ""

    lines: list[str] = [f"Document: {title}" if title else "Document analysé:"]
    doc_type = extracted.get("document_type", "")
    if doc_type:
        lines.append(f"Type: {doc_type}")

    if extracted.get("periode"):
        lines.append(f"Période: {extracted['periode']}")

    parties = extracted.get("parties") or {}
    if parties.get("emetteur", {}).get("nom"):
        lines.append(f"Émetteur: {parties['emetteur']['nom']}")
    if parties.get("destinataire", {}).get("nom"):
        lines.append(f"Destinataire: {parties['destinataire']['nom']}")

    refs = extracted.get("references") or {}
    if refs.get("numero"):
        lines.append(f"Référence: {refs['numero']}")
    if refs.get("date_emission"):
        lines.append(f"Date: {refs['date_emission']}")
    if refs.get("date_echeance"):
        lines.append(f"Échéance: {refs['date_echeance']}")

    montants = extracted.get("montants") or {}
    m_parts = []
    if montants.get("total_ht"):
        m_parts.append(f"HT {montants['total_ht']:,.0f}")
    if montants.get("tva"):
        m_parts.append(f"TVA {montants['tva']:,.0f}")
    if montants.get("total_ttc") or montants.get("net_a_payer"):
        v = montants.get("total_ttc") or montants.get("net_a_payer")
        m_parts.append(f"TTC {v:,.0f}")
    if m_parts:
        lines.append("Montants: " + " | ".join(m_parts) + f" {montants.get('devise', 'XAF')}")

    employe = extracted.get("employe") or {}
    if employe.get("nom"):
        lines.append(f"Employé: {employe.get('prenom', '')} {employe.get('nom', '')} — "
                     f"Brut {employe.get('salaire_brut', 0):,.0f} / Net {employe.get('salaire_net', 0):,.0f} XAF")

    ratios = extracted.get("ratios_financiers") or {}
    ratio_parts = []
    for k, label in [("chiffre_affaires", "CA"), ("resultat_net", "Résultat"), ("tresorerie", "Tréso")]:
        if ratios.get(k):
            ratio_parts.append(f"{label} {ratios[k]:,.0f}")
    if ratio_parts:
        lines.append("Ratios: " + " | ".join(ratio_parts) + " XAF")

    lignes = extracted.get("lignes") or []
    if lignes:
        lines.append(f"Lignes ({len(lignes)}): " + "; ".join(
            f"{l.get('description', '?')[:40]} × {l.get('quantite', 1)} = {l.get('montant', 0):,.0f}"
            for l in lignes[:5]
        ))

    if extracted.get("risques"):
        lines.append("Risques: " + "; ".join(str(r)[:80] for r in extracted["risques"][:3]))

    if extracted.get("actions_requises"):
        lines.append("Actions: " + "; ".join(str(a)[:80] for a in extracted["actions_requises"][:3]))

    if extracted.get("resume"):
        lines.append(f"Résumé: {extracted['resume'][:300]}")

    return "\n".join(lines)
