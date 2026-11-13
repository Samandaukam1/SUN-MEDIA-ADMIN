'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';

import type { SoundFrame, SoundSubscribe } from '@/components/assistant/voice';
import { RobotFace } from '@/components/assistant/RobotFace';
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { addPronunciation, removePronunciation, saveSunnyStyle, saveSunnyVoice } from '@/lib/actions/sunny-voice';
import { idle, type ActionState } from '@/lib/actions/state';
import { MOOD_LABEL, MOODS, type Mood, type VoiceSettings } from '@/lib/assistant/voice-profile';

type Style = { sarcasm: number; qitmir_intensity: number; phrases: string; avoid_phrases: string; reply_length: string; learn_from_feedback: boolean };
type Sample = { text: string; mood: Mood };
type Lex = { id: string; word: string; say_as: string };
type Usage = { ttsChars: number; ttsCached: number; ttsRequests: number; sttMs: number; sttRequests: number; sttCap: number };
type Run = { text: string; ms: number | null; firstByte: string; provider: string; voice: string; cached: boolean; spoken: string; error?: string };

const UZ_VOICES = ['uz-UZ-SardorNeural', 'uz-UZ-MadinaNeural'];
const n = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function Result({ state }: { state: ActionState }) {
  if (state.status === 'error') return <Notice tone="danger" title={state.message} />;
  if (state.status === 'success') return <Notice tone="success" title={state.message} />;
  return null;
}

/**
 * Voice Test Studio: the real voice (Azure, through the same synthesis as Sunny's replies), with mood, voice, rate and
 * pitch to try; the robot's face moves with the actual audio (amplitude from Web Audio, not a timer); measured time to
 * the first audio byte and to playback. Saving changes what Sunny uses everywhere.
 */
export function SunnyVoiceStudio({ voice, style, samples, lexicon, usage }: { voice: VoiceSettings; style: Style; samples: Sample[]; lexicon: Lex[]; usage: Usage }) {
  const [voiceState, voiceAction] = useActionState(saveSunnyVoice, idle);
  const [styleState, styleAction] = useActionState(saveSunnyStyle, idle);
  const [lexState, lexAction] = useActionState(addPronunciation, idle);
  const [text, setText] = useState(samples[0]?.text ?? 'Salom! Eshitaman.');
  const [mood, setMood] = useState<Mood>('neutral');
  const [name, setName] = useState(voice.voice);
  const [rate, setRate] = useState(voice.rate);
  const [pitch, setPitch] = useState(voice.pitch);
  const [intensity, setIntensity] = useState(style.qitmir_intensity);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);

  // Web Audio: the clip plays through an analyser, whose loudness and spectrum move the face — the same frames the
  // widget's voice produces.
  const audio = useRef<{ ctx: AudioContext; analyser: AnalyserNode; src: AudioBufferSourceNode | null } | null>(null);
  const listeners = useRef(new Set<(f: SoundFrame) => void>());
  const subscribe = useCallback<SoundSubscribe>((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);
  useEffect(() => {
    if (!speaking) return;
    let raf = 0;
    const time = new Uint8Array(1024);
    const freq = new Uint8Array(256);
    const tick = () => {
      const a = audio.current;
      if (a) {
        a.analyser.getByteTimeDomainData(time);
        a.analyser.getByteFrequencyData(freq);
        let sum = 0;
        for (const v of time) sum += ((v - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / time.length) * 4.5);
        const bands = [0, 1, 2, 3, 4].map((i) => {
          let s = 0;
          for (let k = i * 24; k < (i + 1) * 24; k++) s += freq[k];
          return Math.max(0, Math.min(1, (s / 24 / 255) * 1.5 - 0.35)) * Math.min(1, level * 3);
        });
        const frame = { level, shape: 0.5, bands };
        listeners.current.forEach((fn) => fn(frame));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaking]);

  const play = useCallback(
    async (say: string, m: Mood) => {
      setBusy(true);
      audio.current?.src?.stop();
      const t0 = performance.now();
      try {
        const res = await fetch('/api/assistant/voice-studio', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: say, mood: m, voice: name, rate, pitch, intensity }) });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setRuns((r) => [{ text: say, ms: null, firstByte: '', provider: '', voice: name, cached: false, spoken: '', error: data?.error ?? `Xato ${res.status}` }, ...r].slice(0, 20));
          return;
        }
        const buf = await res.arrayBuffer();
        const ms = Math.round(performance.now() - t0);
        if (!audio.current) {
          const ctx = new AudioContext();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          analyser.connect(ctx.destination);
          audio.current = { ctx, analyser, src: null };
        }
        const a = audio.current;
        await a.ctx.resume();
        const decoded = await a.ctx.decodeAudioData(buf.slice(0));
        const src = a.ctx.createBufferSource();
        src.buffer = decoded;
        src.connect(a.analyser);
        src.onended = () => {
          setSpeaking(false);
          listeners.current.forEach((fn) => fn({ level: 0, shape: 0.5, bands: [0, 0, 0, 0, 0] }));
        };
        a.src = src;
        setSpeaking(true);
        src.start();
        setRuns((r) =>
          [
            {
              text: say,
              ms,
              firstByte: res.headers.get('x-sunny-first-byte') ?? '',
              provider: res.headers.get('x-sunny-provider') ?? '',
              voice: res.headers.get('x-sunny-voice-name') ?? name,
              cached: res.headers.get('x-sunny-cached') === '1',
              spoken: decodeURIComponent(res.headers.get('x-sunny-spoken') ?? ''),
            },
            ...r,
          ].slice(0, 20),
        );
      } finally {
        setBusy(false);
      }
    },
    [intensity, name, pitch, rate],
  );

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Sinov</h3>
          <TextArea label="Matn" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={600} />
          <div className="grid gap-3 sm:grid-cols-5">
            <SelectInput label="Kayfiyat" value={mood} onChange={(e) => setMood(e.target.value as Mood)}>
              {MOODS.map((m) => (
                <option key={m} value={m}>
                  {MOOD_LABEL[m]}
                </option>
              ))}
            </SelectInput>
            <SelectInput label="Ovoz" value={name} onChange={(e) => setName(e.target.value)}>
              {[...new Set([...UZ_VOICES, voice.voice, voice.fallbackVoice])].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </SelectInput>
            <TextInput label={`Tezlik ${rate >= 0 ? '+' : ''}${rate}%`} type="range" min={-30} max={40} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
            <TextInput label={`Ohang ${pitch >= 0 ? '+' : ''}${pitch}%`} type="range" min={-20} max={50} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} />
            <SelectInput label="Qitmir darajasi" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))}>
              <option value={1}>Yengil</option>
              <option value={2}>O‘rta</option>
              <option value={3}>Kuchli</option>
            </SelectInput>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-50" disabled={busy || !text.trim()} onClick={() => void play(text, mood)}>
              {busy ? 'Tayyorlanmoqda…' : 'Eshitish'}
            </button>
            <button type="button" className="rounded-xl border border-line px-4 py-2 text-sm" disabled={busy} onClick={() => void play(text, 'mischievous')}>
              Qitmir ovozida
            </button>
          </div>
          <p className="text-[13px] text-muted">Har sinov haqiqiy Azure ovozi va oylik belgilar hisobiga kiradi. “Saqlash” bosilmaguncha Sunny’ning o‘zi eski sozlamada gapiradi.</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <RobotFace mood={speaking ? 'speaking' : busy ? 'thinking' : 'idle'} sound={subscribe} size={160} />
          <p className="text-center text-[12px] text-muted">Og‘iz haqiqiy audio balandligi va spektriga qarab harakatlanadi (fonemaga aniq lab-sinxron emas).</p>
        </div>
      </section>

      {runs.length ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">O‘lchovlar (haqiqiy)</h3>
          <ul className="space-y-1 text-[13px]">
            {runs.map((r, i) => (
              <li key={i} className={r.error ? 'text-danger' : 'text-muted'}>
                {r.error ? (
                  <>«{r.text.slice(0, 60)}» — {r.error}</>
                ) : (
                  <>
                    <span className="text-ink">«{r.text.slice(0, 60)}»</span> — {r.provider}/{r.voice}
                    {r.cached ? ' (keshdan)' : ''}, birinchi bayt serverda {r.firstByte || '—'} ms, ijroga tayyor {r.ms} ms
                    {r.spoken && r.spoken !== r.text ? <span className="block text-subtle">o‘qilgani: {r.spoken}</span> : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-semibold">50 ta namuna ibora</h3>
        <ol className="grid gap-1 text-[13px] sm:grid-cols-2">
          {samples.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <button type="button" className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-[12px] disabled:opacity-50" disabled={busy} onClick={() => void play(s.text, s.mood)} aria-label={`Eshitish: ${s.text}`}>
                ▶
              </button>
              <span>
                {s.text} <span className="text-subtle">· {MOOD_LABEL[s.mood]}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <form action={lexAction} className="space-y-3">
          <h3 className="text-sm font-semibold">Talaffuz lug‘ati (noto‘g‘ri o‘qilgan so‘zlar)</h3>
          <Result state={lexState} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="So‘z (yozilishi)" name="word" required maxLength={80} placeholder="SAFI" />
            <TextInput label="Qanday o‘qilsin" name="say_as" required maxLength={120} placeholder="Safi" />
          </div>
          <TextInput label="Izoh (ixtiyoriy)" name="note" maxLength={300} />
          <SubmitButton>Qo‘shish</SubmitButton>
          {lexicon.length ? (
            <ul className="space-y-1 text-[13px]">
              {lexicon.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 border-t border-line pt-1">
                  <span>
                    <b>{l.word}</b> → {l.say_as}
                  </span>
                  <button type="button" className="text-danger" onClick={() => void removePronunciation(l.id)}>
                    O‘chirish
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </form>

        <div className="rounded-2xl border border-line p-4 text-sm">
          <h3 className="mb-2 font-semibold">Bu oy (bepul kvotalar)</h3>
          <p>
            Ovoz (TTS): {n(usage.ttsChars)} / {n(voice.monthlyChars)} belgi · {n(usage.ttsRequests)} so‘rov, {n(usage.ttsCached)} tasi keshdan ($0)
          </p>
          <p>
            Ovozni tanish (STT, server): {(usage.sttMs / 60000).toFixed(1)} / {Math.round(usage.sttCap / 60000)} daqiqa · {n(usage.sttRequests)} so‘rov
          </p>
          <p className="mt-2 text-[13px] text-muted">Azure F0: oyiga 0,5 mln neyron belgi va 5 soat tanish bepul. Chegaraga yetsa Sunny matnda davom etadi; pullik rejim faqat quyidagi belgi bilan.</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <form action={voiceAction} className="space-y-3">
          <h3 className="text-sm font-semibold">Ovoz sozlamalari</h3>
          <Result state={voiceState} />
          <input type="hidden" name="voice" value={name} />
          <input type="hidden" name="rate" value={rate} />
          <input type="hidden" name="pitch" value={pitch} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectInput label="Provayder" name="provider" defaultValue={voice.provider}>
              <option value="azure">Azure (tavsiya)</option>
              <option value="gemini">Gemini (bepul, zaxira)</option>
              <option value="off">O‘chiq — faqat matn</option>
            </SelectInput>
            <SelectInput label="Zaxira ovoz" name="fallback_voice" defaultValue={voice.fallbackVoice}>
              {UZ_VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </SelectInput>
            <TextInput label="Oylik belgi chegarasi" name="monthly_chars" type="number" min={0} defaultValue={voice.monthlyChars} />
          </div>
          <p className="text-[13px] text-muted">
            Saqlanadi: ovoz {name}, tezlik {rate >= 0 ? '+' : ''}
            {rate}%, ohang {pitch >= 0 ? '+' : ''}
            {pitch}% (yuqoridagi sinovdan).
          </p>
          <Checkbox name="enabled" label="Ovoz yoqilgan" defaultChecked={voice.enabled} />
          <Checkbox name="paid_allowed" label="Bepul kvotadan oshishga ruxsat (pullik Azure tarifi)" defaultChecked={voice.paidAllowed} />
          <SubmitButton>Ovozni saqlash</SubmitButton>
        </form>

        <form action={styleAction} className="space-y-3">
          <h3 className="text-sm font-semibold">Uslub profili (Sunny shunga qarab gapiradi)</h3>
          <Result state={styleState} />
          <input type="hidden" name="qitmir_intensity" value={intensity} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectInput label="Javob uzunligi" name="reply_length" defaultValue={style.reply_length}>
              <option value="short">Qisqa</option>
              <option value="normal">O‘rtacha</option>
              <option value="detailed">Batafsil</option>
            </SelectInput>
            <TextInput label="Kinoya (0–1)" name="sarcasm" type="number" step="0.1" min={0} max={1} defaultValue={style.sarcasm} />
          </div>
          <TextArea label="Yoqtirgan iboralaringiz" name="phrases" rows={2} maxLength={2000} defaultValue={style.phrases} hint="Masalan: Zo‘r!, Qani, ketdik, Gap yo‘q" />
          <TextArea label="Ishlatmasin" name="avoid_phrases" rows={2} maxLength={2000} defaultValue={style.avoid_phrases} />
          <Checkbox name="learn_from_feedback" label="“👍 Shunday gapir” tugmasidan o‘rgansin" description="Faqat siz bosgan javoblar uslub namunasi bo‘ladi. Model qayta o‘qitilmaydi — namunalar ko‘rsatma sifatida ishlatiladi." defaultChecked={style.learn_from_feedback} />
          <SubmitButton>Uslubni saqlash</SubmitButton>
        </form>
      </section>
    </div>
  );
}
