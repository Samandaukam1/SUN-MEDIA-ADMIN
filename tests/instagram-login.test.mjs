import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

await import('./integration/hooks.mjs');
const ig = await import('../lib/instagram/api.ts');

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const TOKEN = 'IGAAsecret-token-value';
const SECRET = 'app-secret-0123456789abcdef';

test('consent URL: official Instagram window, read-only scope, no Facebook Login option', () => {
  const u = new URL(ig.authorizeUrl({ appId: '123456789', redirectUri: 'https://sunmediagroup.uz/api/smm/instagram/callback', state: 'abc' }));
  assert.equal(u.origin + u.pathname, 'https://www.instagram.com/oauth/authorize');
  assert.equal(u.searchParams.get('scope'), 'instagram_business_basic');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('enable_fb_login'), '0');
  assert.equal(u.searchParams.get('state'), 'abc');
  assert.equal(u.searchParams.get('force_reauth'), null);
  assert.equal(new URL(ig.authorizeUrl({ appId: '1', redirectUri: 'x:', state: 's', forceReauth: true })).searchParams.get('force_reauth'), 'true');
  assert.equal(ig.cleanCode('AQBx#_'), 'AQBx');
});

test('code exchange: data[] answer (and the older flat one), secret only in the POST body', async () => {
  const calls = [];
  // Raw text as Instagram sends it: a 17-digit number (not exact as a JS number).
  const fetchImpl = async (url, init) => (calls.push({ url, init }), new Response(`{"data":[{"access_token":"${TOKEN}","user_id":17841400000000001,"permissions":"instagram_business_basic"}]}`));
  const r = await ig.exchangeCode(fetchImpl, { appId: '1', appSecret: SECRET, redirectUri: 'https://x/cb', code: 'CODE#_' });
  assert.equal(r.ok, true);
  assert.equal(r.value.userId, '17841400000000001');
  assert.deepEqual(r.value.permissions, ['instagram_business_basic']);
  assert.equal(calls[0].url, 'https://api.instagram.com/oauth/access_token');
  assert.equal(calls[0].init.method, 'POST');
  assert.match(calls[0].init.body, /code=CODE(&|$)/, '"#_" stripped');
  const flat = await ig.exchangeCode(async () => json({ access_token: TOKEN, user_id: '42', permissions: ['instagram_business_basic'] }), { appId: '1', appSecret: SECRET, redirectUri: 'x', code: 'c' });
  assert.equal(flat.value.userId, '42');
  const used = await ig.exchangeCode(async () => json({ error_type: 'OAuthException', code: 400, error_message: 'This authorization code has been used' }, 400), { appId: '1', appSecret: SECRET, redirectUri: 'x', code: 'c' });
  assert.equal(used.ok, false);
  assert.equal(used.kind, 'bad_request');
  assert.ok(!used.message.includes(SECRET));
});

test('long-lived exchange and refresh endpoints', async () => {
  const urls = [];
  const fetchImpl = async (url) => (urls.push(url), json({ access_token: TOKEN + '2', token_type: 'bearer', expires_in: 5183944 }));
  const l = await ig.exchangeLongLived(fetchImpl, { appSecret: SECRET, token: TOKEN });
  assert.equal(l.value.expiresIn, 5183944);
  assert.match(urls[0], /^https:\/\/graph\.instagram\.com\/access_token\?grant_type=ig_exchange_token/);
  const r = await ig.refreshLongLived(fetchImpl, TOKEN);
  assert.equal(r.ok, true);
  assert.match(urls[1], /^https:\/\/graph\.instagram\.com\/refresh_access_token\?grant_type=ig_refresh_token/);
});

test('profile: real fields only; a missing field is named, never filled; zero is a value', async () => {
  let url;
  const r = await ig.readProfile(async (u) => ((url = u), json({ user_id: '17841400000000001', id: '99', username: 'SunMediaUz', name: 'Sun Media', account_type: 'BUSINESS', profile_picture_url: 'https://scontent.cdninstagram.com/x.jpg', followers_count: 0, media_count: 12 })), { token: TOKEN });
  assert.equal(r.ok, true);
  assert.equal(r.value.username, 'sunmediauz');
  assert.equal(r.value.followers, 0);
  assert.equal(r.value.follows, null);
  assert.deepEqual(r.value.missing, ['follows_count']);
  const u = new URL(url);
  assert.equal(u.host, 'graph.instagram.com');
  assert.match(u.pathname, /^\/v\d+\.\d\/me$/);
  assert.equal(u.searchParams.get('fields'), 'user_id,id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count');
  assert.equal(ig.normalizeProfile({ username: 'x' }), null, 'no stable id → nothing stored');
  assert.equal(ig.normalizeProfile({ user_id: '1', profile_picture_url: 'http://insecure' }).pictureUrl, null);
});

test('errors: expired/revoked → reconnect; throttling waits for Meta’s hint; outages back off; token never echoed', async () => {
  const expired = await ig.readProfile(async () => json({ error: { message: `Error validating access token: access_token=${TOKEN}`, type: 'OAuthException', code: 190, error_subcode: 463 } }, 400), { token: TOKEN });
  assert.equal(expired.kind, 'auth');
  assert.ok(!expired.message.includes(TOKEN));
  const perm = await ig.readProfile(async () => json({ error: { message: 'perm', type: 'OAuthException', code: 10 } }, 403), { token: TOKEN });
  assert.equal(perm.kind, 'permission');
  const rate = await ig.readProfile(
    async () => json({ error: { message: 'limit', code: 4 } }, 400, { 'X-Business-Use-Case-Usage': JSON.stringify({ 1: [{ type: 'instagram', call_count: 100, estimated_time_to_regain_access: 30 }] }) }),
    { token: TOKEN },
  );
  assert.equal(rate.kind, 'rate');
  assert.equal(rate.retryAfterSec, 1800);
  const down = await ig.readProfile(async () => new Response('oops', { status: 502 }), { token: TOKEN });
  assert.equal(down.kind, 'transient');
  const net = await ig.readProfile(async () => {
    throw new TypeError('fetch failed');
  }, { token: TOKEN });
  assert.equal(net.kind, 'transient');
  const bad = await ig.readProfile(async () => json({ error: { message: `bad access_token=${TOKEN}&x=1`, code: 100 } }, 400), { token: TOKEN });
  assert.equal(bad.kind, 'bad_request');
  assert.ok(!bad.message.includes(TOKEN), 'redacted');

  assert.equal(ig.nextSyncDelaySec({ ok: true }, 0), 3600, 'hourly');
  assert.equal(ig.nextSyncDelaySec(expired, 1), null, 'stops until reconnected');
  assert.equal(ig.nextSyncDelaySec(rate, 1), 3600);
  assert.equal(ig.nextSyncDelaySec({ ...rate, retryAfterSec: 7200 }, 1), 7200);
  assert.equal(ig.nextSyncDelaySec(down, 1), 1200);
  assert.equal(ig.nextSyncDelaySec(down, 20), 6 * 3600, 'capped');
});

test('signed_request (deauthorize / data deletion) is verified with the app secret', () => {
  const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '17841400000000001', issued_at: 1 })).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
  assert.equal(ig.parseSignedRequest(`${sig}.${payload}`, SECRET).user_id, '17841400000000001');
  assert.equal(ig.parseSignedRequest(`${sig}.${payload}`, 'other-secret-xxxxxxxx'), null);
  assert.equal(ig.parseSignedRequest(`${sig.slice(0, -2)}AA.${payload}`, SECRET), null);
  assert.equal(ig.parseSignedRequest('garbage', SECRET), null);
  assert.equal(ig.parseSignedRequest(`${sig}.${payload}`, ''), null);
});

test('linking: only the card’s own account; another login is refused, never merged or duplicated', () => {
  const card = { id: 'c1', username: 'sunmediauz', ig_user_id: null };
  const none = { connectionOfAccount: null, cardOfAccount: null, connectionUserOfCard: null };
  const me = { userId: '178', username: 'sunmediauz', accountType: 'BUSINESS' };
  assert.equal(ig.linkDecision(card, me, none), 'ok', 'first link by username');
  assert.equal(ig.linkDecision(card, { ...me, username: 'other' }, none), 'mismatch', 'logged into another account');
  assert.equal(ig.linkDecision({ ...card, ig_user_id: '178' }, { ...me, username: 'renamed' }, none), 'ok', 'username changed, same stable id');
  assert.equal(ig.linkDecision({ ...card, ig_user_id: '178' }, { ...me, userId: '999' }, none), 'mismatch', 'same username, other id');
  assert.equal(ig.linkDecision(card, me, { ...none, connectionOfAccount: 'c2' }), 'taken', 'already on another card');
  assert.equal(ig.linkDecision(card, me, { ...none, cardOfAccount: 'c2' }), 'taken');
  assert.equal(ig.linkDecision(card, me, { ...none, connectionOfAccount: 'c1', connectionUserOfCard: '178' }), 'ok', 'reconnecting the same account');
  assert.equal(ig.linkDecision(card, me, { ...none, connectionUserOfCard: '555' }), 'mismatch', 'the card was linked to another id');
  assert.equal(ig.linkDecision(card, { ...me, accountType: 'PERSONAL' }, none), 'not_professional');
  assert.equal(ig.linkDecision(card, { ...me, accountType: 'MEDIA_CREATOR' }, none), 'ok');
});
