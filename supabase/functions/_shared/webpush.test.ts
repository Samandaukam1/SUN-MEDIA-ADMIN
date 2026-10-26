import assert from 'node:assert/strict';
import test from 'node:test';

import { b64urlDecode, b64urlEncode, encryptPayload, generateVapidKeys, sendWebPush, vapidAuthorization } from './webpush.ts';

const enc = new TextEncoder();

async function ecdhPair(privateD: string, publicRaw: string): Promise<CryptoKeyPair> {
  const pub = b64urlDecode(publicRaw);
  const jwk = { kty: 'EC', crv: 'P-256', d: privateD, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33)), ext: true };
  return {
    privateKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('raw', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
}

test('matches the worked example of RFC 8291 (Appendix A) byte for byte', async () => {
  const sender = await ecdhPair('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  const body = await encryptPayload(
    { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
    enc.encode('When I grow up, I want to be a watermelon'),
    { salt: b64urlDecode('DGv6ra1nlYgDCS1FRnbzlw'), senderKeys: sender },
  );
  assert.equal(
    b64urlEncode(body),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  );
});

/** What the browser does with the body: the receiver's side of RFC 8291, written independently of the sender. */
async function decrypt(body: Uint8Array, ua: CryptoKeyPair, uaPublic: Uint8Array, authSecret: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) => {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
  };
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(authSecret, shared, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  assert.equal(plain[plain.length - 1], 2, 'last-record delimiter');
  return new TextDecoder().decode(plain.slice(0, -1));
}

test('a browser subscription decrypts what was sent to it (and only it)', async () => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const text = JSON.stringify({ title: 'Sun Media — Ichki chat', body: 'Ertaga soat 10:00 da yig‘ilish. Ўзбекча матн ✓' });
  const body = await encryptPayload({ p256dh: b64urlEncode(uaPublic), auth: b64urlEncode(authSecret) }, enc.encode(text));
  assert.equal(await decrypt(body, ua, uaPublic, authSecret), text);
  // Fresh salt and sender key every time: the same text never looks the same twice.
  const again = await encryptPayload({ p256dh: b64urlEncode(uaPublic), auth: b64urlEncode(authSecret) }, enc.encode(text));
  assert.notEqual(b64urlEncode(again), b64urlEncode(body));
  await assert.rejects(decrypt(body, ua, uaPublic, crypto.getRandomValues(new Uint8Array(16))), 'another auth secret cannot read it');
});

test('the VAPID header is an ES256 JWT for the push service, verifiable with the public key', async () => {
  const keys = { ...(await generateVapidKeys()), subject: 'mailto:info@sunmediagroup.uz' };
  const now = Date.UTC(2026, 9, 26, 12);
  const header = await vapidAuthorization('https://web.push.apple.com/QGuQyavXutnMH-abc', keys, now);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
  assert.ok(m, header);
  assert.equal(m[4], keys.publicKey);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64urlDecode(m[1]))), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(m[2])));
  assert.deepEqual(claims, { aud: 'https://web.push.apple.com', exp: now / 1000 + 12 * 3600, sub: 'mailto:info@sunmediagroup.uz' });
  const pub = await crypto.subtle.importKey('raw', b64urlDecode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64urlDecode(m[3]), enc.encode(`${m[1]}.${m[2]}`));
  assert.ok(ok, 'signature verifies');
});

test('the request carries the standard headers; Topic is sanitised to what push services accept', async () => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: b64urlEncode(new Uint8Array(16)) };
  const keys = { ...(await generateVapidKeys()), subject: 'https://sunmediagroup.uz' };
  let seen: { url: string; init: RequestInit } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response('', { status: 201 });
  }) as unknown as typeof fetch;
  const res = await sendWebPush(sub, '{"title":"x"}', keys, { ttl: 60, urgency: 'high', topic: 'a1b2-c3d4/e5' }, fake);
  assert.equal(res.status, 201);
  const h = seen!.init.headers as Record<string, string>;
  assert.equal(seen!.url, sub.endpoint);
  assert.equal(h['Content-Encoding'], 'aes128gcm');
  assert.equal(h.TTL, '60');
  assert.equal(h.Urgency, 'high');
  assert.equal(h.Topic, 'a1b2-c3d4e5');
  assert.match(h.Authorization, /^vapid t=.+, k=/);
});
