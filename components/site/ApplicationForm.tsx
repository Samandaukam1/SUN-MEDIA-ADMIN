'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useActionState, useEffect, useId, useRef, useState } from 'react';

import { submitApplication, type ApplicationState } from '@/lib/site/actions';
import type { BudgetOption, SiteSettings } from '@/lib/site/types';
import { SiteIcon } from './SiteIcon';

const EASE = [0.22, 1, 0.36, 1] as const;

export type FormLabels = Pick<
  SiteSettings,
  'form_title' | 'form_subtitle' | 'form_button_label' | 'form_link_label' | 'form_link_placeholder' | 'form_success_title' | 'form_success_text'
>;

/** +998 90 123 45 67 while typing; other country codes keep their digits. */
function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  if (digits.startsWith('998')) {
    const rest = digits.slice(3, 12);
    const parts = [rest.slice(0, 2), rest.slice(2, 5), rest.slice(5, 7), rest.slice(7, 9)].filter(Boolean);
    return `+998${parts.length ? ' ' + parts.join(' ') : ''}`;
  }
  return `+${digits}`;
}

function Field({
  id,
  label,
  icon,
  error,
  children,
  optional,
  multiline,
}: {
  id: string;
  label: string;
  icon: string;
  error?: string;
  children: React.ReactNode;
  optional?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="flex items-center justify-between text-[13px] font-medium text-[#a8a8ac]">
        <span>{label}</span>
        {optional ? <span className="text-[11px] text-[#6e6e76]">ixtiyoriy</span> : null}
      </label>
      <div
        className={`group relative flex rounded-2xl border ${multiline ? 'items-start' : 'items-center'} bg-white/[0.035] transition-all duration-300 focus-within:border-[#d4fc18]/70 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_4px_rgb(212_252_24/0.1)] ${
          error ? 'border-[#ff8a8a]/60' : 'border-white/[0.09] hover:border-white/[0.16]'
        }`}
      >
        <span className={`pointer-events-none pl-4 text-[#6e6e76] transition-colors group-focus-within:text-[#d4fc18] ${multiline ? 'pt-[18px]' : ''}`}>
          <SiteIcon name={icon} size={18} />
        </span>
        {children}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-[12.5px] text-[#ff8a8a]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const input =
  'h-14 w-full min-w-0 bg-transparent px-3 text-[15px] text-white outline-none placeholder:text-[#55555c] autofill:shadow-[inset_0_0_0_1000px_#141416] autofill:[-webkit-text-fill-color:#fff]';

export function ApplicationForm({
  labels,
  budgets,
  source,
  initialService,
  onDone,
  attribution,
  onSuccess,
  failMessage,
}: {
  labels: FormLabels;
  budgets: BudgetOption[];
  source: string;
  /** What the visitor clicked ("Tarif: Standart"): that tariff's budget is chosen in advance. */
  initialService?: string;
  onDone?: () => void;
  /** The ad link's tracking values (the /ariza page): sent with the application; the server keeps known keys only. */
  attribution?: Record<string, string>;
  /** Called once the server confirmed the application; the caller then shows its own confirmation instead of ours. */
  onSuccess?: () => void;
  /** Shown instead of the server's wording when the application could not be saved. */
  failMessage?: string;
}) {
  const uid = useId();
  const [state, action, pending] = useActionState<ApplicationState, FormData>(submitApplication, { status: 'idle' });
  // Every field is controlled: React resets uncontrolled fields after each action, even when it returns errors.
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [brand, setBrand] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [telegram, setTelegram] = useState('');
  const preset = () => budgets.findIndex((b) => initialService?.toLowerCase().includes(b.plan.toLowerCase()));
  const [choice, setChoice] = useState<number>(preset);
  const [custom, setCustom] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => setStartedAt(Date.now()), []);
  const reported = useRef(false);
  useEffect(() => {
    if (state.status !== 'success' || reported.current) return;
    reported.current = true;
    onSuccess?.();
  }, [state.status, onSuccess]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setChoice(preset()), [initialService]);

  const err = state.status === 'error' ? state.fieldErrors ?? {} : {};
  const done = state.status === 'success';
  const own = choice === -1;
  const budgetAmount = own ? custom.replace(/\D/g, '') : String(budgets[choice]?.amount ?? '');
  const budgetLabel = own ? (custom ? `${Number(custom.replace(/\D/g, '')).toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} so‘m` : '') : (budgets[choice]?.label ?? '');

  return (
    <div className="relative">
      <AnimatePresence mode="wait" initial={false}>
        {done && onSuccess ? null : done ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="flex flex-col items-center py-10 text-center"
            role="status"
          >
            <motion.div
              initial={{ scale: 0.4, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }}
              className="mb-6 grid size-20 place-items-center rounded-[26px] bg-[#d4fc18] text-[#0b0b0c] shadow-[0_20px_60px_-10px_rgb(212_252_24/0.6)]"
            >
              <SiteIcon name="check" size={34} strokeWidth={2.4} />
            </motion.div>
            <h3 className="font-display text-[24px] font-medium tracking-tight text-white">{labels.form_success_title}</h3>
            {labels.form_success_text ? <p className="mt-3 max-w-sm text-[15px] text-[#a8a8ac]">{labels.form_success_text}</p> : null}
            {onDone ? (
              <button type="button" onClick={onDone} className="s-btn s-btn-glass lg mt-8 h-12">
                Yopish
              </button>
            ) : null}
          </motion.div>
        ) : (
          <motion.form
            key="form"
            ref={formRef}
            action={action}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="grid gap-5"
            noValidate
          >
            <input type="hidden" name="startedAt" value={startedAt} />
            <input type="hidden" name="source" value={source} />
            <input type="hidden" name="budgetAmount" value={budgetAmount} />
            <input type="hidden" name="budgetLabel" value={budgetLabel} />
            {attribution ? <input type="hidden" name="attribution" value={JSON.stringify(attribution)} /> : null}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                Website
                <input type="text" name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id={`${uid}-first`} label="Ism" icon="user" error={err.firstName}>
                <input id={`${uid}-first`} name="firstName" required maxLength={60} autoComplete="given-name" placeholder="Ismingiz" value={first} onChange={(e) => setFirst(e.target.value)} aria-invalid={!!err.firstName || undefined} className={input} />
              </Field>
              <Field id={`${uid}-last`} label="Familiya" icon="user" error={err.lastName}>
                <input id={`${uid}-last`} name="lastName" required maxLength={60} autoComplete="family-name" placeholder="Familiyangiz" value={last} onChange={(e) => setLast(e.target.value)} aria-invalid={!!err.lastName || undefined} className={input} />
              </Field>
              <Field id={`${uid}-brand`} label="Brend nomi" icon="building" error={err.brand}>
                <input id={`${uid}-brand`} name="brand" required maxLength={120} autoComplete="organization" placeholder="Brend yoki kompaniya" value={brand} onChange={(e) => setBrand(e.target.value)} aria-invalid={!!err.brand || undefined} className={input} />
              </Field>
              <Field id={`${uid}-phone`} label="Telefon raqam" icon="phone" error={err.phone}>
                <input
                  id={`${uid}-phone`}
                  name="phone"
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+998 90 123 45 67"
                  value={phone}
                  onFocus={() => !phone && setPhone('+998 ')}
                  onBlur={() => phone.trim() === '+998' && setPhone('')}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  aria-invalid={!!err.phone || undefined}
                  className={`${input} tabular`}
                />
              </Field>
            </div>

            <div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id={`${uid}-ig`} label="Instagram username" icon="instagram">
                  <input id={`${uid}-ig`} name="instagram" maxLength={80} autoComplete="off" placeholder="@brend" value={instagram} onChange={(e) => setInstagram(e.target.value)} aria-invalid={!!err.social || undefined} className={input} />
                </Field>
                <Field id={`${uid}-tg`} label="Telegram username" icon="telegram">
                  <input id={`${uid}-tg`} name="telegram" maxLength={80} autoComplete="off" placeholder="@username" value={telegram} onChange={(e) => setTelegram(e.target.value)} aria-invalid={!!err.social || undefined} className={input} />
                </Field>
              </div>
              <p className={`mt-2 text-[12.5px] ${err.social ? 'text-[#ff8a8a]' : 'text-[#6e6e76]'}`}>{err.social ?? 'Kamida bittasini yozing.'}</p>
            </div>

            <fieldset className="flex flex-col gap-2.5">
              <legend className="mb-2.5 text-[13px] font-medium text-[#a8a8ac]">Byudjet</legend>
              <div className="flex flex-wrap gap-2">
                {[...budgets.map((b, i) => ({ key: i, label: b.label })), { key: -1, label: 'O‘zim kiritaman' }].map((b) => {
                  const on = choice === b.key;
                  return (
                    <button
                      key={b.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setChoice(on ? -2 : b.key)}
                      className={`rounded-full border px-4 py-2 text-[13.5px] font-medium transition-all duration-300 ${
                        on ? 'border-[#d4fc18] bg-[#d4fc18] text-[#0b0b0c] shadow-[0_8px_24px_-8px_rgb(212_252_24/0.6)]' : 'border-white/[0.1] bg-white/[0.03] text-[#d9d9de] hover:border-white/[0.22]'
                      }`}
                    >
                      {b.label}
                    </button>
                  );
                })}
              </div>
              {own ? (
                <Field id={`${uid}-budget`} label="Oylik byudjet (so‘m)" icon="target" error={err.budget}>
                  <input
                    id={`${uid}-budget`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="5 000 000"
                    value={custom}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
                      setCustom(digits ? Number(digits).toLocaleString('ru-RU').replace(/\u00a0/g, ' ') : '');
                    }}
                    aria-invalid={!!err.budget || undefined}
                    className={`${input} tabular`}
                  />
                </Field>
              ) : err.budget ? (
                <p className="text-[12.5px] text-[#ff8a8a]">{err.budget}</p>
              ) : null}
            </fieldset>

            {state.status === 'error' && !Object.keys(err).length ? (
              <p role="alert" className="rounded-2xl border border-[#ff8a8a]/30 bg-[#ff8a8a]/10 px-4 py-3 text-[14px] text-[#ffb4b4]">
                {failMessage && state.code === 'failed' ? failMessage : state.message}
              </p>
            ) : null}

            <div className="flex flex-col items-start gap-4 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xs text-[12px] leading-relaxed text-[#6e6e76]">
                Yuborish orqali ma’lumotlaringiz faqat siz bilan bog‘lanish uchun ishlatilishiga rozilik bildirasiz.
              </p>
              <button type="submit" disabled={pending} className="s-btn s-btn-lime group w-full sm:w-auto">
                {pending ? <span className="size-4 animate-spin rounded-full border-2 border-[#0b0b0c] border-t-transparent" /> : null}
                <span>{labels.form_button_label}</span>
                {!pending ? (
                  <span className="grid size-7 place-items-center rounded-full bg-black/10 transition-transform duration-500 group-hover:-rotate-45">
                    <SiteIcon name="arrowRight" size={16} strokeWidth={2} />
                  </span>
                ) : null}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
