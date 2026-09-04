"""Conversion de devises vers XAF (devise de reporting de base)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ExchangeRate

DEFAULT_RATES: dict[str, float] = {
    "EUR": 655.96,  # parité fixe XAF/EUR (traité CEMAC)
    "USD": 600.0,   # taux approximatif, éditable par l'admin
}


def get_effective_rate(quote_currency: str, company_id: int | None, db: Session) -> float:
    """Retourne le taux effectif (override entreprise si présent, sinon défaut global/hardcodé)."""
    quote_currency = (quote_currency or "").upper()
    if quote_currency in ("", "XAF"):
        return 1.0

    if company_id is not None:
        override = db.scalar(
            select(ExchangeRate).where(
                ExchangeRate.company_id == company_id,
                ExchangeRate.quote_currency == quote_currency,
            )
        )
        if override is not None:
            return override.rate

    global_rate = db.scalar(
        select(ExchangeRate).where(
            ExchangeRate.company_id.is_(None),
            ExchangeRate.quote_currency == quote_currency,
        )
    )
    if global_rate is not None:
        return global_rate.rate

    return DEFAULT_RATES.get(quote_currency, 1.0)


def convert_to_xaf(amount: float, currency: str | None, company_id: int | None, db: Session) -> float:
    """Convertit un montant vers XAF. No-op si la devise est déjà XAF ou inconnue."""
    if amount is None:
        return 0.0
    currency = (currency or "").upper()
    if currency in ("", "XAF"):
        return amount
    rate = get_effective_rate(currency, company_id, db)
    return amount * rate


def sum_amounts_xaf(db: Session, rows: list[tuple[float, str | None, int | None]]) -> float:
    """Agrège une liste de (montant, devise, company_id) en un total XAF.

    Utilisé pour les totaux plateforme (ex. Console super-admin) : un simple
    SUM(total_amount) SQL mélangerait XAF/EUR/USD sans conversion et fausserait
    le résultat — cf. constat "ventes totales trop faibles" (des ventes en USD/EUR
    comptées à leur valeur faciale au lieu de leur équivalent XAF). Le taux est
    mis en cache par (devise, company_id) pour éviter une requête par ligne.
    """
    total = 0.0
    rate_cache: dict[tuple[str, int | None], float] = {}
    for amount, currency, company_id in rows:
        if amount is None:
            continue
        cur = (currency or "XAF").upper()
        if cur in ("", "XAF"):
            total += amount
            continue
        key = (cur, company_id)
        if key not in rate_cache:
            rate_cache[key] = get_effective_rate(cur, company_id, db)
        total += amount * rate_cache[key]
    return total
