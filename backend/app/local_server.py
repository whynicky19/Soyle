"""Local launcher: load backend-only Speech settings without changing DB/auth config."""
import os
from pathlib import Path

from dotenv import dotenv_values

AZURE_VARIABLES = ("AZURE_TTS_ENABLED", "AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION")


def load_local_speech_settings(project_dir: Path) -> None:
    # Explicit shell settings win, then backend/.env.local, then root .env.local.
    for path in (project_dir / "backend" / ".env.local", project_dir / ".env.local"):
        values = dotenv_values(path) if path.is_file() else {}
        for name in AZURE_VARIABLES:
            value = values.get(name)
            if value is not None:
                os.environ.setdefault(name, value.strip())


def main() -> None:
    import uvicorn
    load_local_speech_settings(Path(__file__).resolve().parents[2])
    uvicorn.run("app.main:app", reload=True, host="127.0.0.1", port=8010)


if __name__ == "__main__":
    main()
