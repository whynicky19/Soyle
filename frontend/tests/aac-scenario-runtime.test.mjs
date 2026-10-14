import assert from "node:assert/strict";
import test from "node:test";

import { canAddAACScenarioCard, evaluateAACScenario } from "../lib/aacScenarioRuntime.ts";

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

test("observation accepts the shown I-see-person sequence and blocks unrelated continuations", () => {
  const observation = {
    scenario_key: "observation",
    labels: ["Я", "Вижу", "Мама", "Папа", "Кот"],
    completion: { type: "contains_any", accepted_labels: ["Мама", "Папа", "Кот"] },
    accepted_sequences: [
      ["Мама"], ["Папа"], ["Кот"],
      ["Вижу", "Мама"], ["Вижу", "Папа"], ["Вижу", "Кот"],
      ["Я", "Вижу", "Мама"], ["Я", "Вижу", "Папа"], ["Я", "Вижу", "Кот"],
    ],
  };
  assert.equal(evaluateAACScenario(observation, ["Я", "Вижу", "Мама"]).complete, true);
  assert.equal(canAddAACScenarioCard(observation, ["Я"], "Вижу"), true);
  assert.equal(canAddAACScenarioCard(observation, ["Я"], "Мама"), false);
  assert.equal(canAddAACScenarioCard(observation, ["Мама"], "Папа"), false);
});

test("single-answer tasks cannot accumulate contradictory or repeated answers", () => {
  const answer = {
    scenario_key: "answer",
    labels: ["Да", "Нет"],
    completion: { type: "contains_any", accepted_labels: ["Да", "Нет"] },
    accepted_sequences: [["Да"], ["Нет"]],
  };
  assert.equal(evaluateAACScenario(answer, ["Да"]).complete, true);
  assert.equal(evaluateAACScenario(answer, ["Да", "Нет"]).complete, false);
  assert.equal(canAddAACScenarioCard(answer, ["Да"], "Нет"), false);
  assert.equal(canAddAACScenarioCard(answer, ["Да"], "Да"), false);
});
