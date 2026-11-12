import type { Metadata } from 'next';
import Link from 'next/link';

import { AiStatusButton, DeleteSession, SessionActions, StartInterview } from '@/components/brief/ManagerControls';
import { NewProspectForm } from '@/components/prospects/NewProspectForm';
import { display, Eyebrow, GlassCard, StatusPill } from '@/components/prospects/ui';
import { INDUSTRIES, industryOf, subOf } from '@/lib/brief/industries';
import { aiReady } from '@/lib/brief/openai';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Mijoz tahlili' };

const TABS = [
  { key: 'yangi', label: 'Yangi tahlil' },
  { key: 'davom', label: 'Davom etayotganlar' },
  { key: 'yakunlangan', label: 'Yakunlangan tahlillar' },
  { key: 'tarix', label: 'Tahlillar tarixi' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const SESSION_STATUS: Record<string, { label: string; cls: string }> = {
  ready: { label: 'Boshlanmagan', cls: 'bg-white/[0.08] text-[#d9d9de]' },
  active: { label: 'Davom etmoqda', cls: 'bg-[#60a5fa]/15 text-[#93c5fd]' },
  completed: { label: 'Yakunlangan', cls: 'bg-[#d4fc18]/14 text-[#d4fc18]' },
  abandoned: { label: 'Yopilgan', cls: 'bg-white/[0.06] text-[#8e8e96]' },
};
const REVIEW: Record<string, string> = { new: 'Ko‘rilmagan', reviewing: 'Ko‘rib chiqilmoqda', reviewed: 'Ko‘rib chiqilgan' };

function Pill({ status }: { status: string }) {
  const s = SESSION_STATUS[status] ?? SESSION_STATUS.ready;
  return <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-semibold ${s.cls}`}>{s.label}</span>;
}

type Search = { bolim?: string; q?: string; soha?: string; holat?: string; dan?: string; gacha?: string };
const dateOk = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

/** Mijoz tahlili: start an interview, follow the unfinished ones, read the finished ones, search the history. */
export default async function ProspectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab: Tab = (TABS.find((t) => t.key === sp.bolim)?.key ?? 'yangi') as Tab;
  const supabase = await createClient();

  let query = supabase
    .from('brief_sessions')
    .select('id, status, company_hint, contact_hint, industry, sub_industry, review_status, created_at, started_at, completed_at, prospect:prospects(name), brief_answers(count)')
    .order('created_at', { ascending: false })
    .limit(tab === 'yangi' ? 6 : 200);
  if (tab === 'davom') query = query.in('status', ['ready', 'active']);
  if (tab === 'yakunlangan') query = query.eq('status', 'completed');
  if (tab === 'tarix' && sp.holat && SESSION_STATUS[sp.holat]) query = query.eq('status', sp.holat);
  if (sp.soha && industryOf(sp.soha)) query = query.eq('industry', sp.soha);
  if (dateOk(sp.dan)) query = query.gte('created_at', `${sp.dan}T00:00:00+05:00`);
  if (dateOk(sp.gacha)) query = query.lte('created_at', `${sp.gacha}T23:59:59+05:00`);
  const { data: rows, error } = await query;
  if (error) throw error;
  const needle = (sp.q ?? '').trim().toLowerCase().slice(0, 80);
  const sessions = (rows ?? []).filter((s) => !needle || [s.company_hint, s.contact_hint, s.prospect?.name].some((v) => v?.toLowerCase().includes(needle)));

  const legacy =
    tab === 'tarix'
      ? ((
          await supabase
            .from('prospects')
            .select('id, name, company, instagram, status, created_at, answers, analyses:prospect_analyses(kind, created_at), interviews:brief_sessions(id)')
            .order('created_at', { ascending: false })
            .limit(200)
        ).data ?? [])
          // Clients who came through an interview are listed above, with their report.
          .filter((p) => !(p.interviews ?? []).length)
          .filter((p) => !needle || [p.name, p.company, p.instagram].some((v) => v?.toLowerCase().includes(needle)))
      : [];
  const ai = aiReady();

  return (
    <div className="space-y-8" data-print-root>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Eyebrow>Mijoz tahlili</Eyebrow>
          <h1 className={`${display} mt-3 text-[34px] leading-[1.05] font-medium text-white sm:text-[46px]`}>Mijozni tushunib oling</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#a8a8ac]">
            Mijoz o‘zi javob beradi: savollar sohasiga, biznes modeliga va oldingi javoblariga moslashadi. Yakunda — faqat siz ko‘radigan tahlil, tavsiyalar va sayt talablari.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className={`rounded-full px-3 py-1.5 ${ai ? 'bg-[#d4fc18]/12 text-[#d4fc18]' : 'bg-white/[0.06] text-[#a8a8ac]'}`}>{ai ? 'AI kaliti o‘rnatilgan' : 'AI ulanmagan — ekspert qoidalari ishlaydi'}</span>
          {ai ? <AiStatusButton /> : null}
          <Link href="/tahlil/savollar" className="rounded-full border border-white/12 px-4 py-1.5 text-[#d9d9de] transition-colors hover:border-[#d4fc18]/50 hover:text-[#d4fc18]">
            Savollar banki
          </Link>
        </div>
      </div>

      <nav aria-label="Bo‘limlar" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/tahlil?bolim=${t.key}`}
            aria-current={t.key === tab ? 'page' : undefined}
            className={`h-10 rounded-full px-5 text-[13.5px] leading-10 transition-colors ${t.key === tab ? 'bg-[#d4fc18] font-semibold text-[#0b0b0c]' : 'bg-white/[0.05] text-[#d9d9de] hover:bg-white/[0.09]'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'yangi' ? (
        <GlassCard glow>
          <p className={`${display} text-[22px] font-medium text-white`}>Yangi tahlil</p>
          <ol className="mt-3 mb-6 grid gap-2 text-[13.5px] text-[#a8a8ac] sm:grid-cols-3">
            <li>1. Mijozni bilsangiz, nomini yozing (shart emas).</li>
            <li>2. “Mijozga topshirish” — MacBook mijoz rejimiga o‘tadi.</li>
            <li>3. Mijoz tugatgach, “Menejer uchun” orqali parolingiz bilan qayting.</li>
          </ol>
          <StartInterview aiReady={ai} />
        </GlassCard>
      ) : null}

      {tab !== 'yangi' ? (
        <form method="get" className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto_auto]">
          <input type="hidden" name="bolim" value={tab} />
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Kompaniya yoki ism bo‘yicha qidirish" aria-label="Qidirish" className="h-11 rounded-full border border-white/10 bg-white/[0.04] px-4 text-[14px] text-white outline-none focus:border-[#d4fc18]" />
          <select name="soha" defaultValue={sp.soha ?? ''} aria-label="Soha" className="h-11 rounded-full border border-white/10 bg-[#0b0b0c] px-4 text-[13.5px] text-[#d9d9de] outline-none focus:border-[#d4fc18]">
            <option value="">Barcha sohalar</option>
            {INDUSTRIES.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
          {tab === 'tarix' ? (
            <select name="holat" defaultValue={sp.holat ?? ''} aria-label="Holat" className="h-11 rounded-full border border-white/10 bg-[#0b0b0c] px-4 text-[13.5px] text-[#d9d9de] outline-none focus:border-[#d4fc18]">
              <option value="">Barcha holatlar</option>
              {Object.entries(SESSION_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="hidden sm:block" />
          )}
          <input type="date" name="dan" defaultValue={dateOk(sp.dan) ?? ''} aria-label="Sanadan" className="h-11 rounded-full border border-white/10 bg-[#0b0b0c] px-4 text-[13.5px] text-[#d9d9de] outline-none [color-scheme:dark] focus:border-[#d4fc18]" />
          <input type="date" name="gacha" defaultValue={dateOk(sp.gacha) ?? ''} aria-label="Sanagacha" className="h-11 rounded-full border border-white/10 bg-[#0b0b0c] px-4 text-[13.5px] text-[#d9d9de] outline-none [color-scheme:dark] focus:border-[#d4fc18]" />
          <button type="submit" className="h-11 rounded-full bg-white/[0.08] px-5 text-[13.5px] text-white hover:bg-white/[0.12]">
            Ko‘rsatish
          </button>
        </form>
      ) : null}

      <section className="space-y-3">
        {tab === 'yangi' && sessions.length ? <p className="text-[13px] text-[#8e8e96]">So‘nggi suhbatlar</p> : null}
        {sessions.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {sessions.map((s) => {
              const name = s.prospect?.name ?? s.company_hint ?? 'Nomi hali aytilmagan';
              const ind = industryOf(s.industry);
              const sub = subOf(s.industry, s.sub_industry);
              const answered = (s.brief_answers as unknown as { count: number }[])?.[0]?.count ?? 0;
              const open = s.status === 'ready' || s.status === 'active';
              return (
                <GlassCard key={s.id} className="h-full">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/tahlil/suhbat/${s.id}`} className="group min-w-0">
                      <p className={`${display} truncate text-[19px] font-medium text-white group-hover:text-[#d4fc18]`}>{name}</p>
                      <p className="mt-1 truncate text-[13px] text-[#8e8e96]">{[ind?.label, sub?.label].filter(Boolean).join(' → ') || 'Soha hali aniqlanmagan'}</p>
                    </Link>
                    <Pill status={s.status} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[#d9d9de]">{answered} ta javob</span>
                    {s.status === 'completed' ? <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[#d9d9de]">{REVIEW[s.review_status] ?? s.review_status}</span> : null}
                    <span className="ml-auto text-[#6e6e76]">{formatShortDateTime(s.completed_at ?? s.started_at ?? s.created_at)}</span>
                  </div>
                  {open && tab !== 'yangi' ? (
                    <div className="mt-4 border-t border-white/[0.06] pt-4">
                      <SessionActions id={s.id} />
                    </div>
                  ) : null}
                  {tab === 'tarix' && !open ? (
                    <div className="mt-4 flex justify-end">
                      <DeleteSession id={s.id} />
                    </div>
                  ) : null}
                </GlassCard>
              );
            })}
          </div>
        ) : tab !== 'yangi' ? (
          <GlassCard className="py-12 text-center">
            <p className={`${display} text-[20px] text-white`}>Hech narsa topilmadi</p>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-[#a8a8ac]">Filtrlarni o‘zgartiring yoki “Yangi tahlil” bo‘limidan suhbat boshlang.</p>
          </GlassCard>
        ) : null}
      </section>

      {tab === 'tarix' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className={`${display} text-[20px] font-medium text-white`}>Qo‘lda o‘tkazilgan tahlillar</p>
              <p className="mt-1 text-[13px] text-[#8e8e96]">Avvalgi usul: menejer savollarni o‘qib beradi, Instagram tahlili ham shu yerda.</p>
            </div>
            <NewProspectForm label="+ Qo‘lda tahlil" />
          </div>
          {legacy.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {legacy.map((p) => (
                <Link key={p.id} href={`/tahlil/${p.id}`} className="group">
                  <GlassCard className="h-full transition-transform duration-300 group-hover:-translate-y-0.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`${display} truncate text-[18px] font-medium text-white group-hover:text-[#d4fc18]`}>{p.name}</p>
                        <p className="mt-1 truncate text-[13px] text-[#8e8e96]">{[p.company, p.instagram ? `@${p.instagram}` : null].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                      <StatusPill status={p.status} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
                      <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[#d9d9de]">{Object.keys((p.answers as object) ?? {}).length} ta javob</span>
                      {(p.analyses ?? []).some((a) => a.kind === 'instagram') ? <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[#d9d9de]">Instagram tahlil qilingan</span> : null}
                      <span className="ml-auto text-[#6e6e76]">{formatShortDateTime(p.created_at)}</span>
                    </div>
                  </GlassCard>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[13.5px] text-[#8e8e96]">Qo‘lda o‘tkazilgan tahlil yo‘q.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
