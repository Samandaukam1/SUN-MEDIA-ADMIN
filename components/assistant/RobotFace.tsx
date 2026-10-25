'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';

export type RobotMood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy';

/**
 * Sunny, the SUN MEDIA robot. The body is the rendered picture with its screen wiped clean; the eyes and mouth are
 * drawn on top (same 1254×1254 frame) so they can blink, look around while thinking and move with the voice.
 * `level` (0–1) is the loudness of what is being said right now, read every frame.
 */
export function RobotFace({ mood, level, size, className = '' }: { mood: RobotMood; level?: MutableRefObject<number>; size: number; className?: string }) {
  const mouth = useRef<SVGEllipseElement>(null);

  useEffect(() => {
    if (mood !== 'speaking') return;
    let frame = 0;
    let smooth = 0.3;
    const tick = (t: number) => {
      // Real loudness when the audio can be measured; otherwise a natural-looking syllable rhythm.
      const target = level && level.current >= 0 ? level.current : 0.35 + 0.35 * Math.abs(Math.sin(t / 95)) * Math.abs(Math.sin(t / 37));
      smooth += (target - smooth) * 0.45;
      mouth.current?.setAttribute('ry', String(5 + Math.min(1, smooth) * 22));
      mouth.current?.setAttribute('rx', String(30 - Math.min(1, smooth) * 6));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mood, level]);

  return (
    <div className={`sb-robot sb-mood-${mood} ${className}`} style={{ width: size, height: size }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assistant/robot.webp" alt="" width={size} height={size} draggable={false} className="sb-robot-img" />
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
        <g filter="url(#sb-glow)" stroke="#d4fc18" fill="none" strokeLinecap="round">
          <g className="sb-eyes">
            <path className="sb-eye" d="M500 360 C498 304 526 288 558 288 C596 288 620 306 618 358" strokeWidth="38" />
            <path className="sb-eye" d="M823 414 C821 372 842 356 870 356 C902 356 922 374 920 414" strokeWidth="34" />
          </g>
          {mood === 'speaking' ? (
            <ellipse ref={mouth} cx="709" cy="430" rx="30" ry="8" fill="#d4fc18" stroke="none" />
          ) : mood === 'thinking' ? (
            <path d="M684 432 L734 432" strokeWidth="14" />
          ) : (
            <path className="sb-smile" d={mood === 'happy' ? 'M672 418 Q709 458 748 418' : 'M676 422 Q709 446 742 422'} strokeWidth="14" />
          )}
        </g>
      </svg>
    </div>
  );
}
