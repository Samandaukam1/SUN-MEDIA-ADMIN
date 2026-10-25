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
  const [three, setThree] = useState<{ ok: boolean; ready: boolean; calm: boolean; compact: boolean; visible: boolean; landed: boolean }>({
    ok: false,
    ready: false,
    calm: false,
    compact: false,
    visible: true,
    landed: false,
  });
  const [cue, setCue] = useState<RobotCue | undefined>(undefined);
  const launcher = useRef<HTMLButtonElement>(null);
  const look = useRef(0);
  const sendCue = useCallback((name: RobotCue['name']) => setCue((c) => ({ name, id: (c?.id ?? 0) + 1 })), []);
  const on3dReady = useCallback(() => setThree((s) => (s.ready ? s : { ...s, ready: true })), []);
  const on3dFail = useCallback(() => setThree((s) => ({ ...s, ok: false, ready: false })), []);

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
      landed: landedBefore,
    }));
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
    <div className={`sb-root ${lite ? 'sb-lite' : ''}`}>
      {wanted ? <SunBotChat key={audience} audience={audience} open={open} closing={closing} onClose={close} onFace={setFace} onReplied={() => sendCue('replied')} /> : null}

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
        className={`sb-launcher ${open ? 'is-open' : ''} ${three.ready ? 'has-3d' : ''} ${three.landed ? 'sb-landed' : ''}`}
        onClick={() => (open ? close() : show())}
        onPointerEnter={() => setWanted(true)}
        onFocus={() => setWanted(true)}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        aria-label={open ? 'Yordamchini yopish' : 'AI yordamchi bilan gaplashish'}
        aria-expanded={open}
      >
        <span className="sb-fly">
          <span className="sb-hover">
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
                  // On a phone the open chat covers the launcher: nothing to draw then.
                  active={three.visible && !(open && three.compact)}
                  onReady={on3dReady}
                  onFail={on3dFail}
                />
              </span>
            ) : null}
          </span>
        </span>
        <span className="sb-ring" aria-hidden />
      </button>
    </div>
  );
}
