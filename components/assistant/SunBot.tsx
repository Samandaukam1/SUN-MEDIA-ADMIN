'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LocalAct } from '@/lib/assistant/intents';
import { wakeRecognizer, type WakeState } from './wake';
import { RobotFace } from './RobotFace';
import { EmotionEngine, expressionOf, type Feeling, type FeelEvent } from './robot/emotion';
import type { RobotCue } from './robot/Robot3D';
import { DEFAULT_PREFS, PREF_LABELS, nudgeFor, readPrefs, ritualFor, type Nudge, type Prefs } from './proactive';
import { keep, kept, store, stored } from './session';
import type { ChatAudience, ChatFace } from './SunBotChat';
import './sunbot.css';

/**
 * The chat and its voice engine are most of Sunny's code and are only needed once someone reaches for it, so they load
 * on the first sign of interest (pointer over the robot, keyboard focus, a tap) or while the browser is idle after the
 * page is ready. Every page ships only the launcher.
 */
const SunBotChat = dynamic(() => import('./SunBotChat').then((m) => m.SunBotChat), { ssr: false });
/** The 3D robot (three.js, shared with the site's hero) loads the same way; the flat robot stands in until it is ready. */
const Robot3D = dynamic(() => import('./robot/Robot3D'), { ssr: false });
/** Qitmir mode's stage (the robot playing across the page): loaded only once someone turns the mode on. */
const QitmirStage = dynamic(() => import('./qitmir/QitmirStage'), { ssr: false });
/** Chat states that own the robot: while one runs it stays home, in the launcher. */
const BUSY = new Set(['listening', 'thinking', 'working', 'speaking']);

/**
 * WebGL that a GPU draws (as for the hero): software renderers would take seconds per frame, so such devices, weak ones
 * and data savers keep the flat robot.
 */
function can3D(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if ((nav.deviceMemory ?? 8) <= 2 || nav.connection?.saveData) return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) || canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * Sunny on every page: a floating robot that flies in, hovers over a neon ring and opens the chat. `audience` only changes
 * the greeting: the server decides what the person may see from their session.
 */
export function SunBot({ audience: given = 'public' }: { audience?: 'public' | 'member' }) {
  // Signed-in pages: a client's cabinet (/kabinet) or the team's system (the panel, the staff cabinet /xodim).
  const path = usePathname() ?? '';
  const audience: ChatAudience = given === 'public' ? 'public' : path.startsWith('/kabinet') ? 'client' : 'staff';
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [wanted, setWanted] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [flying, setFlying] = useState(true);
  const [lite, setLite] = useState(false);
  const [face, setFace] = useState<ChatFace>({ mood: 'idle' });
  const [three, setThree] = useState<{ ok: boolean; ready: boolean; calm: boolean; compact: boolean; touch: boolean; visible: boolean; landed: boolean }>({
    ok: false,
    ready: false,
    calm: false,
    compact: false,
    touch: false,
    visible: true,
    landed: false,
  });
  // Qitmir mode: off until the person turns it on (remembered for this visit). Paused = home with the sly face only;
  // cursorFx off = it may tag the cursor but never holds it.
  const [qitmir, setQitmir] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cursorFx, setCursorFx] = useState(true);
  // Professional mode (§44): serious and concise, the robot stays home; never together with Qitmir.
  const [professional, setProfessional] = useState(false);
  // What Sunny may bring up on its own (rituals, notifications) and whether aloud: the person's choice, kept on this device.
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [nudge, setNudge] = useState<(Nudge & { id: number }) | null>(null);
  const [ask, setAsk] = useState<{ text: string; id: number } | undefined>(undefined);
  const [announce, setAnnounce] = useState<{ text: string; id: number } | undefined>(undefined);
  const router = useRouter();
  const [stage, setStage] = useState(false);
  const [stageFailed, setStageFailed] = useState(false);
  const [out, setOut] = useState(false);
  const hover = useRef<HTMLSpanElement>(null);
  // Voice mode: each press of the mic asks the chat (loaded on demand) to listen without opening its panel.
  const [voiceAsk, setVoiceAsk] = useState(0);
  const [command, setCommand] = useState<{ name: LocalAct | 'summon'; id: number } | undefined>(undefined);
  // "Sunny!" wake word (switched on by the person, remembered for the visit) and spatial audio (on by default).
  const [wake, setWake] = useState(false);
  const [wakeState, setWakeState] = useState<WakeState | 'unsupported'>('off');
  const [canWake, setCanWake] = useState(false);
  const [spatial, setSpatial] = useState(true);
  const [pan, setPanState] = useState(0);
  // Where the robot talks from when it answers out on the page (screen x), for the voice's direction.
  const [spotX, setSpotX] = useState<number | null>(null);
  // Sunny's feelings (emotion.ts): every event that touches it goes through one engine; the robots show the result.
  const emo = useRef<EmotionEngine | null>(null);
  const [feeling, setFeeling] = useState<Feeling>({ name: 'friendly', k: 0 });
  const expression = useMemo(() => expressionOf(feeling), [feeling]);
  const syncFeeling = useCallback(() => {
    const f = emo.current?.feeling;
    if (!f) return;
    // Only a real change re-renders (intensity in steps of 0.05).
    setFeeling((old) => (old.name === f.name && Math.abs(old.k - f.k) < 0.05 ? old : { name: f.name, k: Math.round(f.k * 20) / 20 }));
  }, []);
  const feel = useCallback(
    (kind: FeelEvent) => {
      const now = performance.now() / 1000;
      (emo.current ??= new EmotionEngine(now)).event(kind, now);
      syncFeeling();
    },
    [syncFeeling],
  );
  const [cue, setCue] = useState<RobotCue | undefined>(undefined);
  // The header robot (phones): its own ready / failed state; it falls back to the flat robot on its own.
  const [head3d, setHead3d] = useState<'loading' | 'ready' | 'failed'>('loading');
  const launcher = useRef<HTMLButtonElement>(null);
  const look = useRef(0);
  const sendCue = useCallback((name: RobotCue['name']) => setCue((c) => ({ name, id: (c?.id ?? 0) + 1 })), []);
  const on3dReady = useCallback(() => setThree((s) => (s.ready ? s : { ...s, ready: true })), []);
  const on3dFail = useCallback(() => setThree((s) => ({ ...s, ok: false, ready: false })), []);
  const onHeadReady = useCallback(() => setHead3d('ready'), []);
  const onHeadFail = useCallback(() => setHead3d('failed'), []);
  const onReplied = useCallback(() => sendCue('replied'), [sendCue]);
  // Only after the server confirmed the change (or refused it): never from the chat's own guess.
  const onOutcome = useCallback(
    (ok: boolean) => {
      sendCue(ok ? 'success' : 'fail');
      feel(ok ? 'success' : 'fail');
    },
    [sendCue, feel],
  );

  // Feelings fade with time; a long quiet spell makes Sunny sleepy, the person's return wakes it with a start.
  useEffect(() => {
    let last = performance.now();
    const mark = () => {
      const was = performance.now() - last > 90_000;
      last = performance.now();
      if (was) feel('wake');
    };
    const opts = { passive: true } as const;
    for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(type, mark, opts);
    const id = setInterval(() => {
      const e = (emo.current ??= new EmotionEngine(performance.now() / 1000));
      e.tick(performance.now() / 1000);
      if (performance.now() - last > 90_000 && e.feeling.name !== 'sleepy') feel('idle');
      else syncFeeling();
    }, 1000);
    return () => {
      clearInterval(id);
      for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.removeEventListener(type, mark);
    };
  }, [feel, syncFeeling]);

  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    // Weak devices and data saver get the same states with fewer layers (no glass blur, no glow trail).
    setLite((nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 2 || !!nav.connection?.saveData);
    // The fly-in plays once per visit, not on every page.
    const landedBefore = stored('sunbot:landed') === '1';
    store('sunbot:landed', '1');
    setThree((s) => ({
      ...s,
      ok: can3D(),
      calm: matchMedia('(prefers-reduced-motion: reduce)').matches,
      compact: matchMedia('(pointer: coarse)').matches || innerWidth < 640,
      touch: matchMedia('(pointer: coarse)').matches,
      landed: landedBefore,
    }));
    if (stored('sunbot:qitmir') === '1') {
      setQitmir(true);
      setWanted(true);
    }
    setPaused(stored('sunbot:qitmir-pause') === '1');
    if (stored('sunbot:qitmir') !== '1' && stored('sunbot:pro') === '1') setProfessional(true);
    setPrefs(readPrefs(kept('sunbot:prefs')));
    setCanWake(!!wakeRecognizer());
    if (stored('sunbot:wake') === '1' && wakeRecognizer()) {
      setWake(true);
      setWanted(true);
    }
    setSpatial(stored('sunbot:spatial') !== '0');
    setCursorFx(stored('sunbot:qitmir-cursor') !== '0');
    const onVisibility = () => setThree((s) => ({ ...s, visible: document.visibilityState === 'visible' }));
    document.addEventListener('visibilitychange', onVisibility);
    const landed = setTimeout(() => setFlying(false), landedBefore ? 0 : 2600);
    const idle = (cb: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(cb, { timeout: 8000 }) : setTimeout(cb, 1000));
    const warm = setTimeout(() => idle(() => setWanted(true)), 3000);
    const t = stored('sunbot:teased') === '1' ? undefined : setTimeout(() => setTeaser(true), 5000);
    return () => {
      clearTimeout(t);
      clearTimeout(landed);
      clearTimeout(warm);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setTeaser(false);
    store('sunbot:teased', '1');
  }, [open]);

  // 09 on every opening of the chat, a short farewell on closing.
  const opened = useRef(false);
  useEffect(() => {
    if (open === opened.current) return;
    opened.current = open;
    sendCue(open ? 'welcome' : 'farewell');
  }, [open, sendCue]);

  /** Closes with a short fade (the panel unmounts after it). */
  const closingRef = useRef(false);
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closingRef.current = false;
    }, 170);
  }, []);
  const show = () => {
    setWanted(true);
    setOpen(true);
  };

  // The robot may leave its launcher (Qitmir play, or short trips round the page in normal mode) only with the 3D robot
  // and without reduced motion; the pause button keeps it home. Otherwise Qitmir is the sly face and personality alone.
  const roam = !paused && !professional && three.ok && three.ready && !three.calm && !stageFailed;
  useEffect(() => {
    if (roam) setStage(true);
    else if (!out) setStage(false);
  }, [roam, out]);
  const onOut = useCallback(() => setOut(true), []);
  const onDocked = useCallback(() => setOut(false), []);
  const onStageFail = useCallback(() => {
    setStageFailed(true);
    setOut(false);
    setStage(false);
  }, []);
  const askByVoice = () => {
    setWanted(true);
    setTeaser(false);
    setVoiceAsk((n) => n + 1);
  };
  // A local command ("raqsga tush", "salto qil"…): the launcher robot plays it; the playing robot too, when it is out.
  const onAct = useCallback(
    (act: LocalAct) => {
      const cue = ({ dance: 'dance', salto: 'spin', angry: 'fail', sleep: 'doze', happy: 'success', wave: 'welcome', peace: 'replied', chase: 'tap', stop: null } as const)[act];
      if (cue) sendCue(cue);
      setCommand((c) => ({ name: act, id: (c?.id ?? 0) + 1 }));
      const kind = ({ dance: 'dance', salto: 'salto', angry: 'angry', sleep: 'sleep', happy: 'happy', chase: 'chase', wave: 'wave', peace: 'reconcile', stop: null } as const)[act];
      if (kind) feel(kind);
    },
    [sendCue, feel],
  );
  // Spatial audio: the voice comes a little from the launcher's side of the screen (centred on phones).
  useEffect(() => {
    const place = () => {
      const r = hover.current?.getBoundingClientRect();
      setPanState(!r || three.touch ? 0 : Math.max(-0.35, Math.min(0.35, ((r.left + r.width / 2) / innerWidth) * 0.7 - 0.35)));
    };
    place();
    window.addEventListener('resize', place, { passive: true });
    return () => window.removeEventListener('resize', place);
  }, [three.touch]);
  const toggleSpatial = useCallback(() => {
    setSpatial((v) => {
      store('sunbot:spatial', v ? '0' : '1');
      return !v;
    });
  }, []);
  const toggleWake = () => {
    const next = !wake || wakeState === 'denied';
    setWake(false);
    if (next) setTimeout(() => setWake(true), 0);
    store('sunbot:wake', next ? '1' : '0');
    if (next) setWanted(true);
  };
  // "Sunny!" heard: the robot comes back at full speed (when it is out) and turns to the person.
  const onWake = useCallback(() => {
    setTeaser(false);
    setCommand((c) => ({ name: 'summon', id: (c?.id ?? 0) + 1 }));
    sendCue('welcome');
    feel('tap');
  }, [sendCue, feel]);
  const toggleQitmir = () => {
    const next = !qitmir;
    setQitmir(next);
    store('sunbot:qitmir', next ? '1' : '0');
    if (next) {
      setWanted(true);
      feel('qitmir');
      setProfessional(false);
      store('sunbot:pro', '0');
    }
  };
  const togglePro = () => {
    const next = !professional;
    setProfessional(next);
    store('sunbot:pro', next ? '1' : '0');
    if (next && qitmir) {
      setQitmir(false);
      store('sunbot:qitmir', '0');
    }
  };
  const setPref = (key: keyof Prefs, value: boolean) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      keep('sunbot:prefs', JSON.stringify(next));
      return next;
    });
  };

  const showNudge = useCallback((n: Nudge) => setNudge((old) => ({ ...n, id: (old?.id ?? 0) + 1 })), []);
  // A nudge fades by itself; a short cheer sooner.
  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge((n) => (n?.id === nudge.id ? null : n)), nudge.key === 'cheer' ? 4500 : 25_000);
    return () => clearTimeout(t);
  }, [nudge]);
  const takeNudge = () => {
    if (!nudge) return;
    setNudge(null);
    if (nudge.ask) {
      setWanted(true);
      setAsk((a) => ({ text: nudge.ask!, id: (a?.id ?? 0) + 1 }));
    } else if (nudge.href) router.push(nudge.href);
  };

  // Celebration (§35): only after the system confirmed a real accomplishment; at most once in a while.
  const cheered = useRef(0);
  const onCelebrate = useCallback(() => {
    const now = Date.now();
    if (now - cheered.current < 15_000) return;
    cheered.current = now;
    if (professional) {
      sendCue('success');
      return;
    }
    sendCue('dance');
    feel('dance');
    setCommand((c) => ({ name: 'dance', id: (c?.id ?? 0) + 1 }));
    showNudge({ key: 'cheer', text: qitmir ? 'Mana endi odamga o‘xshab ishladik! 😏' : 'Zo‘r ish! Bajarildi 🎉', label: '' });
  }, [professional, qitmir, sendCue, feel, showNudge]);

  // Daily rituals (§36): once a day, for signed-in people, only a line until they say "ha" (no AI call at all).
  const member = audience !== 'public';
  const mode = qitmir ? 'qitmir' : professional ? 'professional' : 'normal';
  useEffect(() => {
    if (!member || flying || open || !prefs.rituals) return;
    const t = setTimeout(() => {
      const today = new Date().toLocaleDateString('en-CA');
      let done: string[] = [];
      try {
        const r = JSON.parse(kept('sunbot:ritual') ?? '{}') as { date?: string; kinds?: string[] };
        if (r.date === today) done = r.kinds ?? [];
      } catch {
        // a fresh day
      }
      const ritual = ritualFor(new Date().getHours(), audience === 'client' ? 'client' : 'staff', mode, done);
      if (!ritual) return;
      keep('sunbot:ritual', JSON.stringify({ date: today, kinds: [...done, ritual.key] }));
      if (ritual.key === 'morning' && !professional) feel('happy');
      showNudge(ritual);
    }, 4000);
    return () => clearTimeout(t);
  }, [member, flying, open, prefs.rituals, audience, mode, professional, feel, showNudge]);

  // Proactive (§38, §43): a new notification from the person's own live feed. Visual by default, aloud only if chosen;
  // never over typing or a conversation in progress (it waits a little, then lets it go).
  const live = useRef({ prefs, open, mood: face.mood });
  live.current = { prefs, open, mood: face.mood };
  useEffect(() => {
    if (!member) return;
    let wait: ReturnType<typeof setInterval> | undefined;
    const busy = () => {
      const el = document.activeElement as HTMLElement | null;
      return live.current.open || BUSY.has(live.current.mood) || !!el?.closest('input, textarea, select, [contenteditable="true"]');
    };
    const onNotify = (e: Event) => {
      const n = nudgeFor((e as CustomEvent).detail, live.current.prefs);
      if (!n) return;
      clearInterval(wait);
      const deliver = () => {
        showNudge(n);
        sendCue('welcome');
        feel('tap');
        if (live.current.prefs.speak) {
          setWanted(true);
          setAnnounce((a) => ({ text: n.text, id: (a?.id ?? 0) + 1 }));
        }
      };
      if (!busy()) return deliver();
      let tries = 0;
      wait = setInterval(() => {
        if (!busy()) {
          clearInterval(wait);
          deliver();
        } else if (++tries > 20) clearInterval(wait);
      }, 3000);
    };
    window.addEventListener('sm:notify', onNotify);
    return () => {
      window.removeEventListener('sm:notify', onNotify);
      clearInterval(wait);
    };
  }, [member, showNudge, sendCue, feel]);
  useEffect(() => {
    if (!prefsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPrefsOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefsOpen]);
  const togglePause = () => {
    setPaused((p) => {
      store('sunbot:qitmir-pause', p ? '0' : '1');
      return !p;
    });
  };
  const toggleCursorFx = () => {
    setCursorFx((c) => {
      store('sunbot:qitmir-cursor', c ? '0' : '1');
      return !c;
    });
  };

  // A pat: strokes back and forth over the launcher robot's head (desktop).
  const pat = useRef({ x: 0, dir: 0, times: [] as number[], at: 0 });
  const stroke = (clientX: number, clientY: number) => {
    const el = launcher.current;
    const r = el?.getBoundingClientRect();
    const P = pat.current;
    const dx = clientX - P.x;
    P.x = clientX;
    if (!r || clientY > r.top + r.height * 0.45 || Math.abs(dx) < 3) return;
    const dir = Math.sign(dx);
    if (dir === P.dir) return;
    P.dir = dir;
    const now = performance.now();
    P.times = P.times.filter((t) => now - t < 1600);
    P.times.push(now);
    if (P.times.length >= 3 && now - P.at > 2500) {
      P.at = now;
      P.times = [];
      feel('pat');
      sendCue('replied');
    }
  };

  // Eyes follow the pointer over the launcher (desktop): two CSS variables, written at most once a frame.
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'mouse') return;
    stroke(e.clientX, e.clientY);
    if (look.current) return;
    const { clientX, clientY } = e;
    look.current = requestAnimationFrame(() => {
      look.current = 0;
      const el = launcher.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--px', Math.max(-1, Math.min(1, (clientX - r.left - r.width / 2) / (r.width / 2))).toFixed(3));
      el.style.setProperty('--py', Math.max(-1, Math.min(1, (clientY - r.top - r.height / 2) / (r.height / 2))).toFixed(3));
    });
  };
  const onPointerLeave = () => {
    cancelAnimationFrame(look.current);
    look.current = 0;
    launcher.current?.style.setProperty('--px', '0');
    launcher.current?.style.setProperty('--py', '0');
  };

  return (
    <div className={`sb-root ${lite ? 'sb-lite' : ''} ${qitmir ? 'sb-qitmir' : ''}`}>
      {stage ? (
        <QitmirStage
          box={three.compact ? 84 : 116}
          touch={three.touch}
          lite={lite}
          // In a voice conversation (panel closed) a robot out on the page answers where it is; the text panel brings it home.
          dock={!roam || open || (BUSY.has(face.mood) && !(out && face.voice))}
          talk={out && !!face.voice && BUSY.has(face.mood)}
          sound={face.sound}
          onSpot={setSpotX}
          persona={qitmir ? 'qitmir' : 'calm'}
          emotion={expression}
          onFeel={feel}
          on={qitmir}
          chat={face.mood}
          cursorFx={cursorFx}
          command={command}
          active={three.visible}
          home={hover}
          onOut={onOut}
          onDocked={onDocked}
          onFail={onStageFail}
        />
      ) : null}
      {wanted ? (
        <SunBotChat
          key={audience}
          audience={audience}
          qitmir={qitmir}
          professional={professional}
          onCelebrate={onCelebrate}
          ask={ask}
          announce={announce}
          feeling={feeling.name}
          onFeel={feel}
          open={open}
          closing={closing}
          onClose={close}
          onOpen={show}
          onAct={onAct}
          voiceAsk={voiceAsk}
          wake={wake}
          onWake={onWake}
          onWakeState={setWakeState}
          pan={out && face.voice && spotX !== null && !three.touch ? Math.max(-0.35, Math.min(0.35, (spotX / innerWidth) * 0.7 - 0.35)) : pan}
          spatial={spatial}
          onSpatial={three.touch ? undefined : toggleSpatial}
          onFace={setFace}
          onReplied={onReplied}
          onOutcome={onOutcome}
          head={
            // On a phone the open chat covers the launcher: the same 3D robot lives in the header instead.
            three.ok && three.compact && head3d !== 'failed' ? (
              <span className={`sb-head-3d ${head3d === 'ready' ? 'ready' : ''}`} aria-hidden>
                <RobotFace mood={face.mood} sound={face.sound} size={76} className="sb-head-robot" />
                <span className="sb-head-canvas">
                  <Robot3D
                    mood={face.mood}
                    sound={face.sound}
                    cue={cue}
                    box={76}
                    room={12}
                    calm={three.calm}
                    compact
                    roam={false}
                    qitmir={qitmir}
                    emotion={expression}
                    active={open && three.visible}
                    onReady={onHeadReady}
                    onFail={onHeadFail}
                  />
                </span>
              </span>
            ) : undefined
          }
        />
      ) : null}

      {!open && nudge ? (
        <div className={`sb-nudge ${nudge.key === 'cheer' ? 'cheer' : ''}`} role="status" aria-live="polite">
          <p>{nudge.text}</p>
          {nudge.label && (nudge.ask || nudge.href) ? (
            <button type="button" className="sb-nudge-go" onClick={takeNudge}>
              {nudge.label}
            </button>
          ) : null}
          <button type="button" className="sb-nudge-x" aria-label="Yopish" onClick={() => setNudge(null)}>
            ×
          </button>
        </div>
      ) : null}

      {prefsOpen ? (
        <div className="sb-prefs" role="dialog" aria-label="Sunny eslatmalari">
          <p className="sb-prefs-title">Sunny nimalarni o‘zi aytsin?</p>
          {PREF_LABELS.filter(([k]) => audience === 'staff' || k === 'rituals').map(([k, label]) => (
            <label key={k} className="sb-prefs-row">
              <input type="checkbox" checked={prefs[k]} onChange={(e) => setPref(k, e.target.checked)} />
              <span>{label}</span>
            </label>
          ))}
          <button type="button" className="sb-prefs-done" onClick={() => setPrefsOpen(false)}>
            Tayyor
          </button>
        </div>
      ) : null}

      {/* One bubble at a time: Sunny's own line (a ritual, a notification) takes the teaser's place. */}
      {!open && teaser && !nudge ? (
        <button type="button" className="sb-teaser" onClick={show}>
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

      <button
        ref={launcher}
        type="button"
        className={`sb-launcher ${open ? 'is-open' : ''} ${three.ready ? 'has-3d' : ''} ${three.landed ? 'sb-landed' : ''} ${out ? 'sb-out' : ''}`}
        onClick={() => (open ? close() : show())}
        onPointerEnter={() => setWanted(true)}
        onFocus={() => setWanted(true)}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        aria-label={open ? 'Yordamchini yopish' : 'AI yordamchi bilan gaplashish'}
        aria-expanded={open}
      >
        <span className="sb-fly">
          <span className="sb-hover" ref={hover}>
            <RobotFace mood={open || face.mood !== 'idle' ? face.mood : flying ? 'happy' : 'idle'} sound={!three.ready ? face.sound : undefined} size={150} />
            {wanted && three.ok ? (
              <span className={`sb-3d ${three.ready ? 'ready' : ''}`} aria-hidden>
                <Robot3D
                  // The chat's state shows on the robot whether or not the panel is open (voice mode has no panel).
                  mood={face.mood}
                  sound={face.sound}
                  cue={cue}
                  box={three.compact ? 112 : 150}
                  room={three.compact ? 70 : 150}
                  calm={three.calm}
                  compact={three.compact}
                  roam={!open}
                  qitmir={qitmir}
                  emotion={expression}
                  // On a phone the open chat covers the launcher: nothing to draw then; nor while the robot is out playing.
                  active={three.visible && !(open && three.compact) && !out}
                  onReady={on3dReady}
                  onFail={on3dFail}
                />
              </span>
            ) : null}
          </span>
        </span>
        <span className="sb-ring" aria-hidden />
      </button>

      {!flying ? (
        <div className={`sb-qm ${qitmir ? 'on' : ''}`} role="group" aria-label="Sunny boshqaruvi">
          <button type="button" className="sb-qm-tool sb-qm-mic" onClick={askByVoice} aria-label="Ovoz bilan so‘rash" title="Ovoz bilan so‘rash (chat ochilmaydi)">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
              <path d="M5 10.5a7 7 0 0 0 14 0M12 17.5v4" />
            </svg>
          </button>
          {canWake ? (
            <button
              type="button"
              className={`sb-qm-tool sb-wake ${wake && wakeState === 'waiting' ? 'live' : ''}`}
              aria-pressed={wake && wakeState !== 'denied'}
              onClick={toggleWake}
              aria-label="“Sunny!” deb chaqirish"
              title={
                wakeState === 'denied'
                  ? 'Mikrofonga ruxsat berilmagan — qayta urinish uchun bosing'
                  : wake
                    ? '“Sunny!” deb chaqirish yoqilgan (sahifa ochiq turganda mikrofon tinglaydi)'
                    : '“Sunny!” deb chaqirish: sahifa ochiq turganda mikrofon tinglaydi'
              }
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.5 1.6" />
                <path d="M10 9.5a2 2 0 0 1 4 0" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            role="switch"
            aria-checked={qitmir}
            className="sb-qm-switch"
            onClick={toggleQitmir}
            title={qitmir ? 'Qitmir rejimni o‘chirish (Esc — kursorni qo‘yib yuboradi)' : 'Qitmir rejim: robot sahifa bo‘ylab o‘ynaydi'}
          >
            {/* The robot's own Qitmir eyes: grey while off, glowing red while on. */}
            <svg className="sb-qm-eyes" viewBox="0 0 20 11" width="19" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M2 6.2C2.6 2.6 6 1.7 8.2 4.9" />
              <path d="M18 6.2C17.4 2.6 14 1.7 11.8 4.9" />
            </svg>
            <span className="sb-qm-label">Qitmir rejim</span>
          </button>
          {member ? (
            <button
              type="button"
              className="sb-qm-tool sb-pro"
              aria-pressed={professional}
              onClick={togglePro}
              aria-label="Professional rejim"
              title={professional ? 'Professional rejim: yoqilgan (jiddiy va qisqa)' : 'Professional rejim: jiddiy, qisqa, faqat ish'}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3.5" y="7" width="17" height="12.5" rx="2.2" />
                <path d="M9 7V5.6A1.6 1.6 0 0 1 10.6 4h2.8A1.6 1.6 0 0 1 15 5.6V7M3.5 12.5h17" />
              </svg>
            </button>
          ) : null}
          {member ? (
            <button
              type="button"
              className="sb-qm-tool"
              aria-expanded={prefsOpen}
              onClick={() => setPrefsOpen((v) => !v)}
              aria-label="Sunny eslatmalari sozlamasi"
              title="Sunny nimalarni o‘zi aytsin"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9M10 20a2.2 2.2 0 0 0 4 0" />
              </svg>
            </button>
          ) : null}
          {three.ok && !three.calm ? (
            <button type="button" className="sb-qm-tool" aria-pressed={paused} onClick={togglePause} aria-label={paused ? 'Sunny harakatini davom ettirish' : 'Sunny harakatini to‘xtatish'} title={paused ? 'Davom ettirish' : 'Pauza: Sunny joyida qoladi'}>
              {paused ? (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
                  <path d="M8 5.5v13l10.5-6.5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
                  <rect x="6.5" y="5.5" width="3.8" height="13" rx="1.2" />
                  <rect x="13.7" y="5.5" width="3.8" height="13" rx="1.2" />
                </svg>
              )}
            </button>
          ) : null}
          {qitmir && three.ok && !three.calm && !three.touch && !paused ? (
            <button
              type="button"
              className="sb-qm-tool"
              aria-pressed={!cursorFx}
              onClick={toggleCursorFx}
              aria-label={cursorFx ? 'Kursor effektlarini o‘chirish' : 'Kursor effektlarini yoqish'}
              title={cursorFx ? 'Kursor effektlari: yoqilgan' : 'Kursor effektlari: o‘chiq'}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
                <path d="M5 3.5l13 7.2-5.6 1.6-2.4 5.6z" />
                {cursorFx ? null : <path d="M3 21 21 3" />}
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
