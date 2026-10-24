import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import { createChoiceRound, createInstructionSequence, instructionMatches, resolveDifficulty } from "../lib/exerciseRuntime.ts";

const stimuli = ["ball", "book", "apple", "doll", "car", "puzzle"].map((key) => ({
  key,
  label: key,
  speech: key,
  media_ref: `/aac-pictograms/${key}.png`,
}));

function seededRandom(seed = 7) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("word and action rounds support exactly 2, 3 or 4 unique options", () => {
  for (const optionCount of [2, 3, 4]) {
    const round = createChoiceRound(stimuli, optionCount, undefined, seededRandom(optionCount));
    assert.equal(round.optionKeys.length, optionCount);
    assert.equal(new Set(round.optionKeys).size, optionCount);
    assert.ok(round.optionKeys.includes(round.targetKey));
  }
});

test("the correct answer is keyed and appears in every possible visual position", () => {
  const random = seededRandom(20261012);
  const positions = new Set();
  let previousTarget;
  for (let index = 0; index < 300; index += 1) {
    const round = createChoiceRound(stimuli, 4, previousTarget, random);
    assert.notEqual(round.targetKey, previousTarget);
    positions.add(round.optionKeys.indexOf(round.targetKey));
    previousTarget = round.targetKey;
  }
  assert.deepEqual([...positions].sort(), [0, 1, 2, 3]);
});

test("binary choices can repeat or change sides instead of alternating predictably", () => {
  const random = seededRandom(42024);
  let previousCorrectIndex;
  let repeated = 0;
  let changed = 0;
  for (let index = 0; index < 200; index += 1) {
    const round = createChoiceRound(stimuli, 2, undefined, random, previousCorrectIndex);
    const position = round.optionKeys.indexOf(round.targetKey);
    if (previousCorrectIndex !== undefined) {
      if (position === previousCorrectIndex) repeated += 1;
      else changed += 1;
    }
    previousCorrectIndex = position;
  }
  assert.ok(repeated > 60 && changed > 60);
});

test("targets do not repeat until the available stimulus set is exhausted", () => {
  const random = seededRandom(20261014);
  const usedTargets = [];
  let previousCorrectIndex;
  for (let index = 0; index < stimuli.length; index += 1) {
    const round = createChoiceRound(stimuli, 4, usedTargets, random, previousCorrectIndex);
    assert.ok(!usedTargets.includes(round.targetKey));
    usedTargets.push(round.targetKey);
    previousCorrectIndex = round.optionKeys.indexOf(round.targetKey);
  }
  assert.equal(new Set(usedTargets).size, stimuli.length);

  const nextCycle = createChoiceRound(stimuli, 4, usedTargets, random, previousCorrectIndex);
  assert.ok(stimuli.some((item) => item.key === nextCycle.targetKey));
});

test("difficulty keeps option count, round count and attempt limit separate", () => {
  const levels = [
    { level: 1, option_count: 2, rounds: 4, max_attempts: 3 },
    { level: 2, option_count: 3, rounds: 5, max_attempts: 3 },
    { level: 3, option_count: 4, rounds: 5, max_attempts: 3 },
  ];
  assert.equal(resolveDifficulty(levels, 1).option_count, 2);
  assert.equal(resolveDifficulty(levels, 2).option_count, 3);
  assert.equal(resolveDifficulty(levels, 3).option_count, 4);
  assert.equal(resolveDifficulty(undefined, 1).rounds, 12);
});

test("one-step instruction requires the selected object and destination pair", () => {
  const scenario = {
    key: "give-ball",
    instruction: "Дай мяч",
    speech: "Дай мяч",
    objects: [
      { key: "ball", label: "Мяч", role: "movable", media_ref: "/ball.png" },
      { key: "adult", label: "Взрослый", role: "target", media_ref: "/adult.svg" },
    ],
    success: { object_key: "ball", target_key: "adult" },
  };
  assert.equal(instructionMatches(scenario, "ball", "adult"), true);
  assert.equal(instructionMatches(scenario, "ball", null), false);
  assert.equal(instructionMatches(scenario, "book", "adult"), false);
});

test("P1 runner exposes repeat audio, break, refusal and tap-sequence controls", async () => {
  const source = await readFile(new URL("../components/P1ExerciseRunners.tsx", import.meta.url), "utf8");
  assert.match(source, /Повторить/);
  assert.match(source, /Перерыв/);
  assert.match(source, /Не хочу/);
  assert.match(source, /instructionMatches/);
  assert.match(source, /role === "movable"/);
  assert.match(source, /role === "target"/);
});

test("synthetic action scenes are bundled as full local illustrations", async () => {
  for (const name of ["sleep", "eat", "drink", "play", "run"]) {
    const file = await stat(new URL(`../public/p1/actions/${name}.svg`, import.meta.url));
    assert.ok(file.size > 500, name);
  }
});


test("a larger instruction bank rotates objects before repeating them and keeps every scenario", () => {
  const bank = Array.from({length: 8}, (_, i) => ["box", "basket", "table"].map(target => ({
    key: `object-${i}-${target}`, instruction: "Положи предмет", speech: "Положи предмет", objects: [], success: {object_key: `object-${i}`, target_key: target},
  }))).flat();
  const sequence = createInstructionSequence(bank, seededRandom(42));
  assert.equal(sequence.length, 24);
  assert.equal(new Set(sequence.map(item => item.key)).size, 24);
  for (let i = 0; i < 24; i += 8) assert.equal(new Set(sequence.slice(i, i + 8).map(item => item.success.object_key)).size, 8);
  assert.notDeepEqual(sequence.map(item => item.key), createInstructionSequence(bank, seededRandom(95)).map(item => item.key));
});

test("all twelve words are asked before a concept repeats", () => {
  const bank = Array.from({length:12}, (_, i) => ({key: `word-${i}`, label: String(i), speech: String(i)}));
  const used = [];
  for (let i = 0; i < 12; i++) {
    const round = createChoiceRound(bank, 3, used, seededRandom(i + 20));
    assert.ok(!used.includes(round.targetKey));
    used.push(round.targetKey);
  }
  assert.equal(new Set(used).size, 12);
});
