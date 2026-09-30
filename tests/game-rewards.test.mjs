import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_REWARD_RULES, rewardCampaignSchema, rewardLabel, rewardRulesSchema, ruleOdds, unreachableRules } from '../lib/schemas/game-rewards.ts';

const config = (rules = DEFAULT_REWARD_RULES) => ({
  gameId: 'safi-penalty', title: 'SAFI kuz', status: 'active', startsAt: '2026-10-01T09:00:00+05:00', endsAt: null, rules,
});

test('the default example is 7 → 3 SC, 8 → 5 SC, 9 → 7 days Pro, 10 → 30 days Pro — as editable data', () => {
  assert.deepEqual(DEFAULT_REWARD_RULES.map((r) => [r.score, rewardLabel(r)]), [[7, '3 SC'], [8, '5 SC'], [9, '7 kun Pro'], [10, '30 kun Pro']]);
  assert.equal(rewardCampaignSchema.safeParse(config()).success, true);
});

test('rules are validated: scores 1–10, one rule per score, Pro up to a year, quantities at least 1', () => {
  const rule = { score: 7, type: 'SUN_COIN', amount: 3, quantity: null, enabled: true };
  assert.equal(rewardRulesSchema.safeParse([rule, { ...rule, score: 11 }]).success, false);
  assert.equal(rewardRulesSchema.safeParse([rule, { ...rule }]).success, false, 'two rules for 7 goals');
  assert.equal(rewardRulesSchema.safeParse([{ ...rule, type: 'PRO_DAYS', amount: 366 }]).success, false);
  assert.equal(rewardRulesSchema.safeParse([{ ...rule, quantity: 0 }]).success, false);
  assert.equal(rewardRulesSchema.safeParse([{ ...rule, type: 'CASH' }]).success, false);
  assert.equal(rewardRulesSchema.safeParse([]).success, false);
  assert.equal(rewardCampaignSchema.safeParse({ ...config(), endsAt: '2026-09-01T09:00:00+05:00' }).success, false, 'end before start');
});

test('odds per rule follow "the best switched-on rule reached"', () => {
  // A level where each score 0…10 is equally likely (1/11) keeps the arithmetic obvious.
  const flat = Array.from({ length: 11 }, () => 1 / 11);
  const odds = ruleOdds(flat, DEFAULT_REWARD_RULES);
  assert.deepEqual([...odds.keys()], [7, 8, 9, 10]);
  for (const p of odds.values()) assert.ok(Math.abs(p - 1 / 11) < 1e-12);
  // 9 switched off: a 9/10 round takes the 8 rule, so 8 covers scores 8 and 9.
  const off = ruleOdds(flat, DEFAULT_REWARD_RULES.map((r) => (r.score === 9 ? { ...r, enabled: false } : r)));
  assert.equal(off.has(9), false);
  assert.ok(Math.abs((off.get(8) ?? 0) - 2 / 11) < 1e-12);
});

test('rules above the level’s top result are flagged for the admin', () => {
  assert.deepEqual(unreachableRules(8, DEFAULT_REWARD_RULES), [9, 10]);
  assert.deepEqual(unreachableRules(10, DEFAULT_REWARD_RULES), []);
  assert.deepEqual(unreachableRules(6, DEFAULT_REWARD_RULES.map((r) => ({ ...r, enabled: r.score < 9 }))), [7, 8]);
});
