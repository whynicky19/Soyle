"""Offline structure/media check. It deliberately does not grant release approval."""
import array
import hashlib
import json
import sys
import wave
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend/public"
sys.path.insert(0, str(ROOT / "backend"))
from app.core_content import CORE_EXERCISES  # noqa: E402
from app.exercise_engine import validate_version  # noqa: E402
from app.picnic_content import PICNIC  # noqa: E402
from app.tts_library import bundled_tts_path  # noqa: E402


def local(path):
    resolved = (PUBLIC / path.lstrip("/")).resolve()
    assert resolved.is_relative_to(PUBLIC.resolve()) and resolved.is_file(), path
    return resolved


def audible(path):
    with wave.open(str(path)) as audio:
        assert audio.getnchannels() == 1 and audio.getsampwidth() == 2, str(path)
        samples = array.array("h", audio.readframes(audio.getnframes()))
        assert len(samples) / audio.getframerate() > .25 and max(abs(sample) for sample in samples) >= 500, str(path)


def check():
    required = set()
    for exercise in CORE_EXERCISES:
        assert not validate_version({**exercise, "language": "ru"})
        for stimulus in exercise["content"]["stimuli"]:
            required.update([stimulus["media_ref"], *stimulus.get("exemplars", [])])
            audible(bundled_tts_path(stimulus["speech"]))
    assert 10 <= len(PICNIC["scenes"]) <= 15
    assert len({scene["id"] for scene in PICNIC["scenes"]}) == len(PICNIC["scenes"])
    for scene in PICNIC["scenes"]:
        required.add(scene["image"])
        required.update(scene.get("image_by_choice", {}).get("images", {}).values())
        required.update(scene.get("step_images", {}).values())
        if scene.get("result_image"): required.add(scene["result_image"])
        for option in scene["options"]:
            if option.get("image"): required.add(option["image"])
            if option.get("result_image"): required.add(option["result_image"])
    for path in required:
        with Image.open(local(path)) as illustration:
            illustration.verify()
    registered = 0
    for path in (PUBLIC / "learning-core").glob("**/manifest.json"):
        manifest = json.loads(path.read_text())
        records = manifest if isinstance(manifest, list) else manifest.get("images", manifest.get("clips", []))
        if isinstance(records, dict): records = [{"file": key, **value} for key, value in records.items()]
        for entry in records:
            asset = local(entry["file"])
            assert hashlib.sha256(asset.read_bytes()).hexdigest() == entry["sha256"], str(asset)
            registered += 1
    for path in PICNIC["audio"]["clips"].values(): audible(local(path))
    print(json.dumps({"required_images_checked": len(required), "registered_assets_hashed": registered,
                      "comic_narration_clips_checked": len(PICNIC["audio"]["clips"]),
                      "comic_scenes": len(PICNIC["scenes"]), "release_approval": False}, ensure_ascii=False))


if __name__ == "__main__":
    check()
