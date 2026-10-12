'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useActionState, useEffect, useId, useRef, useState } from 'react';

import { submitApplication, type ApplicationState } from '@/lib/site/actions';
import type { SiteSettings } from '@/lib/site/types';
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
  services,
  source,
  initialService,
  onDone,
}: {
  labels: FormLabels;
  services: string[];
  source: string;
  initialService?: string;
  onDone?: () => void;
}) {
  const uid = useId();
  const [state, action, pending] = useActionState<ApplicationState, FormData>(submitApplication, { status: 'idle' });
  // Every field is controlled: React resets uncontrolled fields after each action, even when it returns errors.
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [link, setLink] = useState('');
  const [service, setService] = useState(initialService ?? '');
  const [startedAt, setStartedAt] = useState(0);
  const [canPaste, setCanPaste] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setStartedAt(Date.now());
    setCanPaste(typeof navigator !== 'undefined' && !!navigator.clipboard?.readText);
  }, []);
  useEffect(() => setService(initialService ?? ''), [initialService]);

  const err = state.status === 'error' ? state.fieldErrors ?? {} : {};
  const done = state.status === 'success';

  const pasteLink = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setLink(text.slice(0, 500));
    } catch {
      // Clipboard permission refused: the field stays as it was.
    }
  };

  return (
    <div className="relative">
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
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
            <input type="hidden" name="service" value={service} />
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                Website
                <input type="text" name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id={`${uid}-name`} label="Ismingiz" icon="user" error={err.fullName}>
                <input
                  id={`${uid}-name`}
                  name="fullName"
                  required
                  maxLength={80}
                  autoComplete="name"
                  placeholder="Ism Familiya"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={!!err.fullName || undefined}
                  className={input}
                />
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

            <Field id={`${uid}-company`} label="Kompaniya yoki brend" icon="building" error={err.company} optional>
              <input
                id={`${uid}-company`}
                name="company"
                maxLength={120}
                autoComplete="organization"
                placeholder="Brend nomi"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className={input}
              />
            </Field>

            <Field id={`${uid}-link`} label={labels.form_link_label} icon="link" error={err.link} optional>
              <input
                id={`${uid}-link`}
                name="link"
                inputMode="url"
                autoComplete="url"
                maxLength={500}
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={labels.form_link_placeholder || 'https://'}
                aria-invalid={!!err.link || undefined}
                className={input}
              />
              {canPaste ? (
                <button
                  type="button"
                  onClick={pasteLink}
                  className="mr-2 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white/[0.07] px-3 text-[13px] font-medium text-[#d9d9de] transition-colors hover:bg-[#d4fc18] hover:text-[#0b0b0c]"
                >
                  <SiteIcon name="link" size={14} strokeWidth={2} /> Qo‘yish
                </button>
              ) : null}
            </Field>

            {services.length ? (
              <fieldset className="flex flex-col gap-2.5">
                <legend className="mb-2.5 text-[13px] font-medium text-[#a8a8ac]">Qaysi xizmat kerak?</legend>
                <div className="flex flex-wrap gap-2">
                  {[...services, 'Boshqa'].map((s) => {
                    const on = service === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setService(on ? '' : s)}
                        className={`rounded-full border px-4 py-2 text-[13.5px] font-medium transition-all duration-300 ${
                          on
                            ? 'border-[#d4fc18] bg-[#d4fc18] text-[#0b0b0c] shadow-[0_8px_24px_-8px_rgb(212_252_24/0.6)]'
                            : 'border-white/[0.1] bg-white/[0.03] text-[#d9d9de] hover:border-white/[0.22]'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            <Field id={`${uid}-message`} label="Qisqacha loyiha haqida" icon="message" error={err.message} optional multiline>
              <textarea
                id={`${uid}-message`}
                name="message"
                rows={3}
                maxLength={2000}
                placeholder="Maqsad, muddat, byudjet…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={`${input} h-auto min-h-[104px] resize-none py-4`}
                data-lenis-prevent
              />
            </Field>

            {state.status === 'error' && !Object.keys(err).length ? (
              <p role="alert" className="rounded-2xl border border-[#ff8a8a]/30 bg-[#ff8a8a]/10 px-4 py-3 text-[14px] text-[#ffb4b4]">
                {state.message}
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
