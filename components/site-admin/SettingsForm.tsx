'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { saveSiteSettings } from '@/lib/actions/site';
import type { ActionState } from '@/lib/actions/state';

type Values = Record<string, string | null>;
type Field = { key: string; label: string; max: number; area?: boolean; rows?: number; hint?: string; placeholder?: string; half?: boolean; required?: boolean };

const GROUPS: { title: string; note?: string; fields: Field[] }[] = [
  {
    title: 'Bosh ekran (hero)',
    note: 'Sarlavhada *yulduzcha* ichidagi so‘zlar lime rangda chiqadi.',
    fields: [
      { key: 'hero_eyebrow', label: 'Kichik yozuv (sarlavha ustida)', max: 80, placeholder: 'SMM · Kontent · Reklama' },
      { key: 'hero_title', label: 'Sarlavha', max: 160, required: true, hint: 'Masalan: Brendingizni *ko‘rinadigan* qilamiz' },
      { key: 'hero_subtitle', label: 'Sarlavha osti matni', max: 400, area: true, rows: 3 },
      { key: 'primary_cta_label', label: 'Asosiy tugma', max: 40, required: true, half: true },
      { key: 'secondary_cta_label', label: 'Ikkinchi tugma (Keyslar)', max: 40, required: true, half: true },
    ],
  },
  {
    title: 'Ariza formasi',
    note: 'Ariza qoldirish oynasi, bosh sahifa va “Aloqa” sahifasidagi forma.',
    fields: [
      { key: 'form_title', label: 'Forma sarlavhasi', max: 120, required: true, half: true },
      { key: 'form_button_label', label: 'Yuborish tugmasi nomi', max: 40, required: true, half: true, hint: 'Masalan: Ariza qoldirish' },
      { key: 'form_subtitle', label: 'Forma osti matni', max: 300, area: true, rows: 2 },
      { key: 'form_link_label', label: 'Havola maydoni nomi', max: 60, required: true, half: true, hint: 'Masalan: Instagram yoki sayt havolasi' },
      { key: 'form_link_placeholder', label: 'Havola maydonidagi namuna', max: 120, half: true, placeholder: 'https://instagram.com/brendingiz' },
      { key: 'form_success_title', label: 'Yuborilgandan keyingi sarlavha', max: 120, required: true, half: true },
      { key: 'form_success_text', label: 'Yuborilgandan keyingi matn', max: 300, half: true },
    ],
  },
  {
    title: 'Aloqa',
    note: 'Bo‘sh maydonlar saytda ko‘rinmaydi.',
    fields: [
      { key: 'phone_primary', label: 'Asosiy telefon', max: 20, half: true, placeholder: '+998 90 123 45 67' },
      { key: 'phone_secondary', label: 'Qo‘shimcha telefon', max: 20, half: true, placeholder: '+998 …' },
      { key: 'email', label: 'Email', max: 120, half: true, placeholder: 'info@sunmedia.uz' },
      { key: 'working_hours', label: 'Ish vaqti', max: 80, half: true, placeholder: 'Du–Sh, 9:00–19:00' },
      { key: 'address', label: 'Manzil', max: 200 },
      { key: 'map_url', label: 'Xarita havolasi', max: 600, placeholder: 'https://yandex.uz/maps/…' },
    ],
  },
  {
    title: 'Ijtimoiy tarmoqlar',
    fields: [
      { key: 'instagram_url', label: 'Instagram', max: 300, half: true, placeholder: 'https://instagram.com/…' },
      { key: 'telegram_url', label: 'Telegram', max: 300, half: true, placeholder: 'https://t.me/…' },
      { key: 'youtube_url', label: 'YouTube', max: 300, half: true },
      { key: 'tiktok_url', label: 'TikTok', max: 300, half: true },
      { key: 'facebook_url', label: 'Facebook', max: 300, half: true },
      { key: 'linkedin_url', label: 'LinkedIn', max: 300, half: true },
    ],
  },
  {
    title: 'Biz haqimizda va yakuniy blok',
    fields: [
      { key: 'about_title', label: '“Biz haqimizda” sarlavhasi', max: 160 },
      { key: 'about_body', label: '“Biz haqimizda” matni', max: 3000, area: true, rows: 6, hint: 'Bo‘sh qator bilan xatboshilarga ajrating.' },
      { key: 'cta_title', label: 'Yakuniy blok sarlavhasi (forma yonida)', max: 160 },
      { key: 'cta_subtitle', label: 'Yakuniy blok matni', max: 400, area: true, rows: 2 },
    ],
  },
  {
    title: 'Footer va qidiruv tizimlari',
    fields: [
      { key: 'footer_note', label: 'Footerdagi qisqa matn', max: 200 },
      { key: 'gate_label', label: 'Xodimlar kirishi yozuvi (footer)', max: 40, required: true, hint: 'Bosilganda 6 xonali kod so‘raladi.' },
      { key: 'seo_title', label: 'Sayt sarlavhasi (Google)', max: 80 },
      { key: 'seo_description', label: 'Sayt tavsifi (Google)', max: 200, area: true, rows: 2 },
    ],
  },
];

export function SettingsForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [state, setState] = useState<ActionState>({ status: 'idle' });
  const [pending, start] = useTransition();
  // After a save the server's normalised values (+998…, https://…) come back as the new starting point.
  useEffect(() => setValues(initial), [initial]);
  const errors = state.status === 'error' ? state.fieldErrors ?? {} : {};
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await saveSiteSettings(values);
          setState(result);
          if (result.status === 'success') router.refresh();
        });
      }}
    >
      {GROUPS.map((group) => (
        <Card key={group.title} className="space-y-4">
          <div>
            <SectionTitle>{group.title}</SectionTitle>
            {group.note ? <p className="-mt-1 text-sm text-muted">{group.note}</p> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((f) => {
              const common = {
                id: `settings-${f.key}`,
                name: f.key,
                label: f.label,
                required: f.required,
                maxLength: f.max,
                placeholder: f.placeholder,
                hint: f.hint,
                error: errors[f.key],
                value: values[f.key] ?? '',
              };
              return (
                <div key={f.key} className={f.half ? '' : 'sm:col-span-2'}>
                  {f.area ? (
                    <TextArea {...common} rows={f.rows} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                  ) : (
                    <TextInput {...common} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-line bg-surface/90 p-3 shadow-card backdrop-blur">
        {state.status !== 'idle' && state.status !== 'success' ? <div className="mr-auto"><Notice tone="danger" title={state.message} /></div> : null}
        {state.status === 'success' && !dirty ? <span className="mr-auto text-sm text-success">{state.message}</span> : null}
        {dirty ? <span className="mr-auto text-sm text-muted">Saqlanmagan o‘zgarishlar bor</span> : null}
        <Button type="button" variant="ghost" disabled={!dirty || pending} onClick={() => setValues(initial)}>
          Bekor qilish
        </Button>
        <Button type="submit" loading={pending} disabled={!dirty}>
          Saqlash
        </Button>
      </div>
    </form>
  );
}
