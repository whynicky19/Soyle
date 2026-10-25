import assert from 'node:assert/strict';
import test from 'node:test';
import {starLabel,savedReward} from '../lib/rewards.ts';

test('stars are celebrated once per saved attempt, including retry responses',()=>{
  const seen=new Set();
  assert.equal(savedReward({awarded_stars:3,attempt_status:'completed'},'attempt-1',seen),3);
  assert.equal(savedReward({awarded_stars:3,attempt_status:'completed'},'attempt-1',seen),0);
  assert.equal(savedReward({awarded_stars:0,attempt_status:'completed'},'replayed',seen),0);
  assert.equal(savedReward({awarded_stars:1,attempt_status:'participated'},'aac-1',seen),1);
  for(const status of ['break','refused','technical_error']) assert.equal(savedReward({awarded_stars:5,attempt_status:status},status,seen),0);
  assert.equal(savedReward({awarded_stars:5,attempt_status:'completed',preview:true},'preview',seen),0);
  assert.equal(savedReward({awarded_stars:NaN,attempt_status:'completed'},'invalid',seen),0);
});
test('the star count uses Russian plurals at every decade',()=>{
  assert.deepEqual([0,1,2,5,11,14,21,24,25,111,121].map(starLabel),['звёзд','звезда','звезды','звёзд','звёзд','звёзд','звезда','звезды','звёзд','звёзд','звезда']);
});
