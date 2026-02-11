import json
import sys
from pathlib import Path

# This script exports openapi.json from FastAPI app.
# Add backend to path to import app
sys.path.append(str(Path(__file__).parent.parent))

from app.main import app


def export_openapi():
    json_path = Path(__file__).parent.parent / "openapi.json"
    with open(json_path, "w") as f:
        json.dump(app.openapi(), f, indent=2)
    print(f"Exported OpenAPI schema to {json_path}")


if __name__ == "__main__":
    export_openapi()
