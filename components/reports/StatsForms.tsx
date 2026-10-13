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

const GROUPS: { title: string; fields: { key: string; label: string }[] }[] = [
  {
    title: 'Auditoriya',
    fields: [
      { key: 'followers_start', label: 'Obunachilar (oy boshi)' },
      { key: 'followers_end', label: 'Obunachilar (oy oxiri)' },
      { key: 'views', label: 'Ko‘rishlar' },
      { key: 'reach', label: 'Qamrov' },
      { key: 'profile_visits', label: 'Profilga tashrif' },
    ],
  },
  {
    title: 'Faollik',
    fields: [
      { key: 'likes', label: 'Layklar' },
      { key: 'comments', label: 'Izohlar' },
      { key: 'shares', label: 'Ulashishlar' },
      { key: 'saves', label: 'Saqlashlar' },
    ],
  },
  {
    title: 'Chiqarilgan kontent',
    fields: [
      { key: 'reels_count', label: 'Reels' },
      { key: 'posts_count', label: 'Postlar' },
      { key: 'stories_count', label: 'Stories' },
    ],
  },
];

export type MonthValues = Record<string, number | string | null> & { status?: 'draft' | 'published' | null; ad_currency?: string | null };

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
  values: MonthValues | null;
  editable: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveSocialMonth, idle);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const spend = values?.ad_spend == null ? null : Number(values.ad_spend);
  const leads = values?.leads == null ? null : Number(values.leads);
  const currency = values?.ad_currency === 'USD' ? 'USD' : 'UZS';
  const cpl = spend !== null && leads ? spend / leads : null;
  const id = (key: string) => `${accountId}-${key}`;
  return (
    <form action={action} className="space-y-5">
      <Feedback state={state} />
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="social_account_id" value={accountId} />
      <input type="hidden" name="month" value={month} />
      <fieldset disabled={!editable} className="space-y-5">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">{g.title}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {g.fields.map((m) => (
                <TextInput key={m.key} id={id(m.key)} label={m.label} name={m.key} inputMode="numeric" defaultValue={values?.[m.key] ?? ''} placeholder="—" error={errors[m.key]} />
              ))}
            </div>
          </div>
        ))}
        <div>
          <p className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Reklama</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_110px_1fr]">
            <TextInput id={id('ad_spend')} label="Reklama xarajati" name="ad_spend" inputMode="decimal" defaultValue={values?.ad_spend ?? ''} placeholder="—" error={errors.ad_spend} />
            <SelectInput id={id('ad_currency')} label="Valyuta" name="ad_currency" defaultValue={currency}>
              <option value="UZS">so‘m</option>
              <option value="USD">USD</option>
            </SelectInput>
            <TextInput id={id('leads')} label="Lidlar" name="leads" inputMode="numeric" defaultValue={values?.leads ?? ''} placeholder="—" error={errors.leads} />
          </div>
          <p className="mt-2 text-[13px] text-muted">
            Lid narxi (CPL) avtomatik hisoblanadi: xarajat ÷ lidlar
            {cpl !== null ? ` = ${cpl.toLocaleString('ru-RU', { maximumFractionDigits: currency === 'USD' ? 2 : 0 })} ${currency === 'USD' ? 'USD' : 'so‘m'}` : ''}.
          </p>
        </div>
      </fieldset>
      {editable ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="max-w-md text-[13px] text-muted">
            Bo‘sh maydon — “ma’lumot kiritilmagan” (0 emas). Qoralama hamkorga ko‘rinmaydi; nashr qilingan raqamlar hamkor kabinetida “qo‘lda kiritilgan”
            deb ko‘rsatiladi.
          </p>
          <div className="flex gap-2">
            <SubmitButton variant="secondary" name="intent" value="draft">
              Qoralama saqlash
            </SubmitButton>
            <SubmitButton name="intent" value="publish">
              {values?.status === 'published' ? 'Saqlash (nashrda)' : 'Nashr qilish'}
            </SubmitButton>
          </div>
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
        {published ? 'Qoralamaga qaytarish' : 'Nashr qilish (hamkorga)'}
      </Button>
      {error ? <span className="text-[13px] text-danger">{error}</span> : null}
    </div>
  );
}

export function HighlightsForm({
  reportId,
  clientId,
  value,
  workDone,
  workPlanned,
}: {
  reportId: string;
  clientId: string;
  value: string | null;
  workDone: string | null;
  workPlanned: string | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveReportHighlights, idle);
  return (
    <form action={action} className="space-y-3">
      <Feedback state={state} />
      <input type="hidden" name="report_id" value={reportId} />
      <input type="hidden" name="client_id" value={clientId} />
      <TextArea id={`${reportId}-highlights`} label="Oy yutuqlari (hamkorga ko‘rinadi)" name="highlights" rows={3} defaultValue={value ?? ''} maxLength={5000} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextArea
          id={`${reportId}-done`}
          label="Bajarilgan ishlar — har biri yangi qatorda"
          name="work_done"
          rows={5}
          defaultValue={workDone ?? ''}
          maxLength={5000}
          placeholder={'8 ta Reels\n2 kunlik syomka\nTarget reklama'}
        />
        <TextArea
          id={`${reportId}-planned`}
          label="Rejadagi ishlar — har biri yangi qatorda"
          name="work_planned"
          rows={5}
          defaultValue={workPlanned ?? ''}
          maxLength={5000}
          placeholder={'Yangi mavsum kampaniyasi\n10 ta Reels'}
        />
      </div>
      <div className="flex justify-end">
        <SubmitButton>Matnlarni saqlash</SubmitButton>
      </div>
    </form>
  );
}
