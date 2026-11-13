'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import {
  addAgentMemory,
  approveAgentItem,
  archiveAgentAsset,
  cancelAgentJob,
  checkAgentModels,
  commentAgentItem,
  deactivateAgentMemory,
  dismissAgentTrend,
  editAgentItem,
  generateAgentNow,
  manualAgentText,
  markPublishedManually,
  regenerateAgentItem,
  rejectAgentItem,
  reorderAgentSlides,
  rescheduleAgentItem,
  restoreAgentVersion,
  retryAgentJob,
  allowAgentOverBudget,
  runAgentResearch,
  setAgentProfileStatus,
  toggleCampaign,
  type AgentResult,
} from '@/lib/actions/agents';

function Result({ r }: { r: AgentResult | null }) {
  if (!r) return null;
  return <p className={`mt-2 text-[13px] ${r.ok ? 'text-success' : 'text-danger'}`}>{r.message}</p>;
}

type Act =
  | { kind: 'approve'; itemId: string }
  | { kind: 'regenerate'; itemId: string }
  | { kind: 'restore'; itemId: string; versionId: string }
  | { kind: 'status'; profileId: string; action: 'pause' | 'resume' | 'archive' | 'stop' | 'unstop' }
  | { kind: 'archiveAsset'; assetId: string; restore?: boolean }
  | { kind: 'forget'; memoryId: string }
  | { kind: 'research'; profileId: string }
  | { kind: 'campaign'; id: string; active: boolean }
  | { kind: 'retry'; jobId: string }
  | { kind: 'cancel'; jobId: string }
  | { kind: 'allowOver'; itemId: string }
  | { kind: 'dismissTrend'; id: string };

function run(a: Act): Promise<AgentResult> {
  switch (a.kind) {
    case 'approve':
      return approveAgentItem(a.itemId);
    case 'regenerate':
      return regenerateAgentItem(a.itemId);
    case 'restore':
      return restoreAgentVersion(a.itemId, a.versionId);
    case 'status':
      return setAgentProfileStatus(a.profileId, a.action);
    case 'archiveAsset':
      return archiveAgentAsset(a.assetId, a.restore);
    case 'forget':
      return deactivateAgentMemory(a.memoryId);
    case 'research':
      return runAgentResearch(a.profileId);
    case 'campaign':
      return toggleCampaign(a.id, a.active);
    case 'retry':
      return retryAgentJob(a.jobId);
    case 'cancel':
      return cancelAgentJob(a.jobId);
    case 'allowOver':
      return allowAgentOverBudget(a.itemId);
    case 'dismissTrend':
      return dismissAgentTrend(a.id);
  }
}

/** One action button: optional confirmation, a pending state, the result message. */
export function ActionButton({ act, children, variant = 'secondary', confirm }: { act: Act; children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; confirm?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<AgentResult | null>(null);
  return (
    <div>
      <Button
        type="button"
        variant={variant}
        loading={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const res = await run(act).catch(() => ({ ok: false, message: 'Aloqa uzildi.' }));
            setR(res);
            router.refresh();
          });
        }}
      >
        {children}
      </Button>
      <Result r={r} />
    </div>
  );
}

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState<AgentResult | null>(null);
  const go = (fn: () => Promise<AgentResult>, after?: (res: AgentResult) => void) =>
    start(async () => {
      const res = await fn().catch(() => ({ ok: false, message: 'Aloqa uzildi.' }));
      setR(res);
      after?.(res);
      router.refresh();
    });
  return { pending, r, go };
}

export function GenerateNow({ profileId }: { profileId: string }) {
  const router = useRouter();
  const { pending, r, go } = useAct();
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(['story', 'carousel'] as const).map((k) => (
          <Button key={k} type="button" variant="secondary" loading={pending} onClick={() => go(() => generateAgentNow(profileId, k), (res) => ((res as { itemId?: string }).itemId ? router.push(`/agents/kontent/${(res as { itemId?: string }).itemId}`) : null))}>
            {k === 'story' ? 'Story yaratish' : 'Karusel yaratish'}
          </Button>
        ))}
      </div>
      <Result r={r} />
    </div>
  );
}

/** "Tahrirlash": instruction in plain words; slides to touch (none = the instruction decides). */
export function EditPanel({ itemId, slides, disabled }: { itemId: string; slides: number; disabled?: boolean }) {
  const { pending, r, go } = useAct();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const examples = ['Orqa fonni ochroq qil', 'Logoni biroz kichraytir', 'Matnni tepaga ko‘chir', 'Sarlavhani qisqartir', 'Ko‘proq premium uslubda qil', slides > 1 ? 'Faqat ikkinchi slaydni qayta yarat' : 'Mahsulotni sal kattalashtir'];
  return (
    <div className="flex flex-col gap-3">
      <TextArea label="Nimani o‘zgartirish kerak?" name="instruction" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Masalan: Telefon raqamni pastga joylashtir" />
      <div className="flex flex-wrap gap-1.5">
        {examples.map((x) => (
          <button key={x} type="button" onClick={() => setText(x)} className="rounded-full border border-line px-3 py-1 text-[12px] text-muted hover:border-accent hover:text-ink">
            {x}
          </button>
        ))}
      </div>
      {slides > 1 ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">Faqat shu slaydlar:</span>
          {Array.from({ length: slides }, (_, i) => (
            <label key={i} className="flex items-center gap-1">
              <input type="checkbox" checked={picked.includes(i)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i] : p.filter((x) => x !== i)))} className="accent-[var(--accent)]" />
              {i + 1}
            </label>
          ))}
          <span className="text-[12px] text-subtle">(tanlanmasa — ko‘rsatmadan aniqlanadi)</span>
        </div>
      ) : null}
      <div>
        <Button type="button" loading={pending} disabled={disabled || text.trim().length < 3} onClick={() => go(() => editAgentItem(itemId, text, picked))}>
          Tahrirlash
        </Button>
      </div>
      <p className="text-[12px] text-subtle">Joylashuv, o‘lcham va matn — rasm qayta chizilmasdan; fon yoki obyekt o‘zgarishi — AI tahriri (faqat tanlangan kadrlar). Yangi versiya qayta tasdiqlanadi.</p>
      <Result r={r} />
    </div>
  );
}

export function RegenerateForm({ itemId, disabled }: { itemId: string; disabled?: boolean }) {
  const { pending, r, go } = useAct();
  const [text, setText] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <TextInput label="Yangi variant uchun yo‘nalish (ixtiyoriy)" name="regen" value={text} onChange={(e) => setText(e.target.value)} placeholder="Masalan: yozgi kayfiyat, mahsulot yaqindan" />
      <div>
        <Button type="button" variant="secondary" loading={pending} disabled={disabled} onClick={() => go(() => regenerateAgentItem(itemId, text))}>
          Qayta yaratish
        </Button>
      </div>
      <Result r={r} />
    </div>
  );
}

export function RejectButton({ itemId }: { itemId: string }) {
  const { pending, r, go } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open)
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Rad etish
      </Button>
    );
  return (
    <div className="flex flex-col gap-2">
      <TextInput label="Sababi (agent eslab qoladi)" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <Button type="button" variant="danger" loading={pending} onClick={() => go(() => rejectAgentItem(itemId, reason))}>
          Rad etish
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Bekor
        </Button>
      </div>
      <Result r={r} />
    </div>
  );
}

export function ApproveButton({ itemId, disabled, reason }: { itemId: string; disabled?: boolean; reason?: string }) {
  const { pending, r, go } = useAct();
  return (
    <div>
      <Button type="button" loading={pending} disabled={disabled} onClick={() => go(() => approveAgentItem(itemId))}>
        Tasdiqlash
      </Button>
      {disabled && reason ? <p className="mt-1 text-[12px] text-subtle">{reason}</p> : null}
      <Result r={r} />
    </div>
  );
}

/** Wording by hand: re-composed on the same pictures (no AI cost); a new version that needs approval. */
export function ManualTextForm({ itemId, frames, caption, hashtags }: { itemId: string; frames: { headline: string; body: string; cta: string }[]; caption: string; hashtags: string }) {
  const { pending, r, go } = useAct();
  const [f, setF] = useState(frames);
  const [c, setC] = useState(caption);
  const [h, setH] = useState(hashtags);
  return (
    <div className="flex flex-col gap-3">
      {f.map((x, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-3">
          <TextInput label={`${i + 1}. Sarlavha`} name={`h${i}`} value={x.headline} maxLength={90} onChange={(e) => setF(f.map((y, j) => (j === i ? { ...y, headline: e.target.value } : y)))} />
          <TextInput label="Matn" name={`b${i}`} value={x.body} maxLength={260} onChange={(e) => setF(f.map((y, j) => (j === i ? { ...y, body: e.target.value } : y)))} />
          <TextInput label="CTA" name={`c${i}`} value={x.cta} maxLength={48} onChange={(e) => setF(f.map((y, j) => (j === i ? { ...y, cta: e.target.value } : y)))} />
        </div>
      ))}
      <TextArea label="Caption" name="caption" rows={5} value={c} onChange={(e) => setC(e.target.value)} />
      <TextInput label="Heshteglar" name="hashtags" value={h} onChange={(e) => setH(e.target.value)} />
      <div>
        <Button type="button" variant="secondary" loading={pending} onClick={() => go(() => manualAgentText(itemId, { frames: f, caption: c, hashtags: h }))}>
          Matnni saqlash (yangi versiya)
        </Button>
      </div>
      <Result r={r} />
    </div>
  );
}

export function ReorderSlides({ itemId, thumbs }: { itemId: string; thumbs: string[] }) {
  const { pending, r, go } = useAct();
  const [order, setOrder] = useState(thumbs.map((_, i) => i));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {order.map((src, i) => (
          <div key={src} className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbs[src]} alt={`${src + 1}-slayd`} className="h-28 w-[89px] rounded-lg border border-line object-cover" loading="lazy" />
            <div className="flex gap-1 text-[12px]">
              <button type="button" onClick={() => move(i, -1)} className="rounded border border-line px-2" aria-label="Chapga">
                ←
              </button>
              <span>{i + 1}</span>
              <button type="button" onClick={() => move(i, 1)} className="rounded border border-line px-2" aria-label="O‘ngga">
                →
              </button>
            </div>
          </div>
        ))}
      </div>
      <div>
        <Button type="button" variant="secondary" loading={pending} disabled={order.every((x, i) => x === i)} onClick={() => go(() => reorderAgentSlides(itemId, order))}>
          Tartibni saqlash (yangi versiya)
        </Button>
      </div>
      <Result r={r} />
    </div>
  );
}

export function CommentForm({ itemId }: { itemId: string }) {
  const { pending, r, go } = useAct();
  const [text, setText] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <TextArea label="Izoh" name="comment" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      <div>
        <Button type="button" variant="ghost" loading={pending} disabled={!text.trim()} onClick={() => go(() => commentAgentItem(itemId, text), (res) => (res.ok ? setText('') : null))}>
          Izoh qo‘shish
        </Button>
      </div>
      <Result r={r} />
    </div>
  );
}

export function PublishedForm({ itemId }: { itemId: string }) {
  const { pending, r, go } = useAct();
  const [note, setNote] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <TextInput label="Izoh (ixtiyoriy: havola, vaqt)" name="pub_note" value={note} onChange={(e) => setNote(e.target.value)} />
      <div>
        <Button type="button" variant="secondary" loading={pending} onClick={() => go(() => markPublishedManually(itemId, note))}>
          Qo‘lda joylandi
        </Button>
      </div>
      <Result r={r} />
    </div>
  );
}

export function RescheduleForm({ itemId, date, time }: { itemId: string; date: string; time: string }) {
  const { pending, r, go } = useAct();
  const [d, setD] = useState(date);
  const [t, setT] = useState(time);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <TextInput label="Sana" name="date" type="date" value={d} onChange={(e) => setD(e.target.value)} />
      <TextInput label="Vaqt" name="time" type="time" value={t} onChange={(e) => setT(e.target.value)} />
      <Button type="button" variant="ghost" loading={pending} onClick={() => go(() => rescheduleAgentItem(itemId, d, t))}>
        Vaqtni o‘zgartirish
      </Button>
      <Result r={r} />
    </div>
  );
}

export function MemoryForm({ profileId }: { profileId: string }) {
  const { pending, r, go } = useAct();
  const [kind, setKind] = useState('brand_rule');
  const [text, setText] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 text-[13px]">
        {[
          ['brand_rule', 'Brend qoidasi'],
          ['preference', 'Afzallik'],
          ['fact', 'Tasdiqlangan fakt'],
          ['plan', 'Kontent yo‘nalishi'],
        ].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full border px-3 py-1 ${kind === k ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted'}`}>
            {l}
          </button>
        ))}
      </div>
      <TextArea label="Matn" name="memory" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      <div>
        <Button type="button" variant="secondary" loading={pending} disabled={!text.trim()} onClick={() => go(() => addAgentMemory(profileId, kind, text), (res) => (res.ok ? setText('') : null))}>
          Qo‘shish
        </Button>
      </div>
      <Result r={r} />
    </div>
  );
}

/** Large preview with slide navigation (9:16 for a Story, 4:5 for a carousel). */
export function SlideViewer({ slides, kind }: { slides: { src: string; alt: string }[]; kind: string }) {
  const [i, setI] = useState(0);
  if (!slides.length) return <div className="flex aspect-[4/5] items-center justify-center rounded-2xl border border-dashed border-line text-sm text-muted">Hali rasm yo‘q</div>;
  const story = kind === 'story';
  return (
    <div className="flex flex-col gap-3">
      <div className={`relative mx-auto w-full overflow-hidden rounded-2xl border border-line bg-surface-2 ${story ? 'max-w-[360px]' : 'max-w-[480px]'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slides[i].src} alt={slides[i].alt} className={`w-full ${story ? 'aspect-[9/16]' : 'aspect-[4/5]'} object-cover`} />
        {slides.length > 1 ? (
          <>
            <button type="button" aria-label="Oldingi" onClick={() => setI((i - 1 + slides.length) % slides.length)} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white">
              ‹
            </button>
            <button type="button" aria-label="Keyingi" onClick={() => setI((i + 1) % slides.length)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white">
              ›
            </button>
            <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2.5 py-1 text-[12px] text-white">
              {i + 1}/{slides.length}
            </span>
          </>
        ) : null}
      </div>
      {slides.length > 1 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {slides.map((s, j) => (
            <button key={s.src} type="button" onClick={() => setI(j)} aria-label={`${j + 1}-slayd`} className={`overflow-hidden rounded-lg border-2 ${j === i ? 'border-accent' : 'border-transparent'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt="" className="h-20 w-16 object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Two versions side by side. */
export function VersionCompare({ versions, kind }: { versions: { id: string; label: string; thumbs: string[] }[]; kind: string }) {
  const [a, setA] = useState(versions[1]?.id ?? versions[0]?.id ?? '');
  const [b, setB] = useState(versions[0]?.id ?? '');
  const pick = (id: string) => versions.find((v) => v.id === id);
  if (versions.length < 2) return <p className="text-sm text-muted">Solishtirish uchun kamida ikki versiya kerak.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[
        [a, setA],
        [b, setB],
      ].map(([val, set], n) => (
        <div key={n} className="flex flex-col gap-2">
          <select value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Versiya">
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            {(pick(val as string)?.thumbs ?? []).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" loading="lazy" className={`rounded-lg border border-line object-cover ${kind === 'story' ? 'h-64 w-36' : 'h-44 w-36'}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ModelCheck() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Awaited<ReturnType<typeof checkAgentModels>> | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" variant="secondary" loading={pending} onClick={() => start(async () => setRes(await checkAgentModels().catch(() => null)))}>
          Modellarni tekshirish
        </Button>
      </div>
      {res ? (
        res.configured ? (
          <ul className="flex flex-col gap-1 text-sm">
            {res.models.map((m) => (
              <li key={m.role}>
                <span className={m.ok ? 'text-success' : 'text-danger'}>{m.ok ? '✓' : '✗'}</span> {m.role}: <code>{m.model}</code> — {m.message}
              </li>
            ))}
          </ul>
        ) : (
          <Notice tone="warning">OPENAI_API_KEY serverda o‘rnatilmagan.</Notice>
        )
      ) : null}
    </div>
  );
}
