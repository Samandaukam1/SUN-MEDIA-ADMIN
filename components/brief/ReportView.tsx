'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { display, GlassCard } from '@/components/prospects/ui';
import { briefCorrect, briefRegenerate, briefReview } from '@/lib/actions/brief';
import type { Analysis, Basis, Claim } from '@/lib/brief/guard';
import type { Facts, Item, Requirement } from '@/lib/brief/report';
import { STAGE_LABEL, type Stage } from '@/lib/brief/types';
import { formatShortDateTime } from '@/lib/time';

export type ReportRow = {
  id: string;
  version: number;
  status: string;
  facts: Facts | null;
  analysis: Analysis | null;
  model: string | null;
  error: string | null;
  correction: Record<string, { text: string; at: string } | undefined> | null;
  corrected_at: string | null;
  created_at: string;
};
export type AnswerView = { key: string; stage: Stage; category: string; question: string; purpose: string | null; source: string; labels: string[]; unknown: boolean; edits: number };
export type SuggestionView = { id: string; kind: string; status: string; text: string | null; reason: string | null; purpose: string | null; model: string | null; created_at: string };

const BASIS: Record<Basis, { label: string; cls: string }> = {
  confirmed: { label: 'Tasdiqlangan', cls: 'bg-[#d4fc18]/14 text-[#d4fc18]' },
  inferred: { label: 'Xulosa', cls: 'bg-[#60a5fa]/15 text-[#93c5fd]' },
  unknown: { label: 'Noma’lum', cls: 'bg-white/[0.07] text-[#a8a8ac]' },
};
const SOURCE: Record<string, string> = { curated: 'Kutubxona', bank: 'Tahrirlangan', ai: 'AI savoli', rule: 'Aniqlashtirish' };
const STATUS: Record<string, string> = {
  pending: 'Tayyorlanmoqda…',
  ready: 'AI tahlili tayyor',
  no_ai: 'Javoblar asosidagi hisobot — AI tahlili kutilmoqda (AI ulanmagan)',
  failed: 'AI tahlili bajarilmadi — javoblar asosidagi hisobot ko‘rsatilmoqda',
};

function Badge({ basis }: { basis: Basis }) {
  const b = BASIS[basis];
  return <span className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10.5px] font-semibold tracking-wide uppercase ${b.cls}`}>{b.label}</span>;
}

function Evidence({ keys }: { keys: string[] }) {
  if (!keys.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {keys.map((k) => (
        <a key={k} href={`#a-${k}`} className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10.5px] text-[#8e8e96] hover:text-[#d4fc18]">
          {k}
        </a>
      ))}
    </span>
  );
}

function Claims({ items }: { items: (Claim | Item)[] }) {
  if (!items.length) return <p className="text-[13.5px] text-[#6e6e76]">—</p>;
  return (
    <ul className="space-y-3">
      {items.map((c, i) => (
        <li key={i} className="flex gap-3">
          <Badge basis={c.basis} />
          <span className="min-w-0 text-[14.5px] leading-relaxed text-[#e4e4e7]">
            {c.text}
            <Evidence keys={c.evidence} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function List({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-[13.5px] text-[#6e6e76]">—</p>;
  return (
    <ul className="space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-[14.5px] leading-relaxed text-[#e4e4e7]">
          <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[#d4fc18]" />
          <span className="min-w-0">{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** A report section: its letter, the source (client data or AI interpretation) and the manager's correction beside it. */
function Section({
  letter,
  title,
  section,
  source,
  report,
  children,
}: {
  letter: string;
  title: string;
  section: string;
  source: 'answers' | 'ai' | 'both';
  report: ReportRow | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const correction = report?.correction?.[section];
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(correction?.text ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!report) return;
    setBusy(true);
    const r = await briefCorrect(report.id, { section, text }).catch(() => ({ ok: false as const, message: 'Aloqa uzildi.' }));
    setBusy(false);
    if (!r.ok) return alert(r.message);
    setEditing(false);
    router.refresh();
  };
  return (
    <GlassCard className="break-inside-avoid print:border-black/20 print:bg-none print:shadow-none">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${display} text-[18px] font-medium text-white`}>
          <span className="mr-2 text-[#d4fc18]">{letter}.</span>
          {title}
        </h2>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={`rounded-full px-2.5 py-1 ${source === 'answers' ? 'bg-[#d4fc18]/10 text-[#d4fc18]' : 'bg-[#a78bfa]/12 text-[#c4b5fd]'}`}>
            {source === 'answers' ? 'Mijoz javoblari' : source === 'ai' ? 'AI talqini' : 'Javoblar + AI talqini'}
          </span>
          {report ? (
            <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-full border border-white/12 px-3 py-1 text-[#d9d9de] hover:border-[#d4fc18]/50 print:hidden">
              {correction ? 'Tuzatishni o‘zgartirish' : 'Tuzatish'}
            </button>
          ) : null}
        </div>
      </div>
      {correction && !editing ? (
        <div className="mb-4 rounded-[16px] border border-[#fbbf24]/25 bg-[#fbbf24]/[0.06] p-4">
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-[#fbbf24] uppercase">Menejer tuzatgan · {formatShortDateTime(correction.at)}</p>
          <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-[#f4f4f5]">{correction.text}</p>
          <p className="mt-2 text-[12px] text-[#8e8e96]">Asl matn quyida o‘zgarishsiz saqlanadi.</p>
        </div>
      ) : null}
      {editing ? (
        <div className="mb-4 space-y-2 print:hidden">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="To‘g‘ri ma’lumotni yozing. Bo‘sh qoldirsangiz, tuzatish olib tashlanadi."
            className="w-full rounded-[14px] border border-white/12 bg-[#0b0b0c] p-3 text-[14px] text-white outline-none focus:border-[#d4fc18]"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-full px-4 text-[13px] text-[#a8a8ac]">
              Bekor
            </button>
            <button type="button" disabled={busy} onClick={save} className="h-9 rounded-full bg-[#d4fc18] px-5 text-[13px] font-semibold text-[#0b0b0c] disabled:opacity-50">
              Saqlash
            </button>
          </div>
        </div>
      ) : null}
      <div className={correction && !editing ? 'opacity-70' : ''}>{children}</div>
    </GlassCard>
  );
}

function ReqTable({ title, items, tone }: { title: string; items: Requirement[]; tone: string }) {
  return (
    <div>
      <p className={`mb-2 text-[11.5px] font-semibold tracking-[0.14em] uppercase ${tone}`}>
        {title} · {items.length}
      </p>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((r) => (
            <li key={r.id} className="text-[14px] leading-relaxed text-[#e4e4e7]">
              {r.title}
              <Evidence keys={r.evidence} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-[#6e6e76]">—</p>
      )}
    </div>
  );
}

export function ReportView({
  sessionId,
  completed,
  reviewStatus,
  notes,
  reports,
  answers,
  suggestions,
  events,
}: {
  sessionId: string;
  completed: boolean;
  reviewStatus: string;
  notes: string;
  reports: ReportRow[];
  answers: AnswerView[];
  suggestions: SuggestionView[];
  events: { id: number; kind: string; created_at: string }[];
}) {
  const router = useRouter();
  const [pick, setPick] = useState(reports[0]?.id ?? null);
  const report = reports.find((r) => r.id === pick) ?? reports[0] ?? null;
  const f = report?.facts && 'profile' in (report.facts as object) ? report.facts : null;
  const a = report?.status === 'ready' ? report.analysis : null;
  const [noteText, setNoteText] = useState(notes);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const call = async (name: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(name);
    setMsg(null);
    const r = await fn().catch(() => ({ ok: false, message: 'Aloqa uzildi.' }));
    setBusy(null);
    setMsg(r.ok ? 'Saqlandi.' : (r.message ?? 'Bajarib bo‘lmadi.'));
    if (r.ok) router.refresh();
  };

  const byStage = answers.reduce<Record<string, AnswerView[]>>((acc, x) => ((acc[x.stage] ??= []).push(x), acc), {});
  const profile = f?.profile ?? {};
  const PROFILE: [string, string][] = [
    ['company', 'Kompaniya'],
    ['industry', 'Soha'],
    ['sub_industry', 'Yo‘nalish'],
    ['offer', 'Asosiy mahsulot / xizmat'],
    ['customers', 'Mijozlar'],
    ['model', 'Biznes modeli'],
    ['geography', 'Hudud'],
    ['maturity', 'Faoliyat muddati'],
    ['role', 'Javob bergan shaxs'],
    ['description', 'O‘zi yozgan tavsif'],
  ];

  return (
    <div className="space-y-6">
      <GlassCard className="print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] text-[#a8a8ac]">
            Ko‘rib chiqish:
            <select
              defaultValue={reviewStatus}
              onChange={(e) => call('review', () => briefReview(sessionId, { review: e.target.value }))}
              className="h-9 rounded-full border border-white/12 bg-[#0b0b0c] px-3 text-[13px] text-white outline-none focus:border-[#d4fc18]"
            >
              <option value="new">Ko‘rilmagan</option>
              <option value="reviewing">Ko‘rib chiqilmoqda</option>
              <option value="reviewed">Ko‘rib chiqilgan</option>
            </select>
          </label>
          {reports.length > 1 ? (
            <select value={report?.id ?? ''} onChange={(e) => setPick(e.target.value)} aria-label="Hisobot versiyasi" className="h-9 rounded-full border border-white/12 bg-[#0b0b0c] px-3 text-[13px] text-white outline-none">
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.version}-versiya · {formatShortDateTime(r.created_at)}
                </option>
              ))}
            </select>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2">
            {completed ? (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => call('regen', () => briefRegenerate(sessionId))}
                className="h-9 rounded-full border border-white/12 px-4 text-[13px] text-[#d9d9de] hover:border-[#d4fc18]/50 disabled:opacity-50"
              >
                {busy === 'regen' ? '…' : 'Tahlilni qayta yaratish'}
              </button>
            ) : null}
            <button type="button" onClick={() => window.print()} className="h-9 rounded-full border border-white/12 px-4 text-[13px] text-[#d9d9de] hover:border-[#d4fc18]/50">
              Chop etish / PDF
            </button>
          </div>
        </div>
        {report ? (
          <p className="mt-3 text-[12.5px] text-[#8e8e96]">
            {STATUS[report.status] ?? report.status}
            {report.model ? ` · model: ${report.model}` : ''}
            {report.error ? ` · ${report.error}` : ''}
            {a?.sanitized ? ` · ${a.sanitized} ta asossiz da’vo olib tashlandi` : ''}
          </p>
        ) : null}
        {msg ? <p className="mt-2 text-[12.5px] text-[#a8a8ac]">{msg}</p> : null}
      </GlassCard>

      {!completed ? (
        <GlassCard>
          <p className="text-[14px] text-[#a8a8ac]">Suhbat hali yakunlanmagan. Hisobot mijoz javoblarni yuborgandan keyin tayyorlanadi. Hozirgacha berilgan javoblar pastda.</p>
        </GlassCard>
      ) : null}

      {completed && report && f ? (
        <div className="space-y-4">
          <Section letter="A" title="Mijoz profili" section="profile" source="answers" report={report}>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {PROFILE.filter(([k]) => profile[k]).map(([k, label]) => (
                <div key={k}>
                  <dt className="text-[12px] text-[#8e8e96]">{label}</dt>
                  <dd className="text-[14.5px] text-[#f4f4f5]">{profile[k]}</dd>
                </div>
              ))}
            </dl>
            {a?.profile_summary ? <p className="mt-4 border-t border-white/[0.06] pt-4 text-[14.5px] leading-relaxed text-[#d9d9de]">{a.profile_summary}</p> : null}
          </Section>
          <Section letter="B" title="Biznes qanday ishlaydi?" section="business" source={a ? 'ai' : 'answers'} report={report}>
            <Claims items={a?.how_business_works.length ? a.how_business_works : f.operations.slice(0, 10)} />
          </Section>
          <Section letter="C" title="Asosiy maqsadlar" section="goals" source={a ? 'ai' : 'answers'} report={report}>
            <Claims items={a?.goals.length ? a.goals : f.goals} />
          </Section>
          <Section letter="D" title="Aniqlangan muammolar" section="problems" source={a ? 'ai' : 'answers'} report={report}>
            <Claims items={a?.problems.length ? a.problems : f.problems} />
            {f.notes.length ? (
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <Claims items={f.notes} />
              </div>
            ) : null}
          </Section>
          <Section letter="E" title="Marketing holati" section="marketing" source={a ? 'both' : 'answers'} report={report}>
            <Claims items={f.marketing} />
            {a ? (
              <div className="mt-5 grid gap-5 border-t border-white/[0.06] pt-5 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-[12px] font-semibold text-[#ff9c9c]">Zaif tomonlar</p>
                  <Claims items={a.marketing_weaknesses} />
                </div>
                <div>
                  <p className="mb-2 text-[12px] font-semibold text-[#d4fc18]">Imkoniyatlar</p>
                  <Claims items={a.marketing_opportunities} />
                </div>
              </div>
            ) : null}
          </Section>
          <Section letter="F" title="Tavsiya etiladigan xizmatlar" section="services" source={a ? 'ai' : 'answers'} report={report}>
            <ul className="space-y-3">
              {(a?.services.length ? a.services : f.services).map((s) => (
                <li key={s.service} className="flex gap-3">
                  <Badge basis={s.basis} />
                  <span className="min-w-0 text-[14.5px] leading-relaxed text-[#e4e4e7]">
                    <b className="text-white">{s.service}</b> — {s.reason}
                    <Evidence keys={s.evidence} />
                  </span>
                </li>
              ))}
              {!(a?.services.length || f.services.length) ? <li className="text-[13.5px] text-[#6e6e76]">Javoblarga asoslangan tavsiya chiqmadi.</li> : null}
            </ul>
          </Section>
          {f.website ? (
            <Section letter="G" title={`Sayt uchun texnik talablar — ${f.website.need}`} section="website" source={a?.website ? 'both' : 'answers'} report={report}>
              {f.website.goals.length ? <p className="mb-4 text-[14px] text-[#d9d9de]">Asosiy maqsad: {f.website.goals.join(', ')}</p> : null}
              <div className="grid gap-5 sm:grid-cols-2">
                <ReqTable title="Must have" items={f.website.must} tone="text-[#d4fc18]" />
                <ReqTable title="Should have" items={f.website.should} tone="text-[#93c5fd]" />
                <ReqTable title="Nice to have" items={f.website.nice} tone="text-[#c4b5fd]" />
                <ReqTable title="Not needed" items={f.website.notNeeded} tone="text-[#8e8e96]" />
              </div>
              {f.website.unknown.length ? (
                <div className="mt-5">
                  <p className="mb-2 text-[11.5px] font-semibold tracking-[0.14em] text-[#fbbf24] uppercase">Unknown</p>
                  <List items={f.website.unknown} />
                </div>
              ) : null}
              {f.website.assumptions.length ? (
                <div className="mt-5">
                  <p className="mb-2 text-[12px] font-semibold text-[#a8a8ac]">Taxminlar (tasdiqlanmagan)</p>
                  <List items={f.website.assumptions} />
                </div>
              ) : null}
              {f.website.details.length ? (
                <div className="mt-5 border-t border-white/[0.06] pt-5">
                  <p className="mb-2 text-[12px] font-semibold text-[#a8a8ac]">Mijozning sayt bo‘yicha javoblari</p>
                  <ul className="space-y-1.5">
                    {f.website.details.map((d) => (
                      <li key={d.key} className="text-[13.5px] text-[#d9d9de]">
                        <span className="text-[#8e8e96]">{d.question}</span> — {d.labels.join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {a?.website ? (
                <div className="mt-5 grid gap-5 border-t border-white/[0.06] pt-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[12px] font-semibold text-[#c4b5fd]">Sahifalar (AI taklifi)</p>
                    <List items={a.website.pages} />
                  </div>
                  <div>
                    <p className="mb-2 text-[12px] font-semibold text-[#c4b5fd]">Amalga oshirish ustuvorligi</p>
                    <List items={a.website.priorities} />
                  </div>
                  <div className="sm:col-span-2">
                    <p className="mb-2 text-[12px] font-semibold text-[#c4b5fd]">Hal qilinmagan savollar</p>
                    <List items={a.website.unresolved} />
                  </div>
                </div>
              ) : null}
            </Section>
          ) : null}
          <Section letter="H" title="Uchrashuvda aniqlashtiriladigan savollar" section="meeting" source={a ? 'both' : 'answers'} report={report}>
            <List items={[...(a?.meeting_questions ?? []), ...f.openQuestions]} />
          </Section>
          <Section letter="I" title="Xulosa" section="conclusion" source={a ? 'ai' : 'answers'} report={report}>
            {a?.conclusion ? (
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-[#f4f4f5]">{a.conclusion}</p>
            ) : (
              <p className="text-[14px] text-[#a8a8ac]">AI xulosasi hali yo‘q. Yuqoridagi bo‘limlar faqat mijoz javoblari va aniq qoidalar asosida tuzilgan.</p>
            )}
          </Section>
        </div>
      ) : completed ? (
        <GlassCard>
          <p className="text-[14px] text-[#a8a8ac]">Hisobot tayyorlanmoqda. Bir daqiqadan so‘ng sahifani yangilang.</p>
        </GlassCard>
      ) : null}

      <GlassCard className="print:hidden">
        <p className={`${display} mb-3 text-[18px] font-medium text-white`}>Ichki eslatmalar</p>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={4}
          maxLength={8000}
          placeholder="Faqat SUN MEDIA jamoasi ko‘radi."
          className="w-full rounded-[14px] border border-white/12 bg-[#0b0b0c] p-3 text-[14px] text-white outline-none focus:border-[#d4fc18]"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={!!busy || noteText === notes}
            onClick={() => call('notes', () => briefReview(sessionId, { notes: noteText }))}
            className="h-9 rounded-full bg-[#d4fc18] px-5 text-[13px] font-semibold text-[#0b0b0c] disabled:opacity-40"
          >
            Saqlash
          </button>
        </div>
      </GlassCard>

      <GlassCard>
        <p className={`${display} mb-1 text-[18px] font-medium text-white`}>Mijoz javoblari</p>
        <p className="mb-5 text-[12.5px] text-[#8e8e96]">Mijoz ko‘rgan savol matni va o‘z javobi — o‘zgartirilmaydi.</p>
        <div className="space-y-6">
          {Object.entries(byStage).map(([stage, list]) => (
            <div key={stage}>
              <p className="mb-3 text-[11.5px] font-semibold tracking-[0.16em] text-[#d4fc18] uppercase">{STAGE_LABEL[stage as Stage] ?? stage}</p>
              <ol className="space-y-3">
                {list.map((x) => (
                  <li key={x.key} id={`a-${x.key}`} className="scroll-mt-24 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-3.5 target:border-[#d4fc18]/60">
                    <p className="text-[13px] text-[#a8a8ac]">
                      {x.question}
                      <span className="ml-2 font-mono text-[10.5px] text-[#5e5e66]">{x.key}</span>
                    </p>
                    <p className={`mt-1 text-[14.5px] ${x.unknown ? 'text-[#fbbf24]' : 'text-[#f4f4f5]'}`}>{x.labels.join(', ')}</p>
                    <p className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-[#6e6e76]">
                      <span>{SOURCE[x.source] ?? x.source}</span>
                      {x.edits ? <span>· {x.edits} marta o‘zgartirilgan</span> : null}
                      {x.purpose ? <span className="print:hidden">· Maqsad: {x.purpose}</span> : null}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {!answers.length ? <p className="text-[13.5px] text-[#6e6e76]">Hali javob yo‘q.</p> : null}
        </div>
      </GlassCard>

      {suggestions.length || events.length ? (
        <GlassCard className="print:hidden">
          <p className={`${display} mb-4 text-[18px] font-medium text-white`}>AI va jarayon jurnali</p>
          {suggestions.length ? (
            <ul className="mb-5 space-y-2">
              {suggestions.map((s) => (
                <li key={s.id} className="rounded-[12px] bg-white/[0.03] p-3 text-[13px] text-[#d9d9de]">
                  <span className="text-[#8e8e96]">
                    {s.kind === 'followup' ? 'Aniqlashtirish' : s.kind === 'gaps' ? 'Yetishmayotgan ma’lumot' : 'Tasniflash'} ·{' '}
                    {s.status === 'asked' ? 'so‘raldi' : s.status === 'pending' ? 'navbatda' : s.status === 'rejected' ? 'rad etildi' : 'savol kerak emas'}
                    {s.model ? ` · ${s.model}` : ''} · {formatShortDateTime(s.created_at)}
                  </span>
                  {s.text ? <span className="mt-1 block">{s.text}</span> : null}
                  {s.purpose ? <span className="mt-0.5 block text-[12px] text-[#8e8e96]">Maqsad: {s.purpose}</span> : null}
                  {s.reason ? <span className="mt-0.5 block text-[12px] text-[#fbbf24]">Sabab: {s.reason}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="space-y-1 text-[12.5px] text-[#8e8e96]">
            {events.map((e) => (
              <li key={e.id}>
                {formatShortDateTime(e.created_at)} — {EVENT[e.kind] ?? e.kind}
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}
    </div>
  );
}

const EVENT: Record<string, string> = {
  started: 'Suhbat boshlandi',
  resumed: 'Shu qurilmada davom ettirildi',
  device_link: 'Boshqa qurilma uchun havola yaratildi',
  answer_changed: 'Mijoz javobni o‘zgartirdi',
  answer_dropped: 'Oldingi javob o‘zgargani uchun keraksiz bo‘lib qolgan javob chiqarildi',
  completed: 'Mijoz javoblarni yubordi',
  closed: 'Suhbat yopildi',
  review: 'Ko‘rib chiqish holati o‘zgardi',
  correction: 'Hisobot tuzatildi',
};
