import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { exportFile, exportZip } from '@/lib/agents/export';
import { db, PERMISSION } from '@/lib/agents/server';
import { can, getSessionContext } from '@/lib/auth';

/**
 * Downloads of approved content: ?f=0 (the Story, or carousel slide 1), ?f=1 … or ?zip=1 (the carousel package).
 * Only staff with agents.manage, only the approved current version, the stored PNG byte for byte. Anyone else gets 404.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const notFound = () => new NextResponse('Topilmadi', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const ctx = await getSessionContext();
  if (!ctx || !can(ctx, PERMISSION)) return notFound();
  const { itemId } = await params;
  if (!z.uuid().safeParse(itemId).success) return notFound();
  const { data: item } = await db().from('agent_items').select('*').eq('id', itemId).maybeSingle();
  if (!item) return notFound();
  const { data: profile } = await db().from('agent_profiles').select('*').eq('id', item.profile_id).maybeSingle();
  if (!profile) return notFound();

  const zip = request.nextUrl.searchParams.get('zip') === '1';
  const index = Number(request.nextUrl.searchParams.get('f') ?? '0');
  const r = zip ? await exportZip(item, profile, ctx.userId) : Number.isInteger(index) && index >= 0 && index < 10 ? await exportFile(item, profile, index, ctx.userId) : ({ ok: false, message: 'Fayl raqami noto‘g‘ri' } as const);
  if (!r.ok) return new NextResponse(r.message, { status: 409, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
  return new NextResponse(new Uint8Array(r.data), {
    headers: {
      'Content-Type': zip ? 'application/zip' : 'image/png',
      'Content-Length': String(r.data.length),
      'Content-Disposition': `attachment; filename="${r.name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
