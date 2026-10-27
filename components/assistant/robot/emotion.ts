/**
 * Sunny's emotional state (an expressive simulation, not real feelings): one feeling at a time with an intensity that
 * fades back to the friendly baseline, and transitions that make sense — an upset robot calms down before it is happy
 * again, unless it is reconciled. Pure maths (no three.js, no DOM). The renderers turn the result into an `Expression`:
 * eyes, head, arms, how high and fast it flies, how bright its neon is.
 */

export type Emotion =
  | 'friendly'
  | 'calm'
  | 'happy'
  | 'excited'
  | 'celebrating'
  | 'proud'
  | 'confident'
  | 'curious'
  | 'thoughtful'
  | 'playful'
  | 'mischievous'
  | 'surprised'
  | 'embarrassed'
  | 'sad'
  | 'annoyed'
  | 'angry'
  | 'offended'
  | 'sulking'
  | 'sleepy'
  | 'serious';

type V3 = [number, number, number];
/** Offsets and factors on top of whatever the robot is doing (identity = no change). */
export type Expression = {
  /** × eye openness */
  eye: number;
  /** 0–1: narrowed, slanted eyes */
  squint: number;
  /** × smile height */
  smile: number;
  /** 0–1: lopsided smile */
  smirk: number;
  /** + face light, + energy motes */
  glow: number;
  energy: number;
  head: V3;
  body: V3;
  armL: V3;
  armR: V3;
  /** Gaze bias, −1…1 */
  look: [number, number];
  /** Mood physics: × floating amplitude, × flight speed, hover height (robot heights, + up), × turn stiffness. */
  float: number;
  speed: number;
  hover: number;
  turn: number;
  /** × thruster / neon intensity */
  neon: number;
};

export const IDENTITY: Expression = {
  eye: 1,
  squint: 0,
  smile: 1,
  smirk: 0,
  glow: 0,
  energy: 0,
  head: [0, 0, 0],
  body: [0, 0, 0],
  armL: [0, 0, 0],
  armR: [0, 0, 0],
  look: [0, 0],
  float: 1,
  speed: 1,
  hover: 0,
  turn: 1,
  neon: 1,
};

const FOLDED: Pick<Expression, 'armL' | 'armR'> = { armL: [0.1, 0, 0.55], armR: [0.1, 0, -0.55] };
const E = (e: Partial<Expression>): Expression => ({ ...IDENTITY, ...e });

/** How each feeling shows, at full intensity. */
export const EXPRESS: Record<Emotion, Expression> = {
  friendly: IDENTITY,
  calm: E({ eye: 0.95, glow: -0.05, float: 0.7, speed: 0.8, neon: 0.8 }),
  happy: E({ eye: 0.9, smile: 1.25, glow: 0.25, head: [-0.05, 0, 0.04], float: 1.25, speed: 1.15, hover: 0.03, neon: 1.3 }),
  excited: E({ eye: 1.1, smile: 1.35, glow: 0.45, energy: 0.35, head: [-0.08, 0, 0], float: 1.5, speed: 1.3, hover: 0.05, turn: 1.2, neon: 1.6 }),
  celebrating: E({ eye: 0.9, smile: 1.4, glow: 0.5, energy: 0.6, armL: [0, 0, -0.5], armR: [0, 0, 0.5], float: 1.4, speed: 1.25, hover: 0.06, neon: 1.7 }),
  proud: E({ smile: 1.15, smirk: 0.3, head: [-0.12, 0, 0], body: [-0.06, 0, 0], glow: 0.1, float: 0.9, turn: 1.2, neon: 1.1 }),
  confident: E({ smirk: 0.25, head: [-0.06, 0, 0], float: 0.8, speed: 1.05, turn: 1.3 }),
  curious: E({ eye: 1.15, head: [0, 0, 0.14], look: [0.2, 0.1], glow: 0.05 }),
  thoughtful: E({ eye: 0.8, smile: 0.6, head: [0.1, 0.2, 0.08], look: [0.4, 0.3], float: 0.7, speed: 0.7 }),
  playful: E({ smile: 1.2, smirk: 0.4, head: [0, 0, 0.08], glow: 0.1, float: 1.3, speed: 1.15 }),
  mischievous: E({ squint: 0.45, smirk: 0.8, glow: 0.1, speed: 1.1 }),
  surprised: E({ eye: 1.35, smile: 0.7, head: [-0.1, 0, 0], body: [-0.12, 0, 0], glow: 0.3, hover: 0.04 }),
  embarrassed: E({ eye: 0.75, smile: 0.8, head: [0.14, -0.25, 0.06], look: [-0.5, -0.4], glow: -0.1, float: 0.8 }),
  sad: E({ eye: 0.7, smile: 0.3, head: [0.22, 0, 0], look: [0, -0.5], glow: -0.15, float: 0.6, speed: 0.6, hover: -0.06, neon: 0.5 }),
  annoyed: E({ squint: 0.7, smile: 0.4, head: [0.04, 0.15, 0], ...FOLDED, turn: 1.4, speed: 1.1 }),
  angry: E({ squint: 1, smile: 0.15, glow: 0.3, head: [0.06, 0, 0], armL: [0.15, 0, 0.25], armR: [0.15, 0, -0.25], turn: 1.6, speed: 1.25, neon: 1.3 }),
  offended: E({ squint: 0.4, smile: 0.25, head: [0.1, -0.45, 0.05], look: [-0.6, -0.1], float: 0.7, speed: 0.8, neon: 0.7 }),
  sulking: E({ eye: 0.8, squint: 0.3, smile: 0.2, head: [0.16, -0.35, 0], ...FOLDED, look: [-0.5, -0.3], float: 0.6, speed: 0.6, hover: -0.04, neon: 0.6 }),
  sleepy: E({ eye: 0.35, smile: 0.9, head: [0.18, 0, 0.1], glow: -0.15, float: 0.45, speed: 0.5, hover: -0.05, neon: 0.4 }),
  serious: E({ squint: 0.3, smile: 0.55, float: 0.6, turn: 1.2, neon: 0.9 }),
};

/** Seconds for a feeling to fade to half. */
const HALF_LIFE: Record<Emotion, number> = {
  friendly: 1e9,
  calm: 20,
  happy: 12,
  excited: 6,
  celebrating: 4,
  proud: 10,
  confident: 20,
  curious: 6,
  thoughtful: 8,
  playful: 15,
  mischievous: 20,
  surprised: 1.5,
  embarrassed: 6,
  sad: 25,
  annoyed: 15,
  angry: 8,
  offended: 30,
  sulking: 60,
  sleepy: 1e9,
  serious: 20,
};
const NEGATIVE = new Set<Emotion>(['angry', 'annoyed', 'offended', 'sulking', 'sad', 'embarrassed']);
const POSITIVE = new Set<Emotion>(['happy', 'excited', 'celebrating', 'playful', 'proud']);

/** Things that happen to Sunny (from the chat, the person's gestures, its own games). */
export type FeelEvent =
  | 'success'
  | 'fail'
  | 'praise'
  | 'insult'
  | 'reconcile'
  | 'pat'
  | 'tap'
  | 'hits'
  | 'push'
  | 'five'
  | 'nofive'
  | 'grab'
  | 'thrown'
  | 'idle'
  | 'wake'
  | 'dance'
  | 'salto'
  | 'angry'
  | 'sleep'
  | 'happy'
  | 'chase'
  | 'wave'
  | 'qitmir';

export type Feeling = { name: Emotion; k: number };

export class EmotionEngine {
  private cur: Emotion = 'friendly';
  private k = 0;
  private last: number;

  constructor(now = 0) {
    this.last = now;
  }

  get feeling(): Feeling {
    return { name: this.cur, k: this.k };
  }

  /**
   * Feel `e` at `k`. An upset robot does not jump straight to joy: it calms down first, unless `force` (reconciled,
   * or real work just succeeded).
   */
  feel(e: Emotion, k: number, now: number, force = false, exact = false) {
    this.tick(now);
    if (!force && NEGATIVE.has(this.cur) && this.k > 0.3 && POSITIVE.has(e)) {
      e = 'calm';
      k = Math.min(k, 0.6);
    }
    const same = e === this.cur;
    // A weaker feeling does not replace a stronger one of a different kind (it would flicker).
    if (!same && k < this.k * 0.6 && !force) return;
    // The same feeling again keeps the stronger intensity, unless set exactly (soothing lowers it).
    this.k = Math.max(0, Math.min(1, same && !exact ? Math.max(k, this.k) : k));
    this.cur = e;
  }

  event(kind: FeelEvent, now: number) {
    this.tick(now);
    const was = this.cur;
    const k = this.k;
    switch (kind) {
      case 'success':
        return this.feel('celebrating', 0.9, now, true);
      case 'fail':
        return this.feel('embarrassed', 0.6, now);
      case 'praise':
        return this.feel('proud', 0.85, now);
      case 'insult':
        return this.feel('offended', 0.9, now, true);
      case 'reconcile':
        return this.feel('happy', 0.9, now, true);
      case 'pat':
        // Soothing: an upset robot softens step by step; a content one gets happier.
        if (NEGATIVE.has(was) && k > 0.3) return this.feel(k * 0.5 < 0.3 ? 'calm' : was, k * 0.5 < 0.3 ? 0.5 : k * 0.5, now, true, true);
        return this.feel('happy', Math.min(1, (was === 'happy' ? k : 0) + 0.5), now, true);
      case 'tap':
        return this.feel('curious', 0.5, now);
      case 'hits':
        if ((was === 'annoyed' || was === 'offended') && k > 0.5) return this.feel('offended', 0.9, now, true);
        return this.feel('annoyed', 0.85, now, true);
      case 'push':
        return this.feel('surprised', 0.9, now, true);
      case 'five':
        return this.feel('celebrating', 0.8, now);
      case 'nofive':
        return this.feel('embarrassed', 0.5, now);
      case 'grab':
        return this.feel('mischievous', 0.7, now);
      case 'thrown':
        return this.feel('angry', 0.6, now, true);
      case 'idle':
      case 'sleep':
        return this.feel('sleepy', 1, now, true);
      case 'wake':
        if (was === 'sleepy') return this.feel('surprised', 0.7, now, true);
        return;
      case 'dance':
        return this.feel('excited', 0.9, now);
      case 'salto':
        return this.feel('playful', 0.8, now);
      case 'angry':
        return this.feel('angry', 0.8, now, true);
      case 'happy':
        return this.feel('happy', 0.9, now);
      case 'chase':
      case 'qitmir':
        return this.feel('playful', 0.6, now);
      case 'wave':
        return this.feel('happy', 0.5, now);
    }
  }

  /** Fades the feeling (half-life per feeling); a faded one hands back to the friendly baseline. */
  tick(now: number) {
    const dt = Math.max(0, now - this.last);
    this.last = now;
    if (this.cur === 'friendly') return;
    this.k *= Math.pow(0.5, dt / HALF_LIFE[this.cur]);
    // Offended fades into sulking (still remembered, quieter) before it is gone.
    if (this.cur === 'offended' && this.k < 0.45) {
      this.cur = 'sulking';
      this.k = Math.min(0.6, this.k);
    }
    if (this.k < 0.12) {
      this.cur = 'friendly';
      this.k = 0;
    }
  }
}

/** The expression for a feeling at its intensity (identity at 0). */
export function expressionOf({ name, k }: Feeling): Expression {
  const e = EXPRESS[name];
  const mix = (a: number, b: number) => a + (b - a) * k;
  const mix3 = (a: V3, b: V3): V3 => [mix(a[0], b[0]), mix(a[1], b[1]), mix(a[2], b[2])];
  return {
    eye: mix(1, e.eye),
    squint: e.squint * k,
    smile: mix(1, e.smile),
    smirk: e.smirk * k,
    glow: e.glow * k,
    energy: e.energy * k,
    head: mix3([0, 0, 0], e.head),
    body: mix3([0, 0, 0], e.body),
    armL: mix3([0, 0, 0], e.armL),
    armR: mix3([0, 0, 0], e.armR),
    look: [e.look[0] * k, e.look[1] * k],
    float: mix(1, e.float),
    speed: mix(1, e.speed),
    hover: e.hover * k,
    turn: mix(1, e.turn),
    neon: mix(1, e.neon),
  };
}
