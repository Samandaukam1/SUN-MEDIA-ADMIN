'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Card } from '@/components/ui/Card';
import { SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveShootingAction } from '@/lib/actions/work';
import { idle } from '@/lib/actions/state';
import type { ClientOption, StaffOption } from '@/lib/directory';

const CREW: { role: string; label: string; fits: string[] }[] = [
  { role: 'operator', label: 'Operator', fits: ['operator'] },
  { role: 'editor', label: 'Montajyor', fits: ['editor'] },
  { role: 'smm_manager', label: 'SMM menejer', fits: ['smm_manager'] },
  { role: 'project_manager', label: 'Loyiha menejeri', fits: ['project_manager'] },
];

/** A shooting in one screen: client, when, where, who. The crew gets a notification when it is saved. */
export function ShootingForm({ clients, staff, defaultDate }: { clients: ClientOption[]; staff: StaffOption[]; defaultDate: string }) {
  const [state, action] = useActionState(saveShootingAction, idle);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
        <Card className="space-y-4">
          <SelectInput label="Mijoz" name="client_id" required defaultValue="" error={errors.client_id}>
            <option value="" disabled>
              Mijozni tanlang
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectInput>
          <TextInput label="Syomka nomi" name="title" required placeholder="Masalan: Yangi menyu syomkasi" error={errors.title} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Boshlanishi" name="starts_at" type="datetime-local" required defaultValue={`${defaultDate}T10:00`} error={errors.starts_at} />
            <TextInput label="Tugashi" name="ends_at" type="datetime-local" required defaultValue={`${defaultDate}T13:00`} error={errors.ends_at} />
          </div>
          <TextInput label="Joy nomi" name="location_name" placeholder="Masalan: SAFI Chilonzor filiali" />
          <TextInput label="Manzil" name="location_address" />
          <TextInput label="Xarita havolasi" name="location_url" type="url" placeholder="https://maps.google.com/…" error={errors.location_url} />
          <TextArea label="Izoh" name="description" maxLength={4000} placeholder="Nima olinadi, kiyim, rekvizit…" />
        </Card>
      </div>
      <div className="space-y-6">
        <Card className="space-y-4">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Kim boradi</p>
          {CREW.map((c) => {
            const fits = staff.filter((s) => s.roles.some((r) => c.fits.includes(r)));
            const others = staff.filter((s) => !fits.includes(s));
            return (
              <SelectInput key={c.role} label={c.label} name={`crew_${c.role}`} defaultValue="">
                <option value="">Biriktirilmagan</option>
                {fits.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                {others.length ? (
                  <optgroup label="Boshqa xodimlar">
                    {others.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </SelectInput>
            );
          })}
        </Card>
        <div className="flex justify-end gap-3">
          <Link href="/work/shootings" className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-ink hover:bg-surface-2">
            Bekor qilish
          </Link>
          <SubmitButton>Syomkani rejalashtirish</SubmitButton>
        </div>
      </div>
    </form>
  );
}
