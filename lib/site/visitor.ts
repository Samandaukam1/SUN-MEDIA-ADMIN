import 'server-only';

import { headers } from 'next/headers';

import { gateSecret, visitorKey } from './gate-token';

/** One-way key of the visitor's IP (rate limits) and their browser name; null when no server secret is set. */
export async function currentVisitor(): Promise<{ key: string; userAgent: string } | null> {
  const secret = gateSecret();
  if (!secret) return null;
  const h = await headers();
  const ip = h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return { key: await visitorKey(secret, ip), userAgent: (h.get('user-agent') ?? '').slice(0, 300) };
}

/** One-way key of a login (email) for attempt limits: the email itself never reaches the attempts table. */
export async function loginKey(email: string): Promise<string | null> {
  const secret = gateSecret();
  if (!secret) return null;
  return visitorKey(secret, `login:${email.trim().toLowerCase()}`);
}
