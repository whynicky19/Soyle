export type ChoiceStimulus = {
  key: string;
  label: string;
  speech: string;
  hint?: string;
  media_ref?: string;
  exemplars?: string[];
  visual_token?: string;
};

export function chooseExemplar(stimulus: ChoiceStimulus, previous?: string, random: () => number = Math.random): string | undefined {
  const candidates = [...new Set([stimulus.media_ref, ...(stimulus.exemplars || [])].filter((path): path is string => Boolean(path)))];
  const unseen = candidates.filter((path) => path !== previous);
  return shuffleWithRandom(unseen.length ? unseen : candidates, random)[0];
}

export function chooseRoundMedia(stimuli: readonly ChoiceStimulus[], targetKey: string, previous: Record<string, string>, matchedSet = false, random: () => number = Math.random): Record<string, string> {
  const target = stimuli.find(item => item.key === targetKey);
  const targetPath = target && chooseExemplar(target, previous[targetKey], random);
  const exampleIndex = target ? [target.media_ref, ...(target.exemplars || [])].indexOf(targetPath) : -1;
  const media: Record<string, string> = {};
  for (const item of stimuli) {
    const path = matchedSet && exampleIndex >= 0
      ? [item.media_ref, ...(item.exemplars || [])][exampleIndex]
      : chooseExemplar(item, previous[item.key], random);
    if (path) media[item.key] = path;
  }
  return media;
}

export type DifficultyLevel = {
  level: 1 | 2 | 3;
  option_count: 2 | 3 | 4;
  rounds: number;
  max_attempts: number;
};

export type ChoiceRound = {
  targetKey: string;
  optionKeys: string[];
};

export type InstructionObject = {
  key: string;
  label: string;
  role: "movable" | "target";
  media_ref: string;
};

export type InstructionScenario = {
  key: string;
  instruction: string;
  speech: string;
  objects: InstructionObject[];
  success: { object_key: string; target_key: string };
  result?: { media_ref?: string; relation: "give" | "in" | "on"; speech: string };
};

export function shuffleWithRandom<T>(values: readonly T[], random: () => number = Math.random): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function createChoiceRound(
  stimuli: readonly ChoiceStimulus[],
  optionCount: 2 | 3 | 4,
  excludedTargetKeys?: string | readonly string[] | ReadonlySet<string>,
  random: () => number = Math.random,
  _previousCorrectIndex?: number,
): ChoiceRound {
  if (stimuli.length < optionCount) throw new Error("Недостаточно стимулов для выбранной сложности");
  const excluded = typeof excludedTargetKeys === "string"
    ? new Set([excludedTargetKeys])
    : new Set(excludedTargetKeys || []);
  const possibleTargets = stimuli.filter((item) => !excluded.has(item.key));
  const target = shuffleWithRandom(possibleTargets.length ? possibleTargets : stimuli, random)[0];
  const distractors = shuffleWithRandom(stimuli.filter((item) => item.key !== target.key), random).slice(0, optionCount - 1);
  const optionKeys = shuffleWithRandom([target, ...distractors], random).map((item) => item.key);
  return { targetKey: target.key, optionKeys };
}

export function resolveDifficulty(levels: readonly DifficultyLevel[] | undefined, level: 1 | 2 | 3): DifficultyLevel {
  return levels?.find((item) => item.level === level) || {
    level,
    option_count: level === 1 ? 2 : level === 2 ? 3 : 4,
    rounds: 12,
    max_attempts: 3,
  };
}

export function instructionMatches(
  scenario: InstructionScenario,
  objectKey: string | null,
  targetKey: string | null,
): boolean {
  return objectKey === scenario.success.object_key && targetKey === scenario.success.target_key;
}

export function createInstructionSequence(scenarios: readonly InstructionScenario[], random: () => number = Math.random): InstructionScenario[] {
  const groups = new Map<string, InstructionScenario[]>();
  for (const scenario of scenarios) {
    const key = scenario.success.object_key;
    groups.set(key, [...(groups.get(key) || []), scenario]);
  }
  for (const [key, group] of groups) groups.set(key, shuffleWithRandom(group, random));
  const result: InstructionScenario[] = [];
  let previous: string | undefined;
  while ([...groups.values()].some(group => group.length)) {
    const keys = shuffleWithRandom([...groups.keys()].filter(key => groups.get(key)?.length), random);
    if (keys.length > 1 && keys[0] === previous) [keys[0], keys[1]] = [keys[1], keys[0]];
    for (const key of keys) {
      const scenario = groups.get(key)?.shift();
      if (scenario) { result.push(scenario); previous = key; }
    }
  }
  return result;
}
