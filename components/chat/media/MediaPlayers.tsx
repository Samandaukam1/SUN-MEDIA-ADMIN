'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { Glyph } from './Glyph';
import { claimPlayback, clock, releasePlayback } from './media';

const SPEEDS = [1, 1.5, 2];
const BARS = 40;

/** The stored loudness bars, or (a message from an app that sends none) a calm fixed pattern instead of a flat line. */
function barsOf(waveform: number[] | null | undefined, seed: string): number[] {
  if (waveform?.length) return Array.from({ length: BARS }, (_, i) => waveform[Math.floor((i * waveform.length) / BARS)] ?? 0);
  let h = 7;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: BARS }, (_, i) => 22 + ((h >>> i % 27) & 7) * 9);
}

/** Smooth progress while a media element plays (one rAF loop, only for the element that plays). */
function usePlayhead(el: React.RefObject<HTMLMediaElement | null>, playing: boolean, setAt: (s: number) => void) {
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      if (el.current) setAt(el.current.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [el, playing, setAt]);
}

/**
 * A voice message: play / pause, the waveform as the progress bar (tap to seek), time, speed 1× / 1.5× / 2×. The audio
 * is fetched only when played; starting it stops any other voice or video message.
 */
export const VoiceBubble = memo(function VoiceBubble({
  src,
  durationMs,
  waveform,
  seed,
  knob,
  downloadHref,
}: {
  src: string;
  durationMs: number | null;
  waveform?: number[] | null;
  seed: string;
  /** Colours of the round play button (they differ in outgoing and incoming bubbles). */
  knob: string;
  downloadHref?: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const levels = useMemo(() => barsOf(waveform, seed), [waveform, seed]);
  const total = durationMs ? durationMs / 1000 : loaded;
  const progress = total ? Math.min(1, at / total) : 0;
  usePlayhead(audio, playing, setAt);

  useEffect(() => {
    const el = audio.current;
    return () => {
      if (!el) return;
      el.pause();
      releasePlayback(el);
    };
  }, []);

  const play = () => {
    const el = audio.current;
    if (!el) return;
    claimPlayback(el);
    el.playbackRate = SPEEDS[speed];
    void el.play().catch((e: { name?: string }) => e?.name !== 'AbortError' && setFailed(true));
  };
  const toggle = () => (audio.current && !audio.current.paused ? audio.current.pause() : play());
  const seekTo = (fraction: number) => {
    const el = audio.current;
    if (!el || !total) return;
    const f = Math.min(1, Math.max(0, fraction));
    if (el.readyState >= 1) el.currentTime = f * total;
    else pendingSeek.current = f * total;
    setAt(f * total);
    if (el.paused) play();
  };

  return (
    <div className="flex w-60 max-w-full items-center gap-2.5 py-0.5">
      <button type="button" onClick={toggle} aria-label={playing ? 'To‘xtatish' : 'Tinglash'} className={`grid size-10 shrink-0 place-items-center rounded-full transition-transform active:scale-95 ${knob}`}>
        <Glyph name={playing ? 'pause' : 'play'} size={16} className={playing ? '' : 'translate-x-px'} />
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Ovozli xabar"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(at)}
          aria-valuetext={clock(at * 1000)}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - r.left) / r.width);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              if (total) seekTo((at + (e.key === 'ArrowRight' ? 5 : -5)) / total);
            }
          }}
          className="flex h-7 cursor-pointer touch-none items-center gap-[2px] outline-none"
        >
          {levels.map((v, i) => (
            <span key={i} className={`min-w-[2px] flex-1 rounded-full bg-current ${i / BARS < progress ? 'opacity-100' : 'opacity-35'}`} style={{ height: `${Math.max(14, v)}%` }} />
          ))}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums opacity-75">
          {failed ? (
            <span>
              Ijro etib bo‘lmadi
              {downloadHref ? (
                <>
                  {' · '}
                  <a href={downloadHref} className="underline">
                    yuklab olish
                  </a>
                </>
              ) : null}
            </span>
          ) : (
            <span>{clock((playing || at > 0 ? at : total) * 1000)}</span>
          )}
          {playing || at > 0 ? (
            <button
              type="button"
              onClick={() => {
                const next = (speed + 1) % SPEEDS.length;
                setSpeed(next);
                if (audio.current) audio.current.playbackRate = SPEEDS[next];
              }}
              aria-label="Tezlik"
              className="rounded-full border border-current/30 px-1.5 leading-4 font-semibold"
            >
              {SPEEDS[speed]}×
            </button>
          ) : null}
        </div>
      </div>
      <audio
        ref={audio}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={(e) => {
          setPlaying(false);
          setAt(0);
          e.currentTarget.currentTime = 0;
          releasePlayback(e.currentTarget);
        }}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (Number.isFinite(el.duration)) setLoaded(el.duration);
          if (pendingSeek.current !== null) {
            el.currentTime = pendingSeek.current;
            pendingSeek.current = null;
          }
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
});

/**
 * A round video message: a circle (square video, `object-fit: cover`, nothing stretched), tap to play with sound and
 * tap to pause, a ring for progress, replay at the end. The file loads only near the screen and never autoplays.
 */
export const RoundVideo = memo(function RoundVideo({
  src,
  durationMs,
  downloadHref,
  size = 'size-[min(240px,62vw)]',
  eager = false,
}: {
  src: string;
  durationMs: number | null;
  downloadHref?: string;
  size?: string;
  /** A local preview: no need to wait for the screen. */
  eager?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(eager);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [at, setAt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const total = durationMs ? durationMs / 1000 : loaded;
  const progress = total ? Math.min(1, at / total) : 0;
  usePlayhead(video, playing, setAt);

  useEffect(() => {
    const el = box.current;
    if (near || !el) return;
    if (typeof IntersectionObserver === 'undefined') return setNear(true);
    const io = new IntersectionObserver(([entry]) => entry?.isIntersecting && setNear(true), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    const el = video.current;
    return () => {
      if (!el) return;
      el.pause();
      releasePlayback(el);
    };
  }, []);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (!el.paused) return el.pause();
    setNear(true);
    claimPlayback(el);
    el.muted = false;
    setEnded(false);
    void el.play().catch((e: { name?: string }) => e?.name !== 'AbortError' && setFailed(true));
  };

  const R = 48.5;
  const C = 2 * Math.PI * R;
  return (
    <div ref={box} className={`relative shrink-0 select-none ${size}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'To‘xtatish' : 'Video xabarni ko‘rish'}
        className="absolute inset-[5px] overflow-hidden rounded-full bg-black/30 [-webkit-mask-image:-webkit-radial-gradient(white,black)]"
      >
        <video
          ref={video}
          // #t=0.1: Safari shows the first frame instead of a black circle.
          src={near ? `${src}#t=0.1` : undefined}
          preload="metadata"
          playsInline
          disablePictureInPicture
          className="size-full object-cover"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={(e) => {
            setPlaying(false);
            setEnded(true);
            setAt(0);
            releasePlayback(e.currentTarget);
          }}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLoaded(e.currentTarget.duration)}
          onError={() => near && setFailed(true)}
        />
        {!playing ? (
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-12 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
              <Glyph name={ended ? 'retry' : 'play'} size={ended ? 20 : 18} className={ended ? '' : 'translate-x-px'} />
            </span>
          </span>
        ) : null}
      </button>
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2" />
        <circle cx="50" cy="50" r={R} fill="none" stroke="#d4fc18" strokeWidth="2" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
      </svg>
      <span className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums">
        {failed ? 'Ijro etilmadi' : clock((playing || at > 0 ? at : total) * 1000)}
      </span>
      {failed && downloadHref ? (
        <a href={downloadHref} className="absolute top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white underline">
          Yuklab olish
        </a>
      ) : null}
    </div>
  );
});
