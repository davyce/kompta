#!/usr/bin/env bash
set -euo pipefail

(
  cd backend
  DATABASE_URL="sqlite:////tmp/kompta-test-$$-${RANDOM}.db" .venv/bin/pytest
)

(
  cd frontend
  npm run build
)
