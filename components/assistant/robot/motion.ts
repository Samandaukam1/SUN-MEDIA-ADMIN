/**
 * Sunny's motion director: one place that decides how the 3D robot moves, so the ten movements never fight.
 * It is pure maths (no three.js, no DOM): every frame it turns the chat state, the pointer, one-shot cues and the live
 * sound into a target pose; the renderer eases the model toward it (quaternion slerp per joint).
 *
 * Layers, lowest priority first, each blended over the one below:
 *   1. floating (01) — always on, a sum of slow sines so it never repeats visibly;
 *   2. idle cinematics — 360° turn (02), orbital flight (08) or a glance around, one at a time, only when nothing else
 *      happens; any other layer cancels them with a smooth blend-out;
 *   3. interaction — curious look at the pointer (07), attention on a tap;
 *   4. chat state — listening (04), thinking (03), working (an action running in the system), speaking (05), happy (06),
 *      error, offline;
 *   5. cues — welcome (09) on opening, farewell on closing, a small happy nod after a reply, and the outcome of an action
 *      once the system confirmed it: success (a hop with a raised hand) or fail (a head shake, warning-coloured eyes);
 *   + energy (10) — a burst when an answer is ready after thinking.
 */

import type { Expression } from './emotion';

export type MotionMood = 'idle' | 'listening' | 'thinking' | 'working' | 'speaking' | 'happy' | 'error' | 'offline';
export type MotionCue = 'welcome' | 'farewell' | 'replied' | 'tap' | 'success' | 'fail' | 'dance' | 'spin' | 'doze';
/** Cues that report something to the person: they play in every state (the others wait for a free robot). */
const NEWS: MotionCue[] = ['replied', 'success', 'fail'];
export type IdleAct = 'spin' | 'orbit' | 'glance';
export type Vec3 = [number, number, number];

/** Target pose. Angles in radians; `pos` and the flight path in robot heights (the renderer scales them). */
export type Pose = {
  pos: Vec3;
  body: Vec3;
  head: Vec3;
  /** Screen-left and screen-right arm, rotation at the shoulder. */
  armL: Vec3;
  armR: Vec3;
  /** Extra turn about the vertical axis for the 360°: applied as is, never smoothed (it wraps). */
  spin: number;
  scale: number;
  /** Where the eyes look, −1…1. */
  look: [number, number];
  eyeOpen: number;
  smile: number;
  /** Mouth shapes, 0–1 each: talking ellipse (open/wide follow the audio) or the flat thinking line. */
  talk: number;
  mouthOpen: number;
  mouthWide: number;
  flat: number;
  /** Lime light on the eyes and accents, and the particle/energy field. */
  glow: number;
  energy: number;
  /** Warning colour on the eyes (a failed action, an error), 0–1. */
  alarm: number;
  /** Feeling on the face (emotion layer): narrowed, slanted eyes and a lopsided smile, 0–1 each. */
  squint: number;
  smirk: number;
};

const CUE_SECONDS: Record<MotionCue, number> = { welcome: 1.9, farewell: 1.1, replied: 0.9, tap: 0.6, success: 2.2, fail: 1.7, dance: 2.4, spin: 1.3, doze: 4 };
const IDLE_SECONDS: Record<IdleAct, number> = { spin: 2.8, orbit: 4.6, glance: 2.4 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** easeInOutCubic: slow start, slow stop. */
export const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** In over the first 15%, out over the last 25%. */
const envelope = (q: number) => Math.min(ease(clamp01(q / 0.15)), ease(clamp01((1 - q) / 0.25)));

/** Cubic Bézier, one axis. */
const bez = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};
/** The orbital flight: out to the upper left, a wide curve back through the front, home. Robot heights. */
const ORBIT: Vec3[] = [
  [0, 0, 0],
  [-1.05, 0.62, 0.3],
  [-0.55, -0.12, -0.45],
  [0, 0, 0],
];

export function restPose(): Pose {
  return {
    pos: [0, 0, 0],
    body: [0, 0, 0],
    head: [0, 0, 0],
    armL: [0, 0, 0],
    armR: [0, 0, 0],
    spin: 0,
    scale: 1,
    look: [0, 0],
    eyeOpen: 1,
    smile: 1,
    talk: 0,
    mouthOpen: 0,
    mouthWide: 0.5,
    flat: 0,
    glow: 0.25,
    energy: 0,
    alarm: 0,
    squint: 0,
    smirk: 0,
  };
}

export class MotionDirector {
  mood: MotionMood = 'idle';
  private since = 0;
  private idle: { act: IdleAct; start: number; abortAt?: number; at?: number } | null = null;
  private nextIdle: number;
  private cues: { name: MotionCue; start: number }[] = [];
  private pointer = { x: 0, y: 0, near: false, at: -1e9 };
  private burst = -1e9;
  private level = 0;
  private slow = 0;
  private readonly random: () => number;
  private readonly calm: boolean;
  private readonly compact: boolean;
  private readonly float: number;
  private roam = true;
  /** The feeling shown (eased toward `feelTo`, so a change of mood is a transition, not a jump). */
  private feel: Expression | null = null;
  private feelTo: Expression | null = null;
  private lastT: number | null = null;

  /**
   * `calm` (reduced motion): no turns or flights, a gentle float only; the chat states still show. `float` scales the
   * floating (tests set 0 to look at one movement alone).
   */
  constructor({ calm = false, compact = false, float, random = Math.random, now = 0 }: { calm?: boolean; compact?: boolean; float?: number; random?: () => number; now?: number } = {}) {
    this.calm = calm;
    this.compact = compact;
    this.float = float ?? (calm ? 0.35 : 1);
    this.random = random;
    // The first cinematic comes soon, so the robot is seen to be alive, not a picture.
    this.nextIdle = now + 4 + random() * 3;
  }

  /** The idle cinematic running now (null while none, or while one is blending out). */
  get idleAct(): IdleAct | null {
    return this.idle && this.idle.abortAt === undefined ? this.idle.act : null;
  }

  setMood(mood: MotionMood, now: number) {
    if (mood === this.mood) return;
    // An answer is ready: the energy flows out of the thinking pose (10).
    if (this.mood === 'thinking' && (mood === 'speaking' || mood === 'idle' || mood === 'happy')) this.burst = now;
    this.mood = mood;
    this.since = now;
    if (mood === 'idle') this.nextIdle = Math.max(this.nextIdle, now + 6 + this.random() * 5);
    else this.stopIdle(now);
    // Listening and speaking own the robot: gestures that would turn it away are dropped.
    if (mood === 'listening' || mood === 'speaking') this.cues = this.cues.filter((c) => NEWS.includes(c.name));
  }

  cue(name: MotionCue, now: number) {
    if ((this.mood === 'listening' || this.mood === 'speaking') && !NEWS.includes(name)) return;
    this.cues = this.cues.filter((c) => c.name !== name && !(name === 'farewell' && c.name === 'welcome') && !(name === 'welcome' && c.name === 'farewell'));
    this.cues.push({ name, start: now });
    this.stopIdle(now);
    this.nextIdle = Math.max(this.nextIdle, now + 6);
  }

  /** Pointer relative to the robot (−1…1 each way); `near` when it is close enough to be looked at. */
  setPointer(x: number, y: number, near: boolean, now: number) {
    this.pointer = { x, y, near, at: near ? now : this.pointer.at };
    if (near) this.stopIdle(now);
  }

  /** The emotion layer (see emotion.ts): how the robot carries itself while nothing else is asked of it. */
  setEmotion(e: Expression) {
    this.feelTo = e;
    this.feel ??= { ...e, head: [...e.head], body: [...e.body], armL: [...e.armL], armR: [...e.armR], look: [...e.look] };
  }

  private easeFeeling(now: number) {
    const dt = this.lastT === null ? 0 : Math.min(0.1, Math.max(0, now - this.lastT));
    this.lastT = now;
    const k = 1 - Math.exp(-2.5 * dt);
    const f = this.feel;
    const t = this.feelTo;
    if (!f || !t) return;
    for (const key of ['eye', 'squint', 'smile', 'smirk', 'glow', 'energy', 'float', 'speed', 'hover', 'turn', 'neon'] as const) f[key] += (t[key] - f[key]) * k;
    for (const key of ['head', 'body', 'armL', 'armR'] as const) f[key] = [0, 1, 2].map((i) => f[key][i] + (t[key][i] - f[key][i]) * k) as [number, number, number];
    f.look = [f.look[0] + (t.look[0] - f.look[0]) * k, f.look[1] + (t.look[1] - f.look[1]) * k];
  }

  /** Off while the chat panel is open beside it: no flight (an ongoing one comes home), turns and glances stay. */
  setRoam(on: boolean, now: number) {
    this.roam = on;
    if (!on && this.idle?.act === 'orbit') this.stopIdle(now);
  }

  private stopIdle(now: number) {
    if (this.idle && this.idle.abortAt === undefined) {
      this.idle.abortAt = now;
      this.idle.at = clamp01((now - this.idle.start) / IDLE_SECONDS[this.idle.act]);
    }
  }

  private schedule(now: number) {
    if (this.idle) {
      const over = this.idle.abortAt !== undefined ? now - this.idle.abortAt > 0.5 : now - this.idle.start > IDLE_SECONDS[this.idle.act];
      if (over) {
        this.idle = null;
        this.nextIdle = now + 9 + this.random() * 7;
      }
      return;
    }
    const quiet = this.mood === 'idle' && !this.cues.length && now - this.pointer.at > 4;
    if (this.calm || !quiet || now < this.nextIdle) return;
    const r = this.random();
    // Phones: no flight (the robot stays clear of the page), the turn and the glance only.
    const act: IdleAct = this.compact || !this.roam ? (r < 0.55 ? 'spin' : 'glance') : r < 0.4 ? 'spin' : r < 0.75 ? 'orbit' : 'glance';
    this.idle = { act, start: now };
  }

  update(now: number, level = 0, shape = 0.5): Pose {
    this.schedule(now);
    this.cues = this.cues.filter((c) => now - c.start < CUE_SECONDS[c.name]);
    this.level += (level - this.level) * 0.35;
    this.slow += (level - this.slow) * 0.04;
    const p = restPose();
    const t = now;
    const m = this.mood;
    this.easeFeeling(now);
    // No feeling set (tests, or before the first one): no emotion layer.
    const f = this.feel ?? { eye: 1, squint: 0, smile: 1, smirk: 0, glow: 0, energy: 0, head: [0, 0, 0], body: [0, 0, 0], armL: [0, 0, 0], armR: [0, 0, 0], look: [0, 0], float: 1, speed: 1, hover: 0, turn: 1, neon: 1 };

    // 01 — anti-gravity float: rise and fall with a little drift, tilt and turn; the head trails the body. Mood physics:
    // a happy robot floats livelier and a little higher, a sad or sleepy one low and slow.
    const amp = this.float * f.float * (m === 'listening' ? 0.45 : m === 'thinking' || m === 'working' ? 0.6 : m === 'offline' ? 0.35 : 1);
    p.pos[1] += f.hover;
    p.pos[1] += amp * (0.055 * Math.sin(0.95 * t) + 0.02 * Math.sin(2.3 * t + 1.3));
    p.pos[0] += amp * 0.025 * Math.sin(0.41 * t + 0.7);
    p.body = [amp * 0.035 * Math.sin(0.8 * t + 0.4), amp * 0.09 * Math.sin(0.33 * t), amp * 0.045 * Math.sin(0.57 * t + 1.1)];
    p.head = [amp * 0.03 * Math.sin(0.8 * t - 0.5), amp * 0.06 * Math.sin(0.33 * t - 0.7), amp * 0.03 * Math.sin(0.57 * t + 0.4)];
    p.armL[2] += amp * 0.05 * Math.sin(1.1 * t);
    p.armR[2] -= amp * 0.05 * Math.sin(1.1 * t + 0.8);

    // Blink, at uneven intervals.
    const blink = (t % 5.3 < 0.13 ? 1 : 0) || (t % 11.7 > 5.9 && t % 11.7 < 6.02 ? 1 : 0);
    p.eyeOpen = blink ? 0.12 : 1;

    // 02 / 08 / glance — idle cinematics.
    if (this.idle) {
      const { act, start, abortAt, at } = this.idle;
      const raw = clamp01((now - start) / IDLE_SECONDS[act]);
      const out = abortAt !== undefined ? ease(clamp01((now - abortAt) / 0.5)) : 0;
      const pr = abortAt !== undefined ? at! : raw;
      if (act === 'spin') {
        // Finish the turn the short way when interrupted.
        const angle = 2 * Math.PI * ease(pr);
        p.spin = abortAt !== undefined ? lerp(angle, pr > 0.5 ? 2 * Math.PI : 0, out) : angle;
        p.body[2] += 0.07 * Math.sin(Math.PI * pr) * (1 - out);
        p.pos[1] += 0.06 * Math.sin(Math.PI * pr) * (1 - out);
      } else if (act === 'orbit') {
        const s = ease(pr);
        const w = 1 - out;
        const [a, b, c, d] = ORBIT;
        const at3 = (k: number) => bez(a[k], b[k], c[k], d[k], s);
        const dx = (bez(a[0], b[0], c[0], d[0], Math.min(1, s + 0.02)) - at3(0)) / 0.02;
        p.pos[0] += at3(0) * w;
        p.pos[1] += at3(1) * w;
        p.pos[2] += at3(2) * w;
        // Bank into the curve and look where it goes.
        p.body[2] += Math.max(-0.32, Math.min(0.32, -dx * 0.16)) * w;
        p.body[1] += Math.max(-0.45, Math.min(0.45, dx * 0.22)) * w;
        p.head[1] += Math.max(-0.4, Math.min(0.4, dx * 0.15)) * w;
      } else {
        const w = 1 - out;
        p.head[1] += 0.42 * Math.sin(2 * Math.PI * pr) * w;
        p.head[0] += -0.06 * Math.sin(Math.PI * pr) * w;
        p.look[0] += 0.7 * Math.sin(2 * Math.PI * pr) * w;
      }
    }

    // 07 — curious look: head, eyes and a little of the body turn toward the pointer.
    if (this.pointer.near && (m === 'idle' || m === 'happy' || m === 'error')) {
      const { x, y } = this.pointer;
      p.head[1] += x * 0.5;
      p.head[0] += -y * 0.28;
      p.body[1] += x * 0.14;
      p.look = [x * 0.8, y * 0.6];
    }

    // Chat state.
    const phase = now - this.since;
    if (m === 'listening') {
      // 04 — leaning in, head tilted toward the visitor (never turned away), wide eyes, a pulse with their voice.
      p.head = [-0.07 + p.head[0] * 0.3, -0.12, 0.14];
      p.body[0] += 0.1;
      p.pos[2] += 0.12;
      p.eyeOpen = Math.max(p.eyeOpen, 1.12 + this.level * 0.18);
      p.look = [-0.15, 0.08];
      p.glow = 0.35 + this.level * 0.65;
      p.scale = 1 + this.level * 0.01;
    } else if (m === 'thinking') {
      // 03 — head dips, then turns aside; the eyes narrow and scan; a soft energy pulse.
      const down = ease(clamp01(phase / 0.6));
      const side = ease(clamp01((phase - 0.6) / 0.8));
      p.head[0] += 0.2 * down - 0.08 * side;
      p.head[1] += 0.3 * side + 0.06 * Math.sin(1.4 * t) * side;
      p.head[2] += 0.1 * side;
      p.eyeOpen = Math.min(p.eyeOpen, 0.72);
      p.look = [0.45 * side + 0.25 * Math.sin(2.2 * t), 0.25];
      p.smile = 0;
      p.flat = 1;
      p.energy = 0.3 + 0.12 * Math.sin(3 * t);
      p.glow = 0.3 + 0.2 * Math.sin(3 * t);
    } else if (m === 'working') {
      // Doing it in the system: turned a little to an unseen console, head down to it, hands typing, eyes scanning
      // fast, the energy ring spinning — clearly not just thinking.
      const k = ease(clamp01(phase / 0.4));
      p.body[1] += -0.2 * k;
      p.body[0] += 0.07 * k;
      p.head[0] += 0.14 * k;
      p.head[1] += -0.12 * k;
      p.armL[0] += (0.12 * Math.sin(9 * t)) * k;
      p.armR[0] += (0.12 * Math.sin(9 * t + Math.PI)) * k;
      p.armL[2] += -0.16 * k;
      p.armR[2] += 0.16 * k;
      p.eyeOpen = Math.min(p.eyeOpen, 0.85);
      p.look = [-0.45 + 0.3 * Math.sin(5 * t), 0.35];
      p.smile = 0;
      p.flat = 1;
      p.energy = (0.55 + 0.25 * Math.sin(6 * t)) * k;
      p.glow = 0.45 + 0.25 * Math.sin(6 * t);
    } else if (m === 'speaking') {
      // 05 — the head nods on loud syllables, sways gently; one arm gestures with the flow of the speech.
      p.head[0] += -0.03 + this.level * 0.09;
      p.head[1] += 0.07 * Math.sin(1.3 * t);
      p.head[2] += 0.04 * Math.sin(0.9 * t + 1);
      p.body[1] += 0.05 * Math.sin(0.7 * t);
      p.scale = 1 + this.level * 0.012;
      p.armL[0] += -0.25 * Math.min(1, this.slow * 2.2) * (0.5 + 0.5 * Math.sin(1.1 * t));
      p.armL[2] += -0.1 * Math.min(1, this.slow * 2.2);
      p.smile = 0;
      p.talk = 1;
      p.mouthOpen = level;
      p.mouthWide = shape;
      p.eyeOpen = Math.min(p.eyeOpen, 1 - this.level * 0.2);
      p.glow = 0.2 + this.level * 0.8;
      p.look = [0.05 * Math.sin(0.8 * t), 0];
    } else if (m === 'happy') {
      // 06 — a short hop with a little twist, smiling eyes, a brief glow; then back to floating.
      const hop = phase < 0.8 ? Math.sin((Math.PI * phase) / 0.8) : 0;
      p.pos[1] += 0.16 * hop;
      p.body[1] += 0.25 * Math.sin(phase * 7) * Math.exp(-phase * 2.2);
      p.body[2] += 0.06 * Math.sin(phase * 9) * Math.exp(-phase * 2.5);
      p.smile = 1.3;
      p.eyeOpen = Math.min(p.eyeOpen, 0.9);
      p.glow = Math.max(p.glow, 0.7 * Math.exp(-phase));
      p.energy = Math.max(p.energy, 0.45 * Math.exp(-phase * 1.5));
    } else if (m === 'error') {
      p.head[0] += 0.12;
      p.eyeOpen = Math.min(p.eyeOpen, 0.8);
      p.smile = 0;
      p.flat = 1;
      p.glow = 0.1;
      p.alarm = 0.6;
    } else if (m === 'offline') {
      p.head[0] += 0.18;
      p.eyeOpen = Math.min(p.eyeOpen, 0.55);
      p.smile = 0;
      p.flat = 1;
      p.glow = 0;
    }

    // The feeling, while the chat asks nothing else of the robot (listening, thinking, speaking keep their own face).
    if (m === 'idle' || m === 'happy') {
      for (let i = 0; i < 3; i++) {
        p.head[i] += f.head[i];
        p.body[i] += f.body[i];
        p.armL[i] += f.armL[i];
        p.armR[i] += f.armR[i];
      }
      p.eyeOpen *= f.eye;
      p.smile *= f.smile;
      p.glow = Math.max(0, p.glow + f.glow);
      p.energy = Math.max(p.energy, f.energy);
      p.look = [p.look[0] + f.look[0], p.look[1] + f.look[1]];
      p.squint = f.squint;
      p.smirk = f.smirk;
    }

    // 09 and the other cues, each faded in and out.
    for (const c of this.cues) {
      const q = clamp01((now - c.start) / CUE_SECONDS[c.name]);
      const w = envelope(q);
      if (c.name === 'welcome') {
        // Turn to the visitor and wave the raised (pointing) hand twice, smile. Arms are offsets from the picture's pose.
        p.body[1] = lerp(p.body[1], -0.22, w);
        p.head[1] = lerp(p.head[1], -0.1, w);
        p.head[2] += 0.08 * w;
        p.armL[2] += -0.4 * w + 0.3 * Math.sin(q * Math.PI * 7) * w;
        p.armL[0] += -0.15 * w;
        p.pos[1] += 0.05 * w;
        p.smile = Math.max(p.smile, 1 + 0.3 * w);
        p.eyeOpen = Math.max(p.eyeOpen, 1 + 0.1 * w);
        p.glow = Math.max(p.glow, 0.55 * w);
      } else if (c.name === 'farewell') {
        p.head[0] += 0.16 * Math.sin(Math.PI * q);
        p.armL[2] += -0.3 * w + 0.25 * Math.sin(q * Math.PI * 4) * w;
        p.smile = Math.max(p.smile, 1.15);
      } else if (c.name === 'replied') {
        p.pos[1] += 0.05 * Math.sin(Math.PI * q);
        p.head[0] += -0.07 * Math.sin(Math.PI * q);
        p.smile = Math.max(p.smile, 1 + 0.2 * w);
        p.glow = Math.max(p.glow, 0.4 * w);
      } else if (c.name === 'success') {
        // Done, and the system confirmed it: a hop with a twist, the pointing hand raised, smiling eyes, a flare.
        p.pos[1] += 0.2 * Math.sin(Math.PI * clamp01(q / 0.55));
        p.body[1] += 0.32 * Math.sin(2 * Math.PI * clamp01(q / 0.7)) * w;
        p.armL[2] += -0.65 * w;
        p.armR[2] += 0.3 * w;
        p.head[0] += -0.08 * w;
        p.smile = Math.max(p.smile, 1 + 0.4 * w);
        p.flat *= 1 - w;
        p.talk *= 1 - w * 0.5;
        p.eyeOpen = Math.min(p.eyeOpen, 1 - 0.15 * w);
        p.glow = Math.max(p.glow, 0.95 * w);
        p.energy = Math.max(p.energy, (1 - q) * w);
      } else if (c.name === 'dance') {
        // Asked to dance (a local command): sways side to side, arms up in turn, little hops, smiling.
        const beat = Math.sin(q * Math.PI * 8);
        p.body[1] += 0.32 * beat * w;
        p.body[2] += 0.08 * beat * w;
        p.head[2] -= 0.1 * beat * w;
        p.armL[2] += (-0.55 + 0.35 * beat) * w;
        p.armR[2] += (0.55 + 0.35 * beat) * w;
        p.pos[1] += 0.06 * Math.abs(beat) * w;
        p.smile = Math.max(p.smile, 1 + 0.35 * w);
        p.glow = Math.max(p.glow, 0.7 * w);
        p.energy = Math.max(p.energy, 0.5 * w);
      } else if (c.name === 'spin') {
        // A salto on request: a full turn in the air with a hop (ends where it began, so the turn never jumps).
        p.spin = 2 * Math.PI * ease(q);
        p.pos[1] += 0.14 * Math.sin(Math.PI * q);
        p.armL[2] += -0.35 * Math.sin(Math.PI * q);
        p.armR[2] += 0.35 * Math.sin(Math.PI * q);
      } else if (c.name === 'doze') {
        // "Uxlab qol": eyes shut, head down, a slow sink; wakes by itself after a few seconds.
        p.eyeOpen = Math.min(p.eyeOpen, 1 - 0.92 * w);
        p.head[0] += 0.24 * w;
        p.head[2] += 0.1 * w;
        p.pos[1] -= 0.04 * w;
        p.smile = Math.max(p.smile * (1 - w), 0.9 * w);
        p.glow = Math.min(p.glow, 0.25 - 0.15 * w);
      } else if (c.name === 'fail') {
        // The system refused or failed: a slow head shake, eyes down and warning-coloured, the light dims.
        p.head[1] += 0.3 * Math.sin(q * Math.PI * 6) * (1 - q) * w;
        p.head[0] += 0.13 * w;
        p.eyeOpen = Math.min(p.eyeOpen, 1 - 0.25 * w);
        p.smile *= 1 - w;
        p.flat = Math.max(p.flat, w);
        p.glow = Math.min(p.glow, 0.1 + 0.9 * (1 - w));
        p.energy *= 1 - w;
        p.alarm = Math.max(p.alarm, w);
      } else {
        p.head[2] += 0.13 * Math.sin(Math.PI * q);
        p.eyeOpen = Math.max(p.eyeOpen, 1 + 0.2 * w);
      }
    }

    // 10 — energy transformation after thinking: particles flare, the accents light up, then settle.
    const b = now - this.burst;
    if (b >= 0 && b < 1.3) {
      const k = 1 - b / 1.3;
      p.energy = Math.max(p.energy, k);
      p.glow = Math.max(p.glow, 0.85 * k);
      p.scale *= 1 + 0.03 * Math.sin(Math.PI * Math.min(1, b / 0.5)) * k;
    }
    return p;
  }
}
