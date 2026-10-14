'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { savePrivateData, setEmployeeSkills, setWorkHours, type TeamResult } from '@/lib/actions/team';

const field = 'h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent disabled:opacity-60';

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<TeamResult>) =>
    start(async () => {
      setMessage(null);
      const res = await fn();
      setMessage(res.ok ? { ok: true, text: 'Saqlandi.' } : { ok: false, text: res.message });
      if (res.ok) router.refresh();
    });
  const note = message ? <p className={cn('text-[13px]', message.ok ? 'text-success' : 'text-danger')}>{message.text}</p> : null;
  return { pending, run, note };
}

/** What the person can do — independent of their role; several at once. */
export function SkillsEditor({ userId, all, selected, editable }: { userId: string; all: { id: string; name: string }[]; selected: string[]; editable: boolean }) {
  const [ids, setIds] = useState(selected);
  const { pending, run, note } = useSave();
  const dirty = ids.length !== selected.length || ids.some((id) => !selected.includes(id));
  return (
    <Card className="space-y-3">
      <h2 className="text-[15px] font-semibold">Skilllar</h2>
      <p className="text-[13px] text-muted">Vazifa yaratishda ssenarist, operator va montajyor shu skilllar bo‘yicha tanlanadi.</p>
      <div className="flex flex-wrap gap-2">
        {all.map((s) => {
          const on = ids.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              disabled={!editable}
              aria-pressed={on}
              onClick={() => setIds(on ? ids.filter((x) => x !== s.id) : [...ids, s.id])}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm transition-colors disabled:cursor-default',
                on ? 'border-accent bg-accent-soft font-medium text-accent-on-soft' : 'border-line text-muted hover:bg-surface-2',
              )}
            >
              {on ? '✓ ' : ''}
              {s.name}
            </button>
          );
        })}
      </div>
      {editable ? (
        <Button disabled={!dirty} loading={pending} onClick={() => run(() => setEmployeeSkills(userId, ids))}>
          Saqlash
        </Button>
      ) : null}
      {note}
    </Card>
  );
}

export function WorkHoursEditor({ userId, start, end, editable }: { userId: string; start: string | null; end: string | null; editable: boolean }) {
  const [from, setFrom] = useState(start?.slice(0, 5) ?? '09:00');
  const [to, setTo] = useState(end?.slice(0, 5) ?? '18:00');
  const { pending, run, note } = useSave();
  return (
    <Card className="space-y-3">
      <h2 className="text-[15px] font-semibold">Ish vaqti</h2>
      <p className="text-[13px] text-muted">Kechikish shu xodimning ish boshlash vaqtiga qarab hisoblanadi.</p>
      <div className="grid max-w-sm grid-cols-2 gap-3">
        <label className="text-[13px] text-muted">
          Boshlanishi
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!editable} className={`${field} mt-1`} />
        </label>
        <label className="text-[13px] text-muted">
          Tugashi
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} disabled={!editable} className={`${field} mt-1`} />
        </label>
      </div>
      {editable ? (
        <Button loading={pending} onClick={() => run(() => setWorkHours(userId, from, to))}>
          Saqlash
        </Button>
      ) : null}
      {note}
    </Card>
  );
}

/** Birth date and passport — shown and saved for the system owner only. */
export function PrivateDataEditor({ userId, data }: { userId: string; data: { birth_date: string | null; passport_series: string | null; passport_number: string | null } | null }) {
  const [f, setF] = useState({ birth_date: data?.birth_date ?? '', passport_series: data?.passport_series ?? '', passport_number: data?.passport_number ?? '' });
  const [shown, setShown] = useState(false);
  const { pending, run, note } = useSave();
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Icon name="lock" size={15} /> Shaxsiy ma’lumotlar
        </h2>
        <button type="button" onClick={() => setShown((v) => !v)} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink" aria-pressed={shown}>
          <Icon name={shown ? 'eyeOff' : 'eye'} size={15} />
          {shown ? 'Yashirish' : 'Ko‘rsatish'}
        </button>
      </div>
      <p className="text-[13px] text-muted">Faqat Tizim egasi ko‘radi. Audit jurnaliga qiymatlar yozilmaydi.</p>
      {shown ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-[13px] text-muted">
              Tug‘ilgan sana
              <input type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="text-[13px] text-muted">
              Pasport seriyasi
              <input value={f.passport_series} onChange={(e) => setF({ ...f, passport_series: e.target.value.toUpperCase().slice(0, 2) })} placeholder="AB" autoComplete="off" className={`${field} mt-1 uppercase`} />
            </label>
            <label className="text-[13px] text-muted">
              Pasport raqami
              <input value={f.passport_number} onChange={(e) => setF({ ...f, passport_number: e.target.value.replace(/\D/g, '').slice(0, 7) })} inputMode="numeric" placeholder="1234567" autoComplete="off" className={`${field} mt-1`} />
            </label>
          </div>
          <Button loading={pending} onClick={() => run(() => savePrivateData(userId, f))}>
            Saqlash
          </Button>
        </>
      ) : (
        <p className="font-mono text-sm tracking-widest text-muted">{data?.passport_series || data?.passport_number ? '•• •••••••' : 'Kiritilmagan'}</p>
      )}
      {note}
    </Card>
  );
}
