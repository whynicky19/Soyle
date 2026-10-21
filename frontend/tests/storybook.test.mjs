import assert from "node:assert/strict";
import test from "node:test";
import { availableActions, canContinue, sceneLayers } from "../lib/storybook/interaction.ts";

const state = { scene_index: 3, step: 0, ready: false, paused: false, completed: false, chosen_toy: "train", play: null };
const give = {
  kind: "give_object", actions: [{ key: "take_teddy", object: "teddy" }, { key: "give_misha", object: "misha" }],
  layers: { misha: { x: 21, pose: 2 }, mother: { x: 55, pose: 1 }, teddy: { x: 79 } },
  layer_reactions: [{ when: { step: 1 }, layers: { mother: { pose: 2 }, teddy: { x: 56 } } }, { when: { step: 2 }, layers: { teddy: { x: 34 } } }],
};

test("the teddy moves between real independent shelf, mother and child layers", () => {
  const shelf = sceneLayers(give, state);
  const mother = sceneLayers(give, { ...state, step: 1 });
  const child = sceneLayers(give, { ...state, step: 2, ready: true });
  assert.notEqual(shelf.teddy.x, mother.teddy.x);
  assert.notEqual(mother.teddy.x, child.teddy.x);
  assert.notEqual(shelf.mother.pose, mother.mother.pose);
  assert.equal(shelf.misha.pose, 2);
});

test("give and two-step play expose only the next accessible tap action", () => {
  assert.deepEqual(availableActions(give, state).map((a) => a.key), ["take_teddy"]);
  assert.deepEqual(availableActions(give, { ...state, step: 1 }).map((a) => a.key), ["give_misha"]);
  assert.deepEqual(availableActions(give, { ...state, paused: true }), []);
  assert.equal(canContinue(give, state), false);
  assert.equal(canContinue(give, { ...state, ready: true }), true);
  assert.equal(canContinue({ kind: "watch" }, state), true);
});

test("the first toy choice changes which object moves during play", () => {
  const scene = { layers: { train: { x: 10 }, ball: { x: 72 } }, layer_reactions: [{ when: { play: "roll", step: 1 }, layers: { chosen: { x: 53 } } }] };
  const withTrain = sceneLayers(scene, { ...state, scene_index: 4, step: 1, play: "roll", chosen_toy: "train" });
  const withBall = sceneLayers(scene, { ...state, scene_index: 4, step: 1, play: "roll", chosen_toy: "ball" });
  assert.notEqual(withTrain.train.x, withBall.train.x);
  assert.notEqual(withTrain.ball.x, withBall.ball.x);
});
