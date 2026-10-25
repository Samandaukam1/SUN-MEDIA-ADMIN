'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceLang = 'uz-UZ' | 'ru-RU' | 'en-US';

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * The robot's ears and voice.
 * - Ears: the browser's speech recognition (Chrome, Edge, Safari, Android), Uzbek by default.
 * - Voice: /api/assistant/tts (Azure neural voice, natural Uzbek); if that is off, the browser's own voice.
 * `level` carries the loudness of the voice for the mouth animation (-1 when it cannot be measured).
 */
export function useVoice() {
  const [canListen, setCanListen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const level = useRef(-1);
  const rec = useRef<Recognition | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const stopSpeakRef = useRef<() => void>(() => undefined);

  useEffect(() => setCanListen(!!recognitionCtor()), []);

  const listen = useCallback((lang: VoiceLang, onText: (text: string, final: boolean) => void): Promise<string> => {
    const Ctor = recognitionCtor();
    if (!Ctor) return Promise.resolve('');
    rec.current?.abort();
    return new Promise((resolve) => {
      const r = new Ctor();
      rec.current = r;
      r.lang = lang;
      r.interimResults = true;
      r.continuous = false;
      r.maxAlternatives = 1;
      let finalText = '';
      r.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText += res[0].transcript;
          else interim += res[0].transcript;
        }
        onText((finalText + interim).trim(), false);
      };
      r.onerror = () => undefined;
      r.onend = () => {
        setListening(false);
        rec.current = null;
        const text = finalText.trim();
        if (text) onText(text, true);
        resolve(text);
      };
      try {
        r.start();
        setListening(true);
      } catch {
        setListening(false);
        resolve('');
      }
    });
  }, []);

  const stopListening = useCallback(() => rec.current?.stop(), []);

  const stopSpeaking = useCallback(() => stopSpeakRef.current(), []);

  const speak = useCallback(async (text: string, lang: VoiceLang): Promise<void> => {
    stopSpeakRef.current();
    const clean = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_#`]/g, '').trim();
    if (!clean) return;
    setSpeaking(true);
    try {
      const res = await fetch('/api/assistant/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: clean.slice(0, 900) }) });
      if (res.status === 200) {
        const url = URL.createObjectURL(await res.blob());
        await playMeasured(url);
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      // fall through to the browser voice
    }
    await browserVoice(clean, lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Sunny's voice: the neural voice made a little brighter and higher, with a soft metallic shimmer (a short modulated
   * delay plus a faint ring modulator). Light enough that every word stays clear, so it sounds like a friendly robot.
   */
  function robotChain(ac: AudioContext, source: AudioNode, out: AudioNode) {
    const dry = ac.createGain();
    dry.gain.value = 0.82;
    source.connect(dry).connect(out);

    // Shimmer: ~7 ms delay, gently swept, fed back on itself (a flanger: the "metal" in the voice).
    const delay = ac.createDelay(0.05);
    delay.delayTime.value = 0.007;
    const feedback = ac.createGain();
    feedback.gain.value = 0.38;
    const wet = ac.createGain();
    wet.gain.value = 0.32;
    const sweep = ac.createOscillator();
    sweep.frequency.value = 0.5;
    const sweepDepth = ac.createGain();
    sweepDepth.gain.value = 0.0018;
    sweep.connect(sweepDepth).connect(delay.delayTime);
    source.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(out);

    // A faint ring modulator (the classic robot buzz), mixed low.
    const ring = ac.createGain();
    ring.gain.value = 0;
    const carrier = ac.createOscillator();
    carrier.frequency.value = 48;
    carrier.connect(ring.gain);
    const ringLevel = ac.createGain();
    ringLevel.gain.value = 0.14;
    source.connect(ring).connect(ringLevel).connect(out);

    sweep.start();
    carrier.start();
    return () => {
      sweep.stop();
      carrier.stop();
    };
  }

  /** Plays the mp3 through the robot voice and feeds its loudness to `level` while it plays. */
  function playMeasured(url: string): Promise<void> {
    return new Promise((resolve) => {
      const el = new Audio(url);
      // Slightly faster without pitch correction = a higher, cuter voice.
      el.preservesPitch = false;
      el.playbackRate = 1.07;
      audio.current = el;
      let raf = 0;
      let stopFx = () => undefined as void;
      try {
        ctx.current ??= new AudioContext();
        const ac = ctx.current;
        const source = ac.createMediaElementSource(el);
        const bright = ac.createBiquadFilter();
        bright.type = 'highshelf';
        bright.frequency.value = 3000;
        bright.gain.value = 4;
        source.connect(bright);
        const analyser = ac.createAnalyser();
        analyser.fftSize = 512;
        stopFx = robotChain(ac, bright, analyser);
        analyser.connect(ac.destination);
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          level.current = Math.min(1, Math.sqrt(sum / data.length) * 4.5);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        void ctx.current.resume();
      } catch {
        level.current = -1;
      }
      const done = () => {
        cancelAnimationFrame(raf);
        try {
          stopFx();
        } catch {
          // already stopped
        }
        level.current = -1;
        setSpeaking(false);
        audio.current = null;
        resolve();
      };
      stopSpeakRef.current = () => {
        el.pause();
        done();
      };
      el.onended = done;
      el.onerror = done;
      el.play().catch(done);
    });
  }

  function browserVoice(text: string, lang: VoiceLang): Promise<void> {
    return new Promise((resolve) => {
      const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
      if (!synth) {
        setSpeaking(false);
        return resolve();
      }
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      // Few systems ship an Uzbek voice; Turkish or Russian read Uzbek Latin/Cyrillic far better than English.
      const prefer = lang === 'uz-UZ' ? ['uz', 'tr', 'ru'] : [lang.slice(0, 2)];
      const voice = prefer.map((p) => voices.find((v) => v.lang.toLowerCase().startsWith(p))).find(Boolean);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? lang;
      // No effects are possible on the system voice: a higher pitch at least keeps it robot-like.
      u.rate = 1.04;
      u.pitch = 1.45;
      level.current = -1;
      const done = () => {
        setSpeaking(false);
        resolve();
      };
      stopSpeakRef.current = () => {
        synth.cancel();
        done();
      };
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    });
  }

  useEffect(
    () => () => {
      rec.current?.abort();
      stopSpeakRef.current();
    },
    [],
  );

  return { canListen, listening, speaking, level, listen, stopListening, speak, stopSpeaking };
}
