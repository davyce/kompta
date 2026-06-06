"""Zéro simulacre : Limule doit échouer explicitement en production quand le LLM
est indisponible, et seulement retomber sur un fallback déterministe en local."""
from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.core.config import get_settings
from app.services import limule


def _patch_no_llm(monkeypatch) -> None:
    async def _no_llm(*args, **kwargs):
        return None
    monkeypatch.setattr(limule, "_call_llm", _no_llm)


def test_limule_generate_fail_closes_in_production(monkeypatch):
    """En production, LLM muet → HTTPException 503 (aucune réponse simulée)."""
    _patch_no_llm(monkeypatch)
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    try:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(limule.limule_generate(kind="analysis", prompt="Analyse test"))
        assert exc.value.status_code == 503
    finally:
        get_settings.cache_clear()


def test_limule_generate_falls_back_in_local(monkeypatch):
    """En local, LLM muet → fallback déterministe non vide (pas d'exception)."""
    _patch_no_llm(monkeypatch)
    monkeypatch.setenv("ENVIRONMENT", "local")
    get_settings.cache_clear()
    try:
        content, _vars = asyncio.run(limule.limule_generate(kind="analysis", prompt="Analyse test"))
        assert isinstance(content, str) and content.strip()
    finally:
        get_settings.cache_clear()
