'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { openApplication } from '@/components/site/ApplyButton';
import { RobotFace, type RobotMood } from './RobotFace';
import { answers } from './answers';
import { store, stored } from './session';
import { ISSUE_TEXT, useVoice, type SoundSubscribe, type VoiceLang } from './voice';
import './sunbot-chat.css';

type Action =
  | { type: 'lead_created' }
  | { type: 'link'; href: string; label: string }
  | { type: 'open_apply' }
  /** A change waiting for the person: shown as a card; only their click (or "ha") sends the token back. */
  | { type: 'confirm'; token: string; text: string; state?: 'pending' | 'running' | 'done' | 'failed' | 'cancelled' }
  /** A change the system made (ok) or refused, as the server reported it after checking the database. */
  | { type: 'did'; name: string; ok: boolean; message: string };
type Msg = { role: 'user' | 'assistant'; text: string; actions?: Action[]; error?: boolean; streaming?: boolean; retry?: string };
type Done = { reply?: string; actions?: Action[] };
type Step = { phase: 'start'; name: string; label: string } | { phase: 'end'; name: string; ok: boolean; write: boolean };
/** How an action's result reads on its chip: done / not done. */
const DID: Record<string, [string, string]> = {
  check_in: ['Davomat belgilandi', 'Davomat belgilanmadi'],
  create_task: ['Vazifa yaratildi', 'Vazifa yaratilmadi'],
  update_task: ['Vazifa yangilandi', 'Vazifa yangilanmadi'],
  set_content_status: ['Kontent holati o‘zgardi', 'Kontent holati o‘zgarmadi'],
  send_message: ['Xabar yuborildi', 'Xabar yuborilmadi'],
  edit_message: ['Xabar tahrirlandi', 'Xabar tahrirlanmadi'],
  delete_message: ['Xabar o‘chirildi', 'Xabar o‘chirilmadi'],
};

/** Who the chat is for: the public site, the team's internal system, or a client's cabinet. */
export type ChatAudience = 'public' | 'staff' | 'client';
const GREETING: Record<ChatAudience, string> = {
  public: 'Salom! Men Sunny — SUN MEDIA yordamchisiman. Biznesingiz haqida aytib bering, qaysi xizmat mos kelishini topamiz.',
  staff:
    'Salom! Men Sunny — ichki yordamchingiz. So‘rang yoki buyuring: davomatni belgilayman, vazifa yarataman, chatga yozaman, kontent holatini o‘zgartiraman — hammasi sizning huquqlaringiz doirasida.',
  client: 'Salom! Men Sunny. Loyihangiz, kontent rejasi va s’yomkalar holati haqida so‘rang — tezda topib beraman.',
};
const SUGGESTIONS: Record<ChatAudience, string[]> = {
  public: ['Qanday xizmatlaringiz bor?', 'Tariflar narxi qancha?', 'Restoran uchun keyslar bormi?', 'Konsultatsiyaga yozilmoqchiman'],
  staff: ['Keldimni belgila', 'Bugungi vazifalarim', 'Bugun kimlar keldi, kimlar kelmadi?', 'Bugungi kamchiliklar va xavflar'],
  client: ['Bu oy kontent holati', 'Yaqin s’yomkalar', 'Loyihamiz holati', 'Menejerga qanday yozaman?'],
};
/** What is sent with each question: the recent part of the chat, each message within the server's limit. */
const HISTORY = 24;
const MAX_TEXT = 2000;
const LANGS: { key: VoiceLang; label: string }[] = [
  { key: 'uz-UZ', label: 'UZ' },
  { key: 'ru-RU', label: 'RU' },
  { key: 'en-US', label: 'EN' },
];
// One conversation per audience: what the team discussed internally never shows on the public site, and back.
const storeKey = (audience: ChatAudience) => `sunbot:v3:${audience}`;
const OFFLINE = 'Internet yo‘q. Ulanish tiklangach qayta yuboring.';

function load(audience: ChatAudience): Msg[] | null {
  try {
    const raw = sessionStorage.getItem(storeKey(audience));
    // Errors are not kept: an old "not connected" or timeout message must not come back after a reload.
    const msgs = raw ? (JSON.parse(raw) as Msg[]).filter((m) => !m.error) : [];
    return msgs.length ? msgs : null;
  } catch {
    return null;
  }
}
function save(audience: ChatAudience, msgs: Msg[]) {
  try {
    sessionStorage.setItem(storeKey(audience), JSON.stringify(msgs.filter((m) => !m.error).map(({ role, text, actions }) => ({ role, text, actions })).slice(-30)));
  } catch {
    // storage blocked: the chat simply does not survive a reload
  }
}

/** Light markdown: **bold** and [label](/path) links, nothing else. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        const bold = /^\*\*(.+)\*\*$/.exec(p);
        if (bold) return <strong key={i}>{bold[1]}</strong>;
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p);
        if (link) {
          const internal = link[2].startsWith('/');
          return internal ? (
            <Link key={i} href={link[2]} className="sb-link">
              {link[1]}
            </Link>
          ) : (
            <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="sb-link">
              {link[1]}
            </a>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

/** Five bars that follow the real sound (the voice while Sunny speaks, the microphone while it listens). */
function Wave({ sound }: { sound: SoundSubscribe }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      sound((f) => {
        const node = el.current;
        if (!node) return;
        f.bands.forEach((b, i) => node.style.setProperty(`--b${i}`, b.toFixed(3)));
      }),
    [sound],
  );
  return (
    <span ref={el} className="sb-wave" aria-hidden>
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

const Icon = {
  speaker: (on: boolean) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m22 9-6 6M16 9l6 6" />}
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  stop: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  ),
};

/** What the launcher robot shows while the chat is open: the chat's state and its live sound. */
export type ChatFace = { mood: RobotMood; sound?: SoundSubscribe };

/**
 * Sunny's chat (loaded on demand by SunBot). Type, or press the mic and talk. Replies are written as they arrive and,
 * with the speaker on, spoken from their first sentence; after a spoken question Sunny listens again, like a call.
 * Tapping the mic or stop interrupts it at any moment. Stays mounted once loaded, so a reply still arrives after the panel
 * is closed and reopened. `audience` only changes the greeting: the server decides what the person may see.
 */
export function SunBotChat({
  audience,
  open,
  closing,
  onClose,
  onFace,
  onReplied,
  onOutcome,
  head,
}: {
  audience: ChatAudience;
  open: boolean;
  closing: boolean;
  onClose: () => void;
  onFace: (face: ChatFace) => void;
  /** A reply was given (and spoken, if the voice is on): the 3D robot nods. */
  onReplied?: () => void;
  /** The system confirmed (or refused) a change: the 3D robot celebrates or shakes its head. Never before the server says so. */
  onOutcome?: (ok: boolean) => void;
  /** The robot in the header (the 3D one on phones, where the launcher is covered); the flat robot otherwise. */
  head?: ReactNode;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(true);
  const [lang, setLang] = useState<VoiceLang>('uz-UZ');
  const [happy, setHappy] = useState(false);
  const [online, setOnline] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [spoken, setSpoken] = useState<number | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'success' | 'fail' | null>(null);
  const router = useRouter();
  const voice = useVoice();
  const scroller = useRef<HTMLDivElement>(null);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const openRef = useRef(open);
  openRef.current = open;
  const busyRef = useRef(false);
  const request = useRef<{ id: number; ctl: AbortController | null }>({ id: 0, ctl: null });
  const chosenMute = useRef(false);
  const lastSent = useRef({ text: '', at: 0 });
  const hearRef = useRef<() => void>(() => undefined);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    setMsgs(load(audience) ?? [{ role: 'assistant', text: GREETING[audience] }]);
    if (stored('sunbot:muted') === '0') setMuted(false);
    if (stored('sunbot:muted')) chosenMute.current = true;
    setOnline(navigator.onLine);
  }, [audience]);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      setNote('Internet qayta ulandi');
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2200);
    return () => clearTimeout(t);
  }, [note]);

  useEffect(() => {
    if (!failed) return;
    const t = setTimeout(() => setFailed(false), 5000);
    return () => clearTimeout(t);
  }, [failed]);

  useEffect(() => {
    if (!outcome) return;
    const t = setTimeout(() => setOutcome(null), 3500);
    return () => clearTimeout(t);
  }, [outcome]);

  const outcomeRef = useRef(onOutcome);
  outcomeRef.current = onOutcome;
  /** An action's result, as the server reported it: the robot reacts and the open page shows the change. */
  const report = useCallback((ok: boolean) => {
    setOutcome(ok ? 'success' : 'fail');
    outcomeRef.current?.(ok);
  }, []);

  useEffect(() => {
    if (msgs.length) save(audience, msgs);
  }, [msgs, audience]);
  // The newest line stays in view, including a "Qayta urinish" button that appears when the connection returns.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: busy ? 'auto' : 'smooth' });
  }, [msgs, busy, online]);

  useEffect(() => {
    if (!voice.speaking) setSpoken(null);
  }, [voice.speaking]);

  const { stopSpeaking, cancelListening } = voice;
  useEffect(() => {
    if (!open) {
      // Closing the chat releases the microphone and ends the voice.
      stopSpeaking();
      cancelListening();
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, stopSpeaking, cancelListening]);

  /** Stops whatever Sunny is doing: the request being answered, the voice and the microphone. */
  const interrupt = useCallback(
    (show = true) => {
      const wasBusy = busyRef.current;
      if (wasBusy) {
        request.current.ctl?.abort();
        request.current = { id: request.current.id + 1, ctl: null };
        busyRef.current = false;
        setBusy(false);
        setMsgs((m) => m.map((x) => (x.streaming ? { ...x, streaming: false } : x)));
        setWorking(null);
      }
      const wasTalking = voice.speaking || voice.preparing;
      voice.stopSpeaking();
      if (show && (wasBusy || wasTalking)) setNote('To‘xtatildi');
    },
    [voice],
  );

  const send = useCallback(
    async (raw: string, via: 'text' | 'voice' = 'text', base?: Msg[]) => {
      const text = raw.trim();
      if (!text) return;
      // A double click or a repeated Enter sends the question once.
      const now = Date.now();
      if (lastSent.current.text === text && now - lastSent.current.at < 800) return;
      lastSent.current = { text, at: now };
      voice.unlock();
      // "Ha" / "yo‘q" (typed or said) right after a confirmation card answers that card, nothing else.
      const list = base ?? msgsRef.current;
      const last = list.length - 1;
      const card = list[last]?.role === 'assistant' ? (list[last].actions ?? []).findIndex((a) => a.type === 'confirm' && (a.state ?? 'pending') === 'pending') : -1;
      const answer = card >= 0 ? answers(text) : null;
      if (answer) {
        setMsgs([...list, { role: 'user', text }]);
        setInput('');
        void decideRef.current(last, card, answer === 'yes', via);
        return;
      }
      // A new question while the last one is still being answered replaces it.
      if (busyRef.current) interrupt(false);
      voice.stopSpeaking();
      voice.clearIssue();
      setFailed(false);
      const id = request.current.id + 1;
      const ctl = new AbortController();
      request.current = { id, ctl };
      busyRef.current = true;
      setBusy(true);
      const history = [...(base ?? msgsRef.current).filter((m) => !m.error && !m.streaming), { role: 'user' as const, text }];
      setMsgs([...(base ?? msgsRef.current), { role: 'user', text }]);
      setInput('');
      try {
        performance.clearMarks('sunbot:send');
        for (const name of ['sunbot:first-text', 'sunbot:first-audio']) performance.clearMeasures(name);
        performance.mark('sunbot:send');
      } catch {
        // user timing unavailable
      }

      const speech = mutedRef.current ? null : voice.speech(lang);
      const live = () => request.current.id === id;
      let streamed = '';
      let shown = false;
      let reply: Msg | null = null;
      const show = (t: string) => {
        if (!shown) {
          shown = true;
          try {
            performance.measure('sunbot:first-text', 'sunbot:send');
          } catch {
            // ignore
          }
          setMsgs((m) => [...m, { role: 'assistant', text: t, streaming: true }]);
        } else setMsgs((m) => m.map((x, i) => (i === m.length - 1 && x.streaming ? { ...x, text: t } : x)));
      };
      const post = () =>
        fetch('/api/assistant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-HISTORY).map(({ role, text }) => ({ role, text: text.slice(0, MAX_TEXT) })), stream: true }),
          signal: ctl.signal,
        });

      try {
        let res: Response;
        try {
          res = await post();
        } catch (error) {
          if (ctl.signal.aborted || !navigator.onLine) throw error;
          // One quiet retry for a dropped connection before showing an error.
          setReconnecting(true);
          await new Promise((r) => setTimeout(r, 1200));
          if (!live()) return;
          res = await post().finally(() => setReconnecting(false));
        }
        if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').includes('ndjson')) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          reply = { role: 'assistant', text: data.error ?? 'Xatolik yuz berdi.', error: true, retry: text };
        } else {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let done: Done | null = null;
          let error: string | null = null;
          for (;;) {
            const { value, done: end } = await reader.read();
            if (!live()) return void reader.cancel().catch(() => undefined);
            if (end) break;
            buffer += decoder.decode(value, { stream: true });
            for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
              const line = buffer.slice(0, i).trim();
              buffer = buffer.slice(i + 1);
              if (!line) continue;
              let ev: { t: string; text?: string; error?: string; phase?: Step['phase']; label?: string; ok?: boolean; write?: boolean } & Done;
              try {
                ev = JSON.parse(line);
              } catch {
                continue;
              }
              if (ev.t === 'delta' && ev.text) {
                streamed += ev.text;
                show(streamed);
                speech?.update(streamed);
              } else if (ev.t === 'step') {
                // A tool running in the system: Sunny works; a change it made or that was refused shows at once.
                if (ev.phase === 'start') setWorking(ev.label ?? 'Bajarilmoqda');
                else {
                  setWorking(null);
                  if (ev.write) report(!!ev.ok);
                }
              } else if (ev.t === 'done') done = ev;
              else if (ev.t === 'error') error = ev.error ?? 'Xatolik yuz berdi.';
            }
          }
          if (done) reply = { role: 'assistant', text: done.reply || streamed, actions: done.actions };
          // Cut off half-way: what was written stays, without an error over it.
          else if (streamed) reply = { role: 'assistant', text: streamed };
          else reply = { role: 'assistant', text: error ?? 'Xatolik yuz berdi.', error: true, retry: text };
        }
      } catch {
        if (!live()) return;
        reply = streamed
          ? { role: 'assistant', text: streamed }
          : { role: 'assistant', text: navigator.onLine ? 'Internet bilan bog‘lanib bo‘lmadi. Qayta urinib ko‘ring.' : OFFLINE, error: true, retry: text };
      } finally {
        if (live()) {
          setReconnecting(false);
          setWorking(null);
        }
      }
      if (!live() || !reply) return;

      const final = reply;
      setMsgs((m) => (shown ? m.map((x, i) => (i === m.length - 1 && x.streaming ? final : x)) : [...m, final]));
      busyRef.current = false;
      setBusy(false);
      request.current.ctl = null;
      if (final.error) {
        speech?.cancel();
        setFailed(true);
        return;
      }
      if (final.actions?.some((a) => a.type === 'lead_created')) {
        setHappy(true);
        setTimeout(() => setHappy(false), 4000);
      }
      if (final.actions?.some((a) => a.type === 'open_apply')) setTimeout(() => openApplication(), 600);
      // Something changed in the system: the page behind the chat shows it without a reload.
      if (final.actions?.some((a) => a.type === 'did' && a.ok)) router.refresh();
      if (!speech) return onReplied?.();
      if (!openRef.current) return speech.cancel();
      // The reply is the streamed bubble already on screen, or the one just added after the last rendered message.
      setSpoken(shown ? msgsRef.current.length - 1 : msgsRef.current.length);
      const spoke = await speech.finish(streamed || final.text);
      if (live()) onReplied?.();
      // Conversation mode: a spoken question gets a spoken answer, then Sunny listens again (not after a silent reply:
      // the note about the missing voice stays readable).
      if (via === 'voice' && spoke && live() && openRef.current && !mutedRef.current) hearRef.current();
    },
    [interrupt, lang, onReplied, report, router, voice],
  );

  /** The person's answer to a confirmation card: only a "yes" sends its token, and the server runs the action. */
  const decide = useCallback(
    async (i: number, j: number, yes: boolean, via: 'text' | 'voice' = 'text') => {
      const card = msgsRef.current[i]?.actions?.[j];
      if (!card || card.type !== 'confirm' || (card.state ?? 'pending') !== 'pending') return;
      const mark = (state: NonNullable<Extract<Action, { type: 'confirm' }>['state']>) =>
        setMsgs((m) => m.map((x, k) => (k === i ? { ...x, actions: x.actions?.map((a, n) => (n === j && a.type === 'confirm' ? { ...a, state } : a)) } : x)));
      voice.unlock();
      voice.stopSpeaking();
      const say = (text: string) => {
        if (!mutedRef.current && openRef.current) void voice.speak(text, lang);
      };
      if (!yes) {
        mark('cancelled');
        const text = 'Bekor qilindi — tizimda hech narsa o‘zgarmadi.';
        setMsgs((m) => [...m, { role: 'assistant', text }]);
        if (via === 'voice') say(text);
        return;
      }
      mark('running');
      setWorking('Bajarilmoqda');
      let data: { ok?: boolean; name?: string; message?: string; link?: { href: string; label: string } | null };
      try {
        const res = await fetch('/api/assistant/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: card.token }) });
        data = await res.json().catch(() => ({ ok: false, message: 'Xatolik yuz berdi.' }));
      } catch {
        data = { ok: false, message: navigator.onLine ? 'Internet bilan bog‘lanib bo‘lmadi. Qayta urinib ko‘ring.' : OFFLINE };
      }
      setWorking(null);
      const ok = !!data.ok;
      mark(ok ? 'done' : 'failed');
      report(ok);
      const text = data.message || (ok ? 'Bajarildi.' : 'Bajarilmadi.');
      const actions: Action[] = [{ type: 'did', name: data.name ?? '', ok, message: text }];
      if (data.link) actions.push({ type: 'link', ...data.link });
      setMsgs((m) => [...m, { role: 'assistant', text, actions }]);
      say(text);
      if (ok) router.refresh();
    },
    [lang, report, router, voice],
  );
  const decideRef = useRef(decide);
  decideRef.current = decide;

  const hear = useCallback(async () => {
    voice.unlock();
    // Talking over Sunny (or over a reply still being written) interrupts it.
    if (busyRef.current || voice.speaking || voice.preparing) interrupt(false);
    // The first spoken question turns the spoken replies on, unless the visitor chose silence.
    if (mutedRef.current && !chosenMute.current) setMuted(false);
    mutedRef.current = mutedRef.current && chosenMute.current;
    const before = input;
    const text = await voice.listen(lang, (t) => setInput(t));
    if (text) void send(text, 'voice');
    else setInput(before);
  }, [input, interrupt, lang, send, voice]);
  hearRef.current = () => void hear();

  const toggleMute = () => {
    voice.unlock();
    const next = !muted;
    chosenMute.current = true;
    setMuted(next);
    store('sunbot:muted', next ? '1' : '0');
    if (next) voice.stopSpeaking();
  };
  const reset = () => {
    interrupt(false);
    voice.cancelListening();
    setFailed(false);
    setMsgs([{ role: 'assistant', text: GREETING[audience] }]);
  };
  const retry = (i: number) => {
    const m = msgs[i];
    if (!m?.retry) return;
    // The failed question and its error are replaced by a fresh attempt.
    const base = msgs.slice(0, Math.max(0, i - 1));
    void send(m.retry, 'text', base);
  };
  const replay = (i: number, text: string) => {
    voice.unlock();
    interrupt(false);
    setSpoken(i);
    void voice.speak(text, lang);
  };

  const talking = voice.speaking || voice.preparing;
  const mood: RobotMood = !online
    ? 'offline'
    : voice.listening
      ? 'listening'
      : voice.speaking
        ? 'speaking'
        : working
          ? 'working'
          : voice.transcribing || busy || voice.preparing
            ? 'thinking'
            : failed || outcome === 'fail'
              ? 'error'
              : happy || outcome === 'success'
                ? 'happy'
                : 'idle';
  const status = !online
    ? 'Internet yo‘q'
    : reconnecting
      ? 'Qayta ulanmoqda…'
      : voice.listening
        ? 'Tinglayapman…'
        : voice.transcribing
          ? 'Eshitganimni yozyapman…'
          : working
            ? `${working}…`
            : busy && msgs[msgs.length - 1]?.streaming
            ? 'Javob yozilmoqda…'
            : busy
              ? 'O‘ylayapman…'
              : voice.preparing
                ? 'Ovoz tayyorlanmoqda…'
                : voice.speaking
                  ? 'Gapiryapman…'
                  : outcome === 'success'
                    ? 'Bajarildi ✓'
                    : outcome === 'fail'
                      ? 'Bajarilmadi'
                      : (note ?? (failed ? 'Xatolik — qayta urinib ko‘ring' : 'SUN MEDIA AI yordamchisi'));
  const showSuggestions = msgs.filter((m) => m.role === 'user').length === 0 && !busy;

  useEffect(() => onFace({ mood, sound: voice.subscribe }), [mood, onFace, voice.subscribe]);

  return (
    <>
      {open ? (
        <section className={`sb-panel ${closing ? 'closing' : ''}`} role="dialog" aria-label="SUN MEDIA yordamchisi" data-lenis-prevent>
          <header className="sb-head">
            {head ?? <RobotFace mood={mood} sound={voice.subscribe} size={76} className="sb-head-robot" />}
            <div className="sb-head-text">
              <p className="sb-title">Sunny</p>
              <p className={`sb-status ${mood}`} role="status">
                {voice.listening || voice.speaking ? <Wave sound={voice.subscribe} /> : <span className={`sb-dot ${mood}`} />}
                <span className="sb-status-text">{status}</span>
              </p>
            </div>
            <div className="sb-head-tools">
              <div className="sb-langs" role="radiogroup" aria-label="Til">
                {LANGS.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    role="radio"
                    aria-checked={lang === l.key}
                    className={lang === l.key ? 'on' : ''}
                    onClick={() => {
                      if (voice.listening) voice.cancelListening();
                      setLang(l.key);
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <button type="button" className="sb-icon" onClick={reset} aria-label="Yangi suhbat" title="Yangi suhbat">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
              <button type="button" className="sb-icon" onClick={onClose} aria-label="Yopish">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </header>

          <div className="sb-msgs" ref={scroller} aria-live="polite" aria-busy={busy}>
            {msgs.map((m, i) => (
              <div key={i} className={`sb-msg ${m.role} ${m.error ? 'error' : ''} ${m.streaming ? 'streaming' : ''}`}>
                <div className="sb-bubble">
                  <Rich text={m.text} />
                </div>
                {m.role === 'assistant' && !m.error && !m.streaming && i > 0 ? (
                  spoken === i && talking ? (
                    <button type="button" className="sb-replay on" onClick={() => interrupt()} aria-label="Ovozni to‘xtatish" title="To‘xtatish">
                      <span className="sb-eq" aria-hidden>
                        <i />
                        <i />
                        <i />
                      </span>
                    </button>
                  ) : (
                    <button type="button" className="sb-replay" onClick={() => replay(i, m.text)} aria-label="Ovozda eshitish" title="Ovozda eshitish">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 5 6 9H2v6h4l5 4V5z" />
                        <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
                      </svg>
                    </button>
                  )
                ) : null}
                {m.error && m.retry && online ? (
                  <div className="sb-actions">
                    <button type="button" className="sb-chip" onClick={() => retry(i)}>
                      Qayta urinish ↻
                    </button>
                  </div>
                ) : null}
                {m.actions?.length ? (
                  <div className="sb-actions">
                    {m.actions.map((a, j) =>
                      a.type === 'link' ? (
                        <Link key={j} href={a.href} className="sb-chip" onClick={() => window.innerWidth < 640 && onClose()}>
                          {a.label} →
                        </Link>
                      ) : a.type === 'lead_created' ? (
                        <span key={j} className="sb-chip done">
                          ✓ Ariza yuborildi
                        </span>
                      ) : a.type === 'did' ? (
                        <span key={j} className={`sb-chip ${a.ok ? 'done' : 'fail'}`} title={a.message}>
                          {a.ok ? '✓' : '✕'} {DID[a.name]?.[a.ok ? 0 : 1] ?? (a.ok ? 'Bajarildi' : 'Bajarilmadi')}
                        </span>
                      ) : a.type === 'confirm' ? (
                        <div key={j} className={`sb-confirm ${a.state ?? 'pending'}`} role="group" aria-label="Tasdiqlash">
                          <p>{a.text}</p>
                          {(a.state ?? 'pending') === 'pending' ? (
                            <div className="sb-confirm-buttons">
                              <button type="button" className="sb-confirm-yes" onClick={() => void decide(i, j, true)}>
                                Tasdiqlash
                              </button>
                              <button type="button" className="sb-confirm-no" onClick={() => void decide(i, j, false)}>
                                Bekor qilish
                              </button>
                            </div>
                          ) : (
                            <span className="sb-confirm-state">
                              {a.state === 'running' ? 'Bajarilmoqda…' : a.state === 'done' ? '✓ Bajarildi' : a.state === 'failed' ? '✕ Bajarilmadi' : 'Bekor qilindi'}
                            </span>
                          )}
                        </div>
                      ) : null,
                    )}
                  </div>
                ) : null}
              </div>
            ))}
            {busy && !msgs[msgs.length - 1]?.streaming ? (
              <div className="sb-msg assistant">
                <div className="sb-bubble sb-typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            ) : null}
            {showSuggestions ? (
              <div className="sb-suggest">
                {SUGGESTIONS[audience].map((s) => (
                  <button key={s} type="button" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {voice.issue ? (
            <div className="sb-issue" role="alert">
              <span>{ISSUE_TEXT[voice.issue]}</span>
              <button type="button" onClick={voice.clearIssue} aria-label="Yopish">
                ×
              </button>
            </div>
          ) : null}

          <form
            className="sb-input"
            onSubmit={(e) => {
              e.preventDefault();
              if ((busy || talking) && !input.trim()) interrupt();
              else void send(input);
            }}
          >
            <button type="button" className={`sb-voice ${muted ? '' : 'on'}`} onClick={toggleMute} aria-pressed={!muted} aria-label={muted ? 'Ovozli javobni yoqish' : 'Ovozli javobni o‘chirish'} title={muted ? 'Ovozli javob: o‘chiq' : 'Ovozli javob: yoqilgan'}>
              {Icon.speaker(!muted)}
            </button>
            <textarea
              rows={1}
              value={input}
              maxLength={2000}
              placeholder={voice.listening ? 'Gapiring…' : !online ? 'Internet yo‘q…' : 'Savolingizni yozing…'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            {voice.canListen ? (
              <button
                type="button"
                className={`sb-mic ${voice.listening ? 'on' : ''}`}
                disabled={voice.transcribing}
                onClick={() => (voice.listening ? voice.stopListening() : void hear())}
                aria-label={voice.listening ? 'Gapirib bo‘ldim' : 'Ovoz bilan so‘rash'}
                title={voice.listening ? 'Gapirib bo‘ldim' : talking ? 'To‘xtatib, gapirish' : 'Bosing va gapiring'}
              >
                {Icon.mic}
              </button>
            ) : null}
            {(busy || talking) && !input.trim() ? (
              <button type="submit" className="sb-send sb-stop" aria-label="To‘xtatish" title="To‘xtatish">
                {Icon.stop}
              </button>
            ) : (
              <button type="submit" className="sb-send" disabled={!input.trim()} aria-label="Yuborish">
                {Icon.send}
              </button>
            )}
          </form>
        </section>
      ) : null}

    </>
  );
}
