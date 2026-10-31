import assert from 'node:assert/strict';
import test from 'node:test';

import { CHAT_ROUTE, clock, messagePreview, toWaveform } from '../components/chat/media/format.ts';

test('Sunny steps aside on every internal chat screen, and only there', () => {
  for (const p of ['/chat', '/chat/', '/chat/mijozlar', '/xodim/chat', '/kabinet/chat', '/chat/0f8b7d1e-0000-4000-8000-000000000000']) assert.ok(CHAT_ROUTE.test(p), p);
  for (const p of ['/', '/panel', '/chatbot', '/xodim', '/xodim/vazifa/1', '/kabinet', '/kabinet/chatlar', '/site/chat', '/aloqa']) assert.equal(CHAT_ROUTE.test(p), false, p);
});

test('reply quotes and lists name voice and video messages', () => {
  assert.equal(messagePreview({ body: '', kind: 'voice' }), '🎤 Ovozli xabar');
  assert.equal(messagePreview({ body: '', kind: 'round_video' }), '📹 Video xabar');
  assert.equal(messagePreview({ body: 'Salom', kind: 'text' }), 'Salom');
  assert.equal(messagePreview({ body: '' }), 'Fayl');
  assert.equal(messagePreview({ body: '', kind: 'voice', deleted_at: '2026-10-31T10:00:00Z' }), 'Xabar o‘chirilgan');
});

test('durations read as m:ss', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(9_400), '0:09');
  assert.equal(clock(60_000), '1:00');
  assert.equal(clock(600_000), '10:00');
});

test('the stored waveform fits the database rule: up to 128 values 0–100, loudest = 100', () => {
  assert.deepEqual(toWaveform([]), []);
  const bars = toWaveform(Array.from({ length: 6000 }, (_, i) => Math.abs(Math.sin(i / 40)) * 0.3));
  assert.equal(bars.length, 48);
  assert.ok(bars.every((v) => Number.isInteger(v) && v >= 0 && v <= 100));
  assert.equal(Math.max(...bars), 100);
  // A two-second message still gets every bar (samples repeat instead of leaving gaps).
  assert.equal(toWaveform([0.1, 0.2, 0.05], 48).length, 48);
  assert.ok(toWaveform([0, 0, 0]).every((v) => v === 0));
});
