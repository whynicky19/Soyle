import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";

import { categoriesToScores, evaluateMotorMovement, targetForSequenceStep } from "../lib/motorDetection.ts";

const neutral = categoriesToScores([
  { categoryName: "mouthSmileLeft", score: 0.03 },
  { categoryName: "mouthSmileRight", score: 0.04 },
  { categoryName: "mouthPucker", score: 0.02 },
  { categoryName: "mouthFunnel", score: 0.03 },
  { categoryName: "jawOpen", score: 0.04 },
  { categoryName: "cheekPuff", score: 0.02 },
]);

test("a still neutral face does not match any motor movement", () => {
  for (const target of ["smile", "tube", "open", "teeth", "cheeks"]) {
    assert.equal(evaluateMotorMovement(target, neutral, neutral).matched, false, target);
  }
});

test("each supported movement requires a clear change from the neutral baseline", () => {
  const examples = {
    smile: { mouthsmileleft: 0.65, mouthsmileright: 0.62 },
    tube: { mouthpucker: 0.61 },
    open: { jawopen: 0.7 },
    teeth: { mouthupperupleft: 0.52, mouthupperupright: 0.5 },
    cheeks: { cheekpuff: 0.58 },
  };
  for (const [target, scores] of Object.entries(examples)) {
    assert.equal(evaluateMotorMovement(target, { ...neutral, ...scores }, neutral).matched, true, target);
  }
});

test("sequence requires smile first and tube second", () => {
  assert.equal(targetForSequenceStep("sequence", 0), "smile");
  assert.equal(targetForSequenceStep("sequence", 1), "tube");
});

test("local model and WebAssembly assets are bundled with the site", async () => {
  const model = await stat(new URL("../public/mediapipe/models/face_landmarker.task", import.meta.url));
  const wasm = await stat(new URL("../public/mediapipe/wasm/vision_wasm_internal.wasm", import.meta.url));
  assert.ok(model.size > 1_000_000);
  assert.ok(wasm.size > 1_000_000);
});
