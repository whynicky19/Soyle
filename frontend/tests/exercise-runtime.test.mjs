import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import { createChoiceRound, instructionMatches, resolveDifficulty } from "../lib/exerciseRuntime.ts";

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

test("the correct answer never repeats the same visual position in consecutive rounds", () => {
  const random = seededRandom(42024);
  let previousTarget;
  let previousCorrectIndex;
  for (let index = 0; index < 100; index += 1) {
    const round = createChoiceRound(stimuli, 4, previousTarget, random, previousCorrectIndex);
    const correctIndex = round.optionKeys.indexOf(round.targetKey);
    if (previousCorrectIndex !== undefined) assert.notEqual(correctIndex, previousCorrectIndex);
    previousTarget = round.targetKey;
    previousCorrectIndex = correctIndex;
  }
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
  assert.equal(resolveDifficulty(undefined, 1).rounds, 4);
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
