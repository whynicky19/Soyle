#!/usr/bin/env python3
import json
import shutil
import subprocess
import sys
import wave
from array import array
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.tts_library import BUNDLED_TTS_DIR, bundled_tts_path, known_russian_tts_texts  # noqa: E402


def is_audible(path: Path) -> bool:
    if not path.exists():
        return False
    try:
        with wave.open(str(path), "rb") as audio:
            if audio.getnframes() < audio.getframerate() // 4:
                return False
            samples = array("h", audio.readframes(audio.getnframes()))
            return bool(samples) and max(abs(sample) for sample in samples) >= 500
    except (EOFError, wave.Error):
        return False


def generate(text: str) -> dict[str, str]:
    output_path = bundled_tts_path(text)
    source_path = output_path.with_suffix(".aiff")
    if not is_audible(output_path):
        output_path.unlink(missing_ok=True)
        subprocess.run(
            ["say", "-v", "Milena", "-r", "148", "-o", str(source_path), text],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            [
                "ffmpeg", "-loglevel", "error", "-y", "-i", str(source_path),
                "-af",
                "silenceremove=start_periods=1:start_silence=0.03:start_threshold=-50dB:stop_periods=-1:stop_silence=0.08:stop_threshold=-50dB,highpass=f=60,lowpass=f=10500,afade=t=in:st=0:d=0.04,areverse,afade=t=in:st=0:d=0.12,areverse,apad=pad_dur=0.15",
                "-ar", "24000", "-ac", "1", str(output_path),
            ],
            check=True,
            capture_output=True,
        )
        source_path.unlink(missing_ok=True)
        if not is_audible(output_path):
            output_path.unlink(missing_ok=True)
            raise RuntimeError(f"Generated clip is silent: {text}")
    return {"text": text, "file": output_path.name}


def main() -> int:
    if not shutil.which("say") or not shutil.which("ffmpeg"):
        print("The macOS say command and ffmpeg are required", file=sys.stderr)
        return 1
    BUNDLED_TTS_DIR.mkdir(parents=True, exist_ok=True)
    texts = known_russian_tts_texts()
    with ThreadPoolExecutor(max_workers=4) as pool:
        manifest = list(pool.map(generate, texts))
    (BUNDLED_TTS_DIR / "manifest.json").write_text(
        json.dumps({"voice": "Milena", "base_rate_wpm": 148, "clips": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Generated {len(manifest)} bundled TTS clips")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
