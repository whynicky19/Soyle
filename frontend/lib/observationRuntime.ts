
export type ObservationScene = {key: string; theme: string; media_ref: string; parts: [string, string, string]; options: string[][]; detail_question: string};
export type ObservationContent = {presentation?: string; bank_key?: string; scenes?: ObservationScene[]; default_rounds?: number; round_choices?: number[]};

export function observationRounds(scenes: ObservationScene[], random = Math.random): ObservationScene[] {
  const remaining = [...scenes];
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  const rounds: ObservationScene[] = [];
  const counts = new Map<string, number>();
  let visited = 0;
  function arrange(): boolean {
    if (++visited > 20000) return false;
    if (!remaining.length) return true;
    const previous = rounds.at(-1);
    const candidates = remaining.filter(scene => !previous || (scene.theme !== previous.theme && scene.parts[0] !== previous.parts[0] && scene.parts[1] !== previous.parts[1]))
      .sort((a, b) => (counts.get(a.theme) || 0) - (counts.get(b.theme) || 0));
    for (const next of candidates) {
      const position = remaining.indexOf(next);
      rounds.push(next); remaining.splice(position, 1);
      counts.set(next.theme, (counts.get(next.theme) || 0) + 1);
      if (arrange()) return true;
      counts.set(next.theme, counts.get(next.theme)! - 1);
      rounds.pop(); remaining.splice(position, 0, next);
    }
    return false;
  }
  if (!arrange()) return [...scenes];
  return rounds;
}

export function descriptionQuestion(scene: ObservationScene, step: number): string {
  return step === 0 ? 'Кто на картинке?' : step === 1 ? 'Что делает?' : scene.detail_question;
}
