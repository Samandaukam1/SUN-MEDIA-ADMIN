import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import test from 'node:test';

import { cleanNext, destinationFor, homeFor } from '../lib/cabinet/routing.ts';
import { change, formatMoney, monthlySeries, monthsBetween, periodLabel, resolvePeriod, sumKnown, totals } from '../lib/cabinet/stats.ts';
import { generateTemporaryPassword, passwordProblem } from '../lib/password-policy.ts';

const staff = (permissions, roles = [{ key: 'editor' }]) => ({ status: 'active', kind: 'staff', roles, permissions });
const partner = { status: 'active', kind: 'client', roles: [], permissions: [] };

test('the account decides where it lands, never the button or the URL', () => {
  assert.equal(homeFor(staff([], [{ key: 'system_owner' }])), '/panel');
  assert.equal(homeFor(staff(['dashboard.view'], [{ key: 'owner' }])), '/panel', 'Rahbar → panel');
  assert.equal(homeFor(staff(['files.upload'])), '/xodim', 'employee → own cabinet');
  assert.equal(homeFor(partner), '/kabinet', 'partner (SAFI) → partner cabinet, whichever footer button was used');
  assert.equal(homeFor({ ...partner, status: 'disabled' }), null, 'blocked accounts are refused');
  assert.equal(homeFor({ status: 'pending', kind: null, roles: [], permissions: [] }), null);

  assert.equal(destinationFor(partner, '/panel'), '/kabinet', 'a partner cannot ask for the panel');
  assert.equal(destinationFor(partner, '/xodim'), '/kabinet');
  assert.equal(destinationFor(partner, '/kabinet?dan=2026-01'), '/kabinet?dan=2026-01');
  assert.equal(destinationFor(staff(['files.upload']), '/clients'), '/xodim', 'an employee cannot ask for panel pages');
  assert.equal(destinationFor(staff(['dashboard.view']), '/clients/1'), '/clients/1');
  assert.equal(destinationFor(staff(['dashboard.view']), '/kabinet'), '/panel');
  assert.equal(destinationFor({ ...partner, temporary_password: true }, '/kabinet'), '/parol', 'temporary password first');
  assert.equal(cleanNext('//evil.example'), null);
  assert.equal(cleanNext('https://evil.example'), null);
  assert.equal(cleanNext('/\\evil'), null);
});

const row = (over) => ({
  account_id: 'ig',
  period_start: '2026-08-01',
  period_end: '2026-08-31',
  followers_start: null,
  followers_end: null,
  reach: null,
  views: null,
  profile_visits: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  reels_count: null,
  posts_count: null,
  stories_count: null,
  ad_spend: null,
  ad_currency: 'UZS',
  leads: null,
  source: 'manual',
  synced_at: null,
  updated_at: '2026-09-01T10:00:00Z',
  ...over,
});

test('missing stays missing, a real zero stays zero', () => {
  assert.equal(sumKnown([null, undefined]), null);
  assert.equal(sumKnown([0, null]), 0);
  const t = totals([row({ views: 0 })]);
  assert.equal(t.views, 0);
  assert.equal(t.reach, null);
  assert.equal(t.cpl, null);
  assert.equal(t.engagement_rate, null);
  assert.equal(totals([]).months_with_data, 0);
});

test('followers: latest month per account; growth only where both ends were entered', () => {
  const t = totals([
    row({ period_start: '2026-07-01', followers_start: 900, followers_end: 1000 }),
    row({ period_start: '2026-08-01', followers_start: 1000, followers_end: 1100 }),
    row({ account_id: 'tt', period_start: '2026-07-01', followers_end: 500 }),
  ]);
  assert.equal(t.followers, 1600);
  assert.equal(t.followers_growth, 200);
});

test('cost per lead only from months with both spend and leads, per currency', () => {
  const t = totals([
    row({ period_start: '2026-07-01', ad_spend: 1_000_000, leads: 20 }),
    row({ period_start: '2026-08-01', ad_spend: 500_000, leads: null }),
    row({ account_id: 'fb', ad_spend: 100, ad_currency: 'USD', leads: 4 }),
  ]);
  assert.deepEqual(t.ad_spend, { UZS: 1_500_000, USD: 100 });
  assert.deepEqual(t.cpl, { UZS: 50_000, USD: 25 });
  assert.equal(formatMoney({ UZS: 1_500_000 }), '1 500 000 so‘m');
  assert.equal(totals([row({ ad_spend: 100, leads: 0 })]).cpl, null, 'no leads → no CPL');
});

test('engagement = interactions / reach', () => {
  const t = totals([row({ reach: 1000, likes: 40, comments: 5, shares: 3, saves: 2 })]);
  assert.equal(t.interactions, 50);
  assert.equal(t.engagement_rate, 5);
});

test('cards and charts use the same rows; empty months are gaps', () => {
  const rows = [row({ period_start: '2026-06-01', views: 10 }), row({ period_start: '2026-08-01', views: 30 })];
  const series = monthlySeries(rows, monthsBetween('2026-06-01', '2026-08-01'));
  assert.deepEqual(series.map((s) => s.totals?.views ?? null), [10, null, 30]);
  assert.equal(totals(rows).views, sumKnown(series.map((s) => s.totals?.views ?? null)));
});

test('period from the URL, clamped, with an explicitly named previous period', () => {
  const p = resolvePeriod({ dan: '2026-03', gacha: '2026-08' }, '2026-10-01');
  assert.deepEqual([p.from, p.to, p.length], ['2026-03-01', '2026-08-01', 6]);
  assert.deepEqual(p.previous, { from: '2025-09-01', to: '2026-02-01' });
  assert.equal(periodLabel(p.previous.from, p.previous.to), 'Sentabr 2025 – Fevral 2026');
  assert.equal(periodLabel('2026-03-01', '2026-08-01'), 'Mart – Avgust 2026');
  const single = resolvePeriod({ oy: '2026-08' }, '2026-10-01');
  assert.deepEqual([single.from, single.to, single.previous.from], ['2026-08-01', '2026-08-01', '2026-07-01']);
  const future = resolvePeriod({ gacha: '2030-01' }, '2026-10-01');
  assert.equal(future.to, '2026-10-01', 'no future months');
  const def = resolvePeriod({}, '2026-10-01');
  assert.deepEqual([def.from, def.to], ['2026-05-01', '2026-10-01']);
  const long = resolvePeriod({ dan: '2019-01', gacha: '2026-10' }, '2026-10-01');
  assert.equal(long.length, 24);
  assert.equal(resolvePeriod({ dan: 'drop table', gacha: '2026-13' }, '2026-10-01').to, '2026-10-01');
});

test('change needs both sides and a non-zero base', () => {
  assert.equal(change(120, 100), 20);
  assert.equal(change(80, 100), -20);
  assert.equal(change(5, 0), null);
  assert.equal(change(null, 100), null);
  assert.equal(change(100, null), null);
});

test('temporary passwords are strong and all different', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const p = generateTemporaryPassword(randomInt);
    assert.match(p, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}[!@#$%&*?]$/);
    assert.match(p, /[A-Z]/);
    assert.match(p, /[a-z]/);
    assert.match(p, /\d/);
    assert.doesNotMatch(p, /[0O1lI]/);
    seen.add(p);
  }
  assert.equal(seen.size, 300);
});

test('new password rules', () => {
  assert.match(passwordProblem('short1'), /kamida 10/);
  assert.match(passwordProblem('onlyletterspassword'), /raqam/);
  assert.match(passwordProblem('aaaaaaaaa1'), /oddiy/);
  assert.match(passwordProblem('Sunmedia2026x'), /oson/);
  assert.match(passwordProblem('safiuser2026', { email: 'safiuser@client.uz' }), /login/);
  assert.match(passwordProblem('Kx7-mPq9-zT', { previous: 'Kx7-mPq9-zT' }), /farq/);
  assert.equal(passwordProblem('Tog‘da-2026-quyosh'), null);
});
