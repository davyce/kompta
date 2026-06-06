"""legal.py — Mentions légales d'une entreprise pour les documents officiels.

Au Congo (OHADA/CEMAC), une facture/un contrat n'est valable que s'il porte les
mentions légales de l'émetteur : forme juridique, capital, RCCM, NIU, CNSS, etc.
Ce helper construit ces lignes à partir des seuls champs renseignés.
"""
from __future__ import annotations

from typing import Any


def _g(company: Any, attr: str) -> str:
    return str(getattr(company, attr, "") or "").strip()


def legal_mention_lines(company: Any) -> list[str]:
    """Retourne les lignes de mentions légales (uniquement les champs remplis)."""
    if company is None:
        return []
    lines: list[str] = []

    # 1. Dénomination + forme juridique + capital
    name = _g(company, "legal_name") or _g(company, "name")
    forme = _g(company, "legal_form")
    capital = _g(company, "share_capital")
    head = name
    if forme:
        head += f" — {forme}"
    if capital:
        head += f" au capital de {capital}"
    if head:
        lines.append(head)

    # 2. Siège social
    addr = " ".join(b for b in [_g(company, "address"), _g(company, "city"), _g(company, "country")] if b)
    if addr:
        lines.append(f"Siège : {addr}")

    # 3. Identifiants légaux & fiscaux
    ids = []
    if _g(company, "rccm"):
        ids.append(f"RCCM : {_g(company, 'rccm')}")
    if _g(company, "niu"):
        ids.append(f"NIU : {_g(company, 'niu')}")
    if _g(company, "cnss_number"):
        ids.append(f"CNSS : {_g(company, 'cnss_number')}")
    if _g(company, "patente_number"):
        ids.append(f"Patente : {_g(company, 'patente_number')}")
    if ids:
        lines.append(" · ".join(ids))

    # 4. Contacts
    contact = " · ".join(b for b in [_g(company, "phone"), _g(company, "email"), _g(company, "website")] if b)
    if contact:
        lines.append(contact)

    return lines


def legal_mention_text(company: Any, separator: str = "\n") -> str:
    """Version texte plat (PDF)."""
    return separator.join(legal_mention_lines(company))


def legal_mention_html(company: Any) -> str:
    """Version HTML (contrats) — bloc <br/> séparé, échappé."""
    import html as _html
    lines = legal_mention_lines(company)
    if not lines:
        return ""
    return "<br/>".join(_html.escape(line) for line in lines)
