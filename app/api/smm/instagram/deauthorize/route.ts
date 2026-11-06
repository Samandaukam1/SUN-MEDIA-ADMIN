import { NextResponse, type NextRequest } from 'next/server';

import { parseSignedRequest } from '@/lib/instagram/api';
import { igConfig, revokeByInstagramUser } from '@/lib/instagram/server';

// Meta's "Deauthorize callback URL": the owner removed the app from the Instagram account. Signed with the app secret.
// The token is deleted and readings stop (the card shows "Qayta ulash kerak"); orders and history stay.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const data = parseSignedRequest(String(form?.get('signed_request') ?? ''), igConfig().appSecret);
  if (!data) return new NextResponse(null, { status: 400 });
  await revokeByInstagramUser(String(data.user_id ?? ''), false);
  return NextResponse.json({ ok: true });
}
