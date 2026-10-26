// Web Push, standard and self-hosted: VAPID (RFC 8292) and the aes128gcm message encryption (RFC 8291, RFC 8188),
// with Web Crypto only — the same code runs in the Edge Function (Deno) and in Node tests. Works with every push
// service a browser picks: Apple (iPhone/iPad home-screen apps, Safari), Google (Chrome, Android), Mozilla, Microsoft.

export type WebSubscription = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };
export type PushOptions = { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string };

const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text: string): Uint8Array {
  const s = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** The VAPID private key as a signing key (the public key gives x and y). */
async function vapidSigningKey(keys: VapidKeys): Promise<CryptoKey> {
  const pub = b64urlDecode(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key must be an uncompressed P-256 point');
  const jwk = { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33)), ext: false };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** "vapid t=<JWT>, k=<public key>" for one push service (the JWT's audience is the endpoint's origin). */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): Promise<string> {
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  // 12 hours: the longest a push service accepts is 24 h.
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })));
  const unsigned = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidSigningKey(keys), enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64urlEncode(signature)}, k=${keys.publicKey}`;
}

/**
 * The encrypted body for one subscription (one aes128gcm record): only that browser can read it. `salt` and the
 * sender's key pair are random per message; they can be passed in for tests.
 */
export async function encryptPayload(
  sub: Pick<WebSubscription, 'p256dh' | 'auth'>,
  plaintext: Uint8Array,
  fixed?: { salt: Uint8Array; senderKeys: CryptoKeyPair },
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);
  if (uaPublic.length !== 65) throw new Error('Bad subscription key');
  if (authSecret.length !== 16) throw new Error('Bad subscription auth secret');
  if (plaintext.length > 3992) throw new Error('Push payload too large');

  const sender = fixed?.senderKeys ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, sender.privateKey, 256));

  // RFC 8291 §3.4: the input keying material mixes the shared secret with the browser's auth secret.
  const prkKey = await hmac(authSecret, ecdhSecret);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  // One record, so it is the last: the padding delimiter is 0x02.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

export type PushResponse = { status: number; text: string };

/** Sends one message. The push service answers 201 when it accepted it; 404 / 410 mean the subscription is gone. */
export async function sendWebPush(sub: WebSubscription, payload: string, keys: VapidKeys, options: PushOptions = {}, fetcher: typeof fetch = fetch): Promise<PushResponse> {
  const body = await encryptPayload(sub, enc.encode(payload));
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(sub.endpoint, keys),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(options.ttl ?? 24 * 3600),
    Urgency: options.urgency ?? 'normal',
  };
  // Topic: a repeat of the same notification replaces the undelivered copy instead of arriving twice.
  if (options.topic) headers.Topic = options.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  const res = await fetcher(sub.endpoint, { method: 'POST', headers, body });
  return { status: res.status, text: (await res.text().catch(() => '')).slice(0, 300) };
}

/** A new VAPID key pair (scripts/push/vapid-keys.mjs prints one for the server settings). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { publicKey: b64urlEncode(pub), privateKey: jwk.d as string };
}
