import assert from 'node:assert/strict';
import test from 'node:test';

import { visitorKey } from '../lib/site/gate-token.ts';
import { normalizeHttpsLink, normalizeLink, normalizePhone, slugify } from '../lib/site/normalize.ts';
import { accentRuns, formatPhone, partnershipYears } from '../lib/site/types.ts';

const SECRET = 'test-secret-that-is-long-enough-for-hmac';

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
