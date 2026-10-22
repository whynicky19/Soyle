"""Generate local, unreviewed Russian narration; no child data or network API."""
import array
import hashlib
import json
import subprocess
import sys
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.picnic_content import PICNIC  # noqa: E402


def generate(item):
    text, relative = item
    target = ROOT / "frontend/public" / relative.lstrip("/")
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        temporary = target.with_suffix(".aiff")
        subprocess.run(["say", "-v", "Milena", "-r", "148", "-o", str(temporary), text], check=True, capture_output=True)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(temporary), "-ar", "24000", "-ac", "1", str(target)], check=True, capture_output=True)
        temporary.unlink()
    with wave.open(str(target)) as recording:
        samples = array.array("h", recording.readframes(recording.getnframes()))
        if not samples or max(abs(value) for value in samples) < 500:
            raise RuntimeError(f"Silent clip: {relative}")
        seconds = round(len(samples) / recording.getframerate(), 2)
    return {"text": text, "file": relative, "seconds": seconds, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=4) as pool:
        clips = list(pool.map(generate, PICNIC["audio"]["clips"].items()))
    manifest = {"voice": "Milena", "rate": 148, "status": "generated_unreviewed", "clips": clips}
    (ROOT / "frontend/public/learning-core/picnic/audio/manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Generated/checked {len(clips)} narration clips; pronunciation still requires listening review")
