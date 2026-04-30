import sys
from pathlib import Path

import uvicorn


if __name__ == "__main__":
    backend_path = Path(__file__).parent / "backend"
    sys.path.insert(0, str(backend_path))
    uvicorn.run("app.main:app", host="127.0.0.1", port=8010, reload=True)
