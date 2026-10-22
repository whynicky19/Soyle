// Evidence concerns this task only; it is not a developmental assessment.
export type Support = "repeat_audio" | "reduced_choice" | "model_answer" | "visual_hint";
export type AnswerEvidence = { attempts: number; supports: Support[]; first_response: string | null };

export function newAnswerEvidence(): AnswerEvidence {
  return { attempts: 0, supports: [], first_response: null };
}

export function withSupport(evidence: AnswerEvidence, support: Support): AnswerEvidence {
  return { ...evidence, supports: [...evidence.supports, support] };
}

export function withResponse(evidence: AnswerEvidence, response: string): AnswerEvidence {
  return { ...evidence, attempts: evidence.attempts + 1, first_response: evidence.first_response ?? response };
}

export function responseOutcome(evidence: AnswerEvidence): "independent" | "repeated" | "reduced_choice" | "modelled" | "prompted" {
  if (evidence.supports.includes("model_answer")) return "modelled";
  if (evidence.supports.includes("reduced_choice")) return "reduced_choice";
  if (evidence.supports.includes("visual_hint")) return "prompted";
  if (evidence.supports.includes("repeat_audio")) return "repeated";
  return evidence.attempts <= 1 ? "independent" : "prompted";
}
