import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAACScenario } from "../lib/aacScenarioRuntime.ts";

const request = {
  scenario_key: "request",
  labels: ["Хочу", "Сок", "Вода", "Мяч", "Книга"],
  empty_hint: "Сначала выбери предмет.",
  incomplete_hint: "Теперь выбери предмет.",
  success_hint: "Просьба готова.",
  action_label: "Сказать просьбу",
  completion: { type: "contains_any", accepted_labels: ["Сок", "Вода", "Мяч", "Книга"] },
};

test("request is not complete after selecting only the word Want", () => {
  const result = evaluateAACScenario(request, ["Хочу"]);
  assert.equal(result.complete, false);
  assert.equal(result.hint, "Теперь выбери предмет.");
  assert.equal(result.stepLabel, "Шаг 1 из 2");
});

test("a requested object enables the explicit completion action", () => {
  const singleCard = evaluateAACScenario(request, ["Мяч"]);
  const shortPhrase = evaluateAACScenario(request, ["Хочу", "Вода"]);
  assert.equal(singleCard.complete, true);
  assert.equal(shortPhrase.complete, true);
  assert.equal(shortPhrase.actionLabel, "Сказать просьбу");
  assert.equal(shortPhrase.stepLabel, "Шаг 2 из 2");
});

test("legacy request payload still rejects Want without a requested object", () => {
  const legacy = { scenario_key: "request", labels: ["Хочу", "Сок", "Вода"] };
  assert.equal(evaluateAACScenario(legacy, ["Хочу"]).complete, false);
  assert.equal(evaluateAACScenario(legacy, ["Сок"]).complete, true);
});
