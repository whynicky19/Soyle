import assert from "node:assert/strict";
import test from "node:test";

import { nextIncompleteExerciseIndex, summarizeSessionResults } from "../lib/sessionRuntime.ts";

test("session summary counts unique completed exercises and ignores breaks", () => {
  const results = [
    { exercise_id: 1, score: 0, duration_seconds: 10, attempt_status: "break" },
    { exercise_id: 1, score: 0, duration_seconds: 20, attempt_status: "participated" },
    { exercise_id: 7, score: 100, duration_seconds: 30, attempt_status: "completed" },
    { exercise_id: 7, score: 80, duration_seconds: 40, attempt_status: "completed" },
    { exercise_id: 99, score: 100, duration_seconds: 50, attempt_status: "completed" },
  ];

  const summary = summarizeSessionResults(results, [1, 7]);
  assert.equal(summary.completedCount, 2);
  assert.equal(summary.averageScore, 80);
  assert.equal(summary.durationSeconds, 100);
});

test("resume selects the first exercise without a terminal result", () => {
  const results = [
    { exercise_id: 7, score: 100, duration_seconds: 30, attempt_status: "completed" },
    { exercise_id: 8, score: 0, duration_seconds: 4, attempt_status: "break" },
    { exercise_id: 14, score: 0, duration_seconds: 20, attempt_status: "participated" },
  ];

  assert.equal(nextIncompleteExerciseIndex(results, [7, 14, 8]), 2);
  assert.equal(nextIncompleteExerciseIndex([...results, { exercise_id: 8, score: 0, duration_seconds: 2, attempt_status: "refused" }], [7, 14, 8]), 3);
});
