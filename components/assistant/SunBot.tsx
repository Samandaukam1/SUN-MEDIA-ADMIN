'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { RobotFace } from './RobotFace';
import { store, stored } from './session';
import type { ChatFace } from './SunBotChat';
import './sunbot.css';

/**
 * The chat and its voice engine are most of Sunny's code and are only needed once someone reaches for it, so they load
 * on the first sign of interest (pointer over the robot, keyboard focus, a tap) or while the browser is idle after the
 * page is ready. Every page ships only the launcher.
 */
const SunBotChat = dynamic(() => import('./SunBotChat').then((m) => m.SunBotChat), { ssr: false });

/**
 * Sunny on every page: a floating robot that flies in, hovers over a neon ring and opens the chat. `audience` only changes
 * the greeting: the server decides what the person may see from their session.
 */
export function SunBot({ audience = 'public' }: { audience?: 'public' | 'member' }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [wanted, setWanted] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [flying, setFlying] = useState(true);
  const [lite, setLite] = useState(false);
  const [face, setFace] = useState<ChatFace>({ mood: 'idle' });
  const launcher = useRef<HTMLButtonElement>(null);
  const look = useRef(0);

  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    // Weak devices and data saver get the same states with fewer layers (no glass blur, no glow trail).
    setLite((nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 2 || !!nav.connection?.saveData);
    const landed = setTimeout(() => setFlying(false), 2600);
    const idle = (cb: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(cb, { timeout: 8000 }) : setTimeout(cb, 1000));
    const warm = setTimeout(() => idle(() => setWanted(true)), 3000);
    const t = stored('sunbot:teased') === '1' ? undefined : setTimeout(() => setTeaser(true), 5000);
    return () => {
      clearTimeout(t);
      clearTimeout(landed);
      clearTimeout(warm);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setTeaser(false);
    store('sunbot:teased', '1');
  }, [open]);

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
      {wanted ? <SunBotChat audience={audience} open={open} closing={closing} onClose={close} onFace={setFace} /> : null}

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
        className={`sb-launcher ${open ? 'is-open' : ''}`}
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
            <RobotFace mood={open ? face.mood : flying ? 'happy' : 'idle'} sound={open ? face.sound : undefined} size={150} />
          </span>
        </span>
        <span className="sb-ring" aria-hidden />
      </button>
    </div>
  );
}
