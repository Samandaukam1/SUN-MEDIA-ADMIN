import { createHash } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { parseSignedRequest } from '@/lib/instagram/api';
import { igConfig, revokeByInstagramUser } from '@/lib/instagram/server';

// Meta's "Data deletion request URL": the token, the readings taken through the API and the photo are deleted at once
// (the card itself, manual observations and the order history are the agency's own records and stay).
export const dynamic = 'force-dynamic';

const STATUS = 'https://sunmediagroup.uz/api/smm/instagram/data-deletion';

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const data = parseSignedRequest(String(form?.get('signed_request') ?? ''), igConfig().appSecret);
  if (!data) return new NextResponse(null, { status: 400 });
  const userId = String(data.user_id ?? '');
  await revokeByInstagramUser(userId, true);
  const code = createHash('sha256').update(`${userId}:${Date.now()}`).digest('hex').slice(0, 16);
  return NextResponse.json({ url: `${STATUS}?code=${code}`, confirmation_code: code });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code') ?? '';
  const text = /^[0-9a-f]{16}$/.test(code)
    ? `So‘rov ${code}: Instagram orqali olingan ma’lumotlar (token, API kuzatuvlari, profil rasmi) o‘chirildi.`
    : 'Sun Media — Instagram ma’lumotlarini o‘chirish so‘rovlari shu manzil orqali qabul qilinadi.';
  return new NextResponse(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
