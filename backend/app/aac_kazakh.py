"""Deterministic linguistic composition; validity is not clinical approval."""
import json
from pathlib import Path
RULES=json.loads((Path(__file__).parent/'locales/kk-KZ-aac-rules.json').read_text())


def compose(cards):
    keys=[card.get('concept_key') for card in cards]
    if len(keys) not in {2,3} or any(key is None for key in keys):return None
    intents=[key for key in keys if key in {'want','see','love'}]
    if len(intents)!=1:return None
    intent=intents[0]
    remainder=[key for key in keys if key!=intent]
    subject='me'
    if len(remainder)==2:
        if remainder[0] not in RULES['subjects']:return None
        subject=remainder.pop(0)
    if len(remainder)==1 and intent=='want' and subject=='me' and remainder[0] in RULES['activities']:return RULES['activities'][remainder[0]]
    if len(remainder)!=1 or remainder[0] not in RULES['objects']:return None
    actor=RULES['subjects'][subject];obj=RULES['objects'][remainder[0]]
    if intent=='want':return f"{actor['dat']} {obj['nom']} керек."
    return f"{actor['nom']} {obj['acc']} {actor[intent]}."


def editorial_phrases():
    phrases=set(RULES['activities'].values())
    for subject,actor in RULES['subjects'].items():
        for obj in RULES['objects'].values():
            phrases.add(f"{actor['dat']} {obj['nom']} керек.")
            phrases.add(f"{actor['nom']} {obj['acc']} {actor['see']}.")
            phrases.add(f"{actor['nom']} {obj['acc']} {actor['love']}.")
    return phrases
