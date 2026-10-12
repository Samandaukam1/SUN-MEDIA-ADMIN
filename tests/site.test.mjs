import assert from 'node:assert/strict';
import test from 'node:test';

import { createGateToken, GATE_TTL_SECONDS, verifyGateToken, visitorKey } from '../lib/site/gate-token.ts';
import { normalizeHttpsLink, normalizeLink, normalizePhone, slugify } from '../lib/site/normalize.ts';
import { accentRuns, formatPhone, partnershipYears } from '../lib/site/types.ts';

const SECRET = 'test-secret-that-is-long-enough-for-hmac';

test('a gate token verifies with its secret and only until it expires', async () => {
  const now = Date.UTC(2026, 9, 13, 10, 0, 0);
  const token = await createGateToken(SECRET, now);
  assert.match(token, /^\d{10}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(await verifyGateToken(token, SECRET, now), true);
  assert.equal(await verifyGateToken(token, SECRET, now + (GATE_TTL_SECONDS - 5) * 1000), true);
  assert.equal(await verifyGateToken(token, SECRET, now + (GATE_TTL_SECONDS + 1) * 1000), false, 'expired');
  assert.equal(await verifyGateToken(token, 'another-secret-value-entirely-different', now), false, 'other secret');
  assert.equal(await verifyGateToken(token, null, now), false, 'no secret configured');
});

test('a tampered or forged gate token is refused', async () => {
  const now = Date.UTC(2026, 9, 13, 10, 0, 0);
  const token = await createGateToken(SECRET, now);
  const [expiry, mac] = token.split('.');
  // A later expiry with the old signature.
  assert.equal(await verifyGateToken(`${Number(expiry) + 600}.${mac}`, SECRET, now), false);
  // A signature for a far-future expiry is refused even when valid.
  const farFuture = await createGateToken(SECRET, now + 24 * 3600 * 1000);
  assert.equal(await verifyGateToken(farFuture, SECRET, now), false);
  for (const bad of ['', 'abc', `${expiry}.`, `${expiry}.${mac}x`, `${expiry}.${mac.slice(0, -1)}A`]) {
    assert.equal(await verifyGateToken(bad, SECRET, now), false, bad);
  }
});

test('the visitor key is stable per IP and never contains the IP', async () => {
  const a = await visitorKey(SECRET, '203.0.113.7');
  assert.equal(a, await visitorKey(SECRET, '203.0.113.7'));
  assert.notEqual(a, await visitorKey(SECRET, '203.0.113.8'));
  assert.ok(!a.includes('203'));
  assert.ok(a.length >= 16 && a.length <= 128);
});

test('phones from the form become +<digits>; nine digits are an Uzbek number', () => {
  assert.equal(normalizePhone('90 123 45 67'), '+998901234567');
  assert.equal(normalizePhone('+998 (90) 123-45-67'), '+998901234567');
  assert.equal(normalizePhone('998901234567'), '+998901234567');
  assert.equal(normalizePhone('+7 912 345 67 89'), '+79123456789');
  assert.equal(formatPhone('+998901234567'), '+998 90 123 45 67');
});

test('links: @handle → Instagram, bare domains get https, junk is refused', () => {
  assert.equal(normalizeLink(''), '');
  assert.equal(normalizeLink('@sun.media_uz'), 'https://instagram.com/sun.media_uz');
  assert.equal(normalizeLink('sunmedia.uz'), 'https://sunmedia.uz/');
  assert.equal(normalizeLink('https://t.me/sunmedia'), 'https://t.me/sunmedia');
  assert.equal(normalizeLink('javascript:alert(1)'), null);
  assert.equal(normalizeLink('not a link'), null);
  assert.equal(normalizeLink('https://user:pass@evil.com'), null);
  assert.equal(normalizeHttpsLink('http://brend.uz'), 'https://brend.uz/');
  assert.equal(normalizeHttpsLink(''), null);
  assert.equal(normalizeHttpsLink('localhost'), undefined);
});

test('case slugs are readable Latin', () => {
  assert.equal(slugify('SAFI — Reels seriyasi 2025!'), 'safi-reels-seriyasi-2025');
  assert.equal(slugify('O‘zbekiston bo‘ylab'), 'ozbekiston-boylab');
  assert.equal(slugify('Кофе брендинг'), 'kofe-brending');
  assert.equal(slugify('***'), '');
});

test('*asterisks* mark the lime words of a title; partnership years count from the start year', () => {
  assert.deepEqual(accentRuns('Brendingizni *ko‘rinadigan* qilamiz'), [
    { text: 'Brendingizni ', accent: false },
    { text: 'ko‘rinadigan', accent: true },
    { text: ' qilamiz', accent: false },
  ]);
  assert.equal(partnershipYears(2021, new Date('2026-10-13')), 5);
  assert.equal(partnershipYears(null), null);
});
