"""Test : taux de change avec fallback lorsque l'API est indisponible (mission 3)."""
from __future__ import annotations

from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.services import exchange_rates


def test_fallback_when_api_fails(monkeypatch) -> None:
    """Si httpx lève une erreur réseau, on doit retomber sur les taux figés."""
    exchange_rates.clear_cache()

    class _BoomClient:
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def get(self, *a, **kw):
            raise httpx.ConnectError("réseau coupé")

    monkeypatch.setattr(exchange_rates.httpx, "Client", _BoomClient)

    # XAF→EUR doit tomber sur le fallback déterministe
    rate = exchange_rates.get_rate("XAF", "EUR")
    assert rate is not None
    assert abs(rate - 0.00152) < 1e-6

    payload = exchange_rates.convert(amount=1_000_000, from_currency="XAF", to_currency="EUR")
    assert payload["from"] == "XAF"
    assert payload["to"] == "EUR"
    assert payload["source"] == "fallback"
    assert payload["converted"] is not None
    assert payload["converted"] > 0

    # Identité doit toujours marcher
    assert exchange_rates.get_rate("EUR", "EUR") == 1.0


def test_no_estimated_rate_in_production(monkeypatch) -> None:
    """Zéro simulacre : en production, source temps réel KO → 'unavailable'
    (aucun taux estimé n'est renvoyé), au lieu du fallback déterministe."""
    from app.core.config import get_settings

    exchange_rates.clear_cache()
    monkeypatch.setattr(exchange_rates, "_fetch_remote", lambda frm, to: None)
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    try:
        assert exchange_rates.get_rate("XAF", "EUR") is None
        payload = exchange_rates.convert(amount=1_000, from_currency="XAF", to_currency="EUR")
        assert payload["source"] == "unavailable"
        assert payload["converted"] is None
        assert payload["certified"] is False
    finally:
        get_settings.cache_clear()
        exchange_rates.clear_cache()


def test_currency_convert_endpoint(monkeypatch) -> None:
    """Endpoint /currency/convert : doit répondre même sans réseau."""
    exchange_rates.clear_cache()

    class _BoomClient:
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def get(self, *a, **kw):
            raise httpx.ConnectError("offline")

    monkeypatch.setattr(exchange_rates.httpx, "Client", _BoomClient)

    with TestClient(app) as client:
        response = client.get("/api/currency/convert?amount=1000&from=XAF&to=EUR")
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["from"] == "XAF"
        assert data["to"] == "EUR"
        assert data["converted"] is not None
        assert data["source"] in ("fallback", "cache")
