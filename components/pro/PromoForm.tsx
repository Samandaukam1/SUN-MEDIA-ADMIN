'use client';

import { useActionState, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createPromoCode, setPromoActive } from '@/lib/actions/pro';
import { idle } from '@/lib/actions/state';

/** Yangi promo kod: reward length (3 / 7 / 30 / custom days), window, limits and audience. */
export function PromoForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createPromoCode, idle);
  const [days, setDays] = useState('3');
  const err = (k: string) => (state.status === 'error' ? state.fieldErrors?.[k] : undefined);
  return (
    <form action={action} className="space-y-4">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message ?? 'Saqlandi'} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput label="Kod" name="code" required placeholder="SAFI3DAY" maxLength={32} error={err('code')} />
        <TextInput label="Nomi" name="title" required placeholder="3 kunlik Pro" maxLength={120} error={err('title')} />
      </div>
      <TextArea label="Tavsif (ixtiyoriy)" name="description" rows={2} maxLength={500} />
      <div className="grid gap-4 md:grid-cols-3">
        <SelectInput label="Pro muddati" name="reward_days" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="3">3 kun</option>
          <option value="7">7 kun</option>
          <option value="30">30 kun</option>
          <option value="custom">Boshqa…</option>
        </SelectInput>
        {days === 'custom' ? <TextInput label="Necha kun" name="custom_days" type="number" min={1} max={3650} required error={err('reward_days')} /> : <div />}
        <SelectInput label="Kim uchun" name="audience" defaultValue="clients">
          <option value="clients">Mijozlar</option>
          <option value="everyone">Hamma</option>
          <option value="new_users">Faqat yangi foydalanuvchilar (14 kun)</option>
          <option value="agency">Faqat agentlik xodimlari</option>
        </SelectInput>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput label="Boshlanishi" name="starts_at" type="datetime-local" />
        <TextInput label="Tugashi (ixtiyoriy)" name="expires_at" type="datetime-local" error={err('expires_at')} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <TextInput label="Jami necha marta (bo‘sh = cheksiz)" name="max_redemptions" type="number" min={1} placeholder="1 = bir martalik" />
        <TextInput label="Bir foydalanuvchi" name="per_user_limit" type="number" min={1} max={100} defaultValue={1} />
        <TextInput label="Bir kompaniya" name="per_workspace_limit" type="number" min={1} max={100} defaultValue={1} />
      </div>
      {clients.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Faqat shu mijozlar uchun (bo‘sh = hammasi)</legend>
          <div className="flex flex-wrap gap-4">
            {clients.map((c) => (
              <Checkbox key={c.id} name="eligible_client_ids" value={c.id} label={c.name} />
            ))}
          </div>
        </fieldset>
      ) : null}
      <Checkbox name="is_active" label="Faol" defaultChecked />
      <SubmitButton>Promo kod yaratish</SubmitButton>
    </form>
  );
}

export function PromoToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button size="md" variant={active ? 'ghost' : 'secondary'} loading={pending} onClick={() => start(async () => void (await setPromoActive(id, !active)))}>
      {active ? 'O‘chirish' : 'Yoqish'}
    </Button>
  );
}
