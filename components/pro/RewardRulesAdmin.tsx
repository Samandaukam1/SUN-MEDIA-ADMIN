'use client';

import { useActionState, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, SelectInput, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createRewardCampaign, setRewardCampaignStatus, setSafiLevel, updateRewardCampaign } from '@/lib/actions/game-rewards';
import { idle, type ActionState } from '@/lib/actions/state';
import {
  DEFAULT_REWARD_RULES,
  PRO_DAYS_LIMIT,
  REWARD_LIMIT,
  SAFI_LEVELS,
  percent,
  ruleOdds,
  type LevelProfile,
  type RewardCampaignRow,
  type RewardRuleInput,
  type RewardType,
  type SafiLevel,
} from '@/lib/schemas/game-rewards';
import { fromLocalInput, toLocalInput } from '@/lib/time';

/** The five hidden levels with what each one means for a 10-shot round (the exact server distribution). */
export function SafiLevelPicker({ current, levels }: { current: SafiLevel; levels: LevelProfile[] }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(idle);
  const profile = levels.find((l) => l.key === current);
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-5">
        {SAFI_LEVELS.map((l) => {
          const p = levels.find((x) => x.key === l.key);
          return (
            <button
              key={l.key}
              type="button"
              disabled={pending}
              aria-pressed={l.key === current}
              onClick={() => start(async () => setState(await setSafiLevel(l.key)))}
              className={`rounded-xl border p-3 text-left transition ${l.key === current ? 'border-accent bg-accent/10' : 'border-line hover:bg-surface-2'}`}
            >
              <span className="block font-semibold">{l.label}</span>
              {p ? <span className="mt-1 block text-sm text-muted">Juda yaxshi natija: {p.top}/10</span> : null}
              {p ? <span className="block text-xs text-subtle">O‘rtacha ≈ {p.average.toFixed(1)} gol</span> : null}
            </button>
          );
        })}
      </div>
      {profile ? <Distribution profile={profile} /> : null}
      <p className="text-sm text-muted">
        Ichki sozlama — o‘yinchi darajani, chegarani va qoidalarni ko‘rmaydi. Har zarbani server hal qiladi; tovuq raund davomida
        asta kuchayadi va bu darajada {profile?.top ?? '—'} goldan ortig‘iga yo‘l qo‘ymaydi. Yangi raundlarga qo‘llanadi.
      </p>
      {state.status !== 'idle' && state.message ? <Notice tone={state.status === 'error' ? 'danger' : 'success'} title={state.message} /> : null}
    </div>
  );
}

function Distribution({ profile }: { profile: LevelProfile }) {
  const peak = Math.max(...profile.distribution);
  return (
    <div aria-label="Natijalar taqsimoti" className="rounded-xl bg-surface-2 p-4">
      <p className="mb-3 text-sm text-muted">10 zarbalik raund natijalari (har 100 raunddan taxminan):</p>
      <div className="flex items-end gap-1.5" style={{ height: 96 }}>
        {profile.distribution.map((p, score) => (
          <div key={score} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${score}/10 — ${percent(p)}`}>
            <span className="text-[10px] tabular-nums text-subtle">{p >= 0.005 ? Math.round(p * 100) : p > 0 ? '<1' : ''}</span>
            <div className={`w-full rounded-t ${score === profile.top ? 'bg-accent' : 'bg-line'}`} style={{ height: `${peak > 0 ? Math.max(2, (p / peak) * 64) : 2}px` }} />
            <span className="text-xs tabular-nums text-muted">{score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Row = RewardRuleInput & { key: number; awarded: number };
const toRows = (rules: RewardRuleInput[], awarded: (score: number) => number = () => 0): Row[] =>
  rules.map((r, i) => ({ ...r, key: i, awarded: awarded(r.score) }));

/** Rule rows: score → SUN Coin or Pro days, optional quantity, on / off. Shows how often the current level pays each rule. */
function RulesFields({ rows, setRows, removed, setRemoved, profile }: {
  rows: Row[];
  setRows: (update: (rows: Row[]) => Row[]) => void;
  removed?: number[];
  setRemoved?: (update: (scores: number[]) => number[]) => void;
  profile?: LevelProfile;
}) {
  const odds = profile ? ruleOdds(profile.distribution, rows) : null;
  const change = (key: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const free = Array.from({ length: 10 }, (_, i) => i + 1).filter((s) => !rows.some((r) => r.score === s));
  const nextKey = rows.reduce((m, r) => Math.max(m, r.key), -1) + 1;
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-base font-semibold">Mukofot qoidalari — gol soni bo‘yicha</legend>
      <p className="text-sm text-muted">O‘yinchi erishgan eng yuqori yoqilgan qoida beriladi (bitta raundga bitta mukofot). Masalan, 9 ta gol va 9-qoida OFF bo‘lsa — 8-qoida.</p>
      {rows.map((r) => {
        const unreachable = profile && r.enabled && r.score > profile.top;
        return (
          <div key={r.key} className={`grid items-end gap-3 rounded-xl border p-3 sm:grid-cols-[108px_150px_1fr_1fr_auto] ${r.enabled ? 'border-line' : 'border-dashed border-line opacity-70'}`}>
            <SelectInput label="Gol" value={r.score} disabled={r.awarded > 0} onChange={(e) => change(r.key, { score: Number(e.target.value) })}>
              {[r.score, ...free].sort((a, b) => a - b).map((s) => <option key={s} value={s}>{s}/10</option>)}
            </SelectInput>
            <SelectInput label="Mukofot turi" value={r.type} onChange={(e) => change(r.key, { type: e.target.value as RewardType })}>
              <option value="SUN_COIN">SUN Coin</option>
              <option value="PRO_DAYS">Pro (kun)</option>
            </SelectInput>
            <TextInput label={r.type === 'SUN_COIN' ? 'Miqdor (SC)' : 'Muddat (kun)'} type="number" min={1} max={r.type === 'SUN_COIN' ? REWARD_LIMIT : PRO_DAYS_LIMIT} step={1} required
              value={Number.isFinite(r.amount) ? r.amount : ''} onChange={(e) => change(r.key, { amount: e.target.value === '' ? Number.NaN : Number(e.target.value) })} />
            <TextInput label="Soni (ixtiyoriy)" type="number" min={Math.max(1, r.awarded)} max={REWARD_LIMIT} step={1} placeholder="Cheklanmagan"
              hint={r.awarded > 0 ? `Berilgan: ${r.awarded}` : undefined}
              value={r.quantity ?? ''} onChange={(e) => change(r.key, { quantity: e.target.value === '' ? null : Number(e.target.value) })} />
            <div className="flex items-center gap-2 pb-1">
              <Checkbox label={r.enabled ? 'ON' : 'OFF'} checked={r.enabled} onChange={(e) => change(r.key, { enabled: e.target.checked })} />
              {r.awarded === 0 ? (
                <Button type="button" variant="ghost" aria-label={`${r.score}-gol qoidasini olib tashlash`} onClick={() => {
                  setRows((all) => all.filter((x) => x.key !== r.key));
                  setRemoved?.((scores) => [...scores, r.score]);
                }}>✕</Button>
              ) : null}
            </div>
            {odds || unreachable ? (
              <p className="text-xs text-muted sm:col-span-5">
                {unreachable
                  ? `Joriy darajada ${profile?.top}/10 dan yuqori natija bo‘lmaydi — bu qoida hozir berilmaydi.`
                  : r.enabled && odds?.has(r.score) ? `Joriy darajada ≈ ${percent(odds.get(r.score) ?? 0)} raund shu mukofotni oladi.` : 'OFF — berilmaydi.'}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={free.length === 0} onClick={() => setRows((all) => [...all, { key: nextKey, score: free[0], type: 'SUN_COIN', amount: 1, quantity: null, enabled: true, awarded: 0 }])}>+ Qoida qo‘shish</Button>
        {removed && removed.length ? <span className="self-center text-sm text-muted">Olib tashlanadi: {[...removed].sort((a, b) => a - b).join(', ')}-gol</span> : null}
      </div>
    </fieldset>
  );
}

const clean = (rows: Row[]) => rows.map(({ score, type, amount, quantity, enabled }) => ({ score, type, amount, quantity, enabled }));

export function RewardCampaignBuilder({ profile }: { profile?: LevelProfile }) {
  const [version, setVersion] = useState(0);
  return <CampaignForm key={version} profile={profile} onNew={() => setVersion((v) => v + 1)} />;
}

function CampaignForm({ profile, onNew }: { profile?: LevelProfile; onNew: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState('SAFI Penalty mukofotlari');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [rows, setRowsState] = useState<Row[]>(() => toRows(DEFAULT_REWARD_RULES));
  const setRows = (update: (rows: Row[]) => Row[]) => setRowsState(update);
  const [state, action] = useActionState(async (previous: ActionState, formData: FormData) => {
    formData.set('config', JSON.stringify({
      gameId: 'safi-penalty', title, status: enabled ? 'active' : 'draft',
      startsAt: startsAt ? fromLocalInput(startsAt) : new Date().toISOString(), endsAt: endsAt ? fromLocalInput(endsAt) : null,
      rules: clean(rows),
    }));
    return createRewardCampaign(previous, formData);
  }, idle);
  const err = (key: string) => (state.status === 'error' ? state.fieldErrors?.[key] : undefined);
  if (state.status === 'success') return (
    <div className="space-y-4">
      <Notice tone="success" title={state.message} />
      <Button onClick={onNew}>Yana kampaniya</Button>
    </div>
  );
  return (
    <form action={action} className="space-y-5">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      <Checkbox label={enabled ? 'Saqlanganda darhol yoqiladi (ON)' : 'Qoralama (OFF) — keyin yoqasiz'} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      <TextInput label="Kampaniya nomi" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required error={err('title')} />
      <RulesFields rows={rows} setRows={setRows} profile={profile} />
      {err('rules') ? <Notice tone="danger" title={err('rules')} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Boshlanishi (Toshkent)" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={err('startsAt')} hint="Bo‘sh = hozir." />
        <TextInput label="Tugashi (Toshkent)" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={err('endsAt')} hint="Bo‘sh = muddatsiz." />
      </div>
      <SubmitButton disabled={rows.length === 0}>{enabled ? 'Kampaniyani yoqish' : 'Qoralamani saqlash'}</SubmitButton>
    </form>
  );
}

/** Edit a live or paused campaign in place: switch rules on / off, change amounts, quantities, name and dates. */
export function RewardCampaignEditor({ campaign, profile }: { campaign: RewardCampaignRow; profile?: LevelProfile }) {
  const [title, setTitle] = useState(campaign.title);
  const [startsAt, setStartsAt] = useState(toLocalInput(campaign.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(campaign.endsAt));
  const [rows, setRowsState] = useState<Row[]>(() => campaign.rules.map((r, i) => ({ key: i, score: r.score, type: r.type, amount: r.amount, quantity: r.quantity, enabled: r.enabled, awarded: r.awarded })));
  const [removed, setRemovedState] = useState<number[]>([]);
  const [state, action] = useActionState(async (previous: ActionState, formData: FormData) => {
    formData.set('config', JSON.stringify({
      title, startsAt: fromLocalInput(startsAt) ?? campaign.startsAt, endsAt: endsAt ? fromLocalInput(endsAt) : null, rules: clean(rows),
    }));
    formData.set('removed', JSON.stringify(removed.filter((s) => !rows.some((r) => r.score === s))));
    return updateRewardCampaign(campaign.id, previous, formData);
  }, idle);
  const err = (key: string) => (state.status === 'error' ? state.fieldErrors?.[key] : undefined);
  return (
    <form action={action} className="space-y-5">
      {state.status !== 'idle' && state.message ? <Notice tone={state.status === 'error' ? 'danger' : 'success'} title={state.message} /> : null}
      <TextInput label="Kampaniya nomi" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required error={err('title')} />
      <RulesFields rows={rows} setRows={(u) => setRowsState(u)} removed={removed} setRemoved={(u) => setRemovedState(u)} profile={profile} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Boshlanishi (Toshkent)" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={err('startsAt')} />
        <TextInput label="Tugashi (Toshkent)" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={err('endsAt')} hint="Bo‘sh = muddatsiz." />
      </div>
      <SubmitButton disabled={rows.length === 0}>O‘zgarishlarni saqlash</SubmitButton>
    </form>
  );
}

export function RewardCampaignStatusActions({ id, status, title }: { id: string; status: RewardCampaignRow['status']; title: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(idle);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const go = (next: 'active' | 'paused' | 'ended') => start(async () => {
    const result = await setRewardCampaignStatus(id, next);
    setState(result);
    if (result.status === 'success') setConfirmEnd(false);
  });
  if (status === 'ended') return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === 'active' ? <Button variant="secondary" loading={pending} onClick={() => go('paused')}>Pauza — OFF</Button> : null}
        {status === 'paused' || status === 'draft' ? <Button loading={pending} onClick={() => go('active')}>{status === 'draft' ? 'Yoqish — ON' : 'Davom ettirish — ON'}</Button> : null}
        {status !== 'draft' ? <Button variant="danger" disabled={pending} onClick={() => setConfirmEnd(true)}>Tugatish</Button> : null}
      </div>
      {state.status !== 'idle' && state.message ? <Notice tone={state.status === 'error' ? 'danger' : 'success'} title={state.message} /> : null}
      <Dialog open={confirmEnd} onClose={() => { if (!pending) setConfirmEnd(false); }} title="Kampaniyani tugatish" description={`${title} tugatilgach qayta yoqilmaydi va o‘zgartirilmaydi. Berilgan mukofotlar tarixi saqlanadi.`}>
        {state.status === 'error' ? <div className="mb-4"><Notice tone="danger" title={state.message} /></div> : null}
        <div className="flex justify-end gap-3"><Button variant="secondary" disabled={pending} onClick={() => setConfirmEnd(false)}>Bekor qilish</Button><Button variant="danger" loading={pending} onClick={() => go('ended')}>Tugatish</Button></div>
      </Dialog>
    </div>
  );
}
