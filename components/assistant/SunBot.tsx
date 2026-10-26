'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { RobotFace } from './RobotFace';
import type { RobotCue } from './robot/Robot3D';
import { store, stored } from './session';
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
  const [stage, setStage] = useState(false);
  const [stageFailed, setStageFailed] = useState(false);
  const [out, setOut] = useState(false);
  const hover = useRef<HTMLSpanElement>(null);
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
  const onOutcome = useCallback((ok: boolean) => sendCue(ok ? 'success' : 'fail'), [sendCue]);

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

  // Qitmir mode plays (the robot leaves its launcher) only with the 3D robot and without reduced motion; otherwise the
  // mode is the sly face and the personality alone.
  const play = qitmir && !paused && three.ok && three.ready && !three.calm && !stageFailed;
  useEffect(() => {
    if (play) setStage(true);
    else if (!out) setStage(false);
  }, [play, out]);
  const onOut = useCallback(() => setOut(true), []);
  const onDocked = useCallback(() => setOut(false), []);
  const onStageFail = useCallback(() => {
    setStageFailed(true);
    setOut(false);
    setStage(false);
  }, []);
  const toggleQitmir = () => {
    const next = !qitmir;
    setQitmir(next);
    store('sunbot:qitmir', next ? '1' : '0');
    if (next) setWanted(true);
  };
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

  // Eyes follow the pointer over the launcher (desktop): two CSS variables, written at most once a frame.
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== 'mouse' || look.current) return;
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
          dock={!play || open || BUSY.has(face.mood)}
          on={qitmir}
          chat={face.mood}
          cursorFx={cursorFx}
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
          open={open}
          closing={closing}
          onClose={close}
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

      {!open && teaser ? (
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
            <RobotFace mood={open ? face.mood : flying ? 'happy' : 'idle'} sound={open && !three.ready ? face.sound : undefined} size={150} />
            {wanted && three.ok ? (
              <span className={`sb-3d ${three.ready ? 'ready' : ''}`} aria-hidden>
                <Robot3D
                  mood={open ? face.mood : 'idle'}
                  sound={open ? face.sound : undefined}
                  cue={cue}
                  box={three.compact ? 112 : 150}
                  room={three.compact ? 70 : 150}
                  calm={three.calm}
                  compact={three.compact}
                  roam={!open}
                  qitmir={qitmir}
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
        <div className={`sb-qm ${qitmir ? 'on' : ''}`} role="group" aria-label="Qitmir rejim">
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
          {qitmir && three.ok && !three.calm ? (
            <button type="button" className="sb-qm-tool" aria-pressed={paused} onClick={togglePause} aria-label={paused ? 'O‘yinni davom ettirish' : 'O‘yinni pauza qilish'} title={paused ? 'O‘yinni davom ettirish' : 'Pauza: robot joyida qoladi'}>
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
