/**
 * Proof that this browser typed the footer code: `<expiry>.<HMAC>` in an httpOnly cookie.
 * Web Crypto only, so the middleware (Edge) and server actions (Node) share it. Never imported by client code.
 */
export const GATE_COOKIE = 'sm_gate';
export const GATE_TTL_SECONDS = 30 * 60;

const encoder = new TextEncoder();

/** A dedicated SITE_GATE_SECRET when set; otherwise derived from the server-only Supabase secret key. */
export function gateSecret(): string | null {
  return process.env.SITE_GATE_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  let binary = '';
  for (const byte of mac) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createGateToken(secret: string, now = Date.now()): Promise<string> {
  const expiry = Math.floor(now / 1000) + GATE_TTL_SECONDS;
  return `${expiry}.${await sign(secret, `site-gate:v1:${expiry}`)}`;
}

export async function verifyGateToken(token: string | undefined | null, secret: string | null, now = Date.now()): Promise<boolean> {
  if (!token || !secret) return false;
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiry = Number(match[1]);
  const nowSeconds = Math.floor(now / 1000);
  // Expired, or further in the future than this server ever issues.
  if (expiry <= nowSeconds || expiry > nowSeconds + GATE_TTL_SECONDS + 60) return false;
  return sameText(match[2], await sign(secret, `site-gate:v1:${expiry}`));
}

/** One-way visitor key for rate limits: the IP never reaches the database in plain form. */
export async function visitorKey(secret: string, ip: string): Promise<string> {
  return sign(secret, `site-visitor:v1:${ip}`);
}
