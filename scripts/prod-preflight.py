#!/usr/bin/env python3
"""Run KOMPTA production preflight checks from the command line.

Usage:
  ENVIRONMENT=production python3 scripts/prod-preflight.py

Exit codes:
  0 = ready or warnings only
  2 = blocking failures
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import get_settings  # noqa: E402
from app.db.init_db import create_tables  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.services.readiness import build_production_preflight  # noqa: E402


def main() -> int:
    create_tables()
    with SessionLocal() as db:
        report = build_production_preflight(db, get_settings())
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
    return 2 if report["status"] == "fail" else 0


if __name__ == "__main__":
    raise SystemExit(main())
