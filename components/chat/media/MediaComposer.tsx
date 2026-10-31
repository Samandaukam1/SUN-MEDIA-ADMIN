'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Glyph } from './Glyph';
import { VoiceBubble } from './MediaPlayers';
import { LIMITS, MediaError, TEXT, canRecord, clock, discardAttempt, sendMedia, type Attempt, type Draft } from './media';
import { useRecorder } from './useRecorder';

const RoundVideoRecorder = dynamic(() => import('./RoundVideoRecorder').then((m) => m.RoundVideoRecorder), { ssr: false });

const CANCEL_DX = 96;
const LOCK_DY = 72;
const TAP_MS = 260;
const VOICE: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };

/** Live loudness bars, drawn from the recorder's level outside React (no re-render per frame). */
function LiveBars({ level, className = '' }: { level: React.RefObject<number>; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const bars = Array.from(box.current?.children ?? []) as HTMLElement[];
    const hist = bars.map(() => 0.08);
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 90) {
        last = t;
        hist.shift();
        hist.push(Math.max(0.08, level.current ?? 0));
        bars.forEach((b, i) => (b.style.transform = `scaleY(${hist[i]})`));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [level]);
  return (
    <span ref={box} aria-hidden className={`flex h-6 min-w-0 flex-1 items-center gap-[2px] overflow-hidden ${className}`}>
      {Array.from({ length: 32 }, (_, i) => (
        <span key={i} className="h-full min-w-[2px] flex-1 origin-center scale-y-[0.08] rounded-full bg-current opacity-70 transition-transform duration-75" />
      ))}
    </span>
  );
}

/**
 * The chat composer's voice and round-video controls, inside the host's own row: with nothing typed the send button
 * gives its place to the microphone (and the camera next to it), as in a messenger.
 *
 * Microphone: tap — hands-free recording (Stop → listen → send, or delete); press and hold — record while held, release
 * to send, slide left to cancel, slide up to keep recording hands-free. An interrupted gesture never sends.
 */
export function MediaComposer({
  roomId,
  replyTo,
  idle,
  send,
  onSent,
  onError,
  button,
  primary,
  knob,
  size = 'size-10',
  bar = 'min-h-10 rounded-xl',
  children,
}: {
  roomId: string;
  replyTo: string | null;
  /** Nothing typed or attached and not editing: the media controls replace the send button. */
  idle: boolean;
  /** The host's own send button, shown while there is text. */
  send: ReactNode;
  onSent: () => void;
  onError: (message: string | null) => void;
  /** Classes of the host's secondary buttons (like the attach button) and of its filled send button. */
  button: string;
  primary: string;
  /** Play button colours of the voice preview. */
  knob: string;
  /** The host's button size and the recording bar's height / corners, so the row keeps its look. */
  size?: string;
  bar?: string;
  children: ReactNode;
}) {
  const rec = useRecorder('voice', onError);
  const { open, record, stop, cancel, reset } = rec;
  const [locked, setLocked] = useState(false);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const [sending, setSending] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [video, setVideo] = useState(false);
  const attempt = useRef<Attempt>({});
  const press = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  /** The pointer that pressed the button while it was "send" (only that press, lifted on it, sends). */
  const sendPress = useRef<number | null>(null);
  const sendOnDone = useRef(false);

  const { phase } = rec;
  const active = phase !== 'idle' || sending !== null;
  const holding = phase === 'recording' && !locked;
  const busy = sending !== null;
  const showSend = (phase === 'recording' && locked) || phase === 'done';

  const start = useCallback(
    async (handsFree: boolean) => {
      onError(null);
      setFailed(false);
      setLocked(handsFree);
      setDrag({ dx: 0, dy: 0 });
      if (!canRecord()) return onError(TEXT.unsupported);
      if (await open(VOICE)) record();
    },
    [open, record, onError],
  );

  const deliver = useCallback(
    async (draft: Draft) => {
      onError(null);
      setFailed(false);
      setSending(0);
      try {
        await sendMedia(roomId, draft, attempt.current, replyTo, setSending);
        attempt.current = {};
        setSending(null);
        setLocked(false);
        reset();
        onSent();
      } catch (e) {
        setSending(null);
        setFailed(true);
        // The recording stays as a draft: the send button tries again from where it stopped.
        onError(e instanceof MediaError ? e.message : TEXT.failed);
      }
    },
    [roomId, replyTo, reset, onSent, onError],
  );

  // Released after a hold: the draft arrives a moment after the recorder stops.
  useEffect(() => {
    if (phase !== 'done' || !rec.draft || !sendOnDone.current) return;
    sendOnDone.current = false;
    if (rec.draft.durationMs < LIMITS.minMs) {
      reset();
      setLocked(false);
      onError(TEXT.tooShort);
      return;
    }
    void deliver(rec.draft);
  }, [phase, rec.draft, deliver, reset, onError]);

  const discard = () => {
    sendOnDone.current = false;
    void discardAttempt(attempt.current);
    attempt.current = {};
    cancel();
    setLocked(false);
    setFailed(false);
    onError(null);
  };

  /** The action button: send in hands-free recording / preview, otherwise nothing (the gesture decides). */
  const act = () => {
    if (sending !== null) return;
    if (phase === 'recording' && locked) {
      sendOnDone.current = true;
      stop();
    } else if (phase === 'done' && rec.draft) void deliver(rec.draft);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    press.current = null;
    sendPress.current = null;
    if (phase === 'idle' && sending === null) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
      void start(false);
    } else if (showSend) sendPress.current = e.pointerId;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId || locked) return;
    const dx = Math.min(0, e.clientX - p.x);
    const dy = Math.min(0, e.clientY - p.y);
    if (dx < -CANCEL_DX) {
      press.current = null;
      navigator.vibrate?.(15);
      discard();
    } else if (dy < -LOCK_DY) {
      press.current = null;
      navigator.vibrate?.(10);
      setLocked(true);
      setDrag({ dx: 0, dy: 0 });
    } else setDrag({ dx, dy });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    press.current = null;
    if (!p) {
      // A tap on the button while it is "send"; a finger lifted after a swipe (cancel / lock) does nothing.
      if (sendPress.current === e.pointerId && e.type === 'pointerup') act();
      sendPress.current = null;
      return;
    }
    setDrag({ dx: 0, dy: 0 });
    const tap = performance.now() - p.t < TAP_MS;
    // A tap, a permission prompt in the middle of the hold, or a cancelled gesture: keep recording hands-free.
    if (tap || e.type === 'pointercancel' || phase !== 'recording') setLocked(true);
    else {
      sendOnDone.current = true;
      stop();
    }
  };

  return (
    <>
      {active ? (
        <div className={`relative flex min-w-0 flex-1 items-center gap-2 border border-line bg-surface px-2 py-1 ${bar}`}>
          {phase === 'opening' ? (
            <>
              <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted">Mikrofon ochilmoqda…</span>
              <button type="button" onClick={discard} aria-label="Bekor qilish" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:text-ink">
                <Glyph name="x" size={16} />
              </button>
            </>
          ) : phase === 'recording' ? (
            <>
              {locked ? (
                <button type="button" onClick={discard} aria-label="O‘chirish" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger">
                  <Glyph name="trash" size={17} />
                </button>
              ) : null}
              <span className="flex shrink-0 items-center gap-1.5 pl-1 text-[13px] font-medium tabular-nums">
                <span className="size-2.5 animate-pulse rounded-full bg-[#ff4d4f]" />
                {clock(rec.elapsed)}
              </span>
              {locked ? (
                <>
                  <LiveBars level={rec.level} className="text-accent" />
                  <button type="button" onClick={stop} aria-label="To‘xtatish va tinglash" className="grid size-8 shrink-0 place-items-center rounded-lg text-[#ff4d4f] hover:bg-surface-2">
                    <Glyph name="stop" size={16} />
                  </button>
                </>
              ) : (
                <>
                  <LiveBars level={rec.level} className="max-w-24 text-accent" />
                  <span
                    className="ml-auto flex min-w-0 items-center gap-1 truncate pr-1 text-[12.5px] text-muted"
                    style={{ transform: `translateX(${drag.dx * 0.6}px)`, opacity: 1 + drag.dx / (CANCEL_DX * 1.4) }}
                  >
                    <Glyph name="left" size={14} className="shrink-0" />
                    Bekor qilish uchun suring
                  </span>
                </>
              )}
            </>
          ) : phase === 'done' && rec.draft ? (
            <>
              <button type="button" onClick={discard} disabled={busy} aria-label="O‘chirish" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40">
                <Glyph name="trash" size={17} />
              </button>
              <DraftPreview draft={rec.draft} knob={knob} />
              {busy ? <span className="shrink-0 pr-1 text-[12px] text-muted tabular-nums">{Math.round((sending ?? 0) * 100)}%</span> : null}
              {failed && !busy ? <span className="shrink-0 pr-1 text-[12px] text-danger">Yuborilmadi</span> : null}
            </>
          ) : (
            <span className="flex-1 truncate px-1 text-[13px] text-muted">Yuborilmoqda…</span>
          )}
        </div>
      ) : (
        <>
          {children}
          {idle ? (
            <button
              type="button"
              onClick={() => {
                onError(canRecord() ? null : TEXT.unsupported);
                if (canRecord()) setVideo(true);
              }}
              aria-label="Video xabar yozish" title="Dumaloq video xabar" className={`grid shrink-0 place-items-center ${size} ${button}`}>
              <Glyph name="round" size={19} />
            </button>
          ) : null}
        </>
      )}

      {idle || active ? (
        <span className="relative shrink-0">
          {holding ? (
            // Slide up to keep recording without holding.
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 flex flex-col items-center gap-0.5 rounded-full border border-line bg-surface px-1.5 py-2 text-muted shadow-lg" style={{ transform: `translate(-50%, ${Math.max(-40, drag.dy * 0.5)}px)` }}>
              <Glyph name="lock" size={15} />
              <Glyph name="up" size={13} className="animate-bounce" />
            </span>
          ) : null}
          <button
            type="button"
            aria-label={showSend ? 'Yuborish' : 'Ovozli xabar: bosing yoki bosib turing'}
            title={showSend ? 'Yuborish' : 'Bosing — yozish, bosib turing — qo‘yib yuborsangiz yuboriladi'}
            disabled={busy}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => {
              // Keyboard (Enter / Space): pointer taps are handled above.
              if (e.detail !== 0) return;
              if (phase === 'idle') void start(true);
              else act();
            }}
            className={`grid touch-none place-items-center ${size} transition-transform select-none [-webkit-touch-callout:none] disabled:opacity-40 ${
              showSend || holding ? primary : button
            } ${holding ? 'scale-110' : ''}`}
          >
            {busy ? (
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : showSend ? (
              <Glyph name="send" size={17} />
            ) : (
              <Glyph name="mic" size={19} />
            )}
          </button>
        </span>
      ) : (
        send
      )}

      {video ? <RoundVideoRecorder roomId={roomId} replyTo={replyTo} onSent={onSent} onClose={() => setVideo(false)} /> : null}
    </>
  );
}

/** The recorded voice, playable before it is sent (a local object URL, freed when the draft goes). */
function DraftPreview({ draft, knob }: { draft: Draft; knob: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(draft.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [draft]);
  return url ? (
    <span className="min-w-0 flex-1">
      <VoiceBubble src={url} durationMs={draft.durationMs} waveform={draft.waveform} seed="draft" knob={knob} />
    </span>
  ) : (
    <span className="flex-1" />
  );
}
