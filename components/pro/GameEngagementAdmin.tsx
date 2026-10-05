'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { configureGameEngagement, saveGameEngagementDefinition } from '@/lib/actions/game-engagement';
import { idle, type ActionState } from '@/lib/actions/state';
import { ENGAGEMENT_METRICS, type EngagementDefinition } from '@/lib/schemas/game-engagement';
import { fromLocalInput, toLocalInput } from '@/lib/time';

export function EngagementRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button variant="secondary" loading={pending} onClick={() => start(() => router.refresh())}>Yangilash</Button>;
}

export function EngagementDailyCap({ current }: { current: number }) {
  const [state, action] = useActionState(configureGameEngagement, idle);
  return <form action={action} className="space-y-4">
    {state.status !== 'idle' && state.message ? <Notice tone={state.status === 'error' ? 'danger' : 'success'} title={state.message} /> : null}
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-64 flex-1"><TextInput name="dailyCoinCap" label="SAFI engagement kunlik umumiy limiti (SC)" type="number" min={0} max={100_000} step={1} defaultValue={current} required error={state.status === 'error' ? state.fieldErrors?.dailyCoinCap : undefined} hint="Barcha o‘yinchilar, challenge va yutuqlar uchun umumiy. 0 = SUN Coin tarqatilmaydi." /></div>
      <SubmitButton>Limitni saqlash</SubmitButton>
    </div>
    <p className="text-sm text-muted">Kun Toshkent vaqti bilan yangilanadi. Limit tugasa ham topshiriq bajarilgani va yutuq saqlanadi; SUN Coin berilmaydi. Practice doim bepul va SUN Coin bermaydi.</p>
  </form>;
}

export function EngagementDefinitionBuilder() {
  const [version, setVersion] = useState(0);
  return <DefinitionForm key={version} onDone={() => setVersion((v) => v + 1)} />;
}

export function EngagementDefinitionEditor({ definition }: { definition: EngagementDefinition }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="secondary" onClick={() => setOpen(true)}>Sozlash</Button>
    <Dialog open={open} onClose={() => setOpen(false)} size="lg" title={definition.title} description="Holat, sanalar va mukofot limitlarini boshqaring.">
      <DefinitionForm definition={definition} onDone={() => setOpen(false)} />
    </Dialog>
  </>;
}

function DefinitionForm({ definition, onDone }: { definition?: EngagementDefinition; onDone: () => void }) {
  const [kind, setKind] = useState(definition?.kind ?? 'challenge');
  const [code, setCode] = useState(definition?.code ?? '');
  const [title, setTitle] = useState(definition?.title ?? '');
  const [description, setDescription] = useState(definition?.description ?? '');
  const [metric, setMetric] = useState(definition?.metric ?? 'ROUND_GOALS');
  const [target, setTarget] = useState(String(definition?.target ?? 5));
  const [rewardCoins, setRewardCoins] = useState(String(definition?.rewardCoins ?? 0));
  const [dailyRewardLimit, setDailyRewardLimit] = useState(String(definition?.dailyRewardLimit ?? 0));
  const [enabled, setEnabled] = useState(definition?.enabled ?? false);
  const [startsAt, setStartsAt] = useState(toLocalInput(definition?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(definition?.endsAt));
  const [state, action] = useActionState(async (previous: ActionState, formData: FormData) => {
    formData.set('config', JSON.stringify({
      ...(definition ? { id: definition.id } : {}), gameId: 'safi-penalty', kind, code, title, description, metric,
      target: Number(target), rewardCoins: Number(rewardCoins), dailyRewardLimit: Number(dailyRewardLimit), enabled,
      startsAt: startsAt ? fromLocalInput(startsAt) : new Date().toISOString(), endsAt: endsAt ? fromLocalInput(endsAt) : null,
    }));
    return saveGameEngagementDefinition(previous, formData);
  }, idle);
  const err = (key: string) => state.status === 'error' ? state.fieldErrors?.[key] : undefined;
  const maximum = ENGAGEMENT_METRICS.find((item) => item.key === metric)?.max ?? 100_000;
  const hasCoinReward = Number(rewardCoins) > 0;

  if (state.status === 'success') return <div className="space-y-4"><Notice tone="success" title={state.message} /><Button onClick={onDone}>{definition ? 'Yopish' : 'Yangi topshiriq'}</Button></div>;

  return <form action={action} className="space-y-4">
    {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
    <Checkbox label={enabled ? 'ON — topshiriq faol' : 'OFF — topshiriq o‘chirilgan'} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectInput label="Turi" name="kind" value={kind} disabled={!!definition} onChange={(e) => setKind(e.target.value as 'challenge' | 'achievement')}>
        <option value="challenge">Daily challenge — har kuni</option><option value="achievement">Yutuq — bir marta</option>
      </SelectInput>
      <TextInput label="Kod" name="code" value={code} disabled={!!definition} onChange={(e) => setCode(e.target.value)} required minLength={2} maxLength={64} pattern="[a-z][a-z0-9_]{1,63}" placeholder="five_goals" error={err('code')} hint="Yaratilgandan keyin o‘zgarmaydigan noyob kod." />
    </div>
    <TextInput label="Nomi" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required error={err('title')} placeholder="Bir raundda 5 ta gol uring" />
    <TextArea label="Izoh (ixtiyoriy)" name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} error={err('description')} />
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectInput label="Hisoblanadigan natija" name="metric" value={metric} onChange={(e) => {
        const next = ENGAGEMENT_METRICS.find((item) => item.key === e.target.value);
        if (!next) return;
        setMetric(next.key);
        if (Number(target) > next.max) setTarget(String(next.max));
      }} error={err('metric')}>
        {ENGAGEMENT_METRICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
      </SelectInput>
      <TextInput label="Maqsad" name="target" type="number" min={1} max={maximum} step={1} value={target} onChange={(e) => setTarget(e.target.value)} required error={err('target')} />
    </div>
    {definition ? <p className="text-sm text-muted">Progress boshlanganidan keyin natija turi, maqsad va SUN Coin miqdori o‘zgarmaydi. Yangi shart uchun yangi topshiriq yarating.</p> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput label="Mavjud mukofot (SC)" name="rewardCoins" type="number" min={0} max={1000} step={1} value={rewardCoins} onChange={(e) => setRewardCoins(e.target.value)} required error={err('rewardCoins')} hint="0 = faqat progress/yutuq; SUN Coin berilmaydi." />
      <TextInput label="Kunlik mukofotlar soni" name="dailyRewardLimit" type="number" min={hasCoinReward ? 1 : 0} max={10_000} step={1} value={dailyRewardLimit} onChange={(e) => setDailyRewardLimit(e.target.value)} required error={err('dailyRewardLimit')} hint="Shu topshiriq bo‘yicha barcha o‘yinchilar uchun kunlik limit." />
    </div>
    <Notice title={hasCoinReward ? 'SUN Coin mukofoti limitlar doirasida' : 'Sovrinsiz progress'}>
      {hasCoinReward ? 'Faqat Reward Mode natijalari hisoblanadi. SUN Coin umumiy kunlik limit va topshiriq zaxirasi mavjud bo‘lsa beriladi.' : 'Bajarilgan Practice va Reward Mode natijalari hisoblanadi. O‘yinchilar topshiriq yoki yutuqni SUN Coin sarflamasdan ochishi mumkin.'}
    </Notice>
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput label="Boshlanishi (Toshkent, UTC+5)" name="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={err('startsAt')} hint="Bo‘sh = hozir." />
      <TextInput label="Tugashi (Toshkent, UTC+5)" name="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={err('endsAt')} hint="Bo‘sh = muddatsiz." />
    </div>
    <SubmitButton>{definition ? 'Sozlamalarni saqlash' : 'Topshiriq yaratish'}</SubmitButton>
  </form>;
}
