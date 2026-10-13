import type { Metadata } from 'next';
import Link from 'next/link';

import { NewProspectForm } from '@/components/prospects/NewProspectForm';
import { display, Eyebrow, GlassCard, StatusPill } from '@/components/prospects/ui';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Mijoz tahlili' };

/** Tahlil → all prospects: who was interviewed, what the AI suggested. */
export default async function ProspectsPage() {
  const supabase = await createClient();
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, name, company, instagram, status, created_at, answers, analyses:prospect_analyses(kind, result, created_at)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Eyebrow>Mijoz tahlili</Eyebrow>
          <h1 className={`${display} mt-3 text-[34px] leading-[1.05] font-medium text-white sm:text-[46px]`}>Yangi hamkorni tushunib oling</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#a8a8ac]">
            Savollarni mijozga o‘qib bering, mos javobni belgilang yoki o‘zingiz yozing. AI javoblarni tahlil qilib, mos tarif va nima qilish kerakligini aytadi; Instagram
            sahifasini ham tekshiradi.
          </p>
        </div>
        <NewProspectForm />
      </div>

      {prospects.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {prospects.map((p) => {
            const answered = Object.keys((p.answers as object) ?? {}).length;
            const brief = [...(p.analyses ?? [])].filter((a) => a.kind === 'brief').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            const plan = (brief?.result as { recommended_plan?: { name?: string } } | undefined)?.recommended_plan?.name;
            const ig = (p.analyses ?? []).some((a) => a.kind === 'instagram');
            return (
              <Link key={p.id} href={`/tahlil/${p.id}`} className="group">
                <GlassCard className="h-full transition-transform duration-300 group-hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`${display} truncate text-[19px] font-medium text-white group-hover:text-[#d4fc18]`}>{p.name}</p>
                      <p className="mt-1 truncate text-[13px] text-[#8e8e96]">{[p.company, p.instagram ? `@${p.instagram}` : null].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    <StatusPill status={p.status} />
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2 text-[12px]">
                    <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[#d9d9de]">{answered} ta javob</span>
                    {plan ? <span className="rounded-full bg-[#d4fc18]/12 px-3 py-1 text-[#d4fc18]">Tavsiya: {plan}</span> : null}
                    {ig ? <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[#d9d9de]">Instagram tahlil qilingan</span> : null}
                    <span className="ml-auto text-[#6e6e76]">{formatShortDateTime(p.created_at)}</span>
                  </div>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      ) : (
        <GlassCard className="py-14 text-center">
          <p className={`${display} text-[22px] text-white`}>Hali tahlil yo‘q</p>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-[#a8a8ac]">“Yangi mijoz tahlili” tugmasini bosing — suhbat savollari bosqichma-bosqich ochiladi.</p>
        </GlassCard>
      )}
    </div>
  );
}
