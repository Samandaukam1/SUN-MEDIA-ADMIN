'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { runInstagramAnalysis } from '@/lib/actions/prospects';
import type { InstagramResult } from '@/lib/prospects/analysis';
import { profileFacts, VERDICT_LABEL, type ProfileNumbers, type Verdict } from '@/lib/prospects/instagram';
import { getBrowserClient } from '@/lib/supabase/client';
import { formatShortDateTime } from '@/lib/time';
import { AiWorking } from './AiWorking';
import { Ring } from './BriefView';
import { CopyButton, HistoryPicker } from './controls';
import type { StudioAnalysis } from './types';
import { BulletList, display, Eyebrow, GlassCard } from './ui';

const EASE = [0.22, 1, 0.36, 1] as const;
const STEPS = ['Skrinshotlar ko‘rilmoqda…', 'Raqamlar solishtirilmoqda…', 'Auditoriya jonliligi tekshirilmoqda…', 'Xatolar va kamchiliklar yozilmoqda…', 'O‘sish rejasi tuzilmoqda…'];
const MAX_SHOTS = 6;

const NUMBER_FIELDS: { key: keyof Omit<ProfileNumbers, 'followers'>; label: string; hint: string }[] = [
  { key: 'following', label: 'Obuna bo‘lganlari', hint: 'Following' },
  { key: 'posts', label: 'Postlar soni', hint: 'Jami' },
  { key: 'avgLikes', label: 'O‘rtacha layk', hint: 'Oxirgi 9–12 post' },
  { key: 'avgComments', label: 'O‘rtacha izoh', hint: 'Oxirgi 9–12 post' },
  { key: 'avgViews', label: 'O‘rtacha Reels ko‘rish', hint: 'Oxirgi 6–9 Reels' },
  { key: 'postsLast30', label: '30 kunda postlar', hint: 'Reels + post' },
];

const VERDICT_TONE: Record<Verdict | 'unknown', string> = {
  healthy: 'bg-emerald-400/15 text-emerald-300 border-emerald-300/30',
  mixed: 'bg-[#ffcf5c]/12 text-[#ffdf8c] border-[#ffcf5c]/30',
  suspicious: 'bg-[#ff8a8a]/12 text-[#ff9c9c] border-[#ff8a8a]/30',
  unknown: 'bg-white/[0.06] text-[#d9d9de] border-white/10',
};

const toNumber = (v: string) => {
  const n = Number(v.replace(/[\s,]/g, ''));
  return v.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n;
};

type Shot = { path: string; preview: string };

/** Phone screenshots are large: scale to at most 1600 px and re-encode as JPEG before upload. */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('compress'))), 'image/jpeg', 0.86));
}

const field =
  'h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 text-[15px] text-white tabular-nums outline-none transition-all placeholder:text-[#5c5c64] focus:border-[#d4fc18] focus:shadow-[0_0_0_4px_rgb(212_252_24/0.12)]';

export function InstagramView({ prospectId, handle: initialHandle, analyses, aiReady }: { prospectId: string; handle: string | null; analyses: StudioAnalysis[]; aiReady: boolean }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const last = analyses[0]?.input as { handle?: string; numbers?: Partial<Record<keyof ProfileNumbers, number | null>>; bio?: string } | undefined;
  const [handle, setHandle] = useState(last?.handle ?? initialHandle ?? '');
  const [values, setValues] = useState<Record<keyof ProfileNumbers, string>>(() => {
    const n = last?.numbers ?? {};
    const s = (k: keyof ProfileNumbers) => (n[k] === null || n[k] === undefined ? '' : String(n[k]));
    return { followers: s('followers'), following: s('following'), posts: s('posts'), avgLikes: s('avgLikes'), avgComments: s('avgComments'), avgViews: s('avgViews'), postsLast30: s('postsLast30') };
  });
  const [bio, setBio] = useState(last?.bio ?? '');
  const [shots, setShots] = useState<Shot[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(analyses.length === 0);
  const fileInput = useRef<HTMLInputElement>(null);

  const shotsRef = useRef(shots);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.preview)), []);

  const followers = toNumber(values.followers);
  const numbers: ProfileNumbers | null =
    followers === null
      ? null
      : {
          followers,
          following: toNumber(values.following),
          posts: toNumber(values.posts),
          avgLikes: toNumber(values.avgLikes),
          avgComments: toNumber(values.avgComments),
          avgViews: toNumber(values.avgViews),
          postsLast30: toNumber(values.postsLast30),
        };
  const facts = numbers ? profileFacts(numbers) : null;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    const supabase = getBrowserClient();
    const room = MAX_SHOTS - shots.length;
    const added: Shot[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const blob = await compress(file);
        const path = `${prospectId}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('prospects').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
        added.push({ path, preview: URL.createObjectURL(blob) });
      } catch {
        setError('Skrinshotni yuklab bo‘lmadi. Qayta urinib ko‘ring.');
      }
    }
    setShots((s) => [...s, ...added]);
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function removeShot(shot: Shot) {
    setShots((s) => s.filter((x) => x.path !== shot.path));
    URL.revokeObjectURL(shot.preview);
    await getBrowserClient().storage.from('prospects').remove([shot.path]);
  }

  function run() {
    setError(null);
    if (!handle.trim() || followers === null) {
      setError('Instagram nomi va obunachilar sonini kiriting.');
      return;
    }
    start(async () => {
      const r = await runInstagramAnalysis(prospectId, {
        handle,
        followers,
        following: numbers?.following ?? null,
        posts: numbers?.posts ?? null,
        avgLikes: numbers?.avgLikes ?? null,
        avgComments: numbers?.avgComments ?? null,
        avgViews: numbers?.avgViews ?? null,
        postsLast30: numbers?.postsLast30 ?? null,
        bio,
        screenshots: shots.map((s) => s.path),
      });
      if (!r.ok) setError(r.message);
      else {
        setSelected(null);
        setShowForm(false);
        router.refresh();
      }
    });
  }

  if (pending) return <AiWorking steps={STEPS} />;

  const current = analyses.find((a) => a.id === selected) ?? analyses[0];
  const result = current?.result as InstagramResult | undefined;
  const currentFacts = (current?.input as { facts?: ReturnType<typeof profileFacts> } | undefined)?.facts;

  const form = (
    <GlassCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Instagram sahifasini tahlil qilish</Eyebrow>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#a8a8ac]">
            Profilni oching va raqamlarni kiriting; profil, Reels va statistikadan skrinshot qo‘shing — AI ularni ko‘rib, jonli auditoriya yoki nakrutka, xatolar va o‘sish yo‘lini
            aytadi.
          </p>
        </div>
        {analyses.length ? (
          <button type="button" onClick={() => setShowForm(false)} className="text-[13px] text-[#a8a8ac] hover:text-white">
            Yopish ✕
          </button>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12.5px] text-[#a8a8ac]">
              Instagram nomi *
              <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@brend" maxLength={120} className={`${field} mt-1`} />
            </label>
            <label className="text-[12.5px] text-[#a8a8ac]">
              Obunachilar *
              <input value={values.followers} onChange={(e) => setValues({ ...values, followers: e.target.value })} inputMode="numeric" placeholder="12 400" className={`${field} mt-1`} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {NUMBER_FIELDS.map((f) => (
              <label key={f.key} className="text-[12.5px] text-[#a8a8ac]">
                {f.label}
                <input
                  value={values[f.key]}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  inputMode="numeric"
                  placeholder={f.hint}
                  className={`${field} mt-1 placeholder:text-[12px]`}
                />
              </label>
            ))}
          </div>
          <label className="block text-[12.5px] text-[#a8a8ac]">
            Bio matni
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 600))}
              rows={3}
              placeholder="Profildagi bio matnini shu yerga ko‘chiring"
              className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3.5 py-3 text-[14.5px] text-white outline-none placeholder:text-[#5c5c64] focus:border-[#d4fc18]"
            />
          </label>

          {/* screenshots */}
          <div>
            <p className="text-[12.5px] text-[#a8a8ac]">
              Skrinshotlar ({shots.length}/{MAX_SHOTS}) — profil, post to‘ri, Reels, statistika (Insights)
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {shots.map((s) => (
                <div key={s.path} className="group relative aspect-[9/16] overflow-hidden rounded-xl border border-white/10 bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.preview} alt="" className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => void removeShot(s)}
                    aria-label="Olib tashlash"
                    className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-black/70 text-[13px] text-white opacity-90 hover:bg-[#ff8a8a] hover:text-black"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {shots.length < MAX_SHOTS ? (
                <label
                  className={`grid aspect-[9/16] cursor-pointer place-items-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-center text-[12px] text-[#8e8e96] transition-colors hover:border-[#d4fc18]/60 hover:text-[#d4fc18] ${uploading ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <span>
                    <span className="block text-[22px] leading-none">{uploading ? '…' : '+'}</span>
                    {uploading ? 'Yuklanmoqda' : 'Rasm qo‘shish'}
                  </span>
                  <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void addFiles(e.target.files)} disabled={uploading} />
                </label>
              ) : null}
            </div>
          </div>
        </div>

        {/* live facts */}
        <div className="space-y-3">
          <div className="rounded-[22px] border border-white/[0.08] bg-black/30 p-4">
            <p className="text-[11.5px] font-semibold tracking-[0.18em] text-[#6e6e76] uppercase">Hisob-kitob (avtomatik)</p>
            {facts ? <FactsBlock facts={facts} /> : <p className="mt-3 text-[13.5px] text-[#8e8e96]">Obunachilar sonini kiriting — ko‘rsatkichlar shu yerda hisoblanadi.</p>}
          </div>
          <button
            type="button"
            onClick={run}
            disabled={!aiReady || uploading}
            className="t-shine relative h-12 w-full rounded-full bg-[#d4fc18] px-6 text-[14.5px] font-semibold text-[#0b0b0c] shadow-[0_10px_40px_-8px_rgb(212_252_24/0.55)] transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Instagramni tahlil qilish ✦
          </button>
          {!aiReady ? (
            <p className="rounded-2xl border border-[#ffcf5c]/30 bg-[#ffcf5c]/[0.07] px-4 py-3 text-[13px] text-[#ffdf8c]">
              AI hali ulanmagan: serverga <b>ANTHROPIC_API_KEY</b> qo‘shilgach ishlaydi. Hisob-kitob hozir ham ishlaydi.
            </p>
          ) : null}
          {error ? <p className="text-[13.5px] text-[#ff8a8a]">{error}</p> : null}
        </div>
      </div>
    </GlassCard>
  );

  if (!current || !result) return form;

  const aiVerdict = result.audience.verdict;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <HistoryPicker analyses={analyses} current={current.id} onPick={setSelected} />
        <span className="text-[12.5px] text-[#6e6e76]">
          @{(current.input as { handle?: string }).handle} · {formatShortDateTime(current.created_at)}
        </span>
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="ml-auto h-10 rounded-full border border-[#d4fc18]/40 px-4 text-[13px] font-semibold text-[#d4fc18] hover:bg-[#d4fc18]/10"
          >
            Yangi raqamlar bilan qayta tahlil
          </button>
        ) : null}
      </div>
      {showForm ? form : null}

      <motion.div initial={reduce ? false : { opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
        <div className="relative overflow-hidden rounded-[30px] p-[1.5px]">
          <span aria-hidden className="t-aura" />
          <div className="relative rounded-[28.5px] bg-[#0a0a0b]/95 p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <Ring value={result.score} label="baho" />
              <div className="min-w-0 flex-1">
                <Eyebrow>Profil xulosasi</Eyebrow>
                <p className="mt-2 text-[15.5px] leading-relaxed text-[#e4e4e7]">{result.summary}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${VERDICT_TONE[aiVerdict]}`}>
                    AI: {aiVerdict === 'unknown' ? 'Aniqlab bo‘lmadi' : VERDICT_LABEL[aiVerdict]}
                  </span>
                  {currentFacts?.verdict ? (
                    <span className={`rounded-full border px-3 py-1.5 text-[12.5px] ${VERDICT_TONE[currentFacts.verdict]}`}>Raqamlar: {VERDICT_LABEL[currentFacts.verdict]}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <p className="mb-3 text-[12px] font-semibold tracking-[0.18em] text-[#8e8e96] uppercase">Obunachilar jonlimi yoki nakrutkami</p>
          <p className="text-[15px] leading-relaxed text-[#e4e4e7]">{result.audience.explanation}</p>
          {currentFacts?.signals.length ? (
            <div className="mt-4 border-t border-white/[0.07] pt-4">
              <BulletList items={currentFacts.signals} tone="red" />
            </div>
          ) : null}
        </GlassCard>
        <GlassCard>
          <p className="mb-1 text-[12px] font-semibold tracking-[0.18em] text-[#8e8e96] uppercase">Ko‘rsatkichlar</p>
          {currentFacts ? <FactsBlock facts={currentFacts} compact /> : <p className="text-[14px] text-[#6e6e76]">—</p>}
        </GlassCard>
        <GlassCard>
          <p className="mb-4 text-[12px] font-semibold tracking-[0.18em] text-[#8e8e96] uppercase">Kuchli tomonlari</p>
          <BulletList items={result.strengths} />
        </GlassCard>
        <GlassCard className="lg:col-span-2">
          <p className="mb-4 text-[12px] font-semibold tracking-[0.18em] text-[#8e8e96] uppercase">Xatolar va kamchiliklar</p>
          <BulletList items={result.mistakes} tone="red" />
        </GlassCard>
        <GlassCard className="lg:col-span-2">
          <p className="mb-4 text-[12px] font-semibold tracking-[0.18em] text-[#8e8e96] uppercase">Profilda nimani tuzatish kerak</p>
          <BulletList items={result.profile_fixes} tone="silver" />
        </GlassCard>
        <GlassCard>
          <p className="mb-4 text-[12px] font-semibold tracking-[0.18em] text-[#8e8e96] uppercase">Tayyor bio</p>
          {result.bio_suggestion ? (
            <>
              <p className="rounded-2xl bg-black/40 p-4 text-[14.5px] leading-relaxed whitespace-pre-line text-white">{result.bio_suggestion}</p>
              <div className="mt-3">
                <CopyButton text={result.bio_suggestion} />
              </div>
            </>
          ) : (
            <p className="text-[14px] text-[#6e6e76]">—</p>
          )}
        </GlassCard>
        <GlassCard className="lg:col-span-2">
          <p className="mb-4 text-[12px] font-semibold tracking-[0.18em] text-[#8e8e96] uppercase">Qanday rivojlantirish mumkin</p>
          <ol className="space-y-3">
            {result.growth_plan.map((s, i) => (
              <li key={i} className="flex gap-3 text-[14.5px] leading-relaxed text-[#e4e4e7]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#d4fc18]/14 text-[11.5px] font-bold text-[#d4fc18]">{i + 1}</span>
                <span className="min-w-0 break-words">{s}</span>
              </li>
            ))}
          </ol>
          {result.posting_plan ? <p className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-[14px] leading-relaxed text-[#d9d9de]">{result.posting_plan}</p> : null}
        </GlassCard>
        <GlassCard>
          <p className="mb-4 text-[12px] font-semibold tracking-[0.18em] text-[#8e8e96] uppercase">Kontent g‘oyalari</p>
          <BulletList items={result.content_ideas} tone="silver" />
        </GlassCard>
      </div>

      {result.recommended_plan?.name ? (
        <GlassCard glow>
          <Eyebrow>Bu profil uchun tarif</Eyebrow>
          <p className={`${display} mt-2 text-[24px] text-[#d4fc18]`}>{result.recommended_plan.name}</p>
          <p className="mt-1 text-[14.5px] text-[#d9d9de]">{result.recommended_plan.why}</p>
        </GlassCard>
      ) : null}
      <p className="text-center text-[11.5px] text-[#5c5c64]">
        Nakrutka bo‘yicha xulosa ehtimol: kiritilgan raqamlar, odatiy sanoat ko‘rsatkichlari va skrinshotlarga asoslangan.
      </p>
    </div>
  );
}

function FactsBlock({ facts, compact = false }: { facts: ReturnType<typeof profileFacts>; compact?: boolean }) {
  const er = facts.engagementRate;
  const [lo, hi] = facts.expected;
  const scaleMax = Math.max(hi * 2, er ?? 0);
  const pct = (n: number) => `${Math.min(100, (n / scaleMax) * 100).toFixed(2)}%`;
  const rows: [string, string][] = [
    ['Auditoriya hajmi', facts.tier],
    ['Ko‘rish / obunachi', facts.viewsPerFollower === null ? '—' : `${Math.round(facts.viewsPerFollower * 100)}%`],
    ['Izoh / layk', facts.commentsPerLike === null ? '—' : `${(facts.commentsPerLike * 100).toFixed(1)}%`],
    ['Obuna / obunachi', facts.followingRatio === null ? '—' : String(facts.followingRatio)],
    ['Haftasiga post', facts.postsPerWeek === null ? '—' : String(facts.postsPerWeek)],
  ];
  return (
    <div className="mt-3 space-y-3">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] text-[#a8a8ac]">Engagement</span>
          <span className={`${display} text-[22px] text-white tabular-nums`}>{er === null ? '—' : `${er}%`}</span>
        </div>
        <div className="relative mt-2 h-2 rounded-full bg-white/[0.07]">
          <span className="absolute inset-y-0 rounded-full bg-emerald-400/30" style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})` }} />
          {er !== null ? <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d4fc18] shadow-[0_0_10px_rgb(212_252_24/0.8)]" style={{ left: pct(er) }} /> : null}
        </div>
        <p className="mt-1.5 text-[11.5px] text-[#6e6e76]">
          Shu hajm uchun odatiy: {lo}–{hi}%
        </p>
      </div>
      <dl className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-[13px]">
            <dt className="text-[#8e8e96]">{k}</dt>
            <dd className="text-right text-[#e4e4e7] tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {facts.verdict ? <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${VERDICT_TONE[facts.verdict]}`}>{VERDICT_LABEL[facts.verdict]}</span> : null}
      {!compact && facts.signals.length ? <BulletList items={facts.signals} tone="red" /> : null}
    </div>
  );
}
