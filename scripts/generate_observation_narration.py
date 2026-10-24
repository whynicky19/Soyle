"""Build bundled Russian speech for picture descriptions using the local voice."""
import json
import subprocess
import sys
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app.observation_content import OBSERVATION_SPEECH
from app.tts_library import bundled_tts_path, normalize_tts_text


def generate(text):
    text = normalize_tts_text(text)
    path = bundled_tts_path(text)
    if not path.exists():
        temporary = path.with_suffix('.aiff')
        subprocess.run(['say', '-v', 'Milena', '-r', '148', '-o', str(temporary), text], check=True, capture_output=True)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(temporary), '-ar', '24000', '-ac', '1', str(path)], check=True, capture_output=True)
        temporary.unlink()
    with wave.open(str(path), 'rb') as audio:
        params = audio.getparams()
        frames = audio.readframes(audio.getnframes())
    tail_size = params.framerate // 20 * params.sampwidth * params.nchannels
    if any(frames[-tail_size:]):
        with wave.open(str(path), 'wb') as audio:
            audio.setparams(params)
            audio.writeframes(frames + bytes(params.framerate // 10 * params.sampwidth * params.nchannels))
    return {'text': text, 'file': path.name}


if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=4) as pool:
        clips = list(pool.map(generate, sorted(OBSERVATION_SPEECH)))
    path = ROOT / 'backend/app/tts_audio/manifest.json'
    manifest = json.loads(path.read_text())
    merged = {clip['file']: clip for clip in manifest['clips']}
    merged.update({clip['file']: clip for clip in clips})
    manifest['clips'] = sorted(merged.values(), key=lambda clip: clip['text'])
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'Prepared {len(clips)} speech clips')
