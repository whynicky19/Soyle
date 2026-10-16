import assert from "node:assert/strict";
import test from "node:test";

import { exerciseCountLabel, selectHomeExercises, SESSION_EXERCISE_COUNTS } from "../lib/homePractice.ts";

const exercises = [
  { id: 1, module: "mixed", title: "Я хочу" },
  { id: 2, module: "mixed", title: "Я вижу" },
  { id: 3, module: "sensory", title: "Игрушки" },
  { id: 4, module: "mixed", title: "Помощь" },
  { id: 5, module: "sensory", title: "Животные" },
];

test("duration choices create visibly different plan sizes", () => {
  assert.deepEqual(SESSION_EXERCISE_COUNTS, { 3: 2, 5: 3, 10: 5 });
  assert.equal(exerciseCountLabel(1), "1 задание");
  assert.equal(exerciseCountLabel(3), "3 задания");
  assert.equal(exerciseCountLabel(5), "5 заданий");
});

test("home choices rotate after a saved completion and keep module variety", () => {
  const before = selectHomeExercises({ exercises, completedExerciseIds: [], totalAttempts: 0 });
  const after = selectHomeExercises({ exercises, completedExerciseIds: [before[0].id], totalAttempts: 1 });

  assert.equal(before.length, 3);
  assert.equal(new Set(before.map((item) => item.module)).size, 2);
  assert.equal(after.some((item) => item.id === before[0].id), false);
  assert.notDeepEqual(after.map((item) => item.id), before.map((item) => item.id));
});

test("attempt count rotates choices even when every activity was tried", () => {
  const completedExerciseIds = exercises.map((item) => item.id);
  const first = selectHomeExercises({ exercises, completedExerciseIds, totalAttempts: 5 });
  const next = selectHomeExercises({ exercises, completedExerciseIds, totalAttempts: 6 });
  assert.notDeepEqual(next.map((item) => item.id), first.map((item) => item.id));
});
