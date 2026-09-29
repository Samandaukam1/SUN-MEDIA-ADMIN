'use client';

import { useActionState, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createGameCampaign, guaranteeNextPlayer, setCampaignActive } from '@/lib/actions/games';
import { idle, type ActionState } from '@/lib/actions/state';

const MODES = [
  { value: 'skill', label: 'Mahorat: maqsadga yetgan har kim yutadi' },
  { value: 'probability', label: 'Ehtimol: maqsadga yetganlar orasida X%' },
  { value: 'first_play_guaranteed', label: 'Birinchi o‘yin kafolatlangan, keyin X%' },
  { value: 'next_player_guaranteed', label: 'Belgilangan keyingi o‘yinchi yutadi, qolganlar X%' },
];

/** Yangi o‘yin kampaniyasi: brand, template, difficulty, reward and the (disclosed) winning rule. */
export function GameCampaignForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createGameCampaign, idle);
  const [mode, setMode] = useState('skill');
  const [template, setTemplate] = useState('catch');
  const err = (k: string) => (state.status === 'error' ? state.fieldErrors?.[k] : undefined);
  return (
    <form action={action} className="space-y-4">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message ?? 'Saqlandi'} /> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <SelectInput label="Mijoz" name="client_id" required defaultValue="" error={err('client_id')}>
          <option value="" disabled>
            Tanlang
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Shablon" name="template" value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="catch">Tutish (SAFI: tovuq va tuxum)</option>
          <option value="pour">Quyish (WeDrink: stakan)</option>
        </SelectInput>
        <TextInput label="Nomi" name="title" required maxLength={80} placeholder={template === 'catch' ? 'SAFI Challenge' : 'WeDrink Challenge'} error={err('title')} />
      </div>
      <TextInput label="Qisqa matn (ixtiyoriy)" name="subtitle" maxLength={160} placeholder="10 ta tuxumni tuting — Pro yutib oling" />
      <div className="grid gap-4 md:grid-cols-3">
        <TextInput label="Asosiy rang" name="primary" defaultValue={template === 'catch' ? '#E30613' : '#0EA5E9'} error={err('primary')} />
        <TextInput label="Fon rangi" name="background" defaultValue="#FFF8EC" error={err('background')} />
        <TextInput label="Matn rangi" name="text" defaultValue="#1A1A1A" error={err('text')} />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <TextInput label="Urinishlar" name="attempts" type="number" min={1} max={30} defaultValue={10} />
        <TextInput label="Maqsad (x/urinish)" name="target_score" type="number" min={1} max={30} defaultValue={10} error={err('target_score')} />
        <SelectInput label="Qiyinlik" name="difficulty" defaultValue="normal">
          <option value="easy">Oson</option>
          <option value="normal">O‘rtacha</option>
          <option value="hard">Qiyin</option>
          <option value="extreme">Juda qiyin</option>
        </SelectInput>
        <TextInput label="Mukofot: Pro (kun)" name="reward_days" type="number" min={1} max={365} defaultValue={3} />
      </div>
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <SelectInput label="Yutish qoidasi (mijozga aynan shunday ko‘rsatiladi)" name="win_mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </SelectInput>
        <TextInput label="Ehtimol, %" name="win_percent" type="number" min={0} max={100} step="0.1" defaultValue={10} disabled={mode === 'skill'} />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <TextInput label="Kutish (daqiqa)" name="cooldown_minutes" type="number" min={0} defaultValue={60} />
        <TextInput label="Kuniga o‘yin" name="max_sessions_per_day" type="number" min={1} defaultValue={3} />
        <TextInput label="Bir kishi max yutuq" name="max_wins_per_user" type="number" min={1} defaultValue={1} />
        <TextInput label="Jami sovg‘a (bo‘sh = cheksiz)" name="max_rewards_total" type="number" min={1} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextInput label="Boshlanishi" name="starts_at" type="datetime-local" />
        <TextInput label="Tugashi (ixtiyoriy)" name="ends_at" type="datetime-local" />
      </div>
      <TextArea label="Qo‘shimcha shartlar (ixtiyoriy)" name="rules" rows={2} maxLength={1000} />
      <p className="text-[13px] text-muted">Natijani server hisoblaydi; yutish-yutmaslik o‘yin boshlanganda belgilanadi va mijozga haqiqiy qoida ko‘rsatiladi.</p>
      <SubmitButton>Kampaniya yaratish</SubmitButton>
    </form>
  );
}

export function CampaignActions({ id, active, nextMode }: { id: string; active: boolean; nextMode: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {nextMode && active ? (
        <Button size="md" variant="secondary" loading={pending} onClick={() => start(async () => setState(await guaranteeNextPlayer(id)))}>
          Keyingi o‘yinchi yutsin
        </Button>
      ) : null}
      <Button size="md" variant="ghost" disabled={pending} onClick={() => start(async () => setState(await setCampaignActive(id, !active)))}>
        {active ? 'To‘xtatish' : 'Yoqish'}
      </Button>
      {state && state.status !== 'idle' && state.message ? <span className={state.status === 'error' ? 'text-[13px] text-danger' : 'text-[13px] text-success'}>{state.message}</span> : null}
    </div>
  );
}
