import 'server-only';

import { agencyDateKey } from '@/lib/time';

import { AgentAiOffline, agentResearch } from './ai';
import { briefText } from './creative';
import { generateItem } from './pipeline';
import { collectInsights, duePublish, publishItem, refreshTokens } from './publisher';
import { addMemory, briefOf, db, loadSettings, memoryOf } from './server';

/**
 * Worker (pg_cron → /api/agents/worker, ish bo'lganda har 2 daqiqada). Bir chaqiruv ~55 soniyaga sig'adi:
 *   1) yaqin 3 kunlik slotlarni yaratish (takrorlanmaydi), tiqilib qolgan "lease"larni tiklash;
 *   2) vaqti kelgan tasdiqlangan materiallarni joylash (vaqtga bog'liq — birinchi);
 *   3) navbatdagi materialni tayyorlash (vaqt qolsa — ikkinchisini);
 *   4) haftalik soha kuzatuvi, natijalar, tokenlarni yangilash.
 * Bir profil xatosi boshqalarini to'xtatmaydi: har qadam alohida ushlanadi.
 */
export async function runAgentsWorker(budgetMs = 52_000) {
  const t0 = Date.now();
  const left = () => budgetMs - (Date.now() - t0);
  const report = { planned: 0, published: [] as string[], generated: [] as string[], research: 0, insights: 0, refreshed: 0, errors: [] as string[] };
  const guard = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      report.errors.push(`${label}: ${e instanceof Error ? e.message : 'xato'}`.slice(0, 200));
    }
  };

  await guard('plan', async () => {
    const { data } = await db().rpc('agents_plan', { p_profile: undefined, p_days: 3 });
    report.planned = typeof data === 'number' ? data : 0;
    const now = new Date().toISOString();
    await db().from('agent_items').update({ status: 'queued', lease_until: null }).eq('status', 'generating').lt('lease_until', now);
    await db().from('agent_items').update({ status: 'approved', lease_until: null }).eq('status', 'publishing').lt('lease_until', now);
  });

  await guard('publish', async () => {
    for (const id of await duePublish(3)) {
      if (left() < 25_000) break;
      const r = await publishItem(id);
      report.published.push(`${id.slice(0, 8)}:${r.status}`);
    }
  });

  await guard('generate', async () => {
    for (let n = 0; n < 2 && left() > 30_000; n++) {
      const { data } = await db()
        .from('agent_items')
        .select('id, profile:agent_profiles!inner(status)')
        .eq('status', 'queued')
        .lte('prepare_at', new Date().toISOString())
        .eq('profile.status', 'active')
        .order('scheduled_at')
        .limit(1);
      const id = data?.[0]?.id;
      if (!id) break;
      const r = await generateItem(id);
      report.generated.push(`${id.slice(0, 8)}:${r.status}`);
    }
  });

  await guard('research', async () => {
    if (left() < 30_000) return;
    const s = await loadSettings();
    const today = ((new Date(`${agencyDateKey()}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // Toshkent bo'yicha ISO hafta kuni
    if (today !== s.research_weekday) return;
    const since = new Date(Date.now() - 6 * 86_400_000).toISOString();
    const { data: profiles } = await db().from('agent_profiles').select('*').eq('status', 'active').eq('research_enabled', true);
    for (const p of profiles ?? []) {
      const { count } = await db().from('agent_memory').select('id', { count: 'exact', head: true }).eq('profile_id', p.id).eq('kind', 'research').gt('created_at', since);
      if (count) continue;
      await runResearch(p.id);
      report.research++;
      break; // bir chaqiruvda bitta profil
    }
  });

  await guard('insights', async () => {
    if (left() > 10_000) report.insights = await collectInsights(5);
  });
  await guard('tokens', async () => {
    if (left() > 8_000) report.refreshed = await refreshTokens(3);
  });
  return report;
}

/** Haftalik soha kuzatuvi: internetdan (manbali) — raqobatchilar va soha mavzulari, kontent uchun ilhom. */
export async function runResearch(profileId: string): Promise<{ ok: boolean; message: string }> {
  const { data: p } = await db().from('agent_profiles').select('*').eq('id', profileId).maybeSingle();
  if (!p) return { ok: false, message: 'Profil topilmadi.' };
  const brief = briefText(briefOf(p), await memoryOf(p.id, 30), false);
  try {
    const r = await agentResearch({
      profileId: p.id,
      system:
        'Sen SMM tadqiqotchisisan. Faqat internetda topgan, manbasi aniq ma’lumotni yoz. Topa olmagan narsangni yozma. Javob o‘zbek tilida (lotin), qisqa ro‘yxat ko‘rinishida.',
      user: `${brief}\n\nShu biznes sohasi va hududi (O‘zbekiston, ${p.region ?? 'Toshkent'}) bo‘yicha oxirgi haftalardagi foydali kuzatuvlarni top: soha yangiliklari, mavsumiy ehtiyojlar, auditoriya ko‘p so‘raydigan savollar, raqobatchilar qanday mavzularda yozayotgani (umumiy, brend nomlarisiz). 5–7 band: har bandda kuzatuv + undan qanday kontent g‘oyasi chiqishi. Narx va raqamlarni faqat manbasi bilan yoz.`,
    });
    if (!r.text) return { ok: false, message: 'Tadqiqot natija bermadi.' };
    const date = new Date().toISOString().slice(0, 10);
    await addMemory(p.id, 'research', `${date} kuzatuv (${r.provider}): ${r.text}`.slice(0, 4000), { sources: r.sources, checked_at: new Date().toISOString(), provider: r.provider, model: r.model });
    return { ok: true, message: `Soha kuzatuvi saqlandi (${r.sources.length} ta manba).` };
  } catch (e) {
    if (e instanceof AgentAiOffline) return { ok: false, message: 'AI ulanmagan — internet tadqiqoti o‘tkazilmadi.' };
    return { ok: false, message: e instanceof Error ? e.message : 'Tadqiqot xatosi.' };
  }
}
