#!/usr/bin/env python3
import json
import argparse
import time
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
    parser = argparse.ArgumentParser(description="Generate the existing local library or warm the shared Azure cache")
    parser.add_argument("--azure", action="store_true")
    parser.add_argument("--confirm-output-rights", action="store_true", help="Operator has checked applicable Microsoft output-use rights")
    parser.add_argument("--language", choices=("ru", "kk"), default="ru")
    parser.add_argument("--mode", choices=("normal", "slow", "both"), default="both")
    parser.add_argument("--limit", type=int, default=20, help="Maximum catalogue texts per run")
    args = parser.parse_args()
    if args.azure:
        from app.azure_tts import TTSUnavailable, catalogue, enabled, synthesize
        if not args.confirm_output_rights or not enabled() or args.limit < 1:
            print("Enable Azure and confirm output-use rights; limit must be positive", file=sys.stderr)
            return 1
        modes = ("normal", "slow") if args.mode == "both" else (args.mode,)
        completed = 0
        for language, text in sorted(catalogue()):
            if language != args.language:
                continue
            for mode in modes:
                try:
                    synthesize(text, language, mode)
                except TTSUnavailable:
                    print("Stopped: Azure unavailable or budget exhausted; cached clips are retained", file=sys.stderr)
                    return 1
                time.sleep(3.1)  # Same global limiter/cache as the live endpoint.
            completed += 1
            if completed >= args.limit:
                break
        print(f"Prepared {completed} catalogue entries ({len(modes)} modes)")
        return 0
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
