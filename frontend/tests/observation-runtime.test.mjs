import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {observationRounds, descriptionQuestion} from '../lib/observationRuntime.ts';
const scenes = JSON.parse(readFileSync(new URL('../../backend/app/observation_scenes.json', import.meta.url)));

test('picture series cover six themes without repeats or adjacent repeated actors/actions', () => {
  for (let seed = 1; seed <= 100; seed++) {
    let state = seed;
    const rounds = observationRounds(scenes, () => ((state = state * 16807 % 2147483647) - 1) / 2147483646);
    assert.equal(new Set(rounds.map(item => item.key)).size, 24);
    assert.equal(new Set(rounds.slice(0,12).map(item => item.theme)).size, 6);
    for (let i = 1; i < 24; i++) {
      assert.notEqual(rounds[i].theme, rounds[i-1].theme);
      assert.notEqual(rounds[i].parts[0], rounds[i-1].parts[0]);
      assert.notEqual(rounds[i].parts[1], rounds[i-1].parts[1]);
    }
  }
});
test('each phrase grows grammatically by actor, action and its own detail question', () => {
  for (const scene of scenes) {
    assert.equal(descriptionQuestion(scene, 0), 'Кто на картинке?');
    assert.equal(descriptionQuestion(scene, 1), 'Что делает?');
    assert.equal(descriptionQuestion(scene, 2), scene.detail_question);
    assert.equal(new Set(scene.options.flat()).size, 9);
  }
});
