export type ChoiceStimulus = {
  key: string;
  label: string;
  speech: string;
  hint?: string;
  media_ref?: string;
  visual_token?: string;
};

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
  previousCorrectIndex?: number,
): ChoiceRound {
  if (stimuli.length < optionCount) throw new Error("Недостаточно стимулов для выбранной сложности");
  const excluded = typeof excludedTargetKeys === "string"
    ? new Set([excludedTargetKeys])
    : new Set(excludedTargetKeys || []);
  const possibleTargets = stimuli.filter((item) => !excluded.has(item.key));
  const target = shuffleWithRandom(possibleTargets.length ? possibleTargets : stimuli, random)[0];
  const distractors = shuffleWithRandom(stimuli.filter((item) => item.key !== target.key), random).slice(0, optionCount - 1);
  const optionKeys = shuffleWithRandom([target, ...distractors], random).map((item) => item.key);
  const correctIndex = optionKeys.indexOf(target.key);
  if (previousCorrectIndex !== undefined && optionKeys.length > 1 && correctIndex === previousCorrectIndex) {
    const swapIndex = (correctIndex + 1 + Math.floor(random() * (optionKeys.length - 1))) % optionKeys.length;
    [optionKeys[correctIndex], optionKeys[swapIndex]] = [optionKeys[swapIndex], optionKeys[correctIndex]];
  }
  return { targetKey: target.key, optionKeys };
}

export function resolveDifficulty(levels: readonly DifficultyLevel[] | undefined, level: 1 | 2 | 3): DifficultyLevel {
  return levels?.find((item) => item.level === level) || {
    level,
    option_count: level === 1 ? 2 : level === 2 ? 3 : 4,
    rounds: level === 1 ? 4 : 5,
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
