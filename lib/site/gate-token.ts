/**
 * Server-side keyed hashes for rate limits (visitor IP, login): the plain values never reach the database.
 * Web Crypto only, so Edge and Node code share it. Never imported by client code.
 */

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

/** One-way visitor key for rate limits: the IP never reaches the database in plain form. */
export async function visitorKey(secret: string, ip: string): Promise<string> {
  return sign(secret, `site-visitor:v1:${ip}`);
}
