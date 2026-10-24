import assert from "node:assert/strict";
import test from "node:test";
import { newAnswerEvidence, withSupport, withResponse, responseOutcome } from "../lib/answerEvidence.ts";
import { chooseExemplar } from "../lib/exerciseRuntime.ts";

test("repeat before the first response cannot count as independent", () => {
  const evidence = withResponse(withSupport(newAnswerEvidence(), "repeat_audio"), "cup");
  assert.equal(responseOutcome(evidence), "repeated");
  assert.equal(evidence.first_response, "cup");
});
test("help has a stable hierarchy and preserves the first response", () => {
  let evidence = withResponse(newAnswerEvidence(), "ball");
  evidence = withSupport(evidence, "reduced_choice");
  evidence = withSupport(evidence, "repeat_audio");
  evidence = withResponse(evidence, "cup");
  assert.equal(responseOutcome(evidence), "reduced_choice");
  assert.equal(evidence.first_response, "ball");
  assert.equal(evidence.attempts, 2);
  assert.equal(responseOutcome(withSupport(evidence, "model_answer")), "modelled");
  assert.equal(responseOutcome(withResponse(newAnswerEvidence(), "cup")), "independent");
});
test("different examples keep one concept key without repeating its previous picture", () => {
  const stimulus = { key: "cup", label: "Чашка", speech: "Чашка", media_ref: "/cup-a.webp", exemplars: ["/cup-b.webp"] };
  assert.equal(chooseExemplar(stimulus, "/cup-a.webp", () => 0), "/cup-b.webp");
  assert.equal(chooseExemplar(stimulus, "/cup-b.webp", () => 0), "/cup-a.webp");
  assert.equal(chooseExemplar({ ...stimulus, exemplars: [] }, "/cup-a.webp"), "/cup-a.webp");
});

test("matched action sets cannot make the correct answer a different character", async () => {
  const { chooseRoundMedia } = await import("../lib/exerciseRuntime.ts");
  const stimuli = ["eat", "drink", "read", "play"].map(key => ({key, label: key, speech: key, media_ref: `/${key}-a.png`, exemplars: [`/${key}-b.png`]}));
  const previous = {eat: "/eat-a.png"};
  const first = chooseRoundMedia(stimuli, "eat", previous, true, () => 0.9);
  assert.deepEqual(first, Object.fromEntries(stimuli.map(item => [item.key, `/${item.key}-b.png`])));
  const next = chooseRoundMedia(stimuli, "eat", {eat: first.eat}, true, () => 0.9);
  assert.deepEqual(next, Object.fromEntries(stimuli.map(item => [item.key, `/${item.key}-a.png`])));
  assert.equal(chooseRoundMedia(stimuli, "read", {}, false, () => 0.9).read, "/read-a.png");
});
