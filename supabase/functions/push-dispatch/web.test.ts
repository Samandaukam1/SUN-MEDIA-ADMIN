import assert from 'node:assert/strict';
import test from 'node:test';

import { isWeb, webMessage, webResult, type WebClaimed } from './web.ts';

const room = '6f1c2a9e-1111-4c2b-9b1a-0d6e2f3a4b5c';
const chat: WebClaimed = {
  delivery_id: 7,
  token: 'https://web.push.apple.com/QGuQ',
  title: 'SUN MEDIA jamoasi',
  body: 'Dilshod: Ertaga soat 10:00 da yig‘ilish.',
  data: { route: `/chat/${room}`, type: 'chat.message', notification_id: 'x' },
  priority: 'low',
  badge: 3,
  platform: 'web',
  p256dh: 'p',
  auth_secret: 'a',
  notification_id: 'a0b1c2d3-e4f5-4678-9abc-def012345678',
};

test('web rows are told apart from the phone app rows', () => {
  assert.equal(isWeb(chat), true);
  assert.equal(isWeb({ ...chat, platform: undefined } as never), false);
});

test('a chat message: opens through the resolver, one notification per room, the badge, no sound in busy rooms', () => {
  const { payload, options } = webMessage(chat);
  const m = JSON.parse(payload);
  assert.equal(m.url, '/open?n=a0b1c2d3-e4f5-4678-9abc-def012345678');
  assert.equal(m.tag, `chat:${room}`);
  assert.equal(m.badge, 3);
  assert.equal(m.silent, true);
  assert.equal(m.title, 'SUN MEDIA jamoasi');
  assert.equal(options.urgency, 'normal');
  assert.equal(options.topic, 'a0b1c2d3e4f546789abcdef012345678');
  assert.ok(new TextEncoder().encode(payload).length < 3000);
});

test('a task: its own notification, high priority is urgent and kept longer', () => {
  const task = { ...chat, title: 'Yangi vazifa biriktirildi', body: 'SAFI — Syomka. Deadline: 26.10 17:00', data: { route: '/tasks/1', type: 'task.assigned' }, priority: 'high' as const };
  const { payload, options } = webMessage(task);
  assert.equal(JSON.parse(payload).tag, `n:${chat.notification_id}`);
  assert.equal(JSON.parse(payload).silent, false);
  assert.equal(options.urgency, 'high');
  assert.equal(options.ttl, 3 * 86_400);
});

test('push service answers: accepted, gone (retired), or retried', () => {
  assert.deepEqual(webResult(chat, { status: 201, text: '' }), { delivery_id: 7, status: 'sent' });
  for (const status of [404, 410]) assert.equal(webResult(chat, { status, text: 'gone' }).device_not_registered, true);
  for (const status of [400, 403, 413, 429, 500]) {
    const r = webResult(chat, { status, text: 'x' });
    assert.equal(r.status, 'failed');
    assert.equal(r.device_not_registered, false);
  }
  assert.match(webResult(chat, new Error('connect ECONNREFUSED')).error ?? '', /ECONNREFUSED/);
});
