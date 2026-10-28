/**
 * "Sunny!" — the wake word, heard in the foreground only (the page open and visible, the person switched it on). The
 * browser's own speech recognition listens continuously; no AI request is made for it (the browser vendor's speech
 * service hears the audio, as with the mic button). Two jobs:
 *   - wake: "Sunny" (however it was heard) calls the robot; words said after it in the same breath are the command;
 *   - barge-in while Sunny speaks: "to‘xta…", "Sunny…" stop it — but its own voice coming back through the speakers is
 *     recognised as an echo and ignored.
 * The recognizer is injected, so the logic is tested without a browser.
 */

export type WakeRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
export type WakeState = 'off' | 'waiting' | 'paused' | 'denied';

/** Lower case, Uzbek apostrophes unified, punctuation removed. */
export const heard = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’'`ʻʼ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The name as recognisers write it (Uzbek, Russian or English ears). */
const NAME = /(^|\s)(sunny|sunni|sanni|sani|sonny|sonni|sanniy|санни|сани|сонни|сунни)(?=\s|$)/u;
const STOP = /(^|\s)(toxta|toxtat|toxtagin|bas|jim|stop|kutib tur)(?=\s|$)/u;

/** Is the name in `text`, and what was said after it? */
export function wakeIn(text: string): { found: boolean; rest: string } {
  const t = heard(text);
  const m = NAME.exec(t);
  if (!m) return { found: false, rest: '' };
  return { found: true, rest: t.slice(m.index + m[0].length).trim() };
}

/** Mostly Sunny's own words (its voice through the speakers), not the person's. */
export function isEcho(text: string, spoken: string): boolean {
  const words = heard(text).split(' ').filter((w) => w.length > 1);
  if (!words.length || !spoken) return false;
  const own = new Set(heard(spoken).split(' '));
  return words.filter((w) => own.has(w)).length / words.length >= 0.6;
}

/** While Sunny speaks: does this final phrase stop it? `rest` is the new request said with it, if any. */
export function bargeIn(text: string, spoken: string): { rest: string } | null {
  if (isEcho(text, spoken)) return null;
  const t = heard(text);
  const m = NAME.exec(t) ?? STOP.exec(t);
  if (!m) return null;
  const rest = t
    .slice(m.index + m[0].length)
    .replace(STOP, ' ')
    .trim()
    .replace(/^(avval|endi|keyin)\s+/, '');
  return { rest };
}

/** Words that only call Sunny ("Sunny, hey!"): no command in them. */
const FILLER = new Set(['hey', 'ey', 'hoy', 'ha', 'qani', 'salom', 'eshityapsanmi', 'eshityapsizmi', 'sunny', 'sunni', 'sanni']);
/** What was said after the name, if it is a command: one real word is enough ("Sunny, keldim"). */
export function commandAfter(rest: string): string {
  const w = rest.split(' ').filter(Boolean);
  if (!w.length) return '';
  if (w.length === 1 && (FILLER.has(w[0]) || w[0].length < 4)) return '';
  return rest;
}
/** Recognition "errors" that only mean silence or a restart: listen again at once, no back-off. */
const QUIET_ERRORS = new Set(['no-speech', 'aborted']);
/** How long the recognizer may keep hearing more words after the name before Sunny answers "Eshitaman!". */
const SETTLE_MS = 1300;
const MAX_CALL_MS = 9000;

export type WakeHandlers = {
  /** The name was heard: first as soon as it is (`final` false, for the summon), then with the command (or ''). */
  onWake: (rest: string, final: boolean) => void;
  onBargeIn: (rest: string) => void;
  onState?: (s: WakeState) => void;
};

/**
 * Continuous listening for the name, restarted whenever the browser ends it (it does, after silence or a network
 * hiccup), with a growing pause after errors. `pause()` while the chat itself listens (one recognizer at a time).
 */
export class WakeListener {
  private rec: WakeRecognition | null = null;
  private on = false;
  private paused = false;
  private spoken = '';
  private delay = 300;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private calling = false;
  private callStarted = 0;
  /** Sunny's last words stay an echo for a moment after it stops (the speakers' tail reaches the mic late). */
  private echo = '';
  private echoUntil = 0;
  state: WakeState = 'off';
  private readonly make: () => WakeRecognition;
  private readonly lang: string;
  private readonly handlers: WakeHandlers;

  constructor(make: () => WakeRecognition, lang: string, handlers: WakeHandlers) {
    this.make = make;
    this.lang = lang;
    this.handlers = handlers;
  }

  enable() {
    this.on = true;
    this.paused = false;
    this.start();
  }
  disable() {
    this.on = false;
    this.stop();
    this.set('off');
  }
  /** The chat listens for the question: one recognizer at a time. */
  pause() {
    if (!this.on || this.paused) return;
    this.paused = true;
    this.stop();
    this.set('paused');
  }
  resume() {
    if (!this.on || !this.paused) return;
    this.paused = false;
    this.start();
  }
  /** What Sunny is saying now ('' when silent): heard through the speakers it is an echo, not a command. */
  speaking(text: string) {
    if (!text && this.spoken) {
      this.echo = this.spoken;
      this.echoUntil = Date.now() + 1500;
    }
    this.spoken = text;
  }

  private set(s: WakeState) {
    if (s === this.state) return;
    this.state = s;
    this.handlers.onState?.(s);
  }

  private stop() {
    if (this.timer) clearTimeout(this.timer);
    if (this.pending) clearTimeout(this.pending);
    this.timer = this.pending = null;
    this.calling = false;
    const rec = this.rec;
    this.rec = null;
    if (rec) {
      rec.onend = rec.onresult = rec.onerror = null;
      try {
        rec.abort();
      } catch {
        // already stopped
      }
    }
  }

  private start() {
    if (!this.on || this.paused || this.rec) return;
    let rec: WakeRecognition;
    try {
      rec = this.make();
    } catch {
      return this.retry();
    }
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? '';
        if (this.spoken) {
          // Sunny is speaking: only a clear final phrase may stop it.
          if (!r.isFinal) continue;
          const b = bargeIn(text, this.spoken);
          if (b) this.handlers.onBargeIn(b.rest);
          continue;
        }
        const w = wakeIn(text);
        if (!w.found) continue;
        if (this.echo && Date.now() < this.echoUntil && isEcho(text, this.echo)) continue;
        if (!this.calling) {
          // Called: the robot reacts at once; the command (if any) follows in the final result.
          this.calling = true;
          this.callStarted = Date.now();
          this.handlers.onWake('', false);
        }
        if (r.isFinal) {
          this.called(commandAfter(w.rest));
          continue;
        }
        // Still talking ("Sunny, ertaga SAFI…"): wait for the whole command rather than interrupting with "Eshitaman!".
        if (this.pending) clearTimeout(this.pending);
        const left = Math.max(0, MAX_CALL_MS - (Date.now() - this.callStarted));
        const restNow = commandAfter(w.rest);
        this.pending = setTimeout(() => this.called(restNow), Math.min(SETTLE_MS, left));
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        this.on = false;
        this.stop();
        this.set('denied');
      } else if (!QUIET_ERRORS.has(e.error)) this.delay = Math.min(5000, this.delay * 2);
    };
    rec.onend = () => {
      this.rec = null;
      this.retry();
    };
    try {
      rec.start();
      this.rec = rec;
      this.set('waiting');
    } catch {
      this.retry();
    }
  }

  private called(rest: string) {
    if (!this.calling) return;
    this.calling = false;
    if (this.pending) clearTimeout(this.pending);
    this.pending = null;
    this.handlers.onWake(rest, true);
  }

  private retry() {
    if (!this.on || this.paused || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.start();
    }, this.delay);
    // Calm again after a while without errors.
    this.delay = Math.max(300, this.delay * 0.8);
  }
}

/** Foreground wake word where the browser can listen to Uzbek continuously (Chrome, Edge, Android). Not on Safari or
 * iPhone: their recognition is Siri dictation, which has no Uzbek and stops in the background. */
export function wakeRecognizer(): (() => WakeRecognition) | null {
  if (typeof window === 'undefined') return null;
  const ua = navigator.userAgent;
  const apple = /iP(hone|ad|od)/.test(ua) || (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android|Firefox|FxiOS/.test(ua));
  const w = window as unknown as { SpeechRecognition?: new () => WakeRecognition; webkitSpeechRecognition?: new () => WakeRecognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return !Ctor || apple ? null : () => new Ctor();
}
