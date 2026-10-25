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
 *   4. chat state — listening (04), thinking (03), speaking (05), happy (06), error, offline;
 *   5. cues — welcome (09) on opening, farewell on closing, a small happy nod after a reply;
 *   + energy (10) — a burst when an answer is ready after thinking.
 */

export type MotionMood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'error' | 'offline';
export type MotionCue = 'welcome' | 'farewell' | 'replied' | 'tap';
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
};

const CUE_SECONDS: Record<MotionCue, number> = { welcome: 1.9, farewell: 1.1, replied: 0.9, tap: 0.6 };
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
  private roam = true;

  constructor({ calm = false, compact = false, random = Math.random, now = 0 }: { calm?: boolean; compact?: boolean; random?: () => number; now?: number } = {}) {
    this.calm = calm;
    this.compact = compact;
    this.random = random;
    // The first cinematic comes after the visitor has had a moment with the page.
    this.nextIdle = now + 9 + random() * 6;
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
    if (mood === 'idle') this.nextIdle = Math.max(this.nextIdle, now + 10 + this.random() * 8);
    else this.stopIdle(now);
    // Listening and speaking own the robot: gestures that would turn it away are dropped.
    if (mood === 'listening' || mood === 'speaking') this.cues = this.cues.filter((c) => c.name === 'replied');
  }

  cue(name: MotionCue, now: number) {
    if ((this.mood === 'listening' || this.mood === 'speaking') && name !== 'replied') return;
    this.cues = this.cues.filter((c) => c.name !== name && !(name === 'farewell' && c.name === 'welcome') && !(name === 'welcome' && c.name === 'farewell'));
    this.cues.push({ name, start: now });
    this.stopIdle(now);
    this.nextIdle = Math.max(this.nextIdle, now + 8);
  }

  /** Pointer relative to the robot (−1…1 each way); `near` when it is close enough to be looked at. */
  setPointer(x: number, y: number, near: boolean, now: number) {
    this.pointer = { x, y, near, at: near ? now : this.pointer.at };
    if (near) this.stopIdle(now);
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
        this.nextIdle = now + 14 + this.random() * 14;
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

    // 01 — anti-gravity float: rise and fall with a little drift, tilt and turn; the head trails the body.
    const amp = this.calm ? 0 : m === 'listening' ? 0.45 : m === 'thinking' ? 0.65 : m === 'offline' ? 0.35 : 1;
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
    } else if (m === 'offline') {
      p.head[0] += 0.18;
      p.eyeOpen = Math.min(p.eyeOpen, 0.55);
      p.smile = 0;
      p.flat = 1;
      p.glow = 0;
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
