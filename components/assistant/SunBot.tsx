'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { openApplication } from '@/components/site/ApplyButton';
import { RobotFace, type RobotMood } from './RobotFace';
import { useVoice, type VoiceLang } from './voice';
import './sunbot.css';

type Action = { type: 'lead_created' } | { type: 'link'; href: string; label: string } | { type: 'open_apply' };
type Msg = { role: 'user' | 'assistant'; text: string; actions?: Action[]; error?: boolean };

const GREETING: Record<'public' | 'member', string> = {
  public: 'Salom! Men Sunny — SUN MEDIA yordamchisiman. Biznesingiz haqida aytib bering, qaysi xizmat mos kelishini topamiz.',
  member: 'Salom! Men Sunny. Vazifalar, s’yomkalar yoki loyiha holati haqida so‘rang — tezda topib beraman.',
};
const SUGGESTIONS: Record<'public' | 'member', string[]> = {
  public: ['Qanday xizmatlaringiz bor?', 'Tariflar narxi qancha?', 'Restoran uchun keyslar bormi?', 'Konsultatsiyaga yozilmoqchiman'],
  member: ['Bugungi vazifalarim', 'Yaqin s’yomkalar', 'Bu oy kontent holati', 'Post uchun caption yozib ber'],
};
const LANGS: { key: VoiceLang; label: string }[] = [
  { key: 'uz-UZ', label: 'UZ' },
  { key: 'ru-RU', label: 'RU' },
  { key: 'en-US', label: 'EN' },
];
const STORE = 'sunbot:v1';

function load(): Msg[] | null {
  try {
    const raw = sessionStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Msg[]) : null;
  } catch {
    return null;
  }
}
function save(msgs: Msg[]) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-30)));
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

/**
 * Sunny on every page: a floating robot that opens a chat. Type, or press the mic and talk; with "Ovozli suhbat" on it
 * answers aloud and listens again, like a call. `audience` only changes the greeting: the server decides what the person
 * may see from their session.
 */
export function SunBot({ audience = 'public' }: { audience?: 'public' | 'member' }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [lang, setLang] = useState<VoiceLang>('uz-UZ');
  const [teaser, setTeaser] = useState(false);
  const [happy, setHappy] = useState(false);
  const [flying, setFlying] = useState(true);
  const voice = useVoice();
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;

  useEffect(() => {
    setMsgs(load() ?? [{ role: 'assistant', text: GREETING[audience] }]);
    const landed = setTimeout(() => setFlying(false), 2600);
    const seen = (() => {
      try {
        return sessionStorage.getItem('sunbot:teased') === '1';
      } catch {
        return false;
      }
    })();
    if (seen) return () => clearTimeout(landed);
    const t = setTimeout(() => setTeaser(true), 5000);
    return () => {
      clearTimeout(t);
      clearTimeout(landed);
    };
  }, [audience]);

  useEffect(() => {
    if (msgs.length) save(msgs);
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  useEffect(() => {
    if (!open) return;
    setTeaser(false);
    try {
      sessionStorage.setItem('sunbot:teased', '1');
    } catch {
      // ignore
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      voice.stopSpeaking();
      const next: Msg[] = [...msgsRef.current, { role: 'user', text }];
      setMsgs(next);
      setInput('');
      setBusy(true);
      let reply: Msg;
      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: next.filter((m) => !m.error).map(({ role, text }) => ({ role, text })) }),
        });
        const data = (await res.json()) as { reply?: string; actions?: Action[]; error?: string };
        reply = res.ok && data.reply ? { role: 'assistant', text: data.reply, actions: data.actions } : { role: 'assistant', text: data.error ?? 'Xatolik yuz berdi.', error: true };
      } catch {
        reply = { role: 'assistant', text: 'Internet bilan bog‘lanib bo‘lmadi. Qayta urinib ko‘ring.', error: true };
      }
      setMsgs((m) => [...m, reply]);
      setBusy(false);
      if (reply.actions?.some((a) => a.type === 'lead_created')) {
        setHappy(true);
        setTimeout(() => setHappy(false), 4000);
      }
      if (reply.actions?.some((a) => a.type === 'open_apply')) setTimeout(() => openApplication(), 600);
      if (voiceOnRef.current && !reply.error) {
        await voice.speak(reply.text, lang);
        // Conversation mode: after answering, listen again.
        if (voiceOnRef.current && voice.canListen) void hear();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, lang, voice.canListen],
  );

  const hear = useCallback(async () => {
    voice.stopSpeaking();
    const text = await voice.listen(lang, (t) => setInput(t));
    if (text) void send(text);
  }, [lang, send, voice]);

  const mood: RobotMood = voice.listening ? 'listening' : busy ? 'thinking' : voice.speaking ? 'speaking' : happy ? 'happy' : 'idle';
  const toggleVoice = () => {
    const on = !voiceOn;
    setVoiceOn(on);
    if (!on) {
      voice.stopSpeaking();
      voice.stopListening();
    } else if (voice.canListen && !busy) void hear();
  };
  const reset = () => {
    voice.stopSpeaking();
    setMsgs([{ role: 'assistant', text: GREETING[audience] }]);
  };
  const showSuggestions = msgs.filter((m) => m.role === 'user').length === 0 && !busy;

  return (
    <div className="sb-root">
      {open ? (
        <section className="sb-panel" role="dialog" aria-label="SUN MEDIA yordamchisi" data-lenis-prevent>
          <header className="sb-head">
            <RobotFace mood={mood} level={voice.level} size={76} className="sb-head-robot" />
            <div className="sb-head-text">
              <p className="sb-title">Sunny</p>
              <p className="sb-status">
                <span className={`sb-dot ${mood}`} />
                {mood === 'listening' ? 'Tinglayapman…' : mood === 'thinking' ? 'O‘ylayapman…' : mood === 'speaking' ? 'Gapiryapman…' : 'SUN MEDIA AI yordamchisi'}
              </p>
            </div>
            <div className="sb-head-tools">
              <div className="sb-langs" role="radiogroup" aria-label="Til">
                {LANGS.map((l) => (
                  <button key={l.key} type="button" role="radio" aria-checked={lang === l.key} className={lang === l.key ? 'on' : ''} onClick={() => setLang(l.key)}>
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
              <button type="button" className="sb-icon" onClick={() => setOpen(false)} aria-label="Yopish">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </header>

          <div className="sb-msgs" ref={scroller} aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`sb-msg ${m.role} ${m.error ? 'error' : ''}`}>
                <div className="sb-bubble">
                  <Rich text={m.text} />
                </div>
                {m.role === 'assistant' && !m.error && i > 0 ? (
                  <button type="button" className="sb-replay" onClick={() => void voice.speak(m.text, lang)} aria-label="Ovozda eshitish" title="Ovozda eshitish">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 5 6 9H2v6h4l5 4V5z" />
                      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
                    </svg>
                  </button>
                ) : null}
                {m.actions?.length ? (
                  <div className="sb-actions">
                    {m.actions.map((a, j) =>
                      a.type === 'link' ? (
                        <Link key={j} href={a.href} className="sb-chip" onClick={() => window.innerWidth < 640 && setOpen(false)}>
                          {a.label} →
                        </Link>
                      ) : a.type === 'lead_created' ? (
                        <span key={j} className="sb-chip done">
                          ✓ Ariza yuborildi
                        </span>
                      ) : null,
                    )}
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? (
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

          <form
            className="sb-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <button type="button" className={`sb-voice ${voiceOn ? 'on' : ''}`} onClick={toggleVoice} aria-pressed={voiceOn} title="Ovozli suhbat: javobni ovozda aytadi va yana tinglaydi">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {voiceOn ? (
                  <>
                    <path d="M11 5 6 9H2v6h4l5 4V5z" />
                    <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
                  </>
                ) : (
                  <>
                    <path d="M11 5 6 9H2v6h4l5 4V5z" />
                    <path d="m22 9-6 6M16 9l6 6" />
                  </>
                )}
              </svg>
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={2000}
              placeholder={voice.listening ? 'Gapiring…' : 'Savolingizni yozing…'}
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
                onClick={() => (voice.listening ? voice.stopListening() : void hear())}
                aria-label={voice.listening ? 'To‘xtatish' : 'Gapirish'}
                title="Bosing va gapiring"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
                </svg>
              </button>
            ) : null}
            <button type="submit" className="sb-send" disabled={!input.trim() || busy} aria-label="Yuborish">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        </section>
      ) : null}

      {!open && teaser ? (
        <button type="button" className="sb-teaser" onClick={() => setOpen(true)}>
          Salom! Savolingiz bormi? 👋
          <span
            role="button"
            tabIndex={0}
            aria-label="Yopish"
            className="sb-teaser-x"
            onClick={(e) => {
              e.stopPropagation();
              setTeaser(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && setTeaser(false)}
          >
            ×
          </span>
        </button>
      ) : null}

      <button type="button" className={`sb-launcher ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-label={open ? 'Yordamchini yopish' : 'AI yordamchi bilan gaplashish'} aria-expanded={open}>
        <span className="sb-fly">
          <span className="sb-hover">
            <RobotFace mood={open ? mood : flying ? 'happy' : 'idle'} level={voice.level} size={150} />
          </span>
        </span>
        <span className="sb-ring" aria-hidden />
      </button>
    </div>
  );
}
