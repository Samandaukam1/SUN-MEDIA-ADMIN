'use client';

import { useActionState, useState } from 'react';

import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { savePlan } from '@/lib/actions/plans';
import { idle, type ActionState } from '@/lib/actions/state';

export type ServiceType = { key: string; name: string; unit: string; is_quantitative: boolean };
export type PlanValues = {
  id?: string;
  name: string;
  description: string | null;
  price: number;
  duration_months: number;
  client_id: string | null;
  is_active: boolean;
  position: number;
  features: Record<string, number | null>;
};

type Props = { services: ServiceType[]; clients: { id: string; name: string }[]; values?: PlanValues; editable: boolean };

/** Tariff editor: price, period, audience and what is included (quantity per service). */
export function PlanForm({ services, clients, values, editable }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(savePlan, idle);
  const [included, setIncluded] = useState<Set<string>>(new Set(Object.keys(values?.features ?? {})));
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} className="space-y-8">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message ?? 'Saqlandi'} /> : null}
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <fieldset disabled={!editable} className="space-y-8">
        <section className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Tarif nomi" name="name" defaultValue={values?.name} required error={errors.name} placeholder="Masalan: Premium" />
          <TextInput label="Narxi (so‘m)" name="price" type="number" min={0} step={1000} defaultValue={values?.price ?? ''} required error={errors.price} />
          <TextInput
            label="Muddati (oy)"
            name="duration_months"
            type="number"
            min={1}
            max={36}
            defaultValue={values?.duration_months ?? 1}
            required
            error={errors.duration_months}
          />
          <SelectInput label="Kimlar uchun" name="client_id" defaultValue={values?.client_id ?? ''} error={errors.client_id} hint="Maxsus tarifni faqat tanlangan mijoz ko‘radi">
            <option value="">Barcha mijozlar (ochiq katalog)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                Faqat {c.name}
              </option>
            ))}
          </SelectInput>
          <div className="sm:col-span-2">
            <TextArea label="Tavsif" name="description" rows={3} defaultValue={values?.description ?? ''} error={errors.description} placeholder="Mijozga ko‘rinadigan qisqa izoh" />
          </div>
          <TextInput label="Tartib raqami" name="position" type="number" min={0} defaultValue={values?.position ?? 0} hint="Katalogda kichik raqam oldinda" />
          <div className="flex items-end pb-2">
            <Checkbox label="Faol" description="O‘chirilgan tarifni yangi mijozga biriktirib bo‘lmaydi" name="is_active" defaultChecked={values?.is_active ?? true} />
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold">Tarif tarkibi</h2>
          <p className="mb-4 text-sm text-muted">Belgilangan xizmatlar tarifga kiradi. Miqdor bo‘sh qolsa — cheklanmagan (xizmat sifatida).</p>
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Xizmat</th>
                  <th className="w-40 px-4 py-3">Miqdor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {services.map((s) => {
                  const on = included.has(s.key);
                  return (
                    <tr key={s.key}>
                      <td className="px-4 py-3">
                        <input type="hidden" name="service_keys" value={s.key} />
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            name={`inc_${s.key}`}
                            checked={on}
                            onChange={(e) => {
                              const next = new Set(included);
                              if (e.target.checked) next.add(s.key);
                              else next.delete(s.key);
                              setIncluded(next);
                            }}
                            className="size-4 accent-ink"
                          />
                          <span className="font-medium">{s.name}</span>
                        </label>
                      </td>
                      <td className="px-4 py-2">
                        {s.is_quantitative ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              name={`qty_${s.key}`}
                              min={0}
                              disabled={!on}
                              defaultValue={values?.features[s.key] ?? ''}
                              aria-label={`${s.name} miqdori`}
                              className="h-9 w-24 rounded-lg border border-line bg-surface px-3 disabled:opacity-40"
                            />
                            <span className="text-muted">{s.unit}</span>
                          </div>
                        ) : (
                          <span className="text-muted">xizmat</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </fieldset>
      {editable ? (
        <div className="flex justify-end border-t border-line pt-5">
          <SubmitButton>{values?.id ? 'Saqlash' : 'Tarifni yaratish'}</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
