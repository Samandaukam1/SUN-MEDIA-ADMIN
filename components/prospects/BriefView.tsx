'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { runBriefAnalysis } from '@/lib/actions/prospects';
import type { BriefResult } from '@/lib/prospects/analysis';
import { isAnswered, QUESTIONS, readableAnswers, type Answers } from '@/lib/prospects/questions';
import { formatShortDateTime } from '@/lib/time';
import { AiWorking } from './AiWorking';
import type { StudioAnalysis } from './types';
import { CopyButton, HistoryPicker } from './controls';
import { BulletList, display, Eyebrow, GlassCard } from './ui';

const EASE = [0.22, 1, 0.36, 1] as const;

const STEPS = ['Javoblar o‘qilmoqda…', 'Mijozning asl ehtiyoji aniqlanmoqda…', 'Tariflar solishtirilmoqda…', 'Birinchi oy rejasi tuzilmoqda…', 'Mijozga aytiladigan taklif yozilmoqda…'];

/** A ring that fills to `value` percent. */
export function Ring({ value, label }: { value: number; label: string }) {
  const reduce = useReducedMotion();
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-[118px] shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90 overflow-visible">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="7" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#d4fc18"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - value / 100) : c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
          style={{ filter: 'drop-shadow(0 0 6px rgb(212 252 24 / 0.55))' }}
        />
      </svg>
      <div className="text-center">
        <p className={`${display} text-[26px] leading-none text-white tabular-nums`}>{Math.round(value)}%</p>
        <p className="mt-1 text-[10.5px] tracking-[0.14em] text-[#8e8e96] uppercase">{label}</p>
      </div>
    </div>
  );
}

function Section({ title, children, delay = 0 }: { title: string; children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay, ease: EASE }} className="h-full">
      <GlassCard className="h-full">
        <p className="mb-4 text-[12px] font-semibold tracking-[0.18em] text-[#8e8e96] uppercase">{title}</p>
        {children}
      </GlassCard>
    </motion.div>
  );
}

export function BriefView({
  prospectId,
  analyses,
  answers,
  aiReady,
  autoRun,
  onAutoRunDone,
  onEditAnswers,
}: {
  prospectId: string;
  analyses: StudioAnalysis[];
  answers: Answers;
  aiReady: boolean;
  autoRun: boolean;
  onAutoRunDone: () => void;
  onEditAnswers: () => void;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const answered = QUESTIONS.filter((q) => isAnswered(answers[q.key])).length;
  const current = analyses.find((a) => a.id === selected) ?? analyses[0];
  const result = current?.result as BriefResult | undefined;
  const stale = !!current && JSON.stringify((current.input as { answers?: unknown }).answers) !== JSON.stringify(readableAnswers(answers));

  function run() {
    setError(null);
    start(async () => {
      const r = await runBriefAnalysis(prospectId);
      if (!r.ok) setError(r.message);
      else {
        setSelected(null);
        router.refresh();
      }
    });
  }

  const ran = useRef(false);
  useEffect(() => {
    if (autoRun && !ran.current) {
      ran.current = true;
      onAutoRunDone();
      if (aiReady && answered >= 5) run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  if (pending) return <AiWorking steps={STEPS} />;

  const runButton = (label: string) => (
    <button
      type="button"
      onClick={run}
      disabled={!aiReady || answered < 5}
      className="t-shine relative h-12 rounded-full bg-[#d4fc18] px-6 text-[14.5px] font-semibold text-[#0b0b0c] shadow-[0_10px_40px_-8px_rgb(212_252_24/0.55)] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );

  const notice = !aiReady ? (
    <p className="rounded-2xl border border-[#ffcf5c]/30 bg-[#ffcf5c]/[0.07] px-4 py-3 text-[13.5px] text-[#ffdf8c]">
      AI hali ulanmagan: serverga <b>ANTHROPIC_API_KEY</b> qo‘shilgach, tahlil ishlaydi. Javoblar saqlanib turadi.
    </p>
  ) : answered < 5 ? (
    <p className="text-[13.5px] text-[#a8a8ac]">Tahlil uchun kamida 5 ta savolga javob kerak (hozir {answered} ta).</p>
  ) : null;

  if (!current || !result) {
    return (
      <GlassCard className="overflow-hidden py-12 text-center sm:py-16">
        <span aria-hidden className="t-drift pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-[#d4fc18]/10 blur-3xl" />
        <div className="relative">
          <Eyebrow>AI tahlil</Eyebrow>
          <h2 className={`${display} mx-auto mt-3 max-w-xl text-[24px] leading-tight text-white sm:text-[32px]`}>Mijozga aynan nima kerak — AI aytib beradi</h2>
          <p className="mx-auto mt-3 max-w-lg text-[14.5px] text-[#a8a8ac]">
            {answered} / {QUESTIONS.length} ta savolga javob berilgan. AI mos tarifni tanlaydi, mijozning asl ehtiyojini, xavflarni va birinchi oy rejasini yozadi.
          </p>
          <div className="mt-7 flex flex-col items-center gap-3">
            {runButton('AI bilan tahlil qilish ✦')}
            {notice}
            {error ? <p className="text-[13.5px] text-[#ff8a8a]">{error}</p> : null}
            <button type="button" onClick={onEditAnswers} className="text-[13.5px] text-[#a8a8ac] underline-offset-4 hover:text-white hover:underline">
              Savollarga qaytish
            </button>
          </div>
        </div>
      </GlassCard>
    );
  }

  const plan = result.recommended_plan;
  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <HistoryPicker analyses={analyses} current={current.id} onPick={setSelected} />
        <span className="text-[12.5px] text-[#6e6e76]">{formatShortDateTime(current.created_at)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {stale ? <span className="rounded-full bg-[#ffcf5c]/12 px-3 py-1.5 text-[12px] text-[#ffdf8c]">Javoblar o‘zgargan — qayta tahlil qiling</span> : null}
          {runButton('Qayta tahlil ✦')}
        </div>
      </div>
      {notice}
      {error ? <p className="text-[13.5px] text-[#ff8a8a]">{error}</p> : null}

      {/* recommended tariff */}
      <motion.div initial={reduce ? false : { opacity: 0, y: 30, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, ease: EASE }}>
        <div className="relative overflow-hidden rounded-[30px] p-[1.5px] shadow-[0_40px_120px_-50px_rgb(212_252_24/0.55)]">
          <span aria-hidden className="t-aura" />
          <div className="relative rounded-[28.5px] bg-[#0a0a0b]/95 p-6 sm:p-8">
            <span aria-hidden className="t-drift pointer-events-none absolute -top-16 -right-10 size-64 rounded-full bg-[#d4fc18]/15 blur-3xl" />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
              <Ring value={plan.fit} label="mos" />
              <div className="min-w-0 flex-1">
                <Eyebrow>Tavsiya etilgan tarif</Eyebrow>
                <p className={`${display} mt-2 text-[28px] leading-tight break-words text-[#d4fc18] sm:text-[36px]`}>{plan.name || '—'}</p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[#d9d9de]">{plan.why}</p>
                {result.alternative_plan?.name ? (
                  <p className="mt-3 text-[13.5px] text-[#a8a8ac]">
                    Muqobil: <span className="font-semibold text-white">{result.alternative_plan.name}</span> — {result.alternative_plan.why}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title="Xulosa" delay={0.1}>
            {result.client_type ? <p className="mb-2 inline-flex rounded-full bg-white/[0.07] px-3 py-1 text-[12.5px] text-[#d9d9de]">{result.client_type}</p> : null}
            <p className="text-[15.5px] leading-relaxed text-[#e4e4e7]">{result.summary}</p>
          </Section>
        </div>
        <Section title="Xavflar" delay={0.15}>
          <BulletList items={result.risks} tone="red" />
        </Section>
        <Section title="Aslida nima kerak" delay={0.2}>
          <BulletList items={result.needs} />
        </Section>
        <Section title="Nimadan ko‘ngli to‘ladi" delay={0.25}>
          <BulletList items={result.expectations} />
        </Section>
        <Section title="O‘lchanadigan maqsadlar (KPI)" delay={0.3}>
          <BulletList items={result.kpis} tone="silver" />
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Birinchi oy rejasi" delay={0.35}>
          <ol className="space-y-3">
            {result.first_month.map((s, i) => (
              <li key={i} className="flex gap-3 text-[14.5px] leading-relaxed text-[#e4e4e7]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#d4fc18]/14 text-[11.5px] font-bold text-[#d4fc18]">{i + 1}</span>
                <span className="min-w-0 break-words">{s}</span>
              </li>
            ))}
          </ol>
        </Section>
        <Section title="Kontent tarkibi" delay={0.4}>
          <BulletList items={result.content_mix} tone="silver" />
        </Section>
      </div>

      {result.pitch ? (
        <Section title="Mijozga shunday ayting" delay={0.45}>
          <blockquote className={`${display} text-[17px] leading-[1.55] text-white sm:text-[19px]`}>“{result.pitch}”</blockquote>
          <div className="mt-4">
            <CopyButton text={result.pitch} />
          </div>
        </Section>
      ) : null}

      {result.questions_to_clarify.length ? (
        <Section title="Yana aniqlash kerak" delay={0.5}>
          <BulletList items={result.questions_to_clarify} tone="silver" />
        </Section>
      ) : null}
      <p className="text-center text-[11.5px] text-[#5c5c64]">AI tavsiyasi — yakuniy qarorni menejer qabul qiladi.</p>
    </div>
  );
}
