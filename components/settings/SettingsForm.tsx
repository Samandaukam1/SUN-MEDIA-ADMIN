'use client';

import { useActionState } from 'react';

import { TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { updateAgencySettings } from '@/lib/actions/access';
import { idle, type ActionState } from '@/lib/actions/state';

const DAYS = [
  [1, 'Dushanba'],
  [2, 'Seshanba'],
  [3, 'Chorshanba'],
  [4, 'Payshanba'],
  [5, 'Juma'],
  [6, 'Shanba'],
  [7, 'Yakshanba'],
] as const;

type Props = { workDays: number[]; workdayStart: string; lateGrace: number; loginDomain: string; editable: boolean };

export function SettingsForm({ workDays, workdayStart, lateGrace, loginDomain, editable }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(updateAgencySettings, idle);
  const errors = state.status === 'error' ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} className="space-y-8">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message} /> : null}
      <fieldset disabled={!editable} className="space-y-8">
        <section>
          <h2 className="mb-1 text-base font-semibold">Ish jadvali</h2>
          <p className="mb-4 text-sm text-muted">Yangi xodimlar shu jadval bilan yaratiladi. Davomat va kechikish shu vaqt bo‘yicha hisoblanadi.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ish kunlari">
            {DAYS.map(([value, label]) => (
              <label key={value} className="cursor-pointer rounded-xl border border-line px-4 py-2 text-sm font-medium has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-surface">
                <input type="checkbox" name="work_days" value={value} defaultChecked={workDays.includes(value)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          {errors.work_days ? <p className="mt-2 text-[13px] text-danger">{errors.work_days}</p> : null}
          <div className="mt-5 grid max-w-lg gap-4 sm:grid-cols-2">
            <TextInput label="Ish boshlanishi" name="workday_start" type="time" defaultValue={workdayStart} error={errors.workday_start} />
            <TextInput label="Kechikish chegarasi (daqiqa)" name="late_grace_minutes" type="number" min={0} max={120} defaultValue={lateGrace} error={errors.late_grace_minutes} />
          </div>
        </section>
        <section className="max-w-lg">
          <h2 className="mb-1 text-base font-semibold">Akkauntlar</h2>
          <p className="mb-4 text-sm text-muted">“Xodim qo‘shish” formasida login shu domen bilan taklif qilinadi.</p>
          <TextInput label="Login domeni" name="login_domain" defaultValue={loginDomain} error={errors.login_domain} placeholder="sunmedia.uz" />
        </section>
      </fieldset>
      {editable ? (
        <div className="flex justify-end border-t border-line pt-5">
          <SubmitButton>Saqlash</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
