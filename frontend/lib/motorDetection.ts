export type MotorTarget = "smile" | "tube" | "open" | "teeth" | "cheeks" | "sequence";

export type BlendshapeCategory = {
  categoryName: string;
  score: number;
};

export type BlendshapeScores = Record<string, number>;

export type MovementCheck = {
  matched: boolean;
  confidence: number;
  rawScore: number;
  changeFromBaseline: number;
};

type SingleMovement = Exclude<MotorTarget, "sequence">;

const movementThresholds: Record<SingleMovement, { absolute: number; change: number }> = {
  smile: { absolute: 0.25, change: 0.12 },
  tube: { absolute: 0.22, change: 0.12 },
  open: { absolute: 0.28, change: 0.18 },
  teeth: { absolute: 0.22, change: 0.1 },
  cheeks: { absolute: 0.2, change: 0.1 },
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const average = (...values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const canonicalName = (value: string) => value.replaceAll("_", "").toLowerCase();

export function categoriesToScores(categories: BlendshapeCategory[]): BlendshapeScores {
  return Object.fromEntries(categories.map((category) => [canonicalName(category.categoryName), category.score]));
}

export function mergeBaseline(current: BlendshapeScores, sample: BlendshapeScores, sampleCount: number): BlendshapeScores {
  const next = { ...current };
  const divisor = Math.max(sampleCount + 1, 1);
  for (const [name, value] of Object.entries(sample)) {
    next[name] = ((current[name] || 0) * sampleCount + value) / divisor;
  }
  return next;
}

function movementScore(target: SingleMovement, scores: BlendshapeScores): number {
  const get = (name: string) => scores[canonicalName(name)] || 0;
  if (target === "smile") return average(get("mouthSmileLeft"), get("mouthSmileRight"));
  if (target === "tube") return Math.max(get("mouthPucker"), get("mouthFunnel"));
  if (target === "open") return get("jawOpen");
  if (target === "cheeks") return get("cheekPuff");

  // У MediaPipe нет отдельного признака «видны зубы». Для «заборчика»
  // проверяем именно растяжение уголков губ, не делая вывода о зубах или речи.
  return Math.max(
    average(get("mouthSmileLeft"), get("mouthSmileRight")),
    average(get("mouthUpperUpLeft"), get("mouthUpperUpRight")),
  );
}

export function evaluateMotorMovement(
  target: SingleMovement,
  scores: BlendshapeScores,
  baseline: BlendshapeScores,
): MovementCheck {
  const rawScore = movementScore(target, scores);
  const baselineScore = movementScore(target, baseline);
  const changeFromBaseline = Math.max(0, rawScore - baselineScore);
  const threshold = movementThresholds[target];
  const absoluteProgress = rawScore / threshold.absolute;
  const changeProgress = changeFromBaseline / threshold.change;
  const confidence = clamp(Math.min(absoluteProgress, changeProgress));

  return {
    matched: rawScore >= threshold.absolute && changeFromBaseline >= threshold.change,
    confidence,
    rawScore,
    changeFromBaseline,
  };
}

export function targetForSequenceStep(target: MotorTarget, sequenceStep: 0 | 1): SingleMovement {
  if (target !== "sequence") return target;
  return sequenceStep === 0 ? "smile" : "tube";
}
