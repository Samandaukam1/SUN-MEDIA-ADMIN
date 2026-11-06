import assert from 'node:assert/strict';
import test from 'node:test';

await import('./integration/hooks.mjs');
const { splitQuantity, sendingTimes, projectSending, MAX_PARTS } = await import('../lib/neosmm/split.ts');
const { parseTarget, queueKey } = await import('../lib/neosmm/targets.ts');
const { classifyProviderError, healthOf, inFilter } = await import('../lib/neosmm/health.ts');
const { refillClock, readPolicy, policyFrom, formatRemaining } = await import('../lib/neosmm/refill.ts');
const { profileStats, periodContext, followerSeries } = await import('../lib/neosmm/profiles.ts');
const { sendClaimed, submitOrder, UNKNOWN_RESULT } = await import('../lib/neosmm/submit.ts');
const { translateError } = await import('../lib/neosmm/catalog.ts');

const sum = (a) => a.reduce((x, y) => x + y, 0);

test('exact splits: the agreed examples', () => {
  assert.deepEqual(splitQuantity({ total: 300, min: 100, max: 1000, preferred: 100 }), { ok: true, parts: [100, 100, 100] });
  assert.deepEqual(splitQuantity({ total: 250, min: 100, max: 1000, preferred: 100 }), { ok: true, parts: [100, 150] });
  assert.deepEqual(splitQuantity({ total: 250, min: 100, max: 1000, preferred: 100, even: true }), { ok: true, parts: [125, 125] });
  assert.deepEqual(splitQuantity({ total: 310, min: 100, max: 1000, preferred: 100 }), { ok: true, parts: [100, 100, 110] });
  const low = splitQuantity({ total: 99, min: 100, max: 1000, preferred: 100 });
  assert.equal(low.ok, false);
  assert.match(low.error, /avtomatik oshirilmaydi/);
  const fixed = splitQuantity({ total: 250, min: 100, max: 100 });
  assert.equal(fixed.ok, false);
  assert.deepEqual(fixed.nearest, [200, 300]);
});

test('every split is within min/max and adds up exactly (exhaustive small range)', () => {
  for (const [min, max] of [[10, 10], [10, 15], [100, 250], [1, 7], [50, 1000]])
    for (let total = 1; total <= 600; total++)
      for (const preferred of [null, min, max, Math.ceil((min + max) / 2), 3 * max])
        for (const even of [false, true]) {
          const r = splitQuantity({ total, min, max, preferred, even });
          const feasible = (() => {
            for (let n = 1; n <= MAX_PARTS; n++) if (n * min <= total && total <= n * max) return true;
            return false;
          })();
          if (!r.ok) {
            assert.equal(feasible, false, `${total} ${min}-${max} should split`);
            continue;
          }
          assert.equal(sum(r.parts), total);
          assert.ok(r.parts.every((q) => Number.isInteger(q) && q >= min && q <= max), `${total} ${min}-${max} ${r.parts}`);
          assert.ok(r.parts.length <= MAX_PARTS);
        }
});

test('oversized plans are explained, not generated', () => {
  const r = splitQuantity({ total: 1_000_000, min: 10, max: 1000 });
  assert.equal(r.ok, false);
  assert.match(r.error, /kamida 1\s000 ta buyurtma/);
  const capped = splitQuantity({ total: 10_000, min: 10, max: 1000, preferred: 10 });
  assert.equal(capped.ok, true);
  assert.equal(capped.parts.length, MAX_PARTS, 'preferred size yields to the part limit');
  assert.equal(sum(capped.parts), 10_000);
});

test('sending times: 3 parts over 48 hours → now, +24h, +48h', () => {
  const t0 = Date.UTC(2026, 10, 7, 9);
  const { spacingSeconds, times } = sendingTimes(t0, 48 * 3600, 3);
  assert.equal(spacingSeconds, 86_400);
  assert.deepEqual(times, [t0, t0 + 86_400_000, t0 + 2 * 86_400_000]);
  assert.deepEqual(sendingTimes(t0, 48 * 3600, 1).times, [t0]);
});

test('revised estimate after delays: no burst, spacing kept from actual progress', () => {
  const now = Date.UTC(2026, 10, 9, 12);
  const H = 3_600_000;
  const parts = [
    { state: 'sent', due_at: new Date(now - 30 * H).toISOString(), dispatched_at: new Date(now - 2 * H).toISOString() },
    { state: 'planned', due_at: new Date(now - 6 * H).toISOString() },
    { state: 'planned', due_at: new Date(now - 1 * H).toISOString() },
  ];
  const [a, b, c] = projectSending(parts, 24 * 3600, now);
  assert.equal(a, null);
  assert.equal(b, now - 2 * H + 24 * H);
  assert.equal(c, b + 24 * H);
});

test('targets: Instagram profile URLs and handles are one key; posts are never usernames', () => {
  const a = parseTarget('https://www.instagram.com/SunMediaUz/', 'Instagram');
  const b = parseTarget('@sunmediauz', 'Instagram');
  const c = parseTarget('https://instagram.com/sunmediauz?igsh=abc', 'Instagram');
  const d = parseTarget('https://m.instagram.com/sunmediauz/reels/', 'Instagram');
  for (const x of [a, b, c, d]) {
    assert.equal(x.kind, 'profile');
    assert.equal(x.key, 'ig:u:sunmediauz');
  }
  const post = parseTarget('https://www.instagram.com/p/DAbc123xyz/?img_index=1', 'Instagram');
  assert.equal(post.kind, 'post');
  assert.equal(post.username, null);
  assert.equal(post.key, 'ig:p:DAbc123xyz');
  const reel = parseTarget('https://www.instagram.com/sunmediauz/reel/DAbc123xyz/', 'Instagram');
  assert.equal(reel.kind, 'post', 'a /<user>/reel/<code> link is a post');
  assert.equal(reel.username, null, 'its profile is not guessed from the URL');
  assert.equal(parseTarget('https://www.instagram.com/explore/tags/x', 'Instagram').kind, 'link');
  assert.equal(parseTarget('https://www.instagram.com/stories/sunmediauz/123/', 'Instagram').kind, 'link');
  assert.equal(queueKey(1427, a), 'neosmm:1427:ig:u:sunmediauz');
  assert.notEqual(queueKey(1427, a), queueKey(949, a), 'other service, other queue');
  const yt = parseTarget('https://www.youtube.com/watch?v=abc#t=1', 'YouTube');
  assert.equal(yt.key, 'https://youtube.com/watch?v=abc');
  assert.equal(parseTarget('not a link!', 'Instagram'), null);
});

test('error classes: only service-id refusals are about the service', () => {
  assert.equal(classifyProviderError('Provider error: Incorrect service ID'), 'service');
  assert.equal(classifyProviderError('Invalid service ID'), 'service');
  assert.equal(classifyProviderError('Invalid API key'), 'account');
  assert.equal(classifyProviderError('API access is disabled'), 'account');
  assert.equal(classifyProviderError('Not enough funds on balance'), 'balance');
  assert.equal(classifyProviderError('Minimum quantity is 100'), 'input');
  assert.equal(classifyProviderError('Incorrect link'), 'input');
  assert.equal(classifyProviderError('You have active order with this link. Please wait until order being completed.'), 'active_order');
  assert.equal(classifyProviderError('Technical works', 300), 'maintenance');
  assert.equal(classifyProviderError('Too many requests'), 'maintenance');
  assert.equal(classifyProviderError('Something odd'), 'other');
  assert.match(translateError('You have active order with this link. Please wait until order being completed.'), /tugamagan buyurtma bor/);
});

const H0 = {
  service_id: 1, service_name: 'S', service_category: 'C', last_accepted_at: null, last_accepted_order: null, last_completed_at: null, last_completed_order: null,
  blocked_at: null, blocked_reason: null, missing_since: null, last_seen_at: null, disabled_at: null, cleared_at: null, refill_days: null, refill_starts: null, refill_basis: null, refill_verified_at: null,
};

test('health from evidence; problems take no orders; clearing returns to Tekshirilmagan', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');
  assert.equal(healthOf(undefined, now).state, 'untested');
  assert.equal(healthOf({ ...H0, last_accepted_at: '2026-11-07T08:00:00Z' }, now).state, 'accepted');
  assert.equal(healthOf({ ...H0, last_completed_at: '2026-11-06T08:00:00Z' }, now).state, 'completed');
  assert.equal(healthOf({ ...H0, last_completed_at: '2026-09-01T08:00:00Z' }, now).state, 'untested', 'old evidence is not "recent"');
  const blocked = healthOf({ ...H0, blocked_at: '2026-11-06T07:09:00Z', blocked_reason: 'Provider error: Incorrect service ID', last_seen_at: '2026-11-07T11:00:00Z' }, now);
  assert.equal(blocked.state, 'blocked');
  assert.equal(blocked.orderable, false, 'listed in the catalogue, still blocked');
  assert.equal(healthOf({ ...H0, missing_since: '2026-11-07T00:00:00Z' }, now).orderable, false);
  assert.equal(healthOf({ ...H0, disabled_at: '2026-11-07T00:00:00Z', blocked_at: '2026-11-07T00:00:00Z' }, now).state, 'disabled');
  const cleared = healthOf({ ...H0, last_completed_at: '2026-11-05T00:00:00Z', cleared_at: '2026-11-07T10:00:00Z' }, now);
  assert.equal(cleared.state, 'untested', 'evidence before the clearing does not count');
  assert.ok(inFilter('blocked', 'problem') && inFilter('removed', 'problem') && inFilter('disabled', 'problem'));
  assert.ok(!inFilter('accepted', 'problem') && inFilter('completed', 'recent') && inFilter('untested', 'untested'));
});

test('refill clocks: verified per order, unknown otherwise, never negative', () => {
  const DAY = 86_400_000;
  const accepted = '2026-11-01T10:00:00Z';
  const completed = '2026-11-02T10:00:00Z';
  assert.equal(refillClock(null, accepted, completed, Date.now()).label, 'Muddat tasdiqlanmagan');
  assert.equal(refillClock({ api: true, verified: false }, accepted, completed, Date.now()).kind, 'unverified', 'API refill flag is not a guarantee term');
  const p = { api: true, verified: true, days: 30, starts: 'completed', basis: 'NeoSMM bot tavsifi', verified_at: '2026-11-07T00:00:00Z' };
  assert.equal(refillClock(p, accepted, null, Date.now()).kind, 'waiting', 'starts at completion: not from submission');
  const running = refillClock(p, accepted, completed, Date.parse(completed) + 10 * DAY);
  assert.equal(running.kind, 'running');
  assert.equal(running.remainingMs, 20 * DAY);
  assert.equal(running.expiresAt, Date.parse(completed) + 30 * DAY);
  const ended = refillClock(p, accepted, completed, Date.parse(completed) + 31 * DAY);
  assert.equal(ended.kind, 'expired');
  assert.equal(ended.label, 'Muddat tugadi');
  const fromAccept = refillClock({ ...p, starts: 'accepted' }, accepted, null, Date.parse(accepted) + DAY);
  assert.equal(fromAccept.expiresAt, Date.parse(accepted) + 30 * DAY);
  assert.equal(readPolicy({ verified: true, days: 0, starts: 'completed' }).verified, false, 'incomplete terms are not verified');
  assert.equal(policyFrom(true, null).verified, false);
  assert.equal(formatRemaining(DAY + 3661_000), '1 kun 01:01:01');
  assert.equal(formatRemaining(-5), '00:00:00');
});

const obs = (at, followers, extra = {}) => ({ id: at, observed_at: at, followers, following: null, media_count: null, display_name: null, source: 'manual', origin: 'm', note: null, ...extra });

test('profile statistics: measured only; zero is a value, missing is not; net change between real observations', () => {
  const list = [obs('2026-11-05T07:00:00Z', 1300), obs('2026-11-06T07:00:00Z', null, { display_name: 'Sun' }), obs('2026-11-06T15:00:00Z', 1260), obs('2026-11-04T07:00:00Z', 0)];
  assert.equal(followerSeries(list).length, 3, 'name-only observation is not a count');
  const s = profileStats(list);
  assert.equal(s.first.followers, 0, 'a genuine zero');
  assert.equal(s.latest.followers, 1260);
  assert.equal(s.overall, 1260);
  assert.deepEqual(s.lastDay, { day: '2026-11-06', previousDay: '2026-11-05', change: -40 });
  assert.equal(profileStats([]).latest, null);
  assert.equal(profileStats([obs('2026-11-05T07:00:00Z', 10)]).overall, null);
});

test('order-period context reuses the shared observations', () => {
  const list = [obs('2026-11-05T07:00:00Z', 1300), obs('2026-11-06T07:00:00Z', 1350), obs('2026-11-07T07:00:00Z', 1340)];
  const a = periodContext(list, '2026-11-05T10:00:00Z', '2026-11-06T06:00:00Z');
  assert.equal(a.before.followers, 1300);
  assert.equal(a.after.followers, 1350);
  assert.equal(a.change, 50);
  const running = periodContext(list, '2026-11-05T10:00:00Z', null);
  assert.equal(running.after.followers, 1340, 'still running: the latest observation');
  assert.equal(periodContext([], '2026-11-05T10:00:00Z', null).change, null);
});

test('a refused send keeps the raw provider words and the error class', async () => {
  const updates = [];
  const store = { update: async (id, patch) => (updates.push(patch), true) };
  const call = async () => ({ ok: false, reason: 'provider', message: 'translated', raw: 'Provider error: Incorrect service ID', accepted: 'no' });
  const r = await sendClaimed(store, call, { id: 'x', currency: 'UZS' }, { action: 'add' });
  assert.equal(r.state, 'rejected');
  assert.equal(r.errorKind, 'service');
  assert.equal(updates[0].provider_error, 'Provider error: Incorrect service ID');
  assert.equal(updates[0].error_kind, 'service');
  const net = await sendClaimed(store, async () => ({ ok: false, reason: 'network', message: 'x', accepted: 'no' }), { id: 'y', currency: 'UZS' }, {});
  assert.equal(net.errorKind, 'network', 'a connection never made is not about the service');
  const unclear = await sendClaimed(store, async () => ({ ok: false, reason: 'timeout', message: 'x', accepted: 'unknown' }), { id: 'z', currency: 'UZS' }, {});
  assert.equal(unclear.state, 'unknown');
  assert.match(updates.at(-1).error, new RegExp(UNKNOWN_RESULT));
});

test('a duplicate click never calls the provider', async () => {
  let calls = 0;
  const store = { claim: async () => ({ claimed: false, state: 'accepted', providerOrderId: 5 }), update: async () => true };
  const r = await submitOrder(store, async () => (calls++, { ok: true, data: { order: 1 } }), { id: 'a', currency: 'UZS' }, {});
  assert.equal(r.state, 'duplicate');
  assert.equal(calls, 0);
});
