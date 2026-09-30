import assert from 'node:assert/strict';
import test from 'node:test';

import { coinCampaignSchema, coinDistributionSummary } from '../lib/schemas/sun-coin.ts';

const config = () => ({
  gameId: 'safi-penalty', title: 'SAFI test', totalPool: 20, minimumScore: 5,
  strategy: 'FIRST_ELIGIBLE', status: 'active', startsAt: '2026-10-01T09:00:00+05:00', endsAt: null,
  options: [
    { amount: 5, quantity: 2, weight: 20, minScore: 5, maxScore: 10 },
    { amount: 3, quantity: 3, weight: 30, minScore: 5, maxScore: 10 },
  ],
});

test('20 SC pool with 5 × 2 and 3 × 3 costs 19, leaving 1 unallocated', () => {
  const value = coinCampaignSchema.parse(config());
  assert.deepEqual(coinDistributionSummary(value.totalPool, value.options), {
    fixedCost: 19, poolLimited: false, maximumDistribution: 19, unallocated: 1, exceedsPool: false,
  });
});

test('pool-only quantities use a clearly marked upper bound', () => {
  const value = config();
  value.options[0].quantity = null;
  assert.equal(coinCampaignSchema.safeParse(value).success, true);
  assert.deepEqual(coinDistributionSummary(value.totalPool, value.options), {
    fixedCost: 9, poolLimited: true, maximumDistribution: 20, unallocated: null, exceedsPool: false,
  });
});

test('bounded quantities cannot over-allocate pool, even beside unlimited options', () => {
  const value = config();
  value.options[0].quantity = null;
  value.options[1].quantity = 7;
  assert.equal(coinCampaignSchema.safeParse(value).success, false);
  assert.equal(coinDistributionSummary(value.totalPool, value.options).exceedsPool, true);
});

test('score-specific weighted options remain configurable', () => {
  const value = config();
  value.strategy = 'WEIGHTED_RANDOM';
  value.options[0].minScore = 9;
  value.options[1].maxScore = 8;
  assert.equal(coinCampaignSchema.safeParse(value).success, true);
  value.options[0].maxScore = 8;
  assert.equal(coinCampaignSchema.safeParse(value).success, false);
});

test('rejects unreachable score, missing options and payout exceeding pool', () => {
  for (const mutate of [
    (value) => { value.minimumScore = 11; },
    (value) => { value.options = []; },
    (value) => { value.options[0].amount = 21; },
    (value) => { value.options[0].maxScore = 4; value.options[0].minScore = 1; },
  ]) {
    const value = config(); mutate(value);
    assert.equal(coinCampaignSchema.safeParse(value).success, false);
  }
});

test('rejects invalid quantities, fractional coins and nonpositive weights', () => {
  for (const [field, invalid] of [['quantity', 0], ['quantity', -1], ['amount', 1.5], ['weight', 0], ['amount', Number.MAX_SAFE_INTEGER]]) {
    const value = config(); value.options[0][field] = invalid;
    assert.equal(coinCampaignSchema.safeParse(value).success, false);
  }
});

test('validates dates with explicit timezone and rejects reversed date windows', () => {
  const value = config();
  value.endsAt = '2026-10-02T09:00:00+05:00';
  assert.equal(coinCampaignSchema.safeParse(value).success, true);
  value.endsAt = '2026-09-30T09:00:00+05:00';
  assert.equal(coinCampaignSchema.safeParse(value).success, false);
  value.endsAt = 'not a date';
  assert.equal(coinCampaignSchema.safeParse(value).success, false);
  value.endsAt = null; value.startsAt = '2026-10-01T09:00';
  assert.equal(coinCampaignSchema.safeParse(value).success, false);
});

test('draft creation and strategy whitelist are enforced', () => {
  const value = config(); value.status = 'draft';
  assert.equal(coinCampaignSchema.safeParse(value).success, true);
  value.status = 'ended';
  assert.equal(coinCampaignSchema.safeParse(value).success, false);
  value.status = 'active'; value.strategy = 'CLIENT_CHOSEN';
  assert.equal(coinCampaignSchema.safeParse(value).success, false);
});
