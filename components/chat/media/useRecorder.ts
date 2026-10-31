'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { LIMITS, TEXT, baseMime, deviceError, pickMime, stopPlayback, toWaveform, type Draft, type MediaKind } from './media';

export type RecPhase = 'idle' | 'opening' | 'ready' | 'recording' | 'done';

type Session = {
  stream: MediaStream | null;
  rec: MediaRecorder | null;
  chunks: Blob[];
  samples: number[];
  startedAt: number;
  stoppedAt: number;
  size: { width?: number; height?: number };
  ctx: AudioContext | null;
  timer: ReturnType<typeof setInterval> | undefined;
  raf: number;
  discard: boolean;
  token: number;
};

/**
 * One MediaRecorder session. The device opens only when the person asks; its tracks stop the moment the recording ends,
 * is cancelled, the tab is hidden or the component goes away. Nothing leaves the device here: the finished recording
 * is a local draft until the person sends it. Voice also measures loudness (live bars and the stored waveform).
 */
export function useRecorder(kind: MediaKind, onError: (message: string) => void) {
  const [phase, setPhase] = useState<RecPhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  /** Latest loudness 0..1, for bars drawn outside React. */
  const level = useRef(0);
  const s = useRef<Session>({ stream: null, rec: null, chunks: [], samples: [], startedAt: 0, stoppedAt: 0, size: {}, ctx: null, timer: undefined, raf: 0, discard: false, token: 0 });
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const maxMs = kind === 'voice' ? LIMITS.voiceMaxMs : LIMITS.videoMaxMs;

  const release = useCallback(() => {
    const r = s.current;
    cancelAnimationFrame(r.raf);
    clearInterval(r.timer);
    r.stream?.getTracks().forEach((t) => t.stop());
    r.stream = null;
    setStream(null);
    void r.ctx?.close().catch(() => undefined);
    r.ctx = null;
    level.current = 0;
  }, []);

  const stop = useCallback(() => {
    const r = s.current;
    if (!r.rec || r.rec.state === 'inactive') return;
    r.stoppedAt = performance.now();
    clearInterval(r.timer);
    r.rec.stop();
  }, []);

  /** Throw the session away: no draft, nothing kept, the device closed. */
  const cancel = useCallback(() => {
    const r = s.current;
    r.token++;
    r.discard = true;
    setDraft(null);
    if (r.rec && r.rec.state !== 'inactive') r.rec.stop();
    else {
      release();
      setPhase('idle');
    }
  }, [release]);

  const open = useCallback(
    async (constraints: MediaStreamConstraints): Promise<boolean> => {
      const r = s.current;
      const token = ++r.token;
      setPhase('opening');
      try {
        const next = await navigator.mediaDevices.getUserMedia(constraints);
        if (token !== r.token) {
          next.getTracks().forEach((t) => t.stop());
          return false;
        }
        r.stream?.getTracks().forEach((t) => t.stop());
        r.stream = next;
        setStream(next);
        // A device unplugged / taken away mid-way: keep what was recorded, never record silently on.
        next.getTracks().forEach((t) =>
          t.addEventListener('ended', () => {
            if (r.stream !== next) return;
            if (r.rec && r.rec.state !== 'inactive') stop();
            else {
              release();
              setPhase('idle');
              errorRef.current(kind === 'voice' ? TEXT.micMissing : TEXT.camMissing);
            }
          }),
        );
        setPhase('ready');
        return true;
      } catch (error) {
        if (token === r.token) {
          setPhase('idle');
          errorRef.current(deviceError(error, kind));
        }
        return false;
      }
    },
    [kind, release, stop],
  );

  const meter = useCallback((source: MediaStream) => {
    const r = s.current;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      void ctx.resume().catch(() => undefined);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(source).connect(analyser);
      r.ctx = ctx;
      const buf = new Uint8Array(analyser.fftSize);
      let last = 0;
      const tick = (t: number) => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        level.current = Math.min(1, rms * 3.5);
        if (t - last >= 100) {
          last = t;
          r.samples.push(rms);
        }
        r.raf = requestAnimationFrame(tick);
      };
      r.raf = requestAnimationFrame(tick);
    } catch {
      // No bars on this browser; the recording itself is unaffected.
    }
  }, []);

  const record = useCallback(() => {
    const r = s.current;
    if (!r.stream || (r.rec && r.rec.state !== 'inactive')) return;
    const mime = pickMime(kind);
    let rec: MediaRecorder;
    try {
      if (mime === null) throw new Error('unsupported');
      rec = new MediaRecorder(r.stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 64_000,
        ...(kind === 'round_video' ? { videoBitsPerSecond: 1_000_000 } : {}),
      });
    } catch {
      release();
      setPhase('idle');
      errorRef.current(TEXT.unsupported);
      return;
    }
    const settings = r.stream.getVideoTracks()[0]?.getSettings();
    r.size = settings?.width && settings.height ? { width: Math.round(settings.width), height: Math.round(settings.height) } : {};
    r.chunks = [];
    r.samples = [];
    r.discard = false;
    r.rec = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size) r.chunks.push(e.data);
    };
    rec.onerror = () => stop();
    rec.onstop = () => {
      const ms = Math.min(maxMs, (r.stoppedAt || performance.now()) - r.startedAt);
      const type = baseMime(rec.mimeType || mime || '', kind);
      const blob = new Blob(r.chunks, { type });
      const samples = r.samples;
      r.rec = null;
      r.chunks = [];
      release();
      if (r.discard) return setPhase('idle');
      if (!blob.size) {
        setPhase('idle');
        return errorRef.current(TEXT.empty);
      }
      setDraft({ kind, blob, mime: type, durationMs: ms, ...r.size, waveform: kind === 'voice' ? toWaveform(samples) : undefined });
      setPhase('done');
    };
    stopPlayback();
    rec.start(1000);
    r.startedAt = performance.now();
    r.stoppedAt = 0;
    setElapsed(0);
    setPhase('recording');
    r.timer = setInterval(() => {
      const ms = performance.now() - r.startedAt;
      setElapsed(ms);
      if (ms >= maxMs) stop();
    }, 200);
    if (kind === 'voice') meter(r.stream);
  }, [kind, maxMs, meter, release, stop]);

  /** After a send (or a delete of the draft): back to nothing. */
  const reset = useCallback(() => {
    setDraft(null);
    setPhase('idle');
  }, []);

  // A hidden tab never records or keeps the camera on: a recording stops into its draft, an idle camera closes.
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'ready') return;
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      if (phase === 'recording') stop();
      else cancel();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phase, stop, cancel]);

  // An unsent recording is not lost by a stray click or a closed tab without a question.
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'done') return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a[href]');
      if (link && !link.hasAttribute('download') && !confirm('Yozuv hali yuborilmagan. Sahifadan chiqilsinmi?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [phase]);

  useEffect(() => {
    const r = s.current;
    return () => {
      r.token++;
      r.discard = true;
      if (r.rec && r.rec.state !== 'inactive') r.rec.stop();
      release();
    };
  }, [release]);

  return { phase, elapsed, draft, stream, level, maxMs, open, record, stop, cancel, reset };
}
