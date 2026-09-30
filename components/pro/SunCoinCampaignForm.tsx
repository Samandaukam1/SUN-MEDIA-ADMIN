'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, SelectInput, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idle, type ActionState } from '@/lib/actions/state';
import { createSunCoinCampaign, setSunCoinCampaignStatus } from '@/lib/actions/sun-coin';
import { COIN_LIMIT, COIN_OPTION_LIMIT, coinDistributionSummary, type CoinCampaignStatus } from '@/lib/schemas/sun-coin';
import { fromLocalInput } from '@/lib/time';

type OptionDraft = { key: number; amount: string; quantity: string; weight: string; minScore: string; maxScore: string };
const initialOptions: OptionDraft[] = [
  { key: 0, amount: '5', quantity: '2', weight: '20', minScore: '5', maxScore: '10' },
  { key: 1, amount: '3', quantity: '3', weight: '30', minScore: '5', maxScore: '10' },
];
const coins = (value: number) => `${value.toLocaleString('en-US')} SC`;

export function SunCoinRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button variant="secondary" loading={pending} onClick={() => start(() => router.refresh())}>Analitikani yangilash</Button>;
}

export function SunCoinCampaignBuilder() {
  const [version, setVersion] = useState(0);
  return <CampaignForm key={version} onNew={() => setVersion((v) => v + 1)} />;
}

function CampaignForm({ onNew }: { onNew: () => void }) {
  const [enabled, setEnabled] = useState(true);
  const [title, setTitle] = useState('SAFI SUN Coin');
  const [pool, setPool] = useState('20');
  const [minimumScore, setMinimumScore] = useState('5');
  const [scoreMode, setScoreMode] = useState('minimum');
  const [strategy, setStrategy] = useState('FIRST_ELIGIBLE');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [options, setOptions] = useState(initialOptions);
  const [nextKey, setNextKey] = useState(2);
  const [state, action] = useActionState(async (previous: ActionState, formData: FormData) => {
    formData.set('config', JSON.stringify({
      gameId: 'safi-penalty', title, totalPool: Number(pool), minimumScore: Number(minimumScore), strategy,
      status: enabled ? 'active' : 'draft', startsAt: startsAt ? fromLocalInput(startsAt) : new Date().toISOString(),
      endsAt: endsAt ? fromLocalInput(endsAt) : null,
      options: options.map((option) => ({
        amount: Number(option.amount), quantity: option.quantity === '' ? null : Number(option.quantity), weight: Number(option.weight),
        minScore: scoreMode === 'minimum' ? Number(minimumScore) : Number(option.minScore),
        maxScore: scoreMode === 'minimum' ? 10 : Number(option.maxScore),
      })),
    }));
    return createSunCoinCampaign(previous, formData);
  }, idle);
  const summary = coinDistributionSummary(Number(pool), options.map((option) => ({ amount: Number(option.amount), quantity: option.quantity === '' ? null : Number(option.quantity) })));
  const err = (key: string) => state.status === 'error' ? state.fieldErrors?.[key] : undefined;
  const changeOption = (key: number, field: keyof Omit<OptionDraft, 'key'>, value: string) => setOptions((rows) => rows.map((row) => row.key === key ? { ...row, [field]: value } : row));
  const addOption = (amount = '') => {
    setOptions((rows) => [...rows, { key: nextKey, amount, quantity: '', weight: '1', minScore: minimumScore, maxScore: '10' }]);
    setNextKey((key) => key + 1);
  };

  if (state.status === 'success') return (
    <div className="space-y-4">
      <Notice tone="success" title={state.message} />
      <Button onClick={onNew}>Yangi kampaniya</Button>
    </div>
  );

  return (
    <form action={action} className="space-y-6">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      <Checkbox label={`SUN COIN REWARD — ${enabled ? 'ON' : 'OFF'}`} description={enabled ? 'Saqlanganda kampaniya ishga tushadi. Boshlanish sanasi bo‘lsa shu vaqtdan mukofot beradi.' : 'Qoralama saqlanadi. Keyin kampaniyani ishga tushirishingiz mumkin.'} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput name="title" label="Kampaniya nomi" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required error={err('title')} />
        <TextInput name="totalPool" label="Total reward pool (SC)" type="number" value={pool} onChange={(e) => setPool(e.target.value)} min={1} max={COIN_LIMIT} step={1} required error={err('totalPool')} hint="Kampaniya davomida tarqatilishi mumkin bo‘lgan eng ko‘p SUN Coin." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput name="strategy" label="Tarqatish strategiyasi" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
          <option value="FIRST_ELIGIBLE">FIRST_ELIGIBLE — birinchi mos mukofot</option>
          <option value="WEIGHTED_RANDOM">WEIGHTED_RANDOM — vazn bo‘yicha tanlov</option>
        </SelectInput>
        <TextInput name="minimumScore" label="Minimum score (/10 gol)" type="number" min={0} max={10} step={1} value={minimumScore} onChange={(e) => setMinimumScore(e.target.value)} required error={err('minimumScore')} />
      </div>
      <p className="text-sm text-muted">
        {strategy === 'FIRST_ELIGIBLE'
          ? 'Talabga erishgan o‘yinchi uchun ro‘yxatdagi birinchi mavjud mukofot tanlanadi. Qator tartibi — ustuvorlik.'
          : 'Vaznlar nisbiy: masalan, 50 / 30 / 20. Har bir o‘yinda faqat score, pool va miqdorga mos mukofotlar orasidan tanlanadi.'}
      </p>

      <fieldset className="space-y-4">
        <legend className="mb-3 text-base font-semibold">Reward options</legend>
        <div className="flex flex-wrap gap-2" aria-label="Tez mukofot qo‘shish">
          {[1, 3, 5, 10].map((amount) => <Button key={amount} type="button" variant="secondary" disabled={options.length >= COIN_OPTION_LIMIT} onClick={() => addOption(String(amount))}>+ {amount} SC</Button>)}
          <Button type="button" variant="secondary" disabled={options.length >= COIN_OPTION_LIMIT} onClick={() => addOption()}>+ Custom</Button>
        </div>
        <SelectInput name="scoreMode" label="Score sharti" value={scoreMode} onChange={(e) => setScoreMode(e.target.value)}>
          <option value="minimum">Minimum score — barcha variantlar uchun</option>
          <option value="ranges">Har mukofot uchun alohida gol oralig‘i</option>
        </SelectInput>
        {err('options') ? <Notice tone="danger" title={err('options')} /> : null}
        {options.map((option, index) => (
          <div key={option.key} className="space-y-3 rounded-xl border border-line bg-surface-2/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{index + 1}. mukofot</p>
              <div className="flex items-center gap-2">
                {index > 0 ? <Button type="button" variant="ghost" aria-label={`${index + 1}-mukofotni yuqoriga ko‘tarish`} onClick={() => setOptions((rows) => { const reordered = [...rows]; [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]]; return reordered; })}>↑</Button> : null}
                <Button type="button" variant="ghost" onClick={() => setOptions((rows) => rows.filter((row) => row.key !== option.key))} aria-label={`${index + 1}-mukofotni olib tashlash`}>Olib tashlash</Button>
              </div>
            </div>
            <div className={`grid gap-3 ${strategy === 'WEIGHTED_RANDOM' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              <TextInput name={`amount-${option.key}`} label="SUN Coin (SC)" type="number" min={1} max={COIN_LIMIT} step={1} required value={option.amount} onChange={(e) => changeOption(option.key, 'amount', e.target.value)} />
              <TextInput name={`quantity-${option.key}`} label="G‘oliblar soni (ixtiyoriy)" type="number" min={1} max={COIN_LIMIT} step={1} value={option.quantity} onChange={(e) => changeOption(option.key, 'quantity', e.target.value)} placeholder="Pool tugaguncha" hint="Bo‘sh qoldirilsa, faqat pool chegarasi ishlaydi." />
              {strategy === 'WEIGHTED_RANDOM' ? <TextInput name={`weight-${option.key}`} label="Nisbiy vazn" type="number" min={1} max={COIN_LIMIT} step={1} required value={option.weight} onChange={(e) => changeOption(option.key, 'weight', e.target.value)} /> : null}
            </div>
            {scoreMode === 'ranges' ? <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name={`minScore-${option.key}`} label="Gol: dan" type="number" min={0} max={10} step={1} required value={option.minScore} onChange={(e) => changeOption(option.key, 'minScore', e.target.value)} />
              <TextInput name={`maxScore-${option.key}`} label="Gol: gacha" type="number" min={0} max={10} step={1} required value={option.maxScore} onChange={(e) => changeOption(option.key, 'maxScore', e.target.value)} />
            </div> : null}
          </div>
        ))}
        {options.length === 0 ? <Notice title="Kamida bitta reward qo‘shing." /> : null}
        <Button type="button" variant="secondary" disabled={options.length >= COIN_OPTION_LIMIT} onClick={() => addOption()}>+ Add reward</Button>
      </fieldset>

      <div aria-live="polite" className="grid gap-4 rounded-xl border border-line bg-surface-2 p-4 sm:grid-cols-2">
        <div><p className="text-sm text-muted">Maximum distribution</p><p className="mt-1 text-2xl font-bold tabular-nums">{summary.poolLimited ? '≤ ' : ''}{coins(summary.maximumDistribution)}</p></div>
        <div><p className="text-sm text-muted">Remaining unallocated</p><p className={`mt-1 text-2xl font-bold tabular-nums ${summary.exceedsPool ? 'text-danger' : ''}`}>{summary.unallocated === null ? 'Poolga bog‘liq' : coins(summary.unallocated)}</p></div>
        {summary.poolLimited ? <p className="text-sm text-muted sm:col-span-2">Miqdori cheklanmagan variantlar pooldan foydalanadi. Qoldiq eng kichik mukofotdan kam bo‘lsa, tarqatilmay qolishi mumkin. Miqdori belgilangan variantlar jami: {coins(summary.fixedCost)}.</p> : null}
        {summary.exceedsPool ? <p className="text-sm text-danger sm:col-span-2">Mukofotlar pooldan oshdi. Poolni oshiring yoki mukofot miqdorini kamaytiring.</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput name="startsAt" label="Boshlanishi (Toshkent, UTC+5)" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={err('startsAt')} hint="Bo‘sh = hozir." />
        <TextInput name="endsAt" label="Tugashi (Toshkent, UTC+5)" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={err('endsAt')} hint="Bo‘sh = tugash vaqti yo‘q." />
      </div>
      <p className="text-sm text-muted">Faqat Reward Mode natijalari hisobga olinadi. PRO va SUN Coin mukofotlari alohida beriladi. Mashq rejimi bepul va SUN Coin bermaydi.</p>
      <SubmitButton disabled={options.length === 0 || summary.exceedsPool}>{enabled ? 'START CAMPAIGN' : 'Qoralamani saqlash — OFF'}</SubmitButton>
    </form>
  );
}

export function SunCoinCampaignActions({ id, status, title }: { id: string; status: CoinCampaignStatus; title: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(idle);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const transition = (nextStatus: 'active' | 'paused' | 'ended') => start(async () => {
    const result = await setSunCoinCampaignStatus(id, nextStatus);
    setState(result);
    if (result.status === 'success') setConfirmEnd(false);
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === 'active' ? <Button variant="secondary" loading={pending} onClick={() => transition('paused')}>PAUSE — OFF</Button> : null}
        {status === 'paused' || status === 'draft' ? <Button loading={pending} onClick={() => transition('active')}>{status === 'draft' ? 'START CAMPAIGN — ON' : 'RESUME — ON'}</Button> : null}
        {status === 'active' || status === 'paused' ? <Button variant="danger" disabled={pending} onClick={() => setConfirmEnd(true)}>END CAMPAIGN</Button> : null}
      </div>
      {state.status !== 'idle' && state.message ? <Notice tone={state.status === 'error' ? 'danger' : 'success'} title={state.message} /> : null}
      <Dialog open={confirmEnd} onClose={() => { if (!pending) setConfirmEnd(false); }} title="Kampaniyani tugatish" description={`${title} tugatilgach qayta ishga tushirilmaydi. Barcha mukofotlar va tarix saqlanadi.`}>
        {state.status === 'error' ? <div className="mb-4"><Notice tone="danger" title={state.message} /></div> : null}
        <div className="flex justify-end gap-3"><Button variant="secondary" disabled={pending} onClick={() => setConfirmEnd(false)}>Bekor qilish</Button><Button variant="danger" loading={pending} onClick={() => transition('ended')}>Kampaniyani tugatish</Button></div>
      </Dialog>
    </div>
  );
}
