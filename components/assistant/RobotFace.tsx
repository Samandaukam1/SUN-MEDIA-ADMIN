'use client';

import { useEffect, useRef } from 'react';

import type { SoundSubscribe } from './voice';

export type RobotMood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'error' | 'offline';

/**
 * Sunny, the SUN MEDIA robot. The body is the rendered picture with its screen wiped clean; the eyes and mouth are
 * drawn on top (same 1254×1254 frame) so they can blink, look around while thinking and move with the voice.
 * While it speaks or listens, `sound` frames (real loudness and spectrum) open the mouth, shape it (round for o/u,
 * wide for i/e/s) and drive the halo through one CSS variable, `--lvl`; nothing runs per frame otherwise.
 */
export function RobotFace({ mood, sound, size, className = '' }: { mood: RobotMood; sound?: SoundSubscribe; size: number; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const mouth = useRef<SVGEllipseElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (!sound || (mood !== 'speaking' && mood !== 'listening')) {
      el.style.setProperty('--lvl', '0');
      return;
    }
    let open = 0;
    let shape = 0.5;
    const off = sound((f) => {
      // Fast to open, a little slower to close: reads as syllables rather than jitter.
      open += (f.level - open) * (f.level > open ? 0.55 : 0.3);
      shape += (f.shape - shape) * 0.25;
      el.style.setProperty('--lvl', open.toFixed(3));
      if (mood === 'speaking' && mouth.current) {
        mouth.current.setAttribute('ry', (4 + Math.min(1, open) * 21).toFixed(1));
        mouth.current.setAttribute('rx', (21 + shape * 13 - Math.min(1, open) * 3).toFixed(1));
      }
    });
    return () => {
      off();
      el.style.setProperty('--lvl', '0');
    };
  }, [mood, sound]);

  return (
    <div ref={root} className={`sb-robot sb-mood-${mood} ${className}`} style={{ width: size, height: size }} aria-hidden>
      <span className="sb-halo" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assistant/robot.webp" alt="" width={size} height={size} draggable={false} className="sb-robot-img" />
      <span className="sb-orbit" />
      <svg viewBox="0 0 1254 1254" className="sb-robot-face">
        <defs>
          <filter id="sb-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="9" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#sb-glow)" className="sb-face" fill="none" strokeLinecap="round">
          <g className="sb-eyes">
            <path className="sb-eye" d="M500 360 C498 304 526 288 558 288 C596 288 620 306 618 358" strokeWidth="38" />
            <path className="sb-eye" d="M823 414 C821 372 842 356 870 356 C902 356 922 374 920 414" strokeWidth="34" />
          </g>
          {/* All three mouths are always there and cross-fade, so a change of state never jumps. */}
          <path className="sb-mouth sb-smile" d={mood === 'happy' ? 'M672 418 Q709 458 748 418' : 'M676 422 Q709 446 742 422'} strokeWidth="14" />
          <path className="sb-mouth sb-flat" d="M684 432 L734 432" strokeWidth="14" />
          <ellipse ref={mouth} className="sb-mouth sb-talk" cx="709" cy="430" rx="30" ry="5" stroke="none" />
        </g>
      </svg>
    </div>
  );
}
