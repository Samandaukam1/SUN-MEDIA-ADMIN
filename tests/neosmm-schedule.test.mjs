import assert from 'node:assert/strict';
import test from 'node:test';

await import('./integration/hooks.mjs');
const { planPhase, runPool, PLAN_PHASE } = await import('../lib/neosmm/schedule.ts');
const { createProvider } = await import('../lib/neosmm/provider.ts');
const { classifyProviderError } = await import('../lib/neosmm/health.ts');
const { sendClaimed } = await import('../lib/neosmm/submit.ts');

const NOW = Date.parse('2026-11-06T13:00:00Z');
const at = (min) => new Date(NOW + min * 60_000).toISOString();
const part = (i, state, dueMin, order = `o${i}`) => ({ state, due_at: at(dueMin), order_id: order });

test('plan phase: every state from stored facts only', () => {
  const base = { status: 'active', orders: [], queue: null };
  assert.equal(planPhase({ ...base, parts: [part(0, 'planned', 60)] }, NOW), 'scheduled');
  assert.equal(planPhase({ ...base, parts: [part(0, 'dispatching', -1)] }, NOW), 'processing');
  // A drip-feed: part 1 sent and running at the provider, part 2 in 48 h.
  const drip = { ...base, parts: [part(0, 'sent', -600), part(1, 'planned', 48 * 60)], orders: [{ id: 'o0', status: 'In progress' }], queue: { order_id: 'o0' } };
  assert.equal(planPhase(drip, NOW), 'processing');
  assert.equal(planPhase({ ...drip, orders: [{ id: 'o0', status: 'Completed' }], queue: null }, NOW), 'partially_completed');
  // Due, but another order on the same service + target holds the key.
  assert.equal(planPhase({ ...base, parts: [part(0, 'planned', -5)], queue: { order_id: 'someone-else' } }, NOW), 'queued');
  assert.equal(planPhase({ ...base, status: 'paused', parts: [part(0, 'planned', 10)] }, NOW), 'paused');
  assert.equal(planPhase({ ...base, status: 'paused', parts: [part(0, 'rejected', -5)] }, NOW), 'failed');
  assert.equal(planPhase({ ...base, status: 'paused', parts: [part(0, 'unknown', -5)] }, NOW), 'failed');
  assert.equal(planPhase({ ...base, status: 'completed', parts: [] }, NOW), 'completed');
  assert.equal(planPhase({ ...base, status: 'cancelled', parts: [] }, NOW), 'cancelled');
  for (const k of ['scheduled', 'queued', 'processing', 'partially_completed', 'completed', 'paused', 'failed', 'cancelled']) assert.ok(PLAN_PHASE[k].label);
});

test('plan phase: profile B is never "queued" because of profile A', () => {
  // B's own key is free (A holds only its own key): B's due part is just about to go.
  const b = { status: 'active', parts: [part(0, 'planned', -1, 'b0')], orders: [], queue: null };
  assert.equal(planPhase(b, NOW), 'queued');
  const bScheduled = { ...b, parts: [part(0, 'planned', 30, 'b0')] };
  assert.equal(planPhase(bScheduled, NOW), 'scheduled');
});

test('pool: independent sends overlap up to the limit, results keep order', async () => {
  let open = 0;
  let peak = 0;
  const seen = [];
  const out = await runPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, async (n) => {
    open++;
    peak = Math.max(peak, open);
    await new Promise((r) => setTimeout(r, 5 + (n % 3) * 3));
    open--;
    seen.push(n);
    return n * 10;
  });
  assert.equal(peak, 4);
  assert.deepEqual(out, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.equal(seen.length, 10);
  assert.deepEqual(await runPool([], 4, async () => 1), []);
});

test('HTTP 429 on an order: certainly not taken, waits as asked — never "unknown", never resent at once', async () => {
  let calls = 0;
  const call = createProvider({
    key: 'k-secret',
    fetchImpl: async () => (calls++, new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '90' } })),
    sleep: async () => {},
  });
  const r = await call({ action: 'add', service: '1', link: 'x', quantity: '10' }, { mutation: true });
  assert.equal(calls, 1, 'one call');
  assert.equal(r.ok, false);
  assert.equal(r.accepted, 'no');
  assert.equal(r.retryAfter, 90);
  assert.equal(classifyProviderError(r.raw, r.retryAfter), 'maintenance');
  const updates = [];
  const out = await sendClaimed({ update: async (id, patch) => (updates.push(patch), true) }, call, { id: 'p1', currency: 'UZS' }, { action: 'add' });
  assert.equal(out.state, 'rejected');
  assert.equal(out.errorKind, 'maintenance');
  assert.equal(updates[0].state, 'rejected', 'the database then gives this part alone its retry time');
  const noHeader = await createProvider({ key: 'k', fetchImpl: async () => new Response('', { status: 429 }), sleep: async () => {} })({ action: 'add' }, { mutation: true });
  assert.equal(noHeader.retryAfter, 60);
});

test('a timeout on an order stays unknown (it may have arrived) — the scheduler never retries it', async () => {
  const call = createProvider({
    key: 'k',
    fetchImpl: async () => {
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    },
  });
  const updates = [];
  const out = await sendClaimed({ update: async (id, patch) => (updates.push(patch), true) }, call, { id: 'p2', currency: 'UZS' }, { action: 'add' });
  assert.equal(out.state, 'unknown');
  assert.equal(updates[0].state, 'unknown');
});
