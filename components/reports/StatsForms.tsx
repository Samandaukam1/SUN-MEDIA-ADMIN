'use client';

import { useActionState, useTransition, useState } from 'react';

import { Button, buttonClass } from '@/components/ui/Button';
import { SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { addSocialAccount, generateReport, saveReportHighlights, saveSocialMonth, setReportPublished } from '@/lib/actions/reports';
import { idle, type ActionState } from '@/lib/actions/state';
import { PLATFORM_LABEL } from '@/lib/labels';

function Feedback({ state }: { state: ActionState }) {
  if (state.status === 'error') return <Notice tone="danger" title={state.message} />;
  if (state.status === 'success' && state.message) return <Notice tone="success" title={state.message} />;
  return null;
}

export function AddSocialAccountForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(addSocialAccount, idle);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <SelectInput label="Platforma" name="platform" defaultValue="instagram" error={errors.platform}>
          {Object.entries(PLATFORM_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectInput>
        <TextInput label="Akkaunt" name="handle" required placeholder="safi.uz" error={errors.handle} />
      </div>
      <TextInput label="Havola (ixtiyoriy)" name="url" placeholder="https://instagram.com/safi.uz" error={errors.url} />
      <div className="flex justify-end">
        <SubmitButton>Qo‘shish</SubmitButton>
      </div>
    </form>
  );
}

const METRICS: { key: string; label: string }[] = [
  { key: 'followers_start', label: 'Obunachilar (oy boshi)' },
  { key: 'followers_end', label: 'Obunachilar (oy oxiri)' },
  { key: 'reach', label: 'Qamrov' },
  { key: 'views', label: 'Ko‘rishlar' },
  { key: 'profile_visits', label: 'Profilga tashrif' },
  { key: 'likes', label: 'Layklar' },
  { key: 'comments', label: 'Izohlar' },
  { key: 'shares', label: 'Ulashishlar' },
  { key: 'saves', label: 'Saqlashlar' },
];

export function SocialMonthForm({
  clientId,
  accountId,
  month,
  values,
  editable,
}: {
  clientId: string;
  accountId: string;
  month: string;
  values: Record<string, number | null> | null;
  editable: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveSocialMonth, idle);
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="social_account_id" value={accountId} />
      <input type="hidden" name="month" value={month} />
      <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-3">
        {METRICS.map((m) => (
          <TextInput key={m.key} label={m.label} name={m.key} inputMode="numeric" defaultValue={values?.[m.key] ?? ''} placeholder="—" />
        ))}
      </fieldset>
      {editable ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted">Bo‘sh maydon “ma’lumot yo‘q” — hisobotda ko‘rsatilmaydi.</p>
          <SubmitButton>Saqlash</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

export function GenerateReportForm({ clientId, months }: { clientId: string; months: { value: string; label: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(generateReport, idle);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="client_id" value={clientId} />
      <div className="min-w-48 flex-1">
        <SelectInput label="Oy" name="month" defaultValue={months[1]?.value ?? months[0]?.value}>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </SelectInput>
      </div>
      <SubmitButton>Hisobot tayyorlash</SubmitButton>
      <div className="w-full">
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function ReportActions({ reportId, clientId, published, pdfPath }: { reportId: string; clientId: string; published: boolean; pdfPath: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pdfPath ? (
        <a href={`/api/reports/${reportId}/pdf`} className={buttonClass('secondary')}>
          PDF yuklab olish
        </a>
      ) : null}
      <Button
        type="button"
        variant={published ? 'ghost' : 'primary'}
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await setReportPublished(reportId, clientId, !published);
            setError(res.status === 'error' ? res.message : null);
          })
        }
      >
        {published ? 'Qoralamaga qaytarish' : 'Nashr qilish'}
      </Button>
      {error ? <span className="text-[13px] text-danger">{error}</span> : null}
    </div>
  );
}

export function HighlightsForm({ reportId, clientId, value }: { reportId: string; clientId: string; value: string | null }) {
  const [state, action] = useActionState<ActionState, FormData>(saveReportHighlights, idle);
  return (
    <form action={action} className="space-y-3">
      <Feedback state={state} />
      <input type="hidden" name="report_id" value={reportId} />
      <input type="hidden" name="client_id" value={clientId} />
      <TextArea label="Oy yutuqlari (mijozga ko‘rinadi)" name="highlights" rows={4} defaultValue={value ?? ''} maxLength={5000} />
      <div className="flex justify-end">
        <SubmitButton>Saqlash</SubmitButton>
      </div>
    </form>
  );
}
