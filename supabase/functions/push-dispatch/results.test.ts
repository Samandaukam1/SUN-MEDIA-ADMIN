import assert from 'node:assert/strict';
import test from 'node:test';

import { chunk, toExpoMessages, toResults, type Claimed } from './results.ts';

const batch: Claimed[] = [
  { delivery_id: 1, token: 'ExponentPushToken[a]', title: 'Yangi vazifa', body: 'Montaj', data: { route: '/task/1' }, priority: 'high', badge: 3 },
  { delivery_id: 2, token: 'ExponentPushToken[b]', title: 'Chat', body: null, data: null, priority: 'low', badge: null },
];

test('expo messages carry deep-link data, badge and priority', () => {
  const [high, low] = toExpoMessages(batch);
  assert.equal(high.priority, 'high');
  assert.equal(high.sound, 'default');
  assert.equal(high.badge, 3);
  assert.deepEqual(high.data, { route: '/task/1' });
  assert.equal(low.sound, null);
  assert.equal(low.body, undefined);
  assert.deepEqual(low.data, {});
});

test('tickets map to sent / failed and flag dead devices', () => {
  const results = toResults(batch, [
    { status: 'ok', id: 'ticket-1' },
    { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
  ]);
  assert.deepEqual(results[0], { delivery_id: 1, status: 'sent', ticket_id: 'ticket-1' });
  assert.equal(results[1].status, 'failed');
  assert.equal(results[1].device_not_registered, true);
  assert.match(results[1].error ?? '', /DeviceNotRegistered/);
});

test('an HTTP failure fails the whole batch for retry', () => {
  const results = toResults(batch, null, 'Expo HTTP 503');
  assert.ok(results.every((r) => r.status === 'failed' && r.error === 'Expo HTTP 503' && !r.device_not_registered));
});

test('chunking keeps order', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
