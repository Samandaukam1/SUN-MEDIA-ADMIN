import assert from 'node:assert/strict';
import test from 'node:test';

await import('./integration/hooks.mjs');
const { decText, estimate, formatSom, parseDec } = await import('../lib/neosmm/decimal.ts');
const catalog = await import('../lib/neosmm/catalog.ts');
const { createProvider, NEOSMM_ENDPOINT } = await import('../lib/neosmm/provider.ts');
const { submitOrder, UNKNOWN_RESULT } = await import('../lib/neosmm/submit.ts');

const NB = ' ';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('provider tariffs stay exact: parsing, estimates and UZS formatting', () => {
  assert.equal(decText(parseDec('1500.00')), '1500.00');
  assert.equal(decText(parseDec('0.375')), '0.375');
  assert.equal(parseDec('12,5'), null);
  assert.equal(parseDec('abc'), null);
  // 0.1 × 3 is exactly 0.3 here (no float drift).
  assert.equal(decText(estimate(parseDec('0.1'), 3n, 1n)), '0.30');
  assert.equal(decText(estimate(parseDec('1555.20'), 1000n, 1000n)), '1555.20');
  assert.equal(decText(estimate(parseDec('1500.00'), 250n, 1000n)), '375.00');
  assert.equal(decText(estimate(parseDec('0.005'), 1n, 1n)), '0.01', 'half up at two places');
  assert.equal(formatSom('22000.00'), `22${NB}000${NB}so‘m`);
  assert.equal(formatSom('1555.2'), `1${NB}555,20${NB}so‘m`);
  assert.equal(formatSom('0.375'), `0,375${NB}so‘m`);
  assert.equal(formatSom('125000.50', 'UZS'), `125${NB}000,50${NB}so‘m`);
  assert.equal(formatSom(null), '—');
});

test('catalogue normalisation: "false" is false, raw tariffs kept, unreadable rows counted', () => {
  const { items, skipped } = catalog.normalizeServices([
    { service: 1, name: 'Instagram Followers', type: 'Default', category: 'Instagram', rate: '1500.00', min: '100', max: '100000', refill: true, cancel: 'false' },
    { service: '2', name: '<b>x</b>', type: 'Custom Comments', category: 'Instagram Comments', rate: 12.5, min: 10, max: '1000', refill: 'false', cancel: '1', dripfeed: 'true' },
    { service: 'x', rate: '1' },
    { service: 3, rate: 'free' },
  ]);
  assert.equal(items.length, 2);
  assert.equal(skipped, 2, 'rows without an id or a price are counted, not silently dropped');
  assert.equal(items[0].cancel, false);
  assert.equal(items[1].refill, false);
  assert.equal(items[1].cancel, true);
  assert.equal(items[1].dripfeed, true);
  assert.equal(items[1].rate, '12.5');
  assert.equal(items[1].name, '<b>x</b>', 'provider text stays text (React escapes it)');
  assert.equal(items[0].min, 100);
  const gifts = catalog.normalizeGifts([{ gift: 3, name: 'Ayiqcha', price: '25000.00', stars: 15 }]);
  assert.deepEqual(gifts.items[0], { id: 3, name: 'Ayiqcha', price: '25000.00', stars: 15 });
  const donat = catalog.normalizeDonat([{ product: 1, name: '60 UC', game: 'Pubg Uc', type: 'topup', price: '11489.69', currency: 'UZS', requires: ['player_id', 'server_id', 'bad field!'] }]);
  assert.deepEqual(donat.items[0].requires, ['player_id', 'server_id']);
  assert.equal(donat.items[0].price, '11489.69');
});

test('platform filter: Instagram by category first, then by name', () => {
  assert.equal(catalog.platformOf({ category: 'Instagram Likes', name: 'x' }), 'Instagram');
  assert.equal(catalog.platformOf({ category: 'Boshqa', name: 'IG followers' }), 'Instagram');
  assert.equal(catalog.platformOf({ category: 'Telegram members', name: 'Instagram-like' }), 'Telegram');
  assert.equal(catalog.platformOf({ category: 'Misc', name: 'Web traffic' }), 'Boshqa');
});

test('orders are built from the documented type; unknown types are never sent as Default', () => {
  const base = { id: 7, name: 'IG', category: 'Instagram', rate: '1500.00', min: 100, max: 1000, refill: true, cancel: false, dripfeed: false };
  const ok = catalog.planSmm({ ...base, type: 'Default' }, { link: 'https://instagram.com/p/abc', quantity: 250 });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.plan.params, { service: '7', link: 'https://instagram.com/p/abc', quantity: '250' });
  assert.match(catalog.planSmm({ ...base, type: 'Default' }, { link: 'https://instagram.com/x', quantity: 99 }).error, /kamida 100/);
  assert.match(catalog.planSmm({ ...base, type: 'Default' }, { link: 'https://instagram.com/x', quantity: 1001 }).error, /ko‘pi bilan 1/);
  assert.match(catalog.planSmm({ ...base, type: 'Default' }, { link: 'https://instagram.com/x', quantity: 2.5 }).error, /butun son/);
  assert.match(catalog.planSmm({ ...base, type: 'Default' }, { link: 'https://t.me/x', quantity: 200 }).error, /Instagram havolasini/);
  assert.match(catalog.planSmm({ ...base, type: 'Package' }, { link: 'https://instagram.com/x', quantity: 200 }).error, /hujjatida yo‘q/);
  assert.match(catalog.planSmm({ ...base, type: 'Subscriptions' }, { link: 'https://instagram.com/x' }).error, /Obuna/);
  const comments = catalog.planSmm({ ...base, type: 'Custom Comments', min: 2, max: 10 }, { link: 'https://instagram.com/p/a', comments: 'Zo‘r!\n\n  Ajoyib  \nRahmat' });
  assert.equal(comments.plan.quantity, 3);
  assert.equal(comments.plan.params.comments, 'Zo‘r!\nAjoyib\nRahmat');
  assert.equal(comments.plan.params.quantity, undefined, 'custom comments send the list, not a quantity');
  const poll = catalog.planSmm({ ...base, type: 'Poll' }, { link: 'https://instagram.com/p/a', quantity: 100, answerNumber: 2 });
  assert.equal(poll.plan.params.answer_number, '2');
  const tag = catalog.planSmm({ ...base, type: 'Hashtag Mentions' }, { link: 'https://instagram.com/p/a', quantity: 100, hashtag: 'sunmedia' });
  assert.equal(tag.plan.params.hashtag, '#sunmedia');
  assert.match(catalog.planSmm({ ...base, type: 'Default' }, { link: 'https://instagram.com/x', quantity: 100, runs: 3, interval: 10 }).error, /drip-feed yo‘q/);
  const drip = catalog.planSmm({ ...base, type: 'Default', dripfeed: true }, { link: 'https://instagram.com/x', quantity: 100, runs: 3, interval: 10 });
  assert.equal(drip.plan.billed, 300);
});

test('SMM cost needs a confirmed quantity basis; fixed prices compare exactly', () => {
  const s = { id: 1, name: 'x', type: 'Default', category: 'Instagram', rate: '1500.00', min: 1, max: 10, refill: false, cancel: false, dripfeed: false };
  assert.equal(catalog.smmEstimate(s, 250, null), null, 'no verified basis — no total');
  assert.equal(catalog.smmEstimate(s, 250, 1000), '375.00');
  assert.equal(catalog.samePrice('1500.00', '1500'), true);
  assert.equal(catalog.samePrice('1500.00', '1500.01'), false);
  assert.equal(catalog.enoughBalance('374.99', '375.00'), false);
  assert.equal(catalog.enoughBalance('375', '375.00'), true);
  assert.equal(catalog.enoughBalance(null, '1'), null);
});

test('provider errors in Uzbek; statuses translated, only Completed is “Bajarildi”', () => {
  assert.match(catalog.translateError('Invalid API key'), /kaliti noto‘g‘ri/);
  assert.match(catalog.translateError('Insufficient balance'), /yetarli emas/);
  assert.match(catalog.translateError('Order failed, balance refunded'), /mablag‘ qaytarildi/);
  assert.match(catalog.translateError('Min quantity is 100'), /kamida 100/);
  assert.match(catalog.translateError('API access is disabled for this account'), /o‘chirilgan/);
  assert.match(catalog.translateError('anything', 300), /5 daqiqadan/);
  assert.equal(catalog.statusLabel('Completed').label, 'Bajarildi');
  assert.equal(catalog.statusLabel('In progress').label, 'Bajarilmoqda');
  assert.equal(catalog.statusLabel('Partial').label, 'Qisman bajarildi');
  assert.equal(catalog.statusLabel('Something new').label, 'Something new');
  assert.equal(catalog.isFinal('Pending'), false);
  assert.equal(catalog.isFinal('failed'), true);
  assert.equal(catalog.checkTelegramUsername('@sun_media'), null);
  assert.notEqual(catalog.checkTelegramUsername('ab'), null);
});

test('transport: fixed endpoint, key only in the POST body, error inside HTTP 200, retry_after', async () => {
  const seen = [];
  const call = createProvider({
    key: 'SECRET-KEY',
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return json({ error: 'Texnik ishlar', retry_after: 300 });
    },
  });
  const r = await call({ action: 'add', service: '1' }, { mutation: true });
  assert.equal(seen[0].url, NEOSMM_ENDPOINT);
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(new URLSearchParams(seen[0].init.body).get('key'), 'SECRET-KEY');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unavailable');
  assert.equal(r.retryAfter, 300);
  assert.equal(r.accepted, 'no');
  assert.ok(!JSON.stringify(r).includes('SECRET-KEY'), 'the key never comes back in a result');
  const missing = await createProvider({ key: '' })({ action: 'balance' });
  assert.equal(missing.reason, 'config');
});

test('transport: reads retry a little; a mutation is never resent and an unclear one is “unknown”', async () => {
  let reads = 0;
  const flaky = createProvider({
    key: 'k',
    sleep: async () => {},
    fetchImpl: async () => {
      reads++;
      if (reads < 3) throw new TypeError('fetch failed');
      return json({ balance: '10.00', currency: 'UZS' });
    },
  });
  assert.equal((await flaky({ action: 'balance' })).ok, true);
  assert.equal(reads, 3);

  let writes = 0;
  const timeout = createProvider({
    key: 'k',
    fetchImpl: async () => {
      writes++;
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    },
  });
  const r = await timeout({ action: 'add' }, { mutation: true });
  assert.equal(writes, 1, 'one attempt only');
  assert.equal(r.accepted, 'unknown');
  const gateway = await createProvider({ key: 'k', fetchImpl: async () => new Response('<html>502</html>', { status: 502 }) })({ action: 'add' }, { mutation: true });
  assert.equal(gateway.accepted, 'unknown', 'a 502 page after sending may hide an accepted order');
  const refused = await createProvider({
    key: 'k',
    fetchImpl: async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    },
  })({ action: 'add' }, { mutation: true });
  assert.equal(refused.accepted, 'no', 'a connection never made cannot have placed an order');
});

function fakeStore() {
  const rows = new Map();
  let failUpdates = 0;
  return {
    rows,
    failNext(n) {
      failUpdates = n;
    },
    async claim(row) {
      if (rows.has(row.id)) return { claimed: false, state: rows.get(row.id).state, providerOrderId: rows.get(row.id).provider_order_id ?? null };
      rows.set(row.id, { ...row, state: 'submitting' });
      return { claimed: true };
    },
    async update(id, patch) {
      if (failUpdates > 0) {
        failUpdates--;
        return false;
      }
      rows.set(id, { ...rows.get(id), ...patch });
      return true;
    },
  };
}
const newRow = (id = '00000000-0000-4000-8000-000000000001') => ({
  id,
  owner_id: 'owner',
  kind: 'smm',
  item_id: 1,
  item_name: 'x',
  item_category: null,
  item_type: 'Default',
  price: '1500.00',
  price_unit: 1000,
  currency: 'UZS',
  target: 'https://instagram.com/x',
  params: {},
  quantity: 100,
  estimate: '150.00',
  can_cancel: false,
  can_refill: false,
});

test('submission: one token reaches the provider once — double clicks and two tabs included', async () => {
  const store = fakeStore();
  let calls = 0;
  const call = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    return { ok: true, data: { order: 12345 } };
  };
  const row = newRow();
  const [a, b] = await Promise.all([submitOrder(store, call, row, { action: 'add' }), submitOrder(store, call, row, { action: 'add' })]);
  assert.equal(calls, 1);
  assert.deepEqual([a.state, b.state].sort(), ['accepted', 'duplicate']);
  assert.equal(store.rows.get(row.id).provider_order_id, 12345);
  const again = await submitOrder(store, call, row, { action: 'add' });
  assert.equal(again.state, 'duplicate');
  assert.equal(again.providerOrderId, 12345);
  assert.equal(calls, 1, 'a retry with the same token is not sent');
});

test('submission: an unclear answer is recorded as unknown and not resent; a rejection is final', async () => {
  const store = fakeStore();
  let calls = 0;
  const unclear = async () => {
    calls++;
    return { ok: false, reason: 'timeout', message: 'vaqt tugadi', accepted: 'unknown' };
  };
  const r = await submitOrder(store, unclear, newRow('00000000-0000-4000-8000-000000000002'), {});
  assert.equal(r.state, 'unknown');
  assert.equal(r.message, UNKNOWN_RESULT);
  assert.equal(calls, 1);
  assert.equal(store.rows.get('00000000-0000-4000-8000-000000000002').state, 'unknown');

  const rejected = await submitOrder(store, async () => ({ ok: false, reason: 'provider', message: 'Balansda mablag‘ yetarli emas.', accepted: 'no' }), newRow('00000000-0000-4000-8000-000000000003'), {});
  assert.equal(rejected.state, 'rejected');
  assert.equal(store.rows.get('00000000-0000-4000-8000-000000000003').state, 'rejected');

  const noNumber = await submitOrder(store, async () => ({ ok: true, data: { status: 'ok' } }), newRow('00000000-0000-4000-8000-000000000004'), {});
  assert.equal(noNumber.state, 'unknown', 'success without an order number is not success');
});

test('submission: accepted by the provider but not saved — the number is still returned, nothing resent', async () => {
  const store = fakeStore();
  store.failNext(2);
  let calls = 0;
  const r = await submitOrder(
    store,
    async () => {
      calls++;
      return { ok: true, data: { order: 2913, charge: '11489.69', currency: 'UZS' } };
    },
    newRow('00000000-0000-4000-8000-000000000005'),
    {},
  );
  assert.equal(r.state, 'accepted');
  assert.equal(r.saved, false);
  assert.equal(r.providerOrderId, 2913);
  assert.equal(calls, 1);
  assert.equal(store.rows.get('00000000-0000-4000-8000-000000000005').state, 'submitting', 'left as unclear for reconciliation');
});

test('owners are explicit account ids only: a list is read, anything else is ignored (locks, never opens)', async () => {
  const { parseOwnerIds } = await import('../lib/neosmm/owners.ts');
  const a = 'ddbdd22b-ebd8-45b3-bdaa-cd75cd7d879e';
  const b = '08886B6B-0BFE-40EC-9E1C-7732827646A2';
  assert.deepEqual(parseOwnerIds(`${a}, ${b}`), [a, b.toLowerCase()]);
  assert.deepEqual(parseOwnerIds(`${a}\n${a};${b}`), [a, b.toLowerCase()], 'duplicates and separators');
  assert.deepEqual(parseOwnerIds('system_owner, admin, *, '), [], 'roles or wildcards never count');
  assert.deepEqual(parseOwnerIds(`${a.slice(0, -1)}`), [], 'a typo locks the module');
  assert.deepEqual(parseOwnerIds(undefined), []);
});
