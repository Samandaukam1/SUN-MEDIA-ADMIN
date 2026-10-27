import assert from 'node:assert/strict';
import test from 'node:test';

import { EmotionEngine, expressionOf, IDENTITY } from '../components/assistant/robot/emotion.ts';

test('a feeling fades back to the friendly baseline; at rest the expression changes nothing', () => {
  const e = new EmotionEngine(0);
  assert.deepEqual(expressionOf(e.feeling), IDENTITY);
  e.event('success', 0);
  assert.equal(e.feeling.name, 'celebrating');
  e.tick(30);
  assert.equal(e.feeling.name, 'friendly');
});

test('upset does not jump straight to joy; reconciliation does', () => {
  const e = new EmotionEngine(0);
  e.event('insult', 0);
  assert.equal(e.feeling.name, 'offended');
  e.event('dance', 1);
  assert.equal(e.feeling.name, 'calm', 'calms down first');
  e.event('insult', 2);
  e.event('reconcile', 3);
  assert.equal(e.feeling.name, 'happy');
});

test('offended is remembered for a while (fades into sulking), never forever', () => {
  const e = new EmotionEngine(0);
  e.event('insult', 0);
  e.tick(40);
  assert.equal(e.feeling.name, 'sulking');
  e.tick(400);
  assert.equal(e.feeling.name, 'friendly');
});

test('pats soothe step by step; repeated hits annoy, then offend; real work still celebrates', () => {
  const e = new EmotionEngine(0);
  e.event('hits', 0);
  assert.equal(e.feeling.name, 'annoyed');
  e.event('hits', 1);
  assert.equal(e.feeling.name, 'offended');
  e.event('pat', 2);
  e.event('pat', 3);
  e.event('pat', 4);
  assert.ok(['calm', 'happy'].includes(e.feeling.name) && e.feeling.k <= 0.6, `soothed: ${JSON.stringify(e.feeling)}`);
  e.event('success', 5);
  assert.equal(e.feeling.name, 'celebrating', 'a confirmed action is celebrated even when upset');
});

test('emotions change the body: sad flies lower and slower, angry turns sharper, sleepy closes its eyes', () => {
  const sad = expressionOf({ name: 'sad', k: 1 });
  assert.ok(sad.hover < 0 && sad.speed < 1 && sad.neon < 1);
  assert.ok(expressionOf({ name: 'angry', k: 1 }).turn > 1);
  assert.ok(expressionOf({ name: 'sleepy', k: 1 }).eye < 0.5);
  const half = expressionOf({ name: 'happy', k: 0.5 });
  assert.ok(half.smile > 1 && half.smile < 1.25);
});
