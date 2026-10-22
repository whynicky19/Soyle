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


test("refusal advances navigation but never counts as a performed exercise", () => {
  const results = [{exercise_id: 1, score: 0, duration_seconds: 5, attempt_status: "refused"}];
  assert.equal(nextIncompleteExerciseIndex(results, [1, 2]), 1);
  assert.equal(summarizeSessionResults(results, [1, 2]).completedCount, 0);
  assert.equal(summarizeSessionResults(results, [1, 2]).averageScore, null);
});


test("completed summary survives the active-session refresh and clears on home or child change", async () => {
  const { reconcileActiveSession } = await import("../lib/sessionRuntime.ts");
  const completed = { id: 1, child_id: 10, status: "completed", results: [{ exercise_id: 7 }] };
  const otherActive = { id: 2, child_id: 10, status: "in_progress", results: [] };
  assert.equal(reconcileActiveSession(completed, null, 10, true), completed);
  assert.equal(reconcileActiveSession(completed, otherActive, 10, true), completed);
  assert.equal(reconcileActiveSession(completed, null, 10, false), null);
  assert.equal(reconcileActiveSession(completed, null, 20, true), null);
  assert.equal(reconcileActiveSession({ ...completed, status: "in_progress" }, null, 10, true), null);
});
