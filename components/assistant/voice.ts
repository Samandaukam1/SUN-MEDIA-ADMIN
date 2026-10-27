'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { firstSentence, speakable, speechChunks } from '@/lib/assistant/speech';

export type VoiceLang = 'uz-UZ' | 'ru-RU' | 'en-US';
/** Same voice, another manner: 'qitmir' is a little more playful (prosody only, see /api/assistant/tts). */
export type VoiceStyle = 'qitmir';

/** Why the voice could not do what was asked. */
export type VoiceIssue = 'mic-denied' | 'mic-missing' | 'stt-unavailable' | 'no-speech' | 'stt-failed' | 'voice-missing' | 'tap-to-play';

export const ISSUE_TEXT: Record<VoiceIssue, string> = {
  'mic-denied': 'Mikrofonga ruxsat berilmadi. Brauzer sozlamalarida ruxsat bering yoki savolni yozing.',
  'mic-missing': 'Mikrofon topilmadi yoki band. Savolni yozib yuborishingiz mumkin.',
  'stt-unavailable': 'Bu brauzerda ovozni matnga aylantirib bo‘lmaydi. Savolni yozib yuboring.',
  'no-speech': 'Ovoz eshitilmadi. Mikrofonni bosib, qaytadan gapiring.',
  'stt-failed': 'Ovozni tanib bo‘lmadi. Yana bir bor gapiring yoki yozib yuboring.',
  'voice-missing': 'O‘zbekcha ovoz hozircha mavjud emas — javob matnda.',
  'tap-to-play': 'Ovozli javobni eshitish uchun ekranga bir marta bosing.',
};

/** One animation frame of sound: loudness, mouth shape (0 round … 1 wide) and five frequency bands, all 0–1. */
export type SoundFrame = { level: number; shape: number; bands: number[] };
export type SoundSubscribe = (fn: (frame: SoundFrame) => void) => () => void;

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Safari and every iPhone browser: their recognition is Siri dictation, which has no Uzbek. */
const appleWebKit = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (/Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR|Android|Firefox|FxiOS/.test(navigator.userAgent));
const canRecord = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
/** Compressed recording where the browser has one: Opus (Chrome, Firefox) or AAC (Safari), ~10× smaller than WAV. */
const recorderMime = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m));
function startRecorder(stream: MediaStream): { stop: () => Promise<Blob | null> } | null {
  const mime = recorderMime();
  if (!mime) return null;
  try {
    const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 24000 });
    const parts: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
    recorder.start();
    return {
      stop: () =>
        new Promise((resolve) => {
          if (recorder.state === 'inactive') return resolve(parts.length ? new Blob(parts, { type: mime.split(';')[0] }) : null);
          recorder.onstop = () => resolve(parts.length ? new Blob(parts, { type: (recorder.mimeType || mime).split(';')[0] }) : null);
          try {
            recorder.stop();
          } catch {
            resolve(null);
          }
        }),
    };
  } catch {
    return null;
  }
}
const SILENT: SoundFrame = { level: 0, shape: 0.5, bands: [0, 0, 0, 0, 0] };
const BANDS: [number, number][] = [
  [90, 250],
  [250, 500],
  [500, 1000],
  [1000, 2200],
  [2200, 5000],
];

function mark(name: string) {
  try {
    if (performance.getEntriesByName('sunbot:send').length) performance.measure(name, 'sunbot:send');
  } catch {
    // user timing unavailable
  }
}

/**
 * Sunny's voice colour on top of the TTS voice: a little thinner (less chest), brighter consonants, a faint digital
 * shimmer and soft compression — younger and slightly robotic, never metallic, every Uzbek sound still clear.
 * input → high-pass → less chest → presence → air → (dry + short modulated comb) → compressor → output.
 */
function voiceColour(ac: AudioContext, input: AudioNode, output: AudioNode) {
  const filter = (type: BiquadFilterType, frequency: number, gain = 0, q = 0.8) => {
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.gain.value = gain;
    f.Q.value = q;
    return f;
  };
  const thin = filter('highpass', 150, 0, 0.6);
  const chest = filter('peaking', 330, -2.5, 0.9);
  const presence = filter('peaking', 3200, 3, 0.8);
  const air = filter('highshelf', 7000, 2);
  input.connect(thin).connect(chest).connect(presence).connect(air);

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -22;
  comp.knee.value = 18;
  comp.ratio.value = 2.8;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  const dry = ac.createGain();
  dry.gain.value = 0.92;
  air.connect(dry).connect(comp);

  // The robotic touch: a ~4.5 ms comb, slowly swept, mixed low.
  const delay = ac.createDelay(0.02);
  delay.delayTime.value = 0.0045;
  const sweep = ac.createOscillator();
  sweep.frequency.value = 0.35;
  const depth = ac.createGain();
  depth.gain.value = 0.0006;
  sweep.connect(depth).connect(delay.delayTime);
  const feedback = ac.createGain();
  feedback.gain.value = 0.18;
  const wet = ac.createGain();
  wet.gain.value = 0.11;
  air.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(comp);
  sweep.start();

  const makeup = ac.createGain();
  makeup.gain.value = 1.12;
  comp.connect(makeup).connect(output);
}

/** Mono float samples (any rate) → 16 kHz 16-bit WAV: small, and every speech service reads it. */
function wav16k(chunks: Float32Array[], rate: number): Blob {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const ratio = rate / 16000;
  const out = new Int16Array(Math.floor(length / ratio));
  let i = 0;
  let pos = 0;
  let acc = 0;
  let count = 0;
  let next = ratio;
  for (const c of chunks) {
    for (const s of c) {
      acc += s;
      count++;
      if (++pos >= next) {
        if (i < out.length) out[i++] = Math.max(-1, Math.min(1, acc / count)) * 0x7fff;
        acc = 0;
        count = 0;
        next += ratio;
      }
    }
  }
  const header = new DataView(new ArrayBuffer(44));
  const text = (o: number, s: string) => [...s].forEach((ch, k) => header.setUint8(o + k, ch.charCodeAt(0)));
  text(0, 'RIFF');
  header.setUint32(4, 36 + out.byteLength, true);
  text(8, 'WAVEfmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, 16000, true);
  header.setUint32(28, 32000, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  text(36, 'data');
  header.setUint32(40, out.byteLength, true);
  return new Blob([header.buffer, out.buffer], { type: 'audio/wav' });
}

type Clip = { kind: 'pcm'; reader: ReadableStreamDefaultReader<Uint8Array>; rate: number } | { kind: 'file'; data: ArrayBuffer } | { kind: 'none' } | null;
type Session = {
  lang: VoiceLang;
  style?: VoiceStyle;
  ctl: AbortController;
  jobs: { text: string; clip: Promise<Clip> }[];
  sentText: string;
  finished: boolean;
  running: boolean;
  dead: boolean;
  played: boolean;
  sources: Set<AudioBufferSourceNode>;
  nextTime: number;
  resolve: (spoke: boolean) => void;
  done: Promise<boolean>;
  /** The server said it has no voice now: the rest goes to the system voice without asking again. */
  noServer: boolean;
};
/** What the visitor's spoken reply sounds like, sentence by sentence, while it is still being written. */
export type SpeechHandle = { update: (text: string) => void; finish: (text: string) => Promise<boolean>; cancel: () => void };

/**
 * Sunny's ears and voice.
 * - Voice: /api/assistant/tts streams raw PCM that plays through Web Audio from its first chunk (one AudioContext,
 *   unlocked on the visitor's tap, so mobile autoplay rules are met). The first sentence is sent as soon as it is written.
 *   Without server TTS: a browser voice in that language, never another language's voice reading Uzbek.
 * - Ears: the browser's own recognition where it knows Uzbek (Chrome, Edge, Android); elsewhere (Safari, iPhone, Firefox)
 *   the microphone is recorded with automatic end-of-speech detection and /api/assistant/stt turns it into text.
 * - `subscribe` delivers real loudness and frequency bands (from the voice, or from the microphone) every frame while
 *   Sunny speaks or listens, for the face and the waveform. Nothing runs while it is idle.
 */
export function useVoice() {
  const [canListen, setCanListen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [issue, setIssue] = useState<VoiceIssue | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const outRef = useRef<{ gain: GainNode; analyser: AnalyserNode; panner: StereoPannerNode | null } | null>(null);
  /** Spatial audio: where the robot is, left (−1) to right (1); kept subtle by the caller. */
  const panRef = useRef(0);
  const unlocked = useRef(false);
  const session = useRef<Session | null>(null);
  const synthOn = useRef(false);

  const listenToken = useRef(0);
  const stopListen = useRef<(send: boolean) => void>(() => undefined);
  const micAnalyser = useRef<AnalyserNode | null>(null);
  const webBroken = useRef(new Set<string>());

  const subscribers = useRef(new Set<(f: SoundFrame) => void>());
  const pulse = useRef(0);
  const loop = useRef(0);
  const active = useRef({ speaking: false, listening: false });

  useEffect(() => {
    setCanListen(!!recognitionCtor() || canRecord());
  }, []);

  const audio = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ac = new Ctor({ latencyHint: 'interactive' });
    const gain = ac.createGain();
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    voiceColour(ac, gain, analyser);
    // Spatial audio: the voice comes a little from where Sunny is (no panner in the browser: centred, as before).
    const panner = typeof ac.createStereoPanner === 'function' ? ac.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = panRef.current;
      analyser.connect(panner).connect(ac.destination);
    } else analyser.connect(ac.destination);
    ctxRef.current = ac;
    outRef.current = { gain, analyser, panner };
    return ac;
  }, []);

  /** Moves the voice toward the robot's side of the screen, smoothly (0 = centre). */
  const setPan = useCallback((pan: number) => {
    panRef.current = Math.max(-1, Math.min(1, pan));
    const ac = ctxRef.current;
    const panner = outRef.current?.panner;
    if (ac && panner) panner.pan.setTargetAtTime(panRef.current, ac.currentTime, 0.25);
  }, []);

  /** Call from a tap or key press: starts the audio output so replies that arrive later may play (iOS, Chrome). */
  const unlock = useCallback(() => {
    const ac = audio();
    if (!ac) return;
    if (ac.state !== 'running') void ac.resume().catch(() => undefined);
    if (!unlocked.current) {
      const src = ac.createBufferSource();
      src.buffer = ac.createBuffer(1, 1, ac.sampleRate);
      src.connect(ac.destination);
      src.start(0);
      unlocked.current = true;
    }
  }, [audio]);

  // ---------- sound frames (one rAF loop, only while speaking or listening) ----------
  const frame = useRef<SoundFrame>({ level: 0, shape: 0.5, bands: [0, 0, 0, 0, 0] });
  const time = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(1024));
  const freq = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(512));

  const measure = useCallback((an: AnalyserNode, gain: number) => {
    const f = frame.current;
    if (time.current.length !== an.fftSize) time.current = new Uint8Array(an.fftSize);
    if (freq.current.length !== an.frequencyBinCount) freq.current = new Uint8Array(an.frequencyBinCount);
    an.getByteTimeDomainData(time.current);
    let sum = 0;
    for (const v of time.current) sum += ((v - 128) / 128) ** 2;
    f.level = Math.min(1, Math.sqrt(sum / time.current.length) * gain);
    an.getByteFrequencyData(freq.current);
    const hz = an.context.sampleRate / 2 / an.frequencyBinCount;
    BANDS.forEach(([lo, hi], i) => {
      const a = Math.max(1, Math.floor(lo / hz));
      const b = Math.max(a + 1, Math.ceil(hi / hz));
      let s = 0;
      for (let k = a; k < b; k++) s += freq.current[k];
      f.bands[i] = Math.max(0, Math.min(1, (s / (b - a) / 255) * 1.5 - 0.35)) * Math.min(1, f.level * 3);
    });
    const [, b1, b2, b3, b4] = f.bands;
    f.shape = (b3 + b4) / (b1 + b2 + b3 + b4 + 0.001);
  }, []);

  const tick = useCallback(() => {
    const { speaking: s, listening: l } = active.current;
    if (!s && !l) {
      loop.current = 0;
      subscribers.current.forEach((fn) => fn(SILENT));
      return;
    }
    const f = frame.current;
    const an = s && !synthOn.current ? outRef.current?.analyser : l ? micAnalyser.current : null;
    if (an) measure(an, s ? 4.5 : 6);
    else {
      // No signal to measure (system voice, or recognition that owns the mic): real events drive it — each word or
      // recognised fragment raises `pulse`, which fades between them.
      pulse.current *= 0.9;
      f.level = Math.max(l ? 0.08 : 0.05, pulse.current);
      const t = performance.now() / 120;
      f.bands = [0.55, 1, 0.8, 0.55, 0.35].map((w, i) => f.level * w * (0.75 + 0.25 * Math.sin(t + i * 1.7)));
      f.shape = 0.45 + 0.2 * Math.sin(t / 2);
    }
    subscribers.current.forEach((fn) => fn(f));
    loop.current = requestAnimationFrame(tick);
  }, [measure]);

  const setActive = useCallback(
    (key: 'speaking' | 'listening', on: boolean) => {
      active.current[key] = on;
      if (on && !loop.current) loop.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  const subscribe = useCallback<SoundSubscribe>((fn) => {
    subscribers.current.add(fn);
    return () => subscribers.current.delete(fn);
  }, []);

  // ---------- speaking ----------
  const end = useCallback(
    (s: Session) => {
      if (session.current !== s) return;
      session.current = null;
      setSpeaking(false);
      setPreparing(false);
      setActive('speaking', false);
      s.resolve(s.played);
    },
    [setActive],
  );

  const stopSpeaking = useCallback(() => {
    const s = session.current;
    if (!s) return;
    s.dead = true;
    s.ctl.abort();
    for (const src of s.sources) {
      try {
        src.stop();
      } catch {
        // not started yet
      }
    }
    s.sources.clear();
    if (synthOn.current) window.speechSynthesis?.cancel();
    synthOn.current = false;
    end(s);
  }, [end]);

  const fetchClip = useCallback(async (text: string, signal: AbortSignal, style?: VoiceStyle): Promise<Clip> => {
    try {
      const res = await fetch('/api/assistant/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, stream: true, ...(style ? { style } : {}) }), signal });
      if (res.status === 204) return { kind: 'none' };
      if (!res.ok || !res.body) return null;
      const type = res.headers.get('content-type') ?? '';
      if (type.startsWith('audio/pcm')) return { kind: 'pcm', reader: res.body.getReader(), rate: Number(/rate=(\d+)/.exec(type)?.[1]) || 24000 };
      return { kind: 'file', data: await res.arrayBuffer() };
    } catch {
      return null;
    }
  }, []);

  /** Starts a source at the end of what is already queued, so chunks join without gaps. */
  const schedule = useCallback(
    (s: Session, buf: AudioBuffer) => {
      const ac = ctxRef.current!;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(outRef.current!.gain);
      const at = Math.max(ac.currentTime + 0.03, s.nextTime);
      src.start(at);
      s.nextTime = at + buf.duration;
      s.sources.add(src);
      src.onended = () => {
        s.sources.delete(src);
        if (!s.sources.size && s.finished && !s.running && !s.jobs.length) end(s);
      };
      if (!s.played) {
        s.played = true;
        mark('sunbot:first-audio');
        setPreparing(false);
        setSpeaking(true);
        setActive('speaking', true);
      }
    },
    [end, setActive],
  );

  /**
   * Plays streamed PCM. A small buffer is filled before the first sound (and again after the network falls behind),
   * so a slow connection gives a short pause rather than choppy speech.
   */
  const playPcm = useCallback(
    async (s: Session, clip: Extract<Clip, { kind: 'pcm' }>) => {
      const ac = ctxRef.current!;
      let pending: Float32Array[] = [];
      let pendingSeconds = 0;
      let need = s.played ? 0.12 : 0.45;
      let odd: number | null = null;
      const flush = () => {
        if (!pending.length) return;
        const length = pending.reduce((n, p) => n + p.length, 0);
        const buf = ac.createBuffer(1, length, clip.rate);
        const ch = buf.getChannelData(0);
        let o = 0;
        for (const p of pending) {
          ch.set(p, o);
          o += p.length;
        }
        pending = [];
        pendingSeconds = 0;
        schedule(s, buf);
      };
      try {
        for (;;) {
          const { value, done } = await clip.reader.read();
          if (s.dead) break;
          if (done) break;
          let bytes = value;
          if (odd !== null) {
            const joined = new Uint8Array(bytes.length + 1);
            joined[0] = odd;
            joined.set(bytes, 1);
            bytes = joined;
            odd = null;
          }
          if (bytes.length % 2) {
            odd = bytes[bytes.length - 1];
            bytes = bytes.subarray(0, bytes.length - 1);
          }
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          const samples = new Float32Array(bytes.length / 2);
          for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
          pending.push(samples);
          pendingSeconds += samples.length / clip.rate;
          const ahead = s.nextTime - ac.currentTime;
          if (ahead > 0.1 || pendingSeconds >= need) {
            // Fell behind (nothing left to play): refill a little more before continuing.
            need = s.played && ahead <= 0.1 ? 0.6 : 0.12;
            flush();
          }
        }
      } catch {
        // aborted or the connection dropped: play what arrived
      }
      if (s.dead) void clip.reader.cancel().catch(() => undefined);
      else flush();
    },
    [schedule],
  );

  /** No server voice: a system voice in the reply's language, or silence (with a note) when there is none for Uzbek. */
  const browserVoice = useCallback(
    async (s: Session, text: string) => {
      const synth = window.speechSynthesis;
      const cyrillic = /[Ѐ-ӿ]/.test(text);
      const lang: VoiceLang = cyrillic && !/[ўқғҳЎҚҒҲ]/.test(text) ? 'ru-RU' : s.lang;
      if (!synth) return setIssue('voice-missing');
      let voices = synth.getVoices();
      if (!voices.length) {
        await new Promise((r) => {
          synth.addEventListener('voiceschanged', r, { once: true });
          setTimeout(r, 800);
        });
        voices = synth.getVoices();
      }
      const voice = voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang.slice(0, 2)));
      if (!voice) return setIssue('voice-missing');
      if (s.dead) return;
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(speakable(text, lang));
        u.voice = voice;
        u.lang = voice.lang;
        // Qitmir: the same system voice, a touch brighter and quicker.
        if (s.style === 'qitmir') {
          u.pitch = 1.12;
          u.rate = 1.06;
        }
        u.onstart = () => {
          s.played = true;
          synthOn.current = true;
          setPreparing(false);
          setSpeaking(true);
          setActive('speaking', true);
        };
        u.onboundary = () => {
          pulse.current = 0.85;
        };
        const over = () => {
          synthOn.current = false;
          resolve();
        };
        u.onend = over;
        u.onerror = over;
        synth.speak(u);
      });
    },
    [setActive],
  );

  const run = useCallback(
    async (s: Session) => {
      if (s.running || s.dead) return;
      s.running = true;
      const ac = audio();
      while (s.jobs.length && !s.dead) {
        const job = s.jobs.shift()!;
        const clip = await job.clip;
        if (s.dead) break;
        if (clip?.kind === 'none') {
          // The server has no voice right now: what is queued goes to the system voice as one piece.
          const rest = [job.text, ...s.jobs.map((j) => j.text)].join(' ');
          s.jobs = [];
          s.noServer = true;
          s.ctl.abort();
          await browserVoice(s, rest);
          continue;
        }
        if (!clip || !ac) continue;
        if (ac.state !== 'running') {
          await Promise.race([ac.resume().catch(() => undefined), new Promise((r) => setTimeout(r, 400))]);
          if ((ac.state as string) !== 'running') {
            setIssue('tap-to-play');
            if (clip.kind === 'pcm') void clip.reader.cancel().catch(() => undefined);
            s.jobs = [];
            break;
          }
        }
        if (clip.kind === 'pcm') await playPcm(s, clip);
        else {
          const buf = await ac.decodeAudioData(clip.data.slice(0)).catch(() => null);
          if (buf && !s.dead) schedule(s, buf);
        }
      }
      s.running = false;
      if (s.dead) return;
      // Everything is queued: the session ends when the last sound does (or now, if nothing played).
      if (s.finished && !s.jobs.length && !s.sources.size) end(s);
    },
    [audio, browserVoice, end, playPcm, schedule],
  );

  const enqueue = useCallback(
    (s: Session, text: string) => {
      s.jobs.push({ text, clip: s.noServer ? Promise.resolve({ kind: 'none' }) : fetchClip(text, s.ctl.signal, s.style) });
      if (!s.played) setPreparing(true);
      void run(s);
    },
    [fetchClip, run],
  );

  /** A spoken reply that may still be arriving: `update` with the text so far, `finish` with the whole text. */
  const speech = useCallback(
    (lang: VoiceLang, style?: VoiceStyle): SpeechHandle => {
      stopSpeaking();
      let resolve: (spoke: boolean) => void = () => undefined;
      const done = new Promise<boolean>((r) => (resolve = r));
      const s: Session = { lang, style, ctl: new AbortController(), jobs: [], sentText: '', finished: false, running: false, dead: false, played: false, sources: new Set(), nextTime: 0, resolve, done, noServer: false };
      session.current = s;
      return {
        update(text) {
          if (s.dead || s.sentText) return;
          const first = firstSentence(text);
          if (first) {
            s.sentText = first;
            enqueue(s, first);
          }
        },
        finish(text) {
          if (s.dead) return Promise.resolve(false);
          const rest = !s.sentText ? text : text.startsWith(s.sentText) ? text.slice(s.sentText.length) : '';
          for (const chunk of speechChunks(rest)) enqueue(s, chunk);
          s.finished = true;
          if (!s.running && !s.jobs.length && !s.sources.size) end(s);
          return done;
        },
        cancel: () => (session.current === s ? stopSpeaking() : undefined),
      };
    },
    [end, enqueue, stopSpeaking],
  );

  const speak = useCallback((text: string, lang: VoiceLang, style?: VoiceStyle) => speech(lang, style).finish(text), [speech]);

  // ---------- listening ----------
  const cancelListening = useCallback(() => {
    listenToken.current++;
    stopListen.current(false);
    stopListen.current = () => undefined;
    setListening(false);
    setTranscribing(false);
    active.current.listening = false;
  }, []);
  const stopListening = useCallback(() => stopListen.current(true), []);

  /**
   * The browser's own recognition, with live text. `fallback` means it cannot do this language here: record instead.
   * On a desktop the microphone is also opened by the page (for the real loudness) and recorded: if the recognition ends
   * with nothing although someone clearly spoke, that `recording` goes to the server instead of being lost.
   */
  const webListen = useCallback(
    (lang: VoiceLang, onText: (text: string) => void, token: number) =>
      new Promise<{ text: string; fallback: boolean; recording?: Blob | null }>((resolve) => {
        const Ctor = recognitionCtor()!;
        const r = new Ctor();
        r.lang = lang;
        r.interimResults = true;
        r.continuous = false;
        r.maxAlternatives = 1;
        let finalText = '';
        let error = '';
        let heard = false;
        let audioStarted = false;
        let spokeMs = 0;
        let meter: { close: () => void; recorder: ReturnType<typeof startRecorder> } | null = null;
        // Some builds expose the API but never open the microphone: after 5 s without audio, record instead.
        const noAudio = setTimeout(() => {
          if (audioStarted) return;
          error = 'no-audio';
          r.abort();
        }, 5000);
        r.onaudiostart = () => {
          audioStarted = true;
          // Desktops only: phones keep a single user of the microphone.
          if (matchMedia('(pointer: fine)').matches && ctxRef.current?.state === 'running') {
            void navigator.mediaDevices
              ?.getUserMedia({ audio: true })
              .then((stream) => {
                if (token !== listenToken.current) return stream.getTracks().forEach((t) => t.stop());
                const ac = ctxRef.current!;
                const an = ac.createAnalyser();
                an.fftSize = 1024;
                const src = ac.createMediaStreamSource(stream);
                src.connect(an);
                micAnalyser.current = an;
                const buf = new Float32Array(an.fftSize);
                const poll = setInterval(() => {
                  an.getFloatTimeDomainData(buf);
                  let sum = 0;
                  for (const v of buf) sum += v * v;
                  if (Math.sqrt(sum / buf.length) > 0.03) spokeMs += 100;
                }, 100);
                meter = {
                  recorder: startRecorder(stream),
                  close: () => {
                    clearInterval(poll);
                    src.disconnect();
                    stream.getTracks().forEach((t) => t.stop());
                    if (micAnalyser.current === an) micAnalyser.current = null;
                  },
                };
              })
              .catch(() => undefined);
          }
        };
        r.onsoundstart = () => (pulse.current = 0.5);
        r.onresult = (e) => {
          heard = true;
          pulse.current = 0.9;
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) finalText += res[0].transcript;
            else interim += res[0].transcript;
          }
          onText((finalText + interim).trim());
        };
        r.onerror = (e) => (error = e.error);
        r.onend = async () => {
          clearTimeout(noAudio);
          const m = meter as typeof meter;
          const recording = m?.recorder && !finalText.trim() && spokeMs >= 400 && token === listenToken.current ? await m.recorder.stop() : null;
          if (m?.recorder && !recording) void m.recorder.stop();
          m?.close();
          const fallback = !heard && !recording && ['language-not-supported', 'service-not-allowed', 'network', 'no-audio'].includes(error);
          if (fallback) webBroken.current.add(lang);
          else if (token === listenToken.current && !recording && !finalText.trim()) {
            if (error === 'not-allowed') setIssue('mic-denied');
            else if (error === 'audio-capture') setIssue('mic-missing');
            else if (error !== 'aborted') setIssue('no-speech');
          }
          resolve({ text: finalText.trim(), fallback, recording });
        };
        stopListen.current = (send) => (send ? r.stop() : r.abort());
        try {
          r.start();
        } catch {
          clearTimeout(noAudio);
          resolve({ text: '', fallback: true });
        }
      }),
    [],
  );

  /** Sends a recording to the server's speech recognition (Gemini) and returns what was said. */
  const transcribe = useCallback(
    async (recording: Blob, lang: VoiceLang, token: number): Promise<string> => {
      setListening(false);
      setActive('listening', false);
      setTranscribing(true);
      const ctl = new AbortController();
      stopListen.current = () => ctl.abort();
      try {
        const res = await fetch(`/api/assistant/stt?lang=${lang}`, { method: 'POST', headers: { 'content-type': recording.type || 'audio/wav' }, body: recording, signal: ctl.signal });
        if (token !== listenToken.current) return '';
        if (res.status === 204) {
          setIssue('stt-unavailable');
          return '';
        }
        const data = (await res.json().catch(() => ({}))) as { text?: string };
        if (!res.ok) {
          setIssue('stt-failed');
          return '';
        }
        if (!data.text) setIssue('no-speech');
        return data.text?.trim() ?? '';
      } catch {
        if (token === listenToken.current) setIssue('stt-failed');
        return '';
      } finally {
        setTranscribing(false);
      }
    },
    [setActive],
  );

  /** Records the microphone until the visitor stops talking, then asks the server what was said. */
  const recordListen = useCallback(
    async (lang: VoiceLang, token: number): Promise<string> => {
      const ac = audio();
      if (!ac || !navigator.mediaDevices?.getUserMedia) {
        setIssue('stt-unavailable');
        return '';
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      } catch (e) {
        const name = (e as DOMException)?.name;
        setIssue(name === 'NotAllowedError' || name === 'SecurityError' ? 'mic-denied' : 'mic-missing');
        return '';
      }
      if (token !== listenToken.current) {
        stream.getTracks().forEach((t) => t.stop());
        return '';
      }
      if (ac.state !== 'running') await ac.resume().catch(() => undefined);
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      micAnalyser.current = an;
      // Compressed recording where the browser has one (uploads ~10× faster); otherwise the raw samples become a WAV
      // file. The processor only measures (VAD), its output is muted and nothing is played back.
      const recorder = startRecorder(stream);
      const proc = ac.createScriptProcessor(4096, 1, 1);
      const mute = ac.createGain();
      mute.gain.value = 0;
      src.connect(proc);
      proc.connect(mute).connect(ac.destination);
      const chunks: Float32Array[] = [];

      const text = await new Promise<string | null>((resolve) => {
        let heard = false;
        let loudMs = 0;
        let quietMs = 0;
        let floor = 0.008;
        let finished = false;
        const started = performance.now();
        proc.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          if (!recorder) chunks.push(new Float32Array(input));
          let sum = 0;
          for (const v of input) sum += v * v;
          const rms = Math.sqrt(sum / input.length);
          const ms = (input.length / ac.sampleRate) * 1000;
          const threshold = Math.max(0.018, floor * 2.6);
          if (rms > threshold) {
            loudMs += ms;
            quietMs = 0;
            if (loudMs >= 160) heard = true;
          } else {
            quietMs += ms;
            floor = floor * 0.9 + rms * 0.1;
            if (!heard) loudMs = Math.max(0, loudMs - ms / 2);
          }
          // End of the question: a pause after speech.
          if (heard && quietMs >= 1100) finish(true);
        };
        // Silence from the start, or a very long question, also ends it (a timer, so it works even if audio stalls).
        const watchdog = setInterval(() => {
          const t = performance.now() - started;
          if (!heard && t > 8000) finish(true);
          else if (t > 30000) finish(true);
        }, 250);
        function finish(send: boolean) {
          if (finished) return;
          finished = true;
          clearInterval(watchdog);
          proc.onaudioprocess = null;
          if (!send || token !== listenToken.current) return resolve(null);
          if (!heard) {
            setIssue('no-speech');
            return resolve(null);
          }
          resolve('');
        }
        stopListen.current = (send) => finish(send);
      });

      const compressed = recorder ? await recorder.stop() : null;
      try {
        src.disconnect();
        proc.disconnect();
      } catch {
        // already disconnected
      }
      stream.getTracks().forEach((t) => t.stop());
      if (micAnalyser.current === an) micAnalyser.current = null;
      if (text === null) return '';
      const recording = compressed ?? (chunks.length ? wav16k(chunks, ac.sampleRate) : null);
      if (!recording) {
        setIssue('stt-failed');
        return '';
      }
      return transcribe(recording, lang, token);
    },
    [audio, transcribe],
  );

  /** Listens for one question. `onText` shows what is heard so far (browser recognition only). */
  const listen = useCallback(
    async (lang: VoiceLang, onText: (text: string) => void): Promise<string> => {
      cancelListening();
      const token = ++listenToken.current;
      setIssue(null);
      const web = !!recognitionCtor() && !webBroken.current.has(lang) && !(lang === 'uz-UZ' && appleWebKit());
      if (!web && !canRecord()) {
        setIssue('stt-unavailable');
        return '';
      }
      setListening(true);
      setActive('listening', true);
      try {
        if (web) {
          const r = await webListen(lang, onText, token);
          if (token !== listenToken.current) return '';
          if (r.recording) return await transcribe(r.recording, lang, token);
          if (!r.fallback) return r.text;
        }
        return await recordListen(lang, token);
      } finally {
        if (token === listenToken.current) {
          setListening(false);
          setActive('listening', false);
          stopListen.current = () => undefined;
        }
      }
    },
    [cancelListening, recordListen, setActive, transcribe, webListen],
  );

  // A hidden tab neither listens nor talks: the microphone is released the moment the visitor leaves.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      cancelListening();
      stopSpeaking();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [cancelListening, stopSpeaking]);

  useEffect(
    () => () => {
      cancelListening();
      stopSpeaking();
      cancelAnimationFrame(loop.current);
      loop.current = 0;
      void ctxRef.current?.close().catch(() => undefined);
      // A remount (React strict mode, navigation) starts with a fresh context, never the closed one.
      ctxRef.current = null;
      outRef.current = null;
      unlocked.current = false;
    },
    [cancelListening, stopSpeaking],
  );

  return {
    canListen,
    listening,
    transcribing,
    speaking,
    preparing,
    issue,
    clearIssue: useCallback(() => setIssue(null), []),
    unlock,
    listen,
    stopListening,
    cancelListening,
    speech,
    speak,
    stopSpeaking,
    subscribe,
    setPan,
  };
}
