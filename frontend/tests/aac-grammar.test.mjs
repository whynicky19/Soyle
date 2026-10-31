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

test("free communication speaks multiple ready messages while guided tasks keep their rules", () => {
  const selected = [card(10, "Что это?", "Что это?", "ready_message"), card(11, "Устал", "Я устал", "ready_message")];
  assert.equal(composeAACMessage(selected).valid, false);
  assert.deepEqual(composeAACMessage(selected, "free"), { valid: true, phrase: "Что это? Я устал", reason: "" });
  assert.equal(composeAACMessage([me, see, card(3, "Мама", "Мама", "subject")], "free").phrase, "Я вижу маму");
});


test('Kazakh semantic AAC uses case forms and natural request phrases', () => {
  const card = concept_key => ({id:1,label:concept_key,speech:concept_key,concept_key,language:'kk',grammatical_role:'object'});
  for(const [keys,phrase] of [
    [['want','water'],'Маған су керек.'],
    [['me','apple','want'],'Маған алма керек.'],
    [['me','see','mother'],'Мен анамды көріп тұрмын.'],
    [['me','love','ball'],'Мен допты жақсы көремін.'],
    [['want','draw'],'Сурет салғым келеді.'],
  ]) assert.equal(composeAACMessage(keys.map(card)).phrase,phrase);
  assert.equal(composeAACMessage([card('me'),card('me')]).valid,false);
  assert.match(composeAACMessage([], 'guided', 'kk').reason,/карточканы/);
});
