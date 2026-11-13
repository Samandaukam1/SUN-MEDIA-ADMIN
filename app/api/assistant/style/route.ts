import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { assistantContext, rateLimited } from '@/lib/assistant/request';

export const runtime = 'nodejs';

const body = z.object({ situation: z.string().trim().min(2).max(400), answer: z.string().trim().min(2).max(1200) });

/**
 * "👍 Shunday gapir" — the system owner marks one of Sunny's replies as the way it should talk. Saved as a style
 * example (the same table the owner teaches in conversation), with the owner's own session (row-level security: owner
 * only), and only when the owner switched feedback learning on. No AI call; the model itself is never retrained —
 * the examples are shown to it as style guidance.
 */
export async function POST(request: NextRequest) {
  const { ctx } = await assistantContext(request);
  if (ctx.audience !== 'staff' || !ctx.owner || !ctx.db) return NextResponse.json({ error: 'Faqat tizim egasi uchun.' }, { status: 403 });
  if (rateLimited(`style:${ctx.userId}`, 30, 10 * 60_000)) return NextResponse.json({ error: 'Juda ko‘p. Birozdan so‘ng.' }, { status: 429 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Matn noto‘g‘ri.' }, { status: 400 });
  const { data: p } = await ctx.db.from('assistant_personality').select('learn_from_feedback').eq('id', 1).maybeSingle();
  if (!(p as { learn_from_feedback?: boolean } | null)?.learn_from_feedback) {
    return NextResponse.json({ error: 'Fikrdan o‘rganish o‘chirilgan — Sozlamalar → Sunny ovozi va uslubida yoqing.' }, { status: 409 });
  }
  const { error } = await ctx.db.from('assistant_style_examples').insert({ situation: parsed.data.situation.slice(0, 300), answer: parsed.data.answer.slice(0, 600) });
  if (error) return NextResponse.json({ error: 'Saqlab bo‘lmadi.' }, { status: 500 });
  return NextResponse.json({ ok: true, message: 'Eslab qoldim: shunday gapiraman.' });
}
