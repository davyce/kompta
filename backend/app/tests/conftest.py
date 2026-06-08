from __future__ import annotations

import os
from pathlib import Path


TEST_DB = Path("/private/tmp/kompta_pytest.db")

if TEST_DB.exists():
    TEST_DB.unlink()

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("SEED_DEMO", "true")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_DB}")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "super2026")
os.environ["GOOGLE_CLIENT_ID"] = ""
