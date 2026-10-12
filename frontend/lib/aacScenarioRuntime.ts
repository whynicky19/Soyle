export type AACScenarioContent = {
  scenario_key?: string;
  title?: string;
  labels?: string[];
  instruction?: string;
  steps?: string[];
  criterion?: string;
  empty_hint?: string;
  incomplete_hint?: string;
  success_hint?: string;
  action_label?: string;
  completion?: { type: "contains_any"; accepted_labels: string[] };
};

const fallbackExcludedLabels: Record<string, Set<string>> = {
  request: new Set(["Хочу"]),
  observation: new Set(["Я", "Вижу", "Играю"]),
  past_event: new Set(["Я", "Вчера", "Мяч"]),
};

export function evaluateAACScenario(
  content: AACScenarioContent | undefined,
  selectedLabels: readonly string[],
): { complete: boolean; hint: string; actionLabel: string; stepLabel: string } {
  const configuredLabels = content?.completion?.accepted_labels;
  const excluded = fallbackExcludedLabels[content?.scenario_key || ""] || new Set<string>();
  const acceptedLabels = configuredLabels?.length
    ? configuredLabels
    : (content?.labels || []).filter((label) => !excluded.has(label));
  const complete = selectedLabels.some((label) => acceptedLabels.includes(label));
  const hint = !selectedLabels.length
    ? content?.empty_hint || "Сначала выбери карточку для задания."
    : complete
      ? content?.success_hint || "Сообщение готово. Теперь нажми кнопку справа."
      : content?.incomplete_hint || "Добавь карточку, которая отвечает на задание.";
  return {
    complete,
    hint,
    actionLabel: content?.action_label || "Сказать и закончить",
    stepLabel: complete ? "Шаг 2 из 2" : "Шаг 1 из 2",
  };
}
