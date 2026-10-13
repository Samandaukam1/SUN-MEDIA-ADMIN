'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { deleteProspect, updateProspect } from '@/lib/actions/prospects';
import { isAnswered, QUESTIONS, type Answers } from '@/lib/prospects/questions';
import { BriefView } from './BriefView';
import { InstagramView } from './InstagramView';
import { Questionnaire } from './Questionnaire';
import type { StudioAnalysis } from './types';
import { display, Eyebrow, STATUS_OPTIONS } from './ui';

export type { StudioAnalysis } from './types';

type Prospect = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  instagram: string | null;
  status: string;
  answers: Answers;
  notes: string | null;
  created_at: string;
};

type Tab = 'questions' | 'brief' | 'instagram';

const input =
  'h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 text-[14.5px] text-white outline-none placeholder:text-[#5c5c64] focus:border-[#d4fc18] focus:shadow-[0_0_0_4px_rgb(212_252_24/0.12)]';

/** One prospect: the interview, the AI's reading of it, and the Instagram audit — three tabs. */
export function ProspectStudio({ prospect, analyses, aiReady }: { prospect: Prospect; analyses: StudioAnalysis[]; aiReady: boolean }) {
  const router = useRouter();
  const briefs = analyses.filter((a) => a.kind === 'brief');
  const audits = analyses.filter((a) => a.kind === 'instagram');
  const [answers, setAnswers] = useState<Answers>(prospect.answers);
  const answered = QUESTIONS.filter((q) => isAnswered(answers[q.key])).length;
  const [tab, setTab] = useState<Tab>(briefs.length ? 'brief' : 'questions');
  const [autoRun, setAutoRun] = useState(false);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState({ name: prospect.name, company: prospect.company ?? '', phone: prospect.phone ?? '', instagram: prospect.instagram ?? '', notes: prospect.notes ?? '' });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const tabs: { key: Tab; label: string; short: string; note: string }[] = [
    { key: 'questions', label: 'Suhbat savollari', short: 'Savollar', note: `${answered}/${QUESTIONS.length}` },
    { key: 'brief', label: 'AI tahlil va tarif', short: 'AI tahlil', note: briefs.length ? '✓' : '' },
    { key: 'instagram', label: 'Instagram tahlili', short: 'Instagram', note: audits.length ? '✓' : '' },
  ];

  function saveDetails() {
    setMessage(null);
    start(async () => {
      const r = await updateProspect(prospect.id, details);
      if (!r.ok) setMessage(r.message);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function setStatus(status: string) {
    start(async () => {
      const r = await updateProspect(prospect.id, { status });
      if (!r.ok) setMessage(r.message);
      else router.refresh();
    });
  }

  function remove() {
    if (!confirm(`“${prospect.name}” tahlili butunlay o‘chirilsinmi? Javoblar, AI xulosalari va skrinshotlar o‘chadi.`)) return;
    start(async () => {
      const r = await deleteProspect(prospect.id);
      if (!r.ok) setMessage(r.message);
      else router.push('/tahlil');
    });
  }

  return (
    <div className="space-y-7">
      <div>
        <Link href="/tahlil" className="text-[13px] text-[#8e8e96] transition-colors hover:text-[#d4fc18]">
          ← Barcha tahlillar
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>Mijoz tahlili</Eyebrow>
            <h1 className={`${display} mt-2 text-[30px] leading-[1.08] font-medium break-words text-white sm:text-[42px]`}>{prospect.name}</h1>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13.5px] text-[#a8a8ac]">
              {prospect.company ? <span>{prospect.company}</span> : null}
              {prospect.phone ? (
                <a href={`tel:${prospect.phone.replace(/[^\d+]/g, '')}`} className="hover:text-white">
                  {prospect.phone}
                </a>
              ) : null}
              {prospect.instagram ? (
                <a href={`https://instagram.com/${encodeURIComponent(prospect.instagram)}`} target="_blank" rel="noreferrer" className="text-[#d4fc18] hover:underline">
                  @{prospect.instagram}
                </a>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={prospect.status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={busy}
              aria-label="Holat"
              className="h-10 rounded-full border border-white/12 bg-[#0b0b0c] px-4 text-[13px] text-white outline-none focus:border-[#d4fc18]"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setEditing((v) => !v)} className="h-10 rounded-full border border-white/12 px-4 text-[13px] text-[#d9d9de] hover:border-white/30">
              {editing ? 'Yopish' : 'Ma’lumotlar'}
            </button>
            <button type="button" onClick={remove} disabled={busy} className="h-10 rounded-full px-3 text-[13px] text-[#ff9c9c] hover:bg-[#ff8a8a]/10">
              O‘chirish
            </button>
          </div>
        </div>
        {message ? <p className="mt-3 text-[13.5px] text-[#ff8a8a]">{message}</p> : null}

        {editing ? (
          <div className="mt-5 grid gap-3 rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-[12.5px] text-[#a8a8ac]">
              Ism yoki brend
              <input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} maxLength={120} className={`${input} mt-1`} />
            </label>
            <label className="text-[12.5px] text-[#a8a8ac]">
              Kompaniya
              <input value={details.company} onChange={(e) => setDetails({ ...details, company: e.target.value })} maxLength={160} className={`${input} mt-1`} />
            </label>
            <label className="text-[12.5px] text-[#a8a8ac]">
              Telefon
              <input value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} maxLength={40} className={`${input} mt-1`} />
            </label>
            <label className="text-[12.5px] text-[#a8a8ac]">
              Instagram
              <input value={details.instagram} onChange={(e) => setDetails({ ...details, instagram: e.target.value })} maxLength={120} className={`${input} mt-1`} />
            </label>
            <label className="text-[12.5px] text-[#a8a8ac] sm:col-span-2 lg:col-span-4">
              Izoh (faqat jamoa uchun)
              <textarea
                value={details.notes}
                onChange={(e) => setDetails({ ...details, notes: e.target.value.slice(0, 4000) })}
                rows={3}
                className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3.5 py-3 text-[14.5px] text-white outline-none focus:border-[#d4fc18]"
              />
            </label>
            <div className="sm:col-span-2 lg:col-span-4">
              <button type="button" onClick={saveDetails} disabled={busy} className="h-11 rounded-full bg-[#d4fc18] px-6 text-[14px] font-semibold text-[#0b0b0c] disabled:opacity-60">
                {busy ? 'Saqlanmoqda…' : 'Saqlash'}
              </button>
            </div>
          </div>
        ) : prospect.notes ? (
          <p className="mt-4 max-w-3xl rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-[13.5px] whitespace-pre-line text-[#a8a8ac]">{prospect.notes}</p>
        ) : null}
      </div>

      {/* tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1 sm:inline-flex">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-semibold whitespace-nowrap transition-colors sm:justify-start sm:gap-2 sm:px-5 sm:text-[13.5px] ${
              tab === t.key ? 'text-[#0b0b0c]' : 'text-[#a8a8ac] hover:text-white'
            }`}
          >
            {tab === t.key ? <motion.span layoutId="prospect-tab" className="absolute inset-0 rounded-full bg-[#d4fc18]" transition={{ type: 'spring', stiffness: 380, damping: 32 }} /> : null}
            <span className="relative truncate">
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">
                {i + 1}. {t.label}
              </span>
            </span>
            {t.note ? <span className={`relative hidden text-[11.5px] min-[400px]:inline ${tab === t.key ? 'text-[#0b0b0c]/70' : 'text-[#6e6e76]'}`}>{t.note}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'questions' ? (
        <Questionnaire
          prospectId={prospect.id}
          initial={answers}
          onChange={setAnswers}
          onFinish={(a) => {
            setAnswers(a);
            setAutoRun(true);
            setTab('brief');
            router.refresh();
          }}
        />
      ) : tab === 'brief' ? (
        <BriefView
          prospectId={prospect.id}
          analyses={briefs}
          answers={answers}
          aiReady={aiReady}
          autoRun={autoRun}
          onAutoRunDone={() => setAutoRun(false)}
          onEditAnswers={() => setTab('questions')}
        />
      ) : (
        <InstagramView prospectId={prospect.id} handle={prospect.instagram} analyses={audits} aiReady={aiReady} />
      )}
    </div>
  );
}
