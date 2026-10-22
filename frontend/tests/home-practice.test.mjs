import assert from "node:assert/strict";
import test from "node:test";

import { exerciseCountLabel, SESSION_EXERCISE_COUNTS } from "../lib/homePractice.ts";

test("duration choices create visibly different plan sizes", () => {
  assert.deepEqual(SESSION_EXERCISE_COUNTS, { 3: 2, 5: 3, 10: 5 });
  assert.equal(exerciseCountLabel(1), "1 задание");
  assert.equal(exerciseCountLabel(3), "3 задания");
  assert.equal(exerciseCountLabel(5), "5 заданий");
});
