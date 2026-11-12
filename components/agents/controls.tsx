'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import {
  addAgentMemory,
  approveAgentItem,
  buildAgentDirections,
  connectAgentInstagram,
  deactivateAgentMemory,
  deleteAgentAsset,
  disconnectAgentInstagram,
  fixAgentItem,
  generateAgentNow,
  publishAgentNow,
  regenerateAgentItem,
  rejectAgentItem,
  rescheduleAgentItem,
  runAgentResearch,
  setAgentProfileStatus,
  toggleAgentPublishing,
  uploadAgentAssets,
  type AgentResult,
} from '@/lib/actions/agents';
import { idle, type ActionState } from '@/lib/actions/state';

/** Natija xabari (server amalidan keyin). */
function Result({ r }: { r: AgentResult | null }) {
  if (!r) return null;
  return <p className={`mt-2 text-[13px] ${r.ok ? 'text-success' : 'text-danger'}`}>{r.message}</p>;
}

type Act =
  | { kind: 'approve'; itemId: string }
  | { kind: 'regenerate'; itemId: string }
  | { kind: 'publish'; itemId: string }
  | { kind: 'status'; profileId: string; action: 'pause' | 'resume' | 'archive' }
  | { kind: 'deleteAsset'; assetId: string }
  | { kind: 'forget'; memoryId: string }
  | { kind: 'connect'; profileId: string; force?: boolean }
  | { kind: 'disconnect'; profileId: string }
  | { kind: 'research'; profileId: string }
  | { kind: 'directions'; profileId: string }
  | { kind: 'publishing'; on: boolean };

function run(a: Act): Promise<AgentResult> {
  switch (a.kind) {
    case 'approve':
      return approveAgentItem(a.itemId);
    case 'regenerate':
      return regenerateAgentItem(a.itemId);
    case 'publish':
      return publishAgentNow(a.itemId);
    case 'status':
      return setAgentProfileStatus(a.profileId, a.action);
    case 'deleteAsset':
      return deleteAgentAsset(a.assetId);
    case 'forget':
      return deactivateAgentMemory(a.memoryId);
    case 'connect':
      return connectAgentInstagram(a.profileId, !!a.force);
    case 'disconnect':
      return disconnectAgentInstagram(a.profileId);
    case 'research':
      return runAgentResearch(a.profileId);
    case 'directions':
      return buildAgentDirections(a.profileId);
    case 'publishing':
      return toggleAgentPublishing(a.on);
  }
}

/** Bitta amal tugmasi: tasdiq so'rovi (ixtiyoriy), kutish holati, natija xabari. */
export function ActionButton({ act, children, variant = 'secondary', confirm, busy }: { act: Act; children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; confirm?: string; busy?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<AgentResult | null>(null);
  return (
    <div className="inline-flex flex-col">
      <Button
        type="button"
        variant={variant}
        loading={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const res = await run(act);
            setR(res);
            router.refresh();
          });
        }}
      >
        {pending && busy ? busy : children}
      </Button>
      <Result r={r} />
    </div>
  );
}

export function RejectButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<AgentResult | null>(null);
  return (
    <div className="inline-flex flex-col">
      <Button
        type="button"
        variant="danger"
        loading={pending}
        onClick={() => {
          const reason = window.prompt('Nega rad etilmoqda? (sabab xotiraga yoziladi, g‘oya qaytarilmaydi)', '');
          if (reason === null) return;
          start(async () => {
            setR(await rejectAgentItem(itemId, reason));
            router.refresh();
          });
        }}
      >
        Rad etish
      </Button>
      <Result r={r} />
    </div>
  );
}

export function FixForm({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<AgentResult | null>(null);
  const [comment, setComment] = useState('');
  const [rule, setRule] = useState(false);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await fixAgentItem(itemId, comment, rule);
          setR(res);
          if (res.ok) setComment('');
          router.refresh();
        });
      }}
    >
      <TextArea label="Nimani tuzatish kerak?" name="comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Masalan: 2-kadr juda uzun, soddaroq yoz; hazilroq ohang" required />
      <Checkbox label="Doimiy brend qoidasi sifatida saqlash" description="Belgilansa — keyingi barcha materiallarda qo‘llanadi. Aks holda faqat shu material uchun." checked={rule} onChange={(e) => setRule(e.target.checked)} />
      <div>
        <Button type="submit" loading={pending}>
          {pending ? 'Qayta yozilmoqda…' : 'Tuzatib qayta yaratish'}
        </Button>
      </div>
      <Result r={r} />
    </form>
  );
}

export function RescheduleForm({ itemId, date, time }: { itemId: string; date: string; time: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<AgentResult | null>(null);
  const [d, setD] = useState(date);
  const [t, setT] = useState(time);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setR(await rescheduleAgentItem(itemId, d, t));
          router.refresh();
        });
      }}
    >
      <TextInput label="Sana" type="date" name="date" value={d} onChange={(e) => setD(e.target.value)} />
      <TextInput label="Vaqt" type="time" name="time" value={t} onChange={(e) => setT(e.target.value)} />
      <Button type="submit" variant="secondary" loading={pending}>
        Ko‘chirish
      </Button>
      <div className="basis-full">
        <Result r={r} />
      </div>
    </form>
  );
}

export function GenerateNow({ profileId, today, storiesPerDay }: { profileId: string; today: string; storiesPerDay: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<AgentResult | null>(null);
  const [kind, setKind] = useState<'story' | 'post'>('story');
  const [d, setD] = useState(today);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await generateAgentNow(profileId, kind, d);
          setR(res);
          if (res.itemId && res.ok) router.push(`/agents/kontent/${res.itemId}`);
          else router.refresh();
        });
      }}
    >
      <SelectInput label="Format" name="kind" value={kind} onChange={(e) => setKind(e.target.value as 'story' | 'post')}>
        <option value="story">Story ({storiesPerDay} kadr)</option>
        <option value="post">Rasmli post</option>
      </SelectInput>
      <TextInput label="Sana" type="date" name="date" value={d} onChange={(e) => setD(e.target.value)} />
      <Button type="submit" loading={pending}>
        {pending ? 'Agentlar ishlamoqda…' : 'Hozir tayyorlash'}
      </Button>
      <div className="basis-full">
        <Result r={r} />
      </div>
    </form>
  );
}

export function MemoryForm({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<AgentResult | null>(null);
  const [kind, setKind] = useState('brand_rule');
  const [text, setText] = useState('');
  return (
    <form
      className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addAgentMemory(profileId, kind, text);
          setR(res);
          if (res.ok) setText('');
          router.refresh();
        });
      }}
    >
      <SelectInput label="Turi" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="brand_rule">Doimiy brend qoidasi</option>
        <option value="preference">Afzallik</option>
        <option value="fact">Tasdiqlangan fakt</option>
        <option value="plan">Kelgusi reja</option>
      </SelectInput>
      <TextInput label="Matn" name="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Masalan: “arzon” so‘zini ishlatma; har doim “siz” deb murojaat qil" />
      <Button type="submit" loading={pending}>
        Qo‘shish
      </Button>
      <div className="sm:col-span-3">
        <Result r={r} />
      </div>
    </form>
  );
}

export function AssetUpload({ profileId }: { profileId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(uploadAgentAssets.bind(null, profileId), idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[180px_1fr_1fr_auto] sm:items-end">
      <SelectInput label="Turi" name="kind" defaultValue="product">
        <option value="logo">Logotip</option>
        <option value="product">Haqiqiy mahsulot rasmi</option>
        <option value="style">Uslub namunasi</option>
        <option value="reference">Reference</option>
      </SelectInput>
      <TextInput label="Izoh (mahsulot nomi)" name="note" placeholder="Masalan: Hikvision ColorVu" hint="G‘oyaga mos fotoni tanlashda ishlatiladi" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="files" className="text-[13px] font-medium text-muted">
          Rasmlar (PNG, JPEG, WebP; har biri ≤ 2,8 MB)
        </label>
        <input id="files" name="files" type="file" accept="image/png,image/jpeg,image/webp" multiple required className="text-sm" />
      </div>
      <SubmitButton>Yuklash</SubmitButton>
      {state.status !== 'idle' ? (
        <div className="sm:col-span-4">
          <Notice tone={state.status === 'success' ? 'success' : 'danger'}>{state.message}</Notice>
        </div>
      ) : null}
    </form>
  );
}
