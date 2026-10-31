'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Glyph } from './Glyph';
import { RoundVideo } from './MediaPlayers';
import { MediaError, TEXT, canRecord, clock, discardAttempt, sendMedia, type Attempt } from './media';
import { useRecorder } from './useRecorder';

type Facing = 'user' | 'environment';

const constraints = (facing: Facing): MediaStreamConstraints => ({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  // Square-ish, phone-sized: a clear face and voice without a heavy file.
  video: { facingMode: { ideal: facing }, width: { ideal: 480 }, height: { ideal: 480 }, aspectRatio: { ideal: 1 }, frameRate: { ideal: 30, max: 30 } },
});

/**
 * The round video message: live front camera in a circle → record (ring = time left) → watch it → send, record again or
 * delete. The camera opens with this screen and closes with the recording, a cancel, a hidden tab or the screen itself.
 */
export function RoundVideoRecorder({
  roomId,
  replyTo,
  onSent,
  onClose,
}: {
  roomId: string;
  replyTo: string | null;
  onSent: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const rec = useRecorder('round_video', setError);
  const { open, record, stop, cancel, reset } = rec;
  const [facing, setFacing] = useState<Facing>('user');
  const [cameras, setCameras] = useState(1);
  const [sending, setSending] = useState<number | null>(null);
  const attempt = useRef<Attempt>({});
  const sendOnDone = useRef(false);
  const live = useRef<HTMLVideoElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const url = useMemo(() => (rec.draft ? URL.createObjectURL(rec.draft.blob) : null), [rec.draft]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const openCamera = useCallback(
    async (f: Facing) => {
      setError(null);
      if (!canRecord()) return setError(TEXT.unsupported);
      if (await open(constraints(f))) {
        void navigator.mediaDevices
          .enumerateDevices?.()
          .then((d) => setCameras(d.filter((x) => x.kind === 'videoinput').length))
          .catch(() => undefined);
      }
    },
    [open],
  );

  // Opened by the person's tap on the camera button.
  useEffect(() => {
    void openCamera('user');
  }, [openCamera]);

  useEffect(() => {
    if (live.current) live.current.srcObject = rec.stream;
  }, [rec.stream]);

  useEffect(() => first.current?.focus(), [rec.phase]);

  const send = useCallback(async () => {
    const draft = rec.draft;
    if (!draft) return;
    setError(null);
    setSending(0);
    try {
      await sendMedia(roomId, draft, attempt.current, replyTo, setSending);
      attempt.current = {};
      reset();
      onSent();
      onClose();
    } catch (e) {
      setSending(null);
      // The recording stays here: "Yuborish" tries again from where it stopped.
      setError(e instanceof MediaError ? e.message : TEXT.failed);
    }
  }, [rec.draft, roomId, replyTo, reset, onSent, onClose]);

  // "Send" pressed while recording: the draft comes a moment after the recorder stops.
  useEffect(() => {
    if (rec.phase === 'done' && rec.draft && sendOnDone.current) {
      sendOnDone.current = false;
      void send();
    }
  }, [rec.phase, rec.draft, send]);

  const close = useCallback(() => {
    if (sending !== null) return;
    cancel();
    void discardAttempt(attempt.current);
    attempt.current = {};
    onClose();
  }, [sending, cancel, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const retake = () => {
    void discardAttempt(attempt.current);
    attempt.current = {};
    reset();
    void openCamera(facing);
  };
  const flip = () => {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    void openCamera(next);
  };

  const { phase } = rec;
  const recording = phase === 'recording';
  const R = 48.5;
  const C = 2 * Math.PI * R;
  const ring = sending !== null ? sending : recording ? rec.elapsed / rec.maxMs : 0;
  const round = 'grid place-items-center rounded-full transition active:scale-95 disabled:opacity-40';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Video xabar"
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-5 bg-black/80 px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white backdrop-blur-md"
    >
      <div className="relative size-[min(80vw,340px,52dvh)]">
        {phase === 'done' && url ? (
          <RoundVideo src={url} durationMs={rec.draft?.durationMs ?? null} size="size-full" eager />
        ) : (
          <>
            <div className="absolute inset-[6px] overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10 [-webkit-mask-image:-webkit-radial-gradient(white,black)]">
              <video ref={live} autoPlay muted playsInline className={`size-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`} />
              {phase === 'opening' || phase === 'idle' ? (
                <span className="absolute inset-0 grid place-items-center text-[13px] text-white/70">
                  {phase === 'opening' ? <span className="size-6 animate-spin rounded-full border-2 border-white/70 border-t-transparent" /> : null}
                </span>
              ) : null}
            </div>
            <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r={R} fill="none" stroke="white" strokeOpacity="0.14" strokeWidth="1.6" />
              <circle cx="50" cy="50" r={R} fill="none" stroke={recording ? '#ff4d4f' : '#d4fc18'} strokeWidth="1.6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - ring)} />
            </svg>
          </>
        )}
      </div>

      <p className="min-h-5 text-center text-[13.5px] tabular-nums" aria-live="polite">
        {error ? (
          <span className="text-[#ff8a8a]">{error}</span>
        ) : sending !== null ? (
          `Yuborilmoqda… ${Math.round(sending * 100)}%`
        ) : recording ? (
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 animate-pulse rounded-full bg-[#ff4d4f]" />
            {clock(rec.elapsed)} / {clock(rec.maxMs)}
          </span>
        ) : phase === 'done' ? (
          'Ko‘rib chiqing va yuboring'
        ) : phase === 'ready' ? (
          'Yozish uchun qizil tugmani bosing'
        ) : (
          'Kamera ochilmoqda…'
        )}
      </p>

      <div className="flex items-center gap-6">
        {phase === 'done' ? (
          <>
            <button ref={first} type="button" onClick={close} disabled={sending !== null} aria-label="O‘chirish" className={`${round} size-12 bg-white/10 hover:bg-white/15`}>
              <Glyph name="trash" size={20} />
            </button>
            <button type="button" onClick={retake} disabled={sending !== null} aria-label="Qayta yozish" className={`${round} size-12 bg-white/10 hover:bg-white/15`}>
              <Glyph name="retry" size={20} />
            </button>
            <button type="button" onClick={() => void send()} disabled={sending !== null} aria-label="Yuborish" className={`${round} size-16 bg-[#d4fc18] text-[#0b0b0c]`}>
              {sending !== null ? <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Glyph name="send" size={22} />}
            </button>
          </>
        ) : recording ? (
          <>
            <button type="button" onClick={close} aria-label="Bekor qilish" className={`${round} size-12 bg-white/10 hover:bg-white/15`}>
              <Glyph name="trash" size={20} />
            </button>
            <button ref={first} type="button" onClick={stop} aria-label="To‘xtatish va ko‘rish" className={`${round} size-[72px] border-4 border-white text-[#ff4d4f]`}>
              <Glyph name="stop" size={26} />
            </button>
            <button
              type="button"
              onClick={() => {
                sendOnDone.current = true;
                stop();
              }}
              aria-label="Yuborish"
              className={`${round} size-12 bg-[#d4fc18] text-[#0b0b0c]`}
            >
              <Glyph name="send" size={19} />
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={close} aria-label="Yopish" className={`${round} size-12 bg-white/10 hover:bg-white/15`}>
              <Glyph name="x" size={20} />
            </button>
            {phase === 'idle' && error ? (
              <button ref={first} type="button" onClick={() => void openCamera(facing)} className="h-12 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0b0b0c]">
                Qayta urinish
              </button>
            ) : (
              <button ref={first} type="button" onClick={record} disabled={phase !== 'ready'} aria-label="Yozishni boshlash" className={`${round} size-[72px] border-4 border-white`}>
                <span className="size-[52px] rounded-full bg-[#ff4d4f]" />
              </button>
            )}
            <button type="button" onClick={flip} disabled={phase !== 'ready' || cameras < 2} aria-label="Kamerani almashtirish" className={`${round} size-12 bg-white/10 hover:bg-white/15`}>
              <Glyph name="flip" size={20} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
