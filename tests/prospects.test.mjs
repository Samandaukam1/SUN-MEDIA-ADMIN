import assert from 'node:assert/strict';
import test from 'node:test';

import { profileFacts } from '../lib/prospects/instagram.ts';
import { cleanAnswers, QUESTIONS, readableAnswers } from '../lib/prospects/questions.ts';

const base = { following: 300, posts: 120, avgViews: null, postsLast30: 12 };

test('a healthy small profile is not flagged', () => {
  const f = profileFacts({ ...base, followers: 3000, avgLikes: 150, avgComments: 12 });
  assert.equal(f.engagementRate, 5.4);
  assert.deepEqual(f.expected, [4, 8]);
  assert.equal(f.verdict, 'healthy');
  assert.equal(f.postsPerWeek, 2.8);
});

test('many followers, almost no reactions and views → likely bought', () => {
  const f = profileFacts({ ...base, followers: 50_000, following: 60_000, avgLikes: 120, avgComments: 0, avgViews: 900 });
  assert.equal(f.engagementRate, 0.24);
  assert.equal(f.verdict, 'suspicious');
  assert.ok(f.signals.length >= 3);
});

test('a slightly low profile is mixed, with the reason named', () => {
  const f = profileFacts({ ...base, followers: 12_000, avgLikes: 200, avgComments: 10, avgViews: 1200 });
  assert.equal(f.verdict, 'mixed');
  assert.ok(f.signals.some((s) => s.includes('odatiy')));
});

test('no reaction numbers → no verdict instead of a guess', () => {
  const f = profileFacts({ ...base, followers: 8000, avgLikes: null, avgComments: null });
  assert.equal(f.verdict, null);
  assert.equal(f.engagementRate, null);
});

test('answers are cleaned to known questions and options', () => {
  const a = cleanAnswers({
    business: { options: ['food', 'retail'], custom: '' },
    goal: { options: ['sales', 'leads', 'awareness', 'followers'], custom: 'kafe zanjiri' },
    nonsense: { options: ['x'] },
    followers: { options: ['bogus'], custom: '  ' },
  });
  assert.deepEqual(a.business.options, ['food'], 'single choice keeps one');
  assert.equal(a.goal.options.length, 3, 'max 3');
  assert.equal(a.goal.custom, 'kafe zanjiri');
  assert.equal(a.nonsense, undefined);
  assert.equal(a.followers, undefined, 'unknown options and blank text are dropped');
  const lines = readableAnswers(a);
  assert.equal(lines[0].question, QUESTIONS[0].ask);
  assert.match(lines[1].answer, /Sotuvni oshirish.*O‘z so‘zlari: kafe zanjiri/);
});
