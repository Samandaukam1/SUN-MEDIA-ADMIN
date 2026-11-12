'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { display, GlassCard } from '@/components/prospects/ui';
import { briefBankSave } from '@/lib/actions/brief';
import { STAGE_LABEL, STAGES, type Cond, type Option, type Question, type Stage } from '@/lib/brief/types';
import { formatShortDateTime } from '@/lib/time';

export type BankItem = Question & { origin: 'builtin' | 'edited' | 'new'; versions: { version: number; active: boolean; note: string | null; created_at: string }[] };

const TYPES: Record<string, string> = { single: 'Bitta tanlov', multi: 'Bir nechta tanlov', rank: 'Tartiblab tanlash', yesno: 'Ha / Yo‘q', text: 'Qisqa matn', number: 'Son' };
const field = 'h-10 w-full rounded-[12px] border border-white/12 bg-[#0b0b0c] px-3 text-[13.5px] text-white outline-none focus:border-[#d4fc18]';

/** One simple condition the editor can show and write: "only when <question> is one of <options>". */
function simpleWhen(c: Cond | undefined): { q: string; in: string } | null {
  if (!c) return { q: '', in: '' };
  if ('q' in c && c.in && Object.keys(c).length === 2) return { q: c.q, in: c.in.join(', ') };
  return null;
}

export function QuestionBank({ items, industries }: { items: BankItem[]; industries: { key: string; label: string }[] }) {
  const [industry, setIndustry] = useState('');
  const [stage, setStage] = useState('');
  const [needle, setNeedle] = useState('');
  const [editing, setEditing] = useState<BankItem | 'new' | null>(null);

  const shown = useMemo(
    () =>
      items.filter(
        (q) =>
          (!industry || q.industries.includes(industry) || (industry === '*' && q.industries.includes('*'))) &&
          (!stage || q.stage === stage) &&
          (!needle || `${q.key} ${q.text}`.toLowerCase().includes(needle.toLowerCase())),
      ),
    [items, industry, stage, needle],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input value={needle} onChange={(e) => setNeedle(e.target.value)} placeholder="Savol yoki kalit bo‘yicha qidirish" aria-label="Qidirish" className={`${field} h-11 rounded-full px-4`} />
        <select value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label="Soha" className={`${field} h-11 rounded-full`}>
          <option value="">Barcha sohalar</option>
          <option value="*">Umumiy (hamma uchun)</option>
          {industries.map((i) => (
            <option key={i.key} value={i.key}>
              {i.label}
            </option>
          ))}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Bosqich" className={`${field} h-11 rounded-full`}>
          <option value="">Barcha bosqichlar</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setEditing('new')} className="h-11 rounded-full bg-[#d4fc18] px-5 text-[13.5px] font-semibold text-[#0b0b0c]">
          + Yangi savol
        </button>
      </div>
      <p className="text-[12.5px] text-[#8e8e96]">{shown.length} ta savol. Tahrirlash yangi versiya yaratadi; yakunlangan suhbatlar o‘zi ko‘rgan savol matnini saqlab qoladi.</p>

      {editing ? <Editor item={editing === 'new' ? null : editing} industries={industries} onClose={() => setEditing(null)} /> : null}

      <ul className="space-y-2">
        {shown.map((q) => (
          <li key={q.key}>
            <GlassCard className={`!p-4 ${q.active === false ? 'opacity-50' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14.5px] text-white">{q.text}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[#8e8e96]">
                    <span className="font-mono">{q.key}</span>
                    <span>{STAGE_LABEL[q.stage]}</span>
                    <span>{TYPES[q.type] ?? q.type}</span>
                    <span>ustuvorlik {q.priority}</span>
                    <span>{q.industries.includes('*') ? 'hamma soha' : q.industries.map((k) => industries.find((i) => i.key === k)?.label ?? k).join(', ')}</span>
                    <span className={q.origin === 'builtin' ? '' : 'text-[#d4fc18]'}>{q.origin === 'builtin' ? 'Kutubxona' : q.origin === 'edited' ? `Tahrirlangan · v${q.version}` : `Yangi · v${q.version}`}</span>
                    {q.active === false ? <span className="text-[#ff9c9c]">o‘chirilgan</span> : null}
                  </p>
                  <p className="mt-1 text-[12px] text-[#6e6e76]">Maqsad: {q.purpose}</p>
                </div>
                <div className="flex gap-2">
                  {q.source === 'rule' ? (
                    <span className="text-[11.5px] text-[#6e6e76]">Qoida savoli</span>
                  ) : (
                    <button type="button" onClick={() => setEditing(q)} className="h-8 rounded-full border border-white/12 px-3 text-[12px] text-[#d9d9de] hover:border-[#d4fc18]/50">
                      Tahrirlash
                    </button>
                  )}
                </div>
              </div>
            </GlassCard>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Editor({ item, industries, onClose }: { item: BankItem | null; industries: { key: string; label: string }[]; onClose: () => void }) {
  const router = useRouter();
  const when = simpleWhen(item?.when);
  const [d, setD] = useState({
    key: item?.key ?? '',
    stage: (item?.stage ?? 'industry') as Stage,
    industries: item?.industries ?? ['*'],
    category: item?.category ?? '',
    text: item?.text ?? '',
    description: item?.description ?? '',
    type: item?.type ?? 'single',
    options: (item?.options ?? []).map((o) => `${o.key}|${o.label}`).join('\n'),
    max: item?.max ? String(item.max) : '',
    required: item?.required ?? true,
    allowOther: item?.allowOther ?? false,
    allowUnknown: item?.allowUnknown ?? true,
    allowNone: item?.allowNone ?? false,
    priority: String(item?.priority ?? 60),
    purpose: item?.purpose ?? '',
    whenQ: when?.q ?? '',
    whenIn: when?.in ?? '',
    active: item?.active !== false,
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true);
    setError(null);
    // Options keep everything the editor does not show (requirements, industry filters) by their key.
    const options: Option[] = d.options
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [k, ...rest] = l.split('|');
        const key = k.trim();
        const label = rest.join('|').trim() || key;
        const prev = item?.options?.find((o) => o.key === key);
        return prev ? { ...prev, label } : { key, label };
      });
    const whenCond: Cond | undefined = when === null ? item?.when : d.whenQ.trim() ? { q: d.whenQ.trim(), in: d.whenIn.split(',').map((s) => s.trim()).filter(Boolean) } : undefined;
    const def = {
      ...(item ? { subs: item.subs, optionsFrom: item.optionsFrom, optionsSource: item.optionsSource, skipIf: item.skipIf, unit: item.unit, min: item.min, aiAdaptable: item.aiAdaptable } : {}),
      key: d.key.trim(),
      stage: d.stage,
      industries: d.industries.length ? d.industries : ['*'],
      category: d.category.trim() || STAGE_LABEL[d.stage],
      text: d.text,
      description: d.description.trim() || undefined,
      type: d.type,
      options: item?.optionsFrom || item?.optionsSource ? undefined : ['single', 'multi', 'rank'].includes(d.type) ? options : d.type === 'yesno' ? [{ key: 'yes', label: 'Ha' }, { key: 'no', label: 'Yo‘q' }] : undefined,
      max: d.max ? Number(d.max) : undefined,
      required: d.required,
      allowOther: d.allowOther,
      allowUnknown: d.allowUnknown,
      allowNone: d.allowNone,
      priority: Number(d.priority) || 50,
      purpose: d.purpose,
      uncovers: item?.uncovers ?? [d.key.trim()],
      when: whenCond,
      active: d.active,
    };
    try {
      const r = await briefBankSave(def, d.note);
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    } catch {
      setError('Aloqa uzildi.');
    } finally {
      setBusy(false);
    }
  };

  const toggleIndustry = (k: string) =>
    set('industries', k === '*' ? ['*'] : d.industries.includes(k) ? d.industries.filter((x) => x !== k) : [...d.industries.filter((x) => x !== '*'), k]);

  return (
    <GlassCard glow>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className={`${display} text-[18px] font-medium text-white`}>{item ? `Tahrirlash · ${item.key}` : 'Yangi savol'}</p>
        <button type="button" onClick={onClose} className="text-[13px] text-[#8e8e96] hover:text-white">
          Yopish
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] text-[#8e8e96]">
          Kalit (masalan, cl.new_question)
          <input value={d.key} disabled={!!item} onChange={(e) => set('key', e.target.value.toLowerCase())} className={`${field} mt-1 font-mono disabled:opacity-60`} />
        </label>
        <label className="text-[12px] text-[#8e8e96]">
          Bosqich
          <select value={d.stage} onChange={(e) => set('stage', e.target.value as Stage)} className={`${field} mt-1`}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-[#8e8e96] sm:col-span-2">
          Savol matni (mijoz ko‘radi)
          <input value={d.text} onChange={(e) => set('text', e.target.value)} maxLength={240} className={`${field} mt-1`} />
        </label>
        <label className="text-[12px] text-[#8e8e96] sm:col-span-2">
          Izoh (ixtiyoriy, mijoz ko‘radi)
          <input value={d.description} onChange={(e) => set('description', e.target.value)} maxLength={300} className={`${field} mt-1`} />
        </label>
        <label className="text-[12px] text-[#8e8e96]">
          Javob turi
          <select value={d.type} onChange={(e) => set('type', e.target.value as Question['type'])} className={`${field} mt-1`}>
            {Object.entries(TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-[#8e8e96]">
          Ko‘pi bilan nechta tanlov / belgi
          <input value={d.max} onChange={(e) => set('max', e.target.value.replace(/\D/g, ''))} className={`${field} mt-1`} />
        </label>
        {['single', 'multi', 'rank'].includes(d.type) && !item?.optionsFrom && !item?.optionsSource ? (
          <label className="text-[12px] text-[#8e8e96] sm:col-span-2">
            Variantlar — har qatorda “kalit|Matn”
            <textarea value={d.options} onChange={(e) => set('options', e.target.value)} rows={6} className={`${field} mt-1 h-auto py-2 font-mono text-[12.5px]`} />
          </label>
        ) : null}
        <label className="text-[12px] text-[#8e8e96] sm:col-span-2">
          Biznes maqsadi (faqat menejerlar ko‘radi)
          <input value={d.purpose} onChange={(e) => set('purpose', e.target.value)} maxLength={300} className={`${field} mt-1`} />
        </label>
        <label className="text-[12px] text-[#8e8e96]">
          Ustuvorlik (1–100)
          <input value={d.priority} onChange={(e) => set('priority', e.target.value.replace(/\D/g, '').slice(0, 3))} className={`${field} mt-1`} />
        </label>
        <label className="text-[12px] text-[#8e8e96]">
          Kategoriya
          <input value={d.category} onChange={(e) => set('category', e.target.value)} maxLength={60} className={`${field} mt-1`} />
        </label>
        <div className="sm:col-span-2">
          <p className="mb-1 text-[12px] text-[#8e8e96]">Qaysi sohalar uchun</p>
          <div className="flex flex-wrap gap-1.5">
            {[{ key: '*', label: 'Hamma soha' }, ...industries].map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => toggleIndustry(i.key)}
                className={`rounded-full px-3 py-1 text-[12px] ${d.industries.includes(i.key) ? 'bg-[#d4fc18] text-[#0b0b0c]' : 'bg-white/[0.06] text-[#d9d9de]'}`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
        {when !== null ? (
          <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
            <label className="text-[12px] text-[#8e8e96]">
              Faqat shu savolga… (kalit, ixtiyoriy)
              <input value={d.whenQ} onChange={(e) => set('whenQ', e.target.value)} placeholder="masalan, cl.branches" className={`${field} mt-1 font-mono`} />
            </label>
            <label className="text-[12px] text-[#8e8e96]">
              …shu javoblardan biri berilganda (kalitlar, vergul bilan)
              <input value={d.whenIn} onChange={(e) => set('whenIn', e.target.value)} placeholder="masalan, 2_3, 4_plus" className={`${field} mt-1 font-mono`} />
            </label>
          </div>
        ) : (
          <p className="text-[12px] text-[#8e8e96] sm:col-span-2">Bu savolning murakkab sharti bor — u o‘zgarishsiz saqlanadi.</p>
        )}
        <div className="flex flex-wrap gap-4 text-[13px] text-[#d9d9de] sm:col-span-2">
          {(
            [
              ['required', 'Majburiy'],
              ['allowUnknown', '“Bilmayman”'],
              ['allowOther', '“Boshqa”'],
              ['allowNone', '“Hozircha mavjud emas”'],
              ['active', 'Faol'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" checked={d[k]} onChange={(e) => set(k, e.target.checked)} className="accent-[#d4fc18]" />
              {label}
            </label>
          ))}
        </div>
        <label className="text-[12px] text-[#8e8e96] sm:col-span-2">
          O‘zgarish sababi (ixtiyoriy)
          <input value={d.note} onChange={(e) => set('note', e.target.value)} maxLength={500} className={`${field} mt-1`} />
        </label>
      </div>
      {item?.versions.length ? (
        <div className="mt-4 text-[12px] text-[#8e8e96]">
          Versiyalar:{' '}
          {item.versions.map((v) => (
            <span key={v.version} className="mr-3">
              v{v.version} · {formatShortDateTime(v.created_at)}
              {v.active ? '' : ' (o‘chirilgan)'}
              {v.note ? ` — ${v.note}` : ''}
            </span>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-[13px] text-[#fca5a5]">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-10 rounded-full px-4 text-[13px] text-[#a8a8ac]">
          Bekor
        </button>
        <button type="button" disabled={busy} onClick={save} className="h-10 rounded-full bg-[#d4fc18] px-6 text-[13px] font-semibold text-[#0b0b0c] disabled:opacity-50">
          {busy ? 'Saqlanmoqda…' : 'Yangi versiya sifatida saqlash'}
        </button>
      </div>
    </GlassCard>
  );
}
