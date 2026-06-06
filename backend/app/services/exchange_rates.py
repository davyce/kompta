"""Taux de change multi-devises avec cache et fallback déterministe.

- Cache mémoire (TTL 24h) pour éviter d'appeler l'API à chaque requête.
- Source distante : exchangerate.host (gratuit, sans clé).
- Fallback déterministe si l'API échoue / réseau coupé.
"""
from __future__ import annotations

import time
from typing import Any

import httpx


# ── Taux figés de secours (≈ valeurs réalistes 2026) ─────────────────────
# Source : ordre de grandeur stable XAF/EUR/USD.
_FALLBACK_RATES: dict[str, dict[str, float]] = {
    "XAF": {"XAF": 1.0, "EUR": 0.00152, "USD": 0.00165},
    "EUR": {"XAF": 656.0, "EUR": 1.0, "USD": 1.08},
    "USD": {"XAF": 605.0, "EUR": 0.926, "USD": 1.0},
}

# Devises supportées par défaut pour /currency/rates
_DEFAULT_SYMBOLS = ("XAF", "EUR", "USD", "GBP", "CAD")

# Cache : { (from, to): (rate, fetched_at_ts) }
_CACHE: dict[tuple[str, str], tuple[float, float]] = {}
_TTL_SECONDS = 24 * 3600


def _fallback_rate(frm: str, to: str) -> float | None:
    frm = (frm or "").upper()
    to = (to or "").upper()
    if frm == to:
        return 1.0
    table = _FALLBACK_RATES.get(frm)
    if table and to in table:
        return table[to]
    # Pivot via USD si dispo
    table_usd = _FALLBACK_RATES.get(frm, {}).get("USD")
    rev_usd = _FALLBACK_RATES.get("USD", {}).get(to)
    if table_usd and rev_usd:
        return table_usd * rev_usd
    # Inverse symétrique
    rev = _FALLBACK_RATES.get(to, {}).get(frm)
    if rev:
        return 1.0 / rev
    return None


def _cache_get(frm: str, to: str) -> float | None:
    entry = _CACHE.get((frm, to))
    if not entry:
        return None
    rate, ts = entry
    if time.time() - ts > _TTL_SECONDS:
        _CACHE.pop((frm, to), None)
        return None
    return rate


def _cache_set(frm: str, to: str, rate: float) -> None:
    _CACHE[(frm, to)] = (rate, time.time())


def _fetch_remote(frm: str, to: str) -> float | None:
    """Appel synchrone à exchangerate.host. Retourne None si échec."""
    try:
        url = f"https://api.exchangerate.host/latest?base={frm}&symbols={to}"
        with httpx.Client(timeout=4.0) as client:
            response = client.get(url)
        if response.status_code != 200:
            return None
        data = response.json()
        rates = data.get("rates") if isinstance(data, dict) else None
        if not isinstance(rates, dict):
            return None
        value = rates.get(to)
        if value is None:
            return None
        return float(value)
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return None


def get_rate(from_currency: str, to_currency: str) -> float | None:
    """Retourne le taux from→to. Cache, sinon API, sinon fallback déterministe."""
    frm = (from_currency or "").upper().strip()
    to = (to_currency or "").upper().strip()
    if not frm or not to:
        return None
    if frm == to:
        return 1.0

    cached = _cache_get(frm, to)
    if cached is not None:
        return cached

    remote = _fetch_remote(frm, to)
    if remote is not None and remote > 0:
        _cache_set(frm, to, remote)
        return remote

    fb = _fallback_rate(frm, to)
    if fb is not None:
        # Ne pas cacher le fallback : on retentera l'API à la prochaine requête.
        return fb
    return None


def convert(amount: float, from_currency: str, to_currency: str) -> dict[str, Any]:
    """Convertit un montant et retourne un dict détaillé."""
    frm = (from_currency or "XAF").upper()
    to = (to_currency or "XAF").upper()
    try:
        amt = float(amount)
    except (TypeError, ValueError):
        amt = 0.0

    # `certified` = taux issu d'une vraie source temps réel (API ou cache récent).
    # Les taux "fallback" (figés) ne sont PAS certifiés : le frontend doit l'afficher.
    if frm == to:
        return {
            "from": frm, "to": to, "amount": amt,
            "converted": round(amt, 4), "rate": 1.0, "source": "identity",
            "certified": True,
        }

    # 1. Cache hit ?
    pre_cached = _cache_get(frm, to)
    if pre_cached is not None:
        return {
            "from": frm, "to": to, "amount": amt,
            "converted": round(amt * pre_cached, 4),
            "rate": pre_cached, "source": "cache", "certified": True,
        }

    # 2. Pas en cache : appel API distant
    remote = _fetch_remote(frm, to)
    if remote is not None and remote > 0:
        _cache_set(frm, to, remote)
        return {
            "from": frm, "to": to, "amount": amt,
            "converted": round(amt * remote, 4),
            "rate": remote, "source": "api", "certified": True,
        }

    # 3. Fallback déterministe — taux estimé, NON certifié (affiché comme tel)
    fb = _fallback_rate(frm, to)
    if fb is not None:
        return {
            "from": frm, "to": to, "amount": amt,
            "converted": round(amt * fb, 4),
            "rate": fb, "source": "fallback", "certified": False,
            "notice": "Taux estimé (hors-ligne) — non certifié temps réel.",
        }
    return {
        "from": frm, "to": to, "amount": amt,
        "converted": None, "rate": None, "source": "unavailable", "certified": False,
        "notice": "Taux indisponible — réessayez plus tard.",
    }


def rates_for_base(base: str = "XAF", symbols: tuple[str, ...] = _DEFAULT_SYMBOLS) -> dict[str, Any]:
    """Retourne un mapping {symbol: rate} pour une base donnée."""
    base_u = (base or "XAF").upper()
    out: dict[str, float] = {}
    for sym in symbols:
        sym_u = sym.upper()
        r = get_rate(base_u, sym_u)
        if r is not None:
            out[sym_u] = r
    return {"base": base_u, "rates": out}


def clear_cache() -> None:
    """Vide le cache (utile pour tests)."""
    _CACHE.clear()
