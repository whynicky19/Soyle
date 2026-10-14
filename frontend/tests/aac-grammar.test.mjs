import assert from "node:assert/strict";
import test from "node:test";

import { composeAACMessage } from "../lib/aacGrammar.ts";

function card(id, label, speech, grammatical_role) {
  return {
    id,
    label,
    speech,
    grammatical_role,
    language: "ru",
    category: grammatical_role === "subject" ? "people" : grammatical_role === "action" ? "actions" : "play",
    image: "/soyle-icon.png",
    is_core: false,
    favorite: false,
  };
}

const me = card(1, "Я", "Я", "subject");
const see = card(2, "Вижу", "вижу", "action");

test("observation phrases use the correct Russian object form", () => {
  assert.deepEqual(composeAACMessage([me, see, card(3, "Мама", "Мама", "subject")]), {
    valid: true,
    phrase: "Я вижу маму",
    reason: "",
  });
  assert.equal(composeAACMessage([see, card(4, "Папа", "Папа", "subject")]).phrase, "Вижу папу");
  assert.equal(composeAACMessage([see, card(5, "Кот", "кот", "object")]).phrase, "Вижу кота");
});

test("unrelated invalid role combinations remain blocked", () => {
  const result = composeAACMessage([me, card(3, "Мама", "Мама", "subject")]);
  assert.equal(result.valid, false);
  assert.match(result.reason, /проверенные шаблоны/);
});
