'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { saveAnswers } from '@/lib/actions/prospects';
import { isAnswered, QUESTIONS, type Answer, type Answers } from '@/lib/prospects/questions';
import { display } from './ui';

const EASE = [0.22, 1, 0.36, 1] as const;
const empty: Answer = { options: [], custom: '' };

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * The interview, one question at a time like a test: read the question aloud, tick what the client says, or type
 * their own words when nothing fits. Every change is saved on its own (a second after the last touch).
 */
export function Questionnaire({
  prospectId,
  initial,
  onChange,
  onFinish,
}: {
  prospectId: string;
  initial: Answers;
  onChange: (answers: Answers) => void;
  onFinish: (answers: Answers) => void;
}) {
  const reduce = useReducedMotion();
  const [answers, setAnswers] = useState<Answers>(initial);
  const firstOpen = QUESTIONS.findIndex((q) => !isAnswered(initial[q.key]));
  const [step, setStep] = useState(firstOpen === -1 ? QUESTIONS.length - 1 : firstOpen);
  const [direction, setDirection] = useState(1);
  const [save, setSave] = useState<{ state: SaveState; message?: string }>({ state: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(answers);

  const q = QUESTIONS[step];
  const answer = answers[q.key] ?? empty;
  const answeredCount = QUESTIONS.filter((x) => isAnswered(answers[x.key])).length;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSave({ state: 'saving' });
    const result = await saveAnswers(prospectId, latest.current);
    setSave(result.ok ? { state: 'saved' } : { state: 'error', message: result.message });
    return result.ok;
  }, [prospectId]);

  // Leaving the tab with a change still waiting: save it now.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void saveAnswers(prospectId, latest.current);
      }
    },
    [prospectId],
  );

  function update(next: Answer) {
    const all = { ...answers, [q.key]: next };
    setAnswers(all);
    onChange(all);
    latest.current = all;
    setSave({ state: 'saving' });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 900);
  }

  function toggle(key: string) {
    if (!q.multiple) {
      update({ ...answer, options: answer.options[0] === key ? [] : [key] });
      return;
    }
    if (answer.options.includes(key)) update({ ...answer, options: answer.options.filter((k) => k !== key) });
    else if (!q.max || answer.options.length < q.max) update({ ...answer, options: [...answer.options, key] });
  }

  function go(to: number) {
    if (to < 0 || to >= QUESTIONS.length) return;
    setDirection(to > step ? 1 : -1);
    setStep(to);
  }

  async function finish() {
    const ok = timer.current ? await flush() : save.state !== 'error' || (await flush());
    if (ok) onFinish(latest.current);
  }

  const atMax = !!q.max && answer.options.length >= q.max;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        {/* progress */}
        <div className="flex items-center justify-between gap-3 text-[12.5px]">
          <span className="font-semibold text-[#d4fc18]">
            Savol {step + 1} / {QUESTIONS.length}
          </span>
          <span className="text-[#8e8e96]">
            {save.state === 'saving' ? 'Saqlanmoqda…' : save.state === 'saved' ? 'Saqlandi ✓' : save.state === 'error' ? <span className="text-[#ff8a8a]">{save.message}</span> : `${answeredCount} ta javob`}
          </span>
        </div>
        <div className="mt-3 flex gap-1">
          {QUESTIONS.map((x, i) => (
            <button
              key={x.key}
              type="button"
              onClick={() => go(i)}
              title={x.title}
              aria-label={`${i + 1}-savol: ${x.title}`}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i === step ? 'bg-[#d4fc18]' : isAnswered(answers[x.key]) ? 'bg-[#d4fc18]/40' : 'bg-white/10 hover:bg-white/20'}`}
            />
          ))}
        </div>

        <div className="relative mt-6 min-h-[420px]">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={q.key}
              custom={direction}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgb(255_255_255/0.06),rgb(255_255_255/0.015))] p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] sm:p-8"
            >
              <p className="text-[11.5px] font-semibold tracking-[0.2em] text-[#8e8e96] uppercase">{q.title}</p>
              <h2 className={`${display} mt-3 text-[22px] leading-[1.25] font-medium text-white sm:text-[28px]`}>“{q.ask}”</h2>
              <p className="mt-2 text-[13px] text-[#8e8e96]">
                {q.hint ?? (q.multiple ? 'Bir nechtasini tanlash mumkin.' : 'Bittasini tanlang.')}
                {q.max ? ` ${answer.options.length}/${q.max}` : ''}
              </p>

              <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {q.options.map((o, i) => {
                  const on = answer.options.includes(o.key);
                  const order = q.multiple && on ? answer.options.indexOf(o.key) + 1 : null;
                  const disabled = !on && q.multiple && atMax;
                  return (
                    <motion.button
                      key={o.key}
                      type="button"
                      onClick={() => toggle(o.key)}
                      disabled={disabled}
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.04 * i, ease: EASE }}
                      whileTap={{ scale: 0.98 }}
                      aria-pressed={on}
                      className={`group flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[14.5px] leading-snug transition-colors ${
                        on
                          ? 'border-[#d4fc18] bg-[#d4fc18]/10 text-white shadow-[0_0_0_3px_rgb(212_252_24/0.12)]'
                          : 'border-white/[0.09] bg-white/[0.03] text-[#d9d9de] hover:border-white/25 hover:bg-white/[0.06]'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <span
                        className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold transition-colors ${
                          on ? 'bg-[#d4fc18] text-[#0b0b0c]' : 'bg-white/[0.07] text-[#8e8e96] group-hover:text-white'
                        }`}
                      >
                        {on ? (order ?? '✓') : String.fromCharCode(65 + i)}
                      </span>
                      <span className="min-w-0 break-words">{o.label}</span>
                    </motion.button>
                  );
                })}
              </div>

              <label className="mt-5 block">
                <span className="text-[12.5px] text-[#a8a8ac]">Mos javob yo‘qmi yoki qo‘shimcha bormi? O‘zingiz yozing</span>
                <textarea
                  value={answer.custom}
                  onChange={(e) => update({ ...answer, custom: e.target.value.slice(0, 1000) })}
                  rows={2}
                  placeholder="Mijozning o‘z so‘zlari…"
                  className="mt-1.5 w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-[14.5px] text-white outline-none placeholder:text-[#5c5c64] focus:border-[#d4fc18] focus:shadow-[0_0_0_4px_rgb(212_252_24/0.12)]"
                />
              </label>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => go(step - 1)}
                  disabled={step === 0}
                  className="h-12 rounded-full border border-white/12 px-5 text-[14px] text-[#d9d9de] transition-colors hover:border-white/30 disabled:opacity-30"
                >
                  ← Oldingi
                </button>
                {step < QUESTIONS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => go(step + 1)}
                    className="h-12 rounded-full bg-white px-6 text-[14.5px] font-semibold text-[#0b0b0c] transition-transform hover:scale-[1.02]"
                  >
                    {isAnswered(answer) ? 'Keyingi →' : 'O‘tkazib yuborish →'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void finish()}
                  disabled={answeredCount < 5}
                  title={answeredCount < 5 ? 'Kamida 5 ta savolga javob kerak' : undefined}
                  className={`t-shine relative ml-auto h-12 rounded-full px-6 text-[14.5px] font-semibold transition-transform disabled:cursor-not-allowed disabled:opacity-40 ${
                    step === QUESTIONS.length - 1 ? 'bg-[#d4fc18] text-[#0b0b0c] hover:scale-[1.02]' : 'border border-[#d4fc18]/40 text-[#d4fc18] hover:bg-[#d4fc18]/10'
                  }`}
                >
                  AI tahlilga o‘tish ✦
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* all questions at a glance */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-3">
          <p className="px-2 pt-1 pb-2 text-[11.5px] font-semibold tracking-[0.18em] text-[#6e6e76] uppercase">Savollar</p>
          <ol className="space-y-0.5">
            {QUESTIONS.map((x, i) => {
              const done = isAnswered(answers[x.key]);
              return (
                <li key={x.key}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] transition-colors ${
                      i === step ? 'bg-white/[0.07] text-white' : 'text-[#a8a8ac] hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-bold ${done ? 'bg-[#d4fc18] text-[#0b0b0c]' : 'bg-white/[0.07] text-[#6e6e76]'}`}
                    >
                      {done ? '✓' : i + 1}
                    </span>
                    <span className="truncate">{x.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>
    </div>
  );
}
