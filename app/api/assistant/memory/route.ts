import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { assistantContext, rateLimited } from '@/lib/assistant/request';
import { toUserMessage } from '@/lib/errors';

export const runtime = 'nodejs';

const SCOPE_WHY = {
  personal: 'Siz so‘ragansiz — javoblarni sizga moslash uchun faqat siz bilan suhbatda ishlatiladi.',
  company: 'SUN MEDIA rahbari tasdiqlagan qoida — barcha xodimlar bilan suhbatda hisobga olinadi.',
  partner: 'Hamkor haqidagi agentlik eslatmasi — shu hamkor bilan ishlaganda hisobga olinadi.',
} as const;

const edit = z.object({ id: z.uuid(), body: z.string().trim().min(2).max(400) });
const remove = z.object({ id: z.uuid() });

/**
 * Sunny's memory, as the person manages it: GET lists what Sunny may use with them (their own notes, the company rules,
 * partner notes they may see — row-level security decides), PATCH corrects and DELETE forgets one of their own notes
 * (the system owner also the company rules). Every query runs with the person's own session.
 */
async function signedIn(request: NextRequest) {
  const { ctx } = await assistantContext(request);
  if (ctx.audience === 'public' || !ctx.db || !ctx.userId) return null;
  return ctx;
}

export async function GET(request: NextRequest) {
  const ctx = await signedIn(request);
  if (!ctx) return NextResponse.json({ error: 'Avval tizimga kiring.' }, { status: 401 });
  const { data, error } = await ctx.db!.from('assistant_memories').select('id, scope, body, updated_at, client:clients(name)').order('updated_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  const notes = (data as unknown as { id: string; scope: keyof typeof SCOPE_WHY; body: string; updated_at: string; client: { name: string } | null }[]).map((n) => ({
    id: n.id,
    scope: n.scope,
    body: n.body,
    updated_at: n.updated_at,
    client: n.client?.name ?? null,
    why: SCOPE_WHY[n.scope],
    editable: n.scope === 'personal' || (n.scope === 'company' && ctx.owner),
  }));
  return NextResponse.json({ notes }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest) {
  const ctx = await signedIn(request);
  if (!ctx) return NextResponse.json({ error: 'Avval tizimga kiring.' }, { status: 401 });
  if (rateLimited(`memory:${ctx.userId}`, 60, 10 * 60_000)) return NextResponse.json({ error: 'Juda ko‘p o‘zgartirish. Birozdan so‘ng.' }, { status: 429 });
  const parsed = edit.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Eslatma 2–400 belgi bo‘lsin.' }, { status: 400 });
  const { data, error } = await ctx.db!.from('assistant_memories').update({ body: parsed.data.body }).eq('id', parsed.data.id).select('id, body');
  if (error?.code === '23505') return NextResponse.json({ error: 'Bunday eslatma allaqachon bor.' }, { status: 409 });
  if (error?.code === '23514') return NextResponse.json({ error: 'Maxfiy ma’lumot (parol, karta raqami) saqlanmaydi.' }, { status: 400 });
  if (error) return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Bu eslatmani o‘zgartira olmaysiz.' }, { status: 403 });
  return NextResponse.json({ ok: true, body: data[0].body });
}

export async function DELETE(request: NextRequest) {
  const ctx = await signedIn(request);
  if (!ctx) return NextResponse.json({ error: 'Avval tizimga kiring.' }, { status: 401 });
  const parsed = remove.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Eslatma tanlanmagan.' }, { status: 400 });
  const { data, error } = await ctx.db!.from('assistant_memories').delete().eq('id', parsed.data.id).select('id');
  if (error) return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Bu eslatmani o‘chira olmaysiz.' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
