"""Bundle word-card names, neutral semantic hints and feedback with the local voice."""
import json,sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT),str(ROOT/'backend')]
from scripts.generate_observation_narration import generate
from app.word_reinforcement import SPEECH

if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=4) as pool:clips=list(pool.map(generate,SPEECH))
    path=ROOT/'backend/app/tts_audio/manifest.json'
    manifest=json.loads(path.read_text());merged={clip['file']:clip for clip in manifest['clips']}
    merged.update({clip['file']:clip for clip in clips});manifest['clips']=sorted(merged.values(),key=lambda c:c['text'])
    path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('Prepared',len(clips),'word-card phrases.')
