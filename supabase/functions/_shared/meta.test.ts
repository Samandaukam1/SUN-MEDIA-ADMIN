import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  agencyDate,
  agencyDay,
  allowedReturn,
  graphClient,
  GraphError,
  insightTotals,
  mediaRow,
  parseLeadgenEvents,
  signState,
  snapshotFromInsights,
  verifyState,
  verifyWebhookSignature,
} from './meta.ts';

const SECRET = 'app-secret-for-tests';

test('webhook signature: only Meta (the app secret holder) is accepted', async () => {
  const body = '{"object":"page","entry":[]}';
  const good = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
  assert.equal(await verifyWebhookSignature(SECRET, body, good), true);
  assert.equal(await verifyWebhookSignature(SECRET, body + ' ', good), false, 'tampered body');
  assert.equal(await verifyWebhookSignature('other', body, good), false, 'other secret');
  assert.equal(await verifyWebhookSignature(SECRET, body, null), false, 'missing header');
  assert.equal(await verifyWebhookSignature('', body, good), false, 'unconfigured secret never passes');
});

test('OAuth state is signed and expires', async () => {
  const state = { uid: 'u1', client_id: 'c1', return_to: 'https://admin.sunmedia.uz/clients/c1', exp: Date.now() + 60_000, nonce: 'n' };
  const token = await signState(state, SECRET);
  assert.deepEqual(await verifyState(token, SECRET), state);
  assert.equal(await verifyState(token, 'wrong'), null, 'foreign signature');
  const [body] = token.split('.');
  assert.equal(await verifyState(`${body}.AAAA`, SECRET), null, 'forged signature');
  const expired = await signState({ ...state, exp: Date.now() - 1 }, SECRET);
  assert.equal(await verifyState(expired, SECRET), null, 'expired state');
});

test('return URLs are limited to known admin origins', () => {
  const origins = ['https://admin.sunmedia.uz', 'http://localhost:3000'];
  assert.equal(allowedReturn('https://admin.sunmedia.uz/clients/1?tab=integrations', origins), 'https://admin.sunmedia.uz/clients/1?tab=integrations');
  assert.equal(allowedReturn('https://evil.example/steal', origins), null);
  assert.equal(allowedReturn('https://admin.sunmedia.uz.evil.example/', origins), null);
  assert.equal(allowedReturn('not a url', origins), null);
});

test('leadgen webhook events are parsed; malformed entries are skipped', () => {
  const events = parseLeadgenEvents({
    object: 'page',
    entry: [
      {
        id: '501',
        changes: [
          { field: 'leadgen', value: { leadgen_id: '3001', page_id: '501', form_id: '701', ad_id: '9', adgroup_id: '8', created_time: 1759137300 } },
          { field: 'feed', value: { post_id: '1' } },
          { field: 'leadgen', value: { leadgen_id: 'drop table', page_id: '501' } },
        ],
      },
    ],
  });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { leadgen_id: '3001', page_id: '501', form_id: '701', ad_id: '9', adgroup_id: '8', created_time: '2025-09-29T09:15:00.000Z' });
  assert.deepEqual(parseLeadgenEvents({ object: 'instagram', entry: [] }), []);
  assert.deepEqual(parseLeadgenEvents(null), []);
});

test('agency days are Tashkent calendar days', () => {
  const { since, until } = agencyDay('2026-09-29');
  assert.equal(new Date(since * 1000).toISOString(), '2026-09-28T19:00:00.000Z');
  assert.equal(until - since, 86_400);
  // 20:30 UTC on the 28th is already the 29th in Tashkent; "yesterday" is the 28th.
  const now = new Date('2026-09-28T20:30:00Z');
  assert.equal(agencyDate(now), '2026-09-29');
  assert.equal(agencyDate(now, 1), '2026-09-28');
});

test('insights keep only numbers Meta returned', () => {
  const totals = insightTotals({
    data: [
      { name: 'views', total_value: { value: 1200 } },
      { name: 'reach', total_value: { value: 800 } },
      { name: 'total_interactions', total_value: { value: 95 } },
      { name: 'saves', total_value: {} },
      { name: 'follower_count', values: [{ value: 3 }, { value: 5 }] },
    ],
  });
  assert.deepEqual(totals, { views: 1200, reach: 800, total_interactions: 95, follower_count: 5 });
  assert.deepEqual(snapshotFromInsights(totals), { views: 1200, reach: 800, interactions: 95 });
  assert.deepEqual(insightTotals({ error: { message: 'x' } }), {});
});

test('media rows take insights first and fall back to public counts', () => {
  const row = mediaRow(
    { id: '9001', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://instagram.com/reel/x', thumbnail_url: 'https://cdn/x.jpg', like_count: 10, comments_count: 2, timestamp: '2026-09-01T10:00:00+0000' },
    { views: 50000, reach: 30000, likes: 12, saved: 40, shares: 7 },
  );
  assert.equal(row.views, 50000);
  assert.equal(row.likes, 12);
  assert.equal(row.comments, 2);
  assert.equal(row.saves, 40);
  assert.equal(row.interactions, null);
});

test('graph client signs calls with appsecret_proof and surfaces reconnect errors', async () => {
  const calls: string[] = [];
  const fakeFetch = (async (input: URL | string) => {
    calls.push(String(input));
    if (String(input).includes('/expired')) {
      return new Response(JSON.stringify({ error: { message: 'Session has expired', code: 190 } }), { status: 400 });
    }
    return new Response(JSON.stringify({ id: '1' }), { status: 200 });
  }) as typeof fetch;
  const graph = graphClient({ appSecret: SECRET, fetch: fakeFetch });
  await graph('me', { fields: 'id' }, { token: 'tok' });
  const url = new URL(calls[0]);
  assert.equal(url.pathname, '/v23.0/me');
  assert.equal(url.searchParams.get('appsecret_proof'), createHmac('sha256', SECRET).update('tok').digest('hex'));
  await assert.rejects(graph('expired', {}, { token: 'tok' }), (e: unknown) => e instanceof GraphError && e.needsReconnect);
});
