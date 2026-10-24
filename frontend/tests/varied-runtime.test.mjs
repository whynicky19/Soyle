import assert from 'node:assert/strict';
import test from 'node:test';
import {createVariedRounds, orderMatches, pairMatches} from '../lib/variedRuntime.ts';

const picture = key => ({key, label:key, media_ref:`/${key}.webp`});
test('a short sort series balances all groups and never repeats an object', () => {
  const categories = ['food', 'toys', 'clothing'].map(picture);
  const sort_items = categories.flatMap(group => Array.from({length:8}, (_, index) => ({...picture(`${group.key}-${index}`), category_key:group.key})));
  const rounds = createVariedRounds('category_sort', {categories, sort_items}, () => .4);
  assert.equal(new Set(rounds.map(round => round.key)).size, 24);
  for (const group of categories) assert.equal(rounds.slice(0, 12).filter(round => round.category_key === group.key).length, 4);
  assert.equal(sort_items.length, 24);
});
test('sequence starts with two actions, then offers three-action stories without repeats', () => {
  const tasks = [3,2,3,2].map((size,index) => ({key:`story-${index}`, instruction:'История', cards:['eat','wash','read'].map(picture), correct_order:['eat','wash','read'].slice(0,size)}));
  const result = createVariedRounds('action_sequence', {tasks}, () => .8);
  assert.deepEqual(result.map(task => task.correct_order.length), [2,2,3,3]);
  assert.equal(new Set(result.map(task => task.key)).size, 4);
  assert.equal(orderMatches(['eat','wash'], ['wash','eat']), false);
  assert.equal(orderMatches(['wash'], ['wash','eat']), false);
  assert.equal(orderMatches(['wash','eat'], ['wash','eat']), true);
});
test('matching evaluates a complete object and action pair, not either key alone', () => {
  const pairs = [{object_key:'spoon', target_key:'eat'}, {object_key:'cup', target_key:'drink'}];
  assert.equal(pairMatches({object_key:'spoon', target_key:'drink'}, pairs), false);
  assert.equal(pairMatches({object_key:'spoon', target_key:'eat'}, pairs), true);
});
