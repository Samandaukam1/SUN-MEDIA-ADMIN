import assert from 'node:assert/strict';
import test from 'node:test';

import { engagementCapSchema, engagementDefinitionSchema, engagementMetricLabel } from '../lib/schemas/game-engagement.ts';

const definition = () => ({
  gameId: 'safi-penalty', kind: 'challenge', code: 'five_goals', title: '5 gol uring', description: '',
  metric: 'ROUND_GOALS', target: 5, rewardCoins: 0, dailyRewardLimit: 0, enabled: false,
  startsAt: '2026-10-01T09:00:00+05:00', endsAt: null,
});

test('challenge and achievement configs support zero-coin progression', () => {
  const value = definition();
  assert.equal(engagementDefinitionSchema.safeParse(value).success, true);
  value.kind = 'achievement'; value.metric = 'SHOTS_TOTAL'; value.target = 100;
  assert.equal(engagementDefinitionSchema.safeParse(value).success, true);
  assert.equal(engagementMetricLabel('SHOTS_TOTAL'), 'Jami zarbalar');
});

test('positive coin rewards require a bounded positive daily award count', () => {
  const value = definition(); value.rewardCoins = 1;
  assert.equal(engagementDefinitionSchema.safeParse(value).success, false);
  value.dailyRewardLimit = 20;
  assert.equal(engagementDefinitionSchema.safeParse(value).success, true);
  value.rewardCoins = 1001;
  assert.equal(engagementDefinitionSchema.safeParse(value).success, false);
  value.rewardCoins = 1; value.dailyRewardLimit = 10001;
  assert.equal(engagementDefinitionSchema.safeParse(value).success, false);
});

test('Practice challenge cannot issue SUN Coin', () => {
  const value = definition(); value.metric = 'PRACTICE_ROUNDS'; value.target = 3;
  assert.equal(engagementDefinitionSchema.safeParse(value).success, true);
  value.rewardCoins = 1; value.dailyRewardLimit = 20;
  assert.equal(engagementDefinitionSchema.safeParse(value).success, false);
});

test('impossible per-round combo, zone and corner targets are rejected', () => {
  for (const [metric, maximum] of [['ROUND_GOALS', 10], ['GOAL_COMBO', 10], ['DISTINCT_ZONES', 15], ['ALL_CORNERS', 4]]) {
    const value = definition(); value.metric = metric; value.target = maximum;
    assert.equal(engagementDefinitionSchema.safeParse(value).success, true, metric);
    value.target = maximum + 1;
    assert.equal(engagementDefinitionSchema.safeParse(value).success, false, metric);
  }
});

test('dates require explicit timezone and an increasing campaign window', () => {
  const value = definition(); value.endsAt = '2026-10-02T09:00:00+05:00';
  assert.equal(engagementDefinitionSchema.safeParse(value).success, true);
  value.endsAt = value.startsAt;
  assert.equal(engagementDefinitionSchema.safeParse(value).success, false);
  value.endsAt = null; value.startsAt = '2026-10-01T09:00';
  assert.equal(engagementDefinitionSchema.safeParse(value).success, false);
});

test('only registered metric types and stable safe codes are accepted', () => {
  const value = definition(); value.code = 'raw code';
  assert.equal(engagementDefinitionSchema.safeParse(value).success, false);
  value.code = 'five_goals'; value.metric = 'CLIENT_REPORTED_COINS';
  assert.equal(engagementDefinitionSchema.safeParse(value).success, false);
});

test('global daily cap can switch issuance off, and rejects invalid currency quantities', () => {
  for (const cap of [0, 1, 100_000]) assert.equal(engagementCapSchema.safeParse({ gameId: 'safi-penalty', dailyCoinCap: cap }).success, true);
  for (const cap of [-1, 0.5, 100_001, Number.NaN]) assert.equal(engagementCapSchema.safeParse({ gameId: 'safi-penalty', dailyCoinCap: cap }).success, false);
});
