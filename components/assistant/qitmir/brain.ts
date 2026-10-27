import type { Expression, FeelEvent } from '../robot/emotion';
import type { MotionMood } from '../robot/motion';

/**
 * Qitmir mode's brain: the one place that decides what the mischievous robot does, so its tricks never fight. Pure
 * maths (no three.js, no DOM), like the motion director: every frame it turns the pointer, the page's targets and the
 * chat state into a state, a physical body (position, velocity, orientation, angular velocity) and a pose.
 *
 * Screen space: CSS px of the viewport, y down. Distances and speeds are tuned in robot sizes (`box`), so a phone's
 * smaller robot moves the same way. Orientation is a quaternion in three.js axes (x right, y up, z toward the viewer).
 *
 * Priorities, highest first:
 *   1. dock — the mode is off or paused, the chat is open or busy, a dialog or a form has the person's attention: the
 *      robot flies home to its launcher (and lets go of whatever it holds) and stays there;
 *   2. physics in progress — thrown, tumbling, dizzy, recovering: nothing else until it is upright again;
 *   3. the cursor — watch, chase, approach, grab, hang on it;
 *   4. its own games — the logo, letters, hide and seek, a salto, watching the page, sleep — each with a cooldown.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Rect = { x: number; y: number; w: number; h: number };

export type QState =
  | 'NORMAL_IDLE'
  | 'QITMIR_IDLE'
  | 'WATCHING_CURSOR'
  | 'CHASING_CURSOR'
  | 'CURSOR_APPROACH'
  | 'CURSOR_GRAB'
  | 'CURSOR_ATTACHED'
  | 'THROWN_AWAY'
  | 'TUMBLING'
  | 'DIZZY'
  | 'ANGRY'
  | 'RECOVERING'
  | 'LOGO_LANDING'
  | 'TEXT_INTERACTION'
  | 'HIDE_AND_SEEK'
  | 'ACROBATIC_FLIGHT'
  | 'WATCHING_PAGE'
  | 'SLEEPING'
  | 'SURPRISED'
  | 'VICTORY'
  | 'NOTICED'
  | 'PATTED'
  | 'BUMPED'
  | 'ANNOYED'
  | 'HIGH_FIVE'
  | 'TALKING'
  | 'RETURNING'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'EXECUTING_ACTION'
  | 'SUCCESS'
  | 'ERROR';
/** Home, in its launcher: the normal robot is drawn there instead (the label then says what the chat is doing). */
type Mode = Exclude<QState, 'NORMAL_IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'EXECUTING_ACTION' | 'SUCCESS' | 'ERROR'> | 'DOCKED';

export type SayKey = 'grab' | 'miss' | 'thrown' | 'angry' | 'logo' | 'hide' | 'found' | 'wake' | 'text' | 'tap' | 'bored' | 'hit' | 'five' | 'nofive' | 'pat' | 'push';
export type QEvent = { type: 'out' } | { type: 'docked' } | { type: 'say'; key: SayKey } | { type: 'poke'; id: number } | { type: 'feel'; kind: FeelEvent };
/** 'qitmir' chases and grabs the cursor; 'calm' (normal mode) only takes short trips round the page while the person is
 * idle and always comes home. */
export type Persona = 'qitmir' | 'calm';

/** The page as the robot sees it, viewport rectangles (see dom.ts). */
export type QTargets = {
  logo: Rect | null;
  /** Decorative heading words, each with a few of its letters to land on. */
  texts: { id: number; rect: Rect; letters: Rect[] }[];
  /** Cards it may hide behind (their top edge). */
  hides: { id: number; rect: Rect }[];
  /** Things worth looking at. */
  sights: Rect[];
  /** Controls it must not sit on. */
  colliders: Rect[];
};

export type QPose = {
  visible: boolean;
  /** Anti-gravity thruster under it, 0–1: soft while hovering, strong when accelerating, off when resting. */
  thrust: number;
  alpha: number;
  /** The robot's origin (the middle of its height), viewport px. */
  x: number;
  y: number;
  /** × the playing size. */
  scale: number;
  orient: Quat;
  body: Vec3;
  head: Vec3;
  armL: Vec3;
  armR: Vec3;
  look: Vec2;
  eyeOpen: number;
  /** 0–1: narrowed, slanted eyes (cunning at 0.35, angry at 1). */
  squint: number;
  /** 0–1: the smile tilted into a smirk. */
  smirk: number;
  smile: number;
  glow: number;
  anger: number;
  energy: number;
  sleep: boolean;
  speed: number;
  /** Hidden behind a card: everything below `edge` between `left` and `right` is not drawn. */
  clip: { edge: number; left: number; right: number } | null;
  shadow: { x: number; y: number; w: number; o: number } | null;
  /** Hanging on the cursor: the hand, the pointer, how hard the rope pulls (0–1). */
  tether: { hx: number; hy: number; px: number; py: number; tension: number } | null;
};

export type Game = 'logo' | 'text' | 'hide' | 'salto' | 'watch';
/** Seconds before the same thing may happen again (the frequency limiter). */
const COOL: Record<Game | 'grab' | 'surprise', number> = { logo: 30, text: 22, hide: 30, salto: 14, watch: 8, grab: 7, surprise: 6 };
/** Gap between the end of one game and the start of the next. */
const GAME_GAP = 2;
/** No sign of the person for this long: the robot pretends to sleep. */
const SLEEP_AFTER = 28;
/** The raised (pointing) hand holds the cursor: that arm swung up beside the head (offset at the shoulder, as in the
 * motion director). */
export const GRIP_ARM: Vec3 = [0.12, 0, -2.05];

/** Busy with itself: a cursor appearing right next to it now makes it jump. */
const STARTLED = new Set<string>(['QITMIR_IDLE', 'WATCHING_PAGE', 'LOGO_LANDING', 'TEXT_INTERACTION']);
/** Being thrown about or holding on: no other reaction until it is steady. */
const PHYSICAL = new Set<string>(['THROWN_AWAY', 'TUMBLING', 'DIZZY', 'RECOVERING', 'CURSOR_GRAB', 'CURSOR_ATTACHED', 'BUMPED', 'SURPRISED']);
/** Playing with the cursor (or home): the cursor running into it is not a push. */
const CURSOR_GAME = new Set<string>(['WATCHING_CURSOR', 'CHASING_CURSOR', 'CURSOR_APPROACH', 'CURSOR_GRAB', 'CURSOR_ATTACHED', 'DOCKED', 'RETURNING']);
/** Not in the middle of something physical: a touch may call it. */
const FREE = new Set<string>(['QITMIR_IDLE', 'WATCHING_PAGE', 'LOGO_LANDING', 'TEXT_INTERACTION', 'ACROBATIC_FLIGHT', 'CHASING_CURSOR']);

const CHAT_STATE: Partial<Record<MotionMood, QState>> = {
  listening: 'LISTENING',
  thinking: 'THINKING',
  working: 'EXECUTING_ACTION',
  speaking: 'SPEAKING',
  happy: 'SUCCESS',
  error: 'ERROR',
};

const T = {
  /** Top chase speed and acceleration, boxes per second (²). */
  speed: 9,
  accel: 30,
  drag: 1.2,
  /** Slows down inside this radius, boxes. */
  arrive: 1.8,
  /** Kept from a moving cursor, boxes (wide: the cursor is over a control or text is being selected). */
  personal: 0.7,
  wide: 1.6,
  gravity: 9,
  /** No flight is ever faster than this, boxes/s (a throw may be). */
  cap: 14,
  /** Never spins faster than this (rad/s): comfortable to watch. */
  maxSpin: 11,
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const bez2 = (a: Vec2, c: Vec2, b: Vec2, t: number): Vec2 => {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
};
/** Angle of a screen vector measured from straight down toward the right (y down). */
const ang = (x: number, y: number) => Math.atan2(x, y);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- quaternions, [x, y, z, w] as in three.js ----------
export const qMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qConj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
const qNorm = (q: Quat): Quat => {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
};
/** Euler angles in three.js 'XYZ' order. */
export function qEuler(x: number, y: number, z: number): Quat {
  const [c1, c2, c3] = [Math.cos(x / 2), Math.cos(y / 2), Math.cos(z / 2)];
  const [s1, s2, s3] = [Math.sin(x / 2), Math.sin(y / 2), Math.sin(z / 2)];
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
}
/** How far q is turned from upright, radians. */
export const qAngle = (q: Quat) => 2 * Math.acos(Math.min(1, Math.abs(q[3])));
const UPRIGHT: Quat = [0, 0, 0, 1];

type Plan = {
  t1?: number;
  phase?: string;
  from?: Vec2;
  ctrl?: Vec2;
  dur?: number;
  ptr?: Vec2;
  id?: number;
  i?: number;
  angle?: number;
  side?: number;
  until?: number;
  still?: number;
  bored?: number;
  lead?: number;
  next?: Mode;
  sight?: Rect;
  count?: number;
  x?: number;
  touched?: boolean;
};
type Gesture = {
  head: Vec3;
  body: Vec3;
  armL: Vec3;
  armR: Vec3;
  look: Vec2;
  lookAt: Vec2 | null;
  lookK: number;
  eyeOpen: number;
  squint: number;
  smirk: number;
  smile: number;
  glow: number;
  anger: number;
  energy: number;
  float: number;
  sleep: boolean;
};
const gesture = (qitmir: boolean): Gesture => ({
  head: [0, 0, 0],
  body: [0, 0, 0],
  armL: [0, 0, 0],
  armR: [0, 0, 0],
  look: [0, 0],
  lookAt: null,
  lookK: 1,
  eyeOpen: 1,
  // Qitmir's resting look is sly; the normal robot's is its original friendly face.
  squint: qitmir ? 0.35 : 0,
  smirk: qitmir ? 0.65 : 0,
  smile: 1,
  glow: qitmir ? 0.35 : 0.25,
  anger: 0,
  energy: 0,
  float: 1,
  sleep: false,
});

export type BrainOptions = {
  /** Robot size while it plays, px (the picture's frame). */
  box: number;
  /** Touch screen: no cursor to chase or hold; it follows fingers instead. */
  touch?: boolean;
  persona?: Persona;
  random?: () => number;
  now?: number;
  home?: { x: number; y: number; scale: number } | null;
  viewport?: Vec2;
};

export class QitmirBrain {
  private readonly box: number;
  private readonly touch: boolean;
  private readonly random: () => number;
  private W: number;
  private H: number;
  private home: { x: number; y: number; scale: number } | null;
  /** Origin → the gripping hand, px at scale 1 (y down). Measured from the model by the renderer. */
  private grip: Vec2;
  private targets: QTargets = { logo: null, texts: [], hides: [], sights: [], colliders: [] };
  private flags = { dock: true, chat: 'idle' as MotionMood, interactive: false, selecting: false, cursorFx: true, talk: false };

  private mode: Mode = 'DOCKED';
  private since: number;
  private last: number;
  private plan: Plan = {};
  private g: Gesture = gesture(true);
  private persona: Persona;
  /** The feeling (emotion.ts), eased toward `feelTo`: face, posture and mood physics. */
  private feel: Expression | null = null;
  private feelTo: Expression | null = null;
  private thrust = 0;
  /** Physical interaction: strokes over the head, taps on the body, a fast swipe through it. */
  private pat = { dir: 0, times: [] as number[], at: -1e9 };
  private taps: number[] = [];
  private pushed = { at: -1e9, vx: 0, vy: 0 };
  private hit = -1e9;
  private poked = -1e9;
  private fived = -1e9;
  private dodgeUntil = -1e9;
  /** Going home by its own choice (end of a calm trip), not because something needs the robot home. */
  private voluntary = false;
  /** Summoned: flies home as fast as it can. */
  private fast = false;

  private pos: Vec2;
  private vel: Vec2 = [0, 0];
  private acc: Vec2 = [0, 0];
  private q: Quat = [0, 0, 0, 1];
  private w: Vec3 = [0, 0, 0];
  private size: number;
  private sizeTo: number;
  private alpha = 1;
  private hop = 0;
  private offY = 0;
  private extra: Quat = [0, 0, 0, 1];
  private shadow: QPose['shadow'] = null;
  private clip: QPose['clip'] = null;
  private tether: QPose['tether'] = null;
  private tension = 0;

  private ptr = { x: 0, y: 0, vx: 0, vy: 0, t: -1e9, moved: -1e9, known: false, inside: false, down: false, restX: 0, restY: 0, travel: 0 };
  private samples: { t: number; vx: number; vy: number }[] = [];
  private shook = -1e9;
  private startle = -1e9;
  private tapped = -1e9;
  private touched = -1e9;
  private userAt: number;
  private outAt = -1e9;
  private cool: Record<string, number> = {};
  private lastGame: Game | null = null;
  /** A still cursor may be grabbed; after a grab ends it must move before the next. */
  private armed = true;
  private boost = { k: 1, until: -1e9 };
  private events: QEvent[] = [];

  constructor({ box, touch = false, persona = 'qitmir', random = Math.random, now = 0, home = null, viewport = [1280, 800] }: BrainOptions) {
    this.box = box;
    this.touch = touch;
    this.persona = persona;
    // A calm robot waits a little before its first trip.
    this.cool.trip = now + 10;
    this.random = random;
    this.since = this.last = this.userAt = now;
    [this.W, this.H] = viewport;
    this.home = home;
    this.pos = home ? [home.x, home.y] : [this.W - box, this.H - box];
    this.size = this.sizeTo = home?.scale ?? 1;
    this.grip = [-0.26 * box, -0.36 * box];
  }

  /** What the robot is doing, as the spec names it. */
  get state(): QState {
    if (this.mode !== 'DOCKED') return this.mode;
    return CHAT_STATE[this.flags.chat] ?? 'NORMAL_IDLE';
  }
  get position(): Vec2 {
    return [this.pos[0], this.pos[1]];
  }
  get velocity(): Vec2 {
    return [this.vel[0], this.vel[1]];
  }
  get orientation(): Quat {
    return [...this.q];
  }
  /** What it sees of the page and where its hand is (QA). */
  get debug() {
    return { targets: this.targets, grip: this.grip, flags: { ...this.flags } };
  }

  setViewport(w: number, h: number) {
    this.W = w;
    this.H = h;
  }
  setHome(home: { x: number; y: number; scale: number } | null) {
    this.home = home;
  }
  setGrip(grip: Vec2) {
    this.grip = grip;
  }
  setTargets(t: QTargets) {
    this.targets = t;
  }
  setFlags(f: Partial<QitmirBrain['flags']>) {
    Object.assign(this.flags, f);
  }
  setPersona(persona: Persona) {
    this.persona = persona;
  }
  /** The feeling to show (emotion.ts). */
  setEmotion(e: Expression) {
    this.feelTo = e;
    this.feel ??= { ...e, head: [...e.head], body: [...e.body], armL: [...e.armL], armR: [...e.armR], look: [...e.look] };
  }

  /** A calm robot waiting in its launcher: would it go on a trip now? (The stage asks this about once a second.) */
  wantsOut(now: number): boolean {
    return this.mode === 'DOCKED' && !this.flags.dock && !!this.home && (this.persona === 'qitmir' || this.tripDue(now));
  }

  /** Calm trips: only while the person is idle (no pointer, keys or scrolling for a few seconds), with a cooldown, never
   * while they are away for long, and only when there is something worth visiting. */
  private tripDue(now: number): boolean {
    const quiet = now - this.userAt;
    const t = this.targets;
    return quiet > 7 && quiet < 120 && now >= (this.cool.trip ?? 0) && (!!this.perch() || t.texts.some((x) => x.letters.length) || t.sights.length > 0);
  }

  /** The person typed, scrolled or otherwise showed they are there. */
  activity(now: number) {
    this.userAt = now;
  }

  /** Escape: let go of the cursor at once and keep away from it for a while. */
  escape(now: number) {
    this.userAt = now;
    if (this.mode === 'CURSOR_ATTACHED' || this.mode === 'CURSOR_GRAB' || this.mode === 'CURSOR_APPROACH') this.letGo(now, 10);
  }

  pointer(kind: 'move' | 'down' | 'up' | 'leave', x: number, y: number, now: number) {
    const p = this.ptr;
    this.userAt = now;
    if (kind === 'leave') {
      p.inside = false;
      p.down = false;
      return;
    }
    if (kind === 'up') {
      p.down = false;
      return;
    }
    const near = Math.hypot(x - this.pos[0], y - this.pos[1]) < 1.1 * this.box * this.size;
    // Out of nowhere right next to the robot (it was away, or it jumped there): a start.
    if (near && (!p.inside || Math.hypot(x - p.x, y - p.y) > 2.2 * this.box)) this.startle = now;
    // Physical interaction with the robot's body (not while it rests in its launcher or is thrown about).
    const s = this.size;
    const B = this.box;
    const rx = x - this.pos[0];
    const ry = y - this.pos[1];
    const body = this.mode !== 'DOCKED' && this.mode !== 'RETURNING' && Math.hypot(rx / (0.42 * B * s), ry / (0.48 * B * s)) < 1;
    if (kind === 'down' && body) {
      if (this.mode === 'HIGH_FIVE' && Math.hypot(x - this.hand()[0], y - this.hand()[1]) < 0.4 * B * s) this.fived = now;
      else if (now < this.dodgeUntil) this.poked = now;
      else {
        this.taps = this.taps.filter((t0) => now - t0 < 2.5);
        this.taps.push(now);
        if (this.taps.length >= 3) {
          this.hit = now;
          this.taps = [];
        } else if (!this.touch) this.poked = now;
      }
    }
    if (kind === 'down') {
      p.down = true;
      if (this.touch) {
        if (near) this.tapped = now;
        else this.touched = now;
      }
    }
    if (p.known && p.inside) {
      const dt = Math.max(0.004, now - p.t);
      const vx = (x - p.x) / dt;
      const vy = (y - p.y) / dt;
      const sp = Math.hypot(vx, vy);
      // Strokes back and forth over its head (no button held): a pat.
      if (kind === 'move' && body && ry < -0.05 * B * s && (this.touch || !p.down) && sp > 40 && sp < 1100 && Math.abs(vx) > 30) {
        const dir = Math.sign(vx);
        if (dir !== this.pat.dir) {
          this.pat.dir = dir;
          this.pat.times = this.pat.times.filter((t0) => now - t0 < 1.6);
          this.pat.times.push(now);
          if (this.pat.times.length >= 3) this.pat.at = now;
        }
      }
      // A fast swipe straight through its body: a push.
      const mid = [(x + p.x) / 2 - this.pos[0], (y + p.y) / 2 - this.pos[1]];
      const through = body || Math.hypot(mid[0] / (0.42 * B * s), mid[1] / (0.48 * B * s)) < 1;
      // (Not while it plays with the cursor itself — running into it is part of that game.)
      if (kind === 'move' && through && (this.touch || !p.down) && sp > 1300 && !CURSOR_GAME.has(this.mode)) this.pushed = { at: now, vx, vy };
      const k = 1 - Math.exp(-dt / 0.05);
      p.vx += (vx - p.vx) * k;
      p.vy += (vy - p.vy) * k;
      p.travel += Math.hypot(x - p.x, y - p.y);
      this.samples.push({ t: now, vx, vy });
      while (this.samples.length && now - this.samples[0].t > 0.3) this.samples.shift();
      if (this.mode === 'CURSOR_ATTACHED' && this.shaken(vx, vy, now)) this.shook = now;
    } else {
      p.vx = p.vy = 0;
    }
    if (Math.hypot(x - p.restX, y - p.restY) > 2) {
      p.moved = now;
      p.restX = x;
      p.restY = y;
      if (Math.hypot(x - this.pos[0], y - this.pos[1]) > 0.5 * this.box) this.armed = true;
    }
    p.x = x;
    p.y = y;
    p.t = now;
    p.known = true;
    p.inside = true;
  }

  /** A shake: a fast move that reverses a fast move from a moment ago, or a single violent yank. */
  private shaken(vx: number, vy: number, now: number): boolean {
    const s = Math.hypot(vx, vy);
    if (s > 4200) return true;
    if (s < 900) return false;
    return this.samples.some((o) => now - o.t < 0.25 && Math.hypot(o.vx, o.vy) > 900 && o.vx * vx + o.vy * vy < -0.25 * s * Math.hypot(o.vx, o.vy));
  }

  /** A one-off signal from the pointer handler, used once. */
  private take(name: 'shook' | 'startle' | 'tapped' | 'touched' | 'fived' | 'hit' | 'poked', now: number): boolean {
    if (now - this[name] > (name === 'touched' || name === 'tapped' ? 1 : 0.25)) return false;
    this[name] = -1e9;
    return true;
  }

  /** Everything that happened since the last call (the renderer acts on it once). */
  drain(): QEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  update(now: number): QPose {
    const dt = clamp(now - this.last, 0, 1 / 20);
    this.last = now;
    const p = this.ptr;
    if (now - p.t > 0.05) {
      p.vx *= Math.exp(-dt / 0.08);
      p.vy *= Math.exp(-dt / 0.08);
    }
    p.travel *= Math.exp(-dt / 0.6);
    this.acc = [0, 0];
    this.g = gesture(this.persona === 'qitmir');
    this.extra = UPRIGHT;
    this.offY = 0;

    if (this.flags.dock && this.mode !== 'DOCKED' && this.mode !== 'RETURNING') this.goHome(now);
    // The reason to go home went away on the way there (a field lost focus, the chat finished): play on from here.
    else if (!this.flags.dock && this.mode === 'RETURNING' && this.home && !this.voluntary) {
      this.sizeTo = 1;
      this.enter('QITMIR_IDLE', now, { until: now + 1 + this.random() });
    }
    if (this.mode !== 'RETURNING' && this.mode !== 'DOCKED') this.alpha = Math.min(1, this.alpha + dt / 0.3);
    if (now - this.userAt > SLEEP_AFTER && this.sleepy()) this.enter('SLEEPING', now, { x: this.pos[0] });
    // The cursor appears right next to it out of nowhere while it is busy with itself: a start.
    if (!this.touch && STARTLED.has(this.mode) && (this.cool.surprise ?? -1e9) <= now && this.take('startle', now)) this.surprise(now);
    // Phones: a finger on the screen calls it away from its own games.
    if (this.touch && FREE.has(this.mode)) {
      if (this.take('tapped', now)) this.victory(now, 'tap');
      else if (this.take('touched', now)) {
        this.shadow = this.clip = null;
        this.sizeTo = 1;
        this.chase(now);
      }
    }

    // A voice conversation with the robot out on the page: it answers where it is (not from its launcher).
    if (this.flags.talk && this.mode !== 'TALKING' && this.mode !== 'DOCKED' && this.mode !== 'RETURNING' && !PHYSICAL.has(this.mode)) {
      this.tether = this.clip = this.shadow = null;
      this.sizeTo = 1;
      this.enter('TALKING', now, { until: now });
    }
    this.react(now);
    this.think(now, dt);
    this.express(dt);
    if (this.mode !== 'DOCKED') this.move(dt);
    this.size += (this.sizeTo - this.size) * damp(5, dt);
    this.thrustFor(dt);
    return this.pose(now);
  }

  private feelEvent(kind: FeelEvent) {
    this.events.push({ type: 'feel', kind });
  }

  /** The person touched it: a pat, a tap, several hits, a push, a high five. */
  private react(now: number) {
    const free = !PHYSICAL.has(this.mode) && this.mode !== 'DOCKED' && this.mode !== 'RETURNING';
    if (!free) return;
    const B = this.box;
    if (this.take('fived', now)) {
      this.say('five');
      this.feelEvent('five');
      this.vel = [this.vel[0] * 0.3, -1.5 * B];
      return this.enter('VICTORY', now);
    }
    if (now - this.pushed.at < 0.25) {
      const { vx, vy } = this.pushed;
      this.pushed.at = -1e9;
      const v = Math.hypot(vx, vy) || 1;
      const k = Math.min(1, v / 3000) * 6 * B;
      this.vel = [this.vel[0] + (vx / v) * k, this.vel[1] + (vy / v) * k];
      this.w = [this.w[0] + (vy / v) * 3, this.w[1], this.w[2] - (vx / v) * 6];
      this.tether = this.clip = this.shadow = null;
      this.sizeTo = 1;
      this.say('push', 0.6);
      this.feelEvent('push');
      return this.enter('BUMPED', now);
    }
    if (this.take('hit', now)) {
      this.say('hit');
      this.feelEvent('hits');
      this.dodgeUntil = now + 5;
      this.dodge();
      return this.enter('ANNOYED', now);
    }
    if (this.take('poked', now)) {
      if (now < this.dodgeUntil) {
        // Still cross: it slips away from the next poke.
        this.dodge();
        return;
      }
      this.feelEvent('tap');
      return this.enter('NOTICED', now);
    }
    if (now - this.pat.at < 0.25 && this.mode !== 'PATTED') {
      this.say('pat', 0.5);
      this.feelEvent('pat');
      this.shadow = this.clip = null;
      this.enter('PATTED', now, { until: now + 1.4 });
    } else if (this.mode === 'PATTED' && now - this.pat.at < 0.25) this.plan.until = now + 1.4;
  }

  private dodge() {
    const B = this.box;
    const dx = this.pos[0] - this.ptr.x;
    const dy = this.pos[1] - this.ptr.y;
    const d = Math.hypot(dx, dy) || 1;
    this.vel = [(dx / d) * 5 * B, (dy / d) * 3 * B - 1.5 * B];
  }

  /** The feeling on top of what the robot does (not while it is thrown about or asleep). */
  private express(dt: number) {
    const f = this.feel;
    const t = this.feelTo;
    if (!f || !t) return;
    const k = damp(2.5, dt);
    for (const key of ['eye', 'squint', 'smile', 'smirk', 'glow', 'energy', 'float', 'speed', 'hover', 'turn', 'neon'] as const) f[key] += (t[key] - f[key]) * k;
    for (const key of ['head', 'body', 'armL', 'armR'] as const) f[key] = [0, 1, 2].map((i) => f[key][i] + (t[key][i] - f[key][i]) * k) as Vec3;
    f.look = [f.look[0] + (t.look[0] - f.look[0]) * k, f.look[1] + (t.look[1] - f.look[1]) * k];
    if (PHYSICAL.has(this.mode) || this.mode === 'SLEEPING' || this.mode === 'DOCKED') return;
    const g = this.g;
    for (let i = 0; i < 3; i++) {
      g.head[i] += f.head[i];
      g.body[i] += f.body[i];
      g.armL[i] += f.armL[i];
      g.armR[i] += f.armR[i];
    }
    if (g.eyeOpen > 0.5) g.eyeOpen *= f.eye;
    g.squint = Math.max(g.squint, f.squint);
    g.smirk = Math.max(g.smirk, f.smirk);
    g.smile *= f.smile;
    g.glow = Math.max(0, g.glow + f.glow);
    g.energy = Math.max(g.energy, f.energy);
    g.float *= f.float;
    g.look = [g.look[0] + f.look[0], g.look[1] + f.look[1]];
    this.offY -= f.hover * 0.9 * this.box;
  }

  private thrustFor(dt: number) {
    const B = this.box;
    const m = this.mode;
    const resting =
      m === 'DOCKED' || m === 'SLEEPING' || m === 'HIDE_AND_SEEK' || (m === 'LOGO_LANDING' && this.plan.phase === 'rest') || (m === 'TEXT_INTERACTION' && this.plan.phase === 'look');
    const speed = Math.hypot(...this.vel) / (10 * B);
    const push = Math.hypot(...this.acc) / (30 * B);
    const want = resting ? 0.04 : Math.min(1, 0.22 + speed * 0.45 + push * 0.35) * (this.feel?.neon ?? 1);
    this.thrust += (Math.min(1, want) - this.thrust) * damp(want > this.thrust ? 8 : 3, dt);
  }

  // ---------- states ----------

  private enter(mode: Mode, now: number, plan: Plan = {}) {
    this.mode = mode;
    this.since = now;
    this.plan = plan;
  }

  private say(key: SayKey, chance = 1) {
    if (this.random() < chance) this.events.push({ type: 'say', key });
  }

  private sleepy(): boolean {
    if (this.persona === 'calm') return false;
    const m = this.mode;
    return m === 'QITMIR_IDLE' || m === 'WATCHING_PAGE' || m === 'WATCHING_CURSOR' || m === 'CHASING_CURSOR' || (m === 'LOGO_LANDING' && this.plan.phase === 'rest');
  }

  /** Is the person actually moving the pointer now (not a twitch)? */
  private moving(now: number, travel = 1.2): boolean {
    const p = this.ptr;
    return p.known && p.inside && now - p.moved < 0.3 && p.travel > travel * this.box && !this.approaching();
  }

  /** The pointer is slowly coming to the robot itself (to look, to pat it): curiosity, not the person at work. */
  private approaching(): boolean {
    const p = this.ptr;
    return Math.hypot(p.x - this.pos[0], p.y - this.pos[1]) < 1.5 * this.box * this.size && Math.hypot(p.vx, p.vy) < 600;
  }

  private goHome(now: number, voluntary = false) {
    this.voluntary = voluntary;
    if (this.mode === 'CURSOR_ATTACHED') this.armed = false;
    this.tether = null;
    // Behind a card: rise out first (the clip stays until it is clear).
    if (this.clip) this.vel[1] = Math.min(this.vel[1], -5 * this.box);
    this.enter('RETURNING', now);
  }

  private liftOff(now: number) {
    const B = this.box;
    this.events.push({ type: 'out' });
    this.alpha = 1;
    this.vel = [0, 0];
    this.outAt = now;
    this.sizeTo = 1;
    this.enter('QITMIR_IDLE', now, { until: now + 0.9 + this.random() * 0.8, from: [this.pos[0] - 0.7 * B, this.pos[1] - 1.7 * B] });
  }

  /** Let go of the cursor gently (Escape, a control under it, a click, boredom): a short drop, then it keeps away. */
  private letGo(now: number, away = COOL.grab) {
    this.tether = null;
    this.armed = false;
    this.cool.grab = now + away;
    this.vel = [this.vel[0] * 0.3 + (this.pos[0] > this.ptr.x ? 1 : -1) * 1.2 * this.box, 1.5 * this.box];
    this.enter('RECOVERING', now, { next: 'QITMIR_IDLE', dur: 0.6 });
  }

  private endGame(now: number, next: Mode = 'QITMIR_IDLE') {
    this.clip = null;
    this.shadow = null;
    this.sizeTo = 1;
    this.cool.any = now + GAME_GAP;
    // A calm robot's trip ends at home.
    if (this.persona === 'calm') return this.homeFromTrip(now);
    if (next === 'CHASING_CURSOR') this.chase(now);
    else this.enter(next, now, { until: now + 1.5 + this.random() * 2 });
  }

  private homeFromTrip(now: number) {
    this.cool.trip = now + 35 + this.random() * 45;
    this.goHome(now, true);
  }

  private chase(now: number, lead = 1) {
    if (this.persona === 'calm') return this.homeFromTrip(now);
    this.enter('CHASING_CURSOR', now, { still: 1.5 + this.random(), bored: now + 12 + this.random() * 6, lead });
  }

  private think(now: number, dt: number) {
    const B = this.box;
    const p = this.ptr;
    const g = this.g;
    const s = this.plan;
    const t = now - this.since;
    const cursor = !this.touch && p.known && p.inside;
    const toPtr = Math.hypot(p.x - this.pos[0], p.y - this.pos[1]);
    const busyPtr = this.flags.interactive || this.flags.selecting || p.down;

    switch (this.mode) {
      case 'DOCKED': {
        if (this.home) this.pos = [this.home.x, this.home.y];
        this.vel = [0, 0];
        this.w = [0, 0, 0];
        this.q = [0, 0, 0, 1];
        this.size = this.sizeTo = this.home?.scale ?? 1;
        this.clip = this.shadow = this.tether = null;
        if (!this.flags.dock && this.home && (this.persona === 'qitmir' || this.tripDue(now))) this.liftOff(now);
        return;
      }

      case 'RETURNING': {
        this.shadow = null;
        if (this.clip && (this.pos[1] + 0.45 * B * this.size < this.clip.edge || this.pos[0] < this.clip.left || this.pos[0] > this.clip.right)) this.clip = null;
        this.turn(UPRIGHT, 60, 0.9, dt);
        if (!this.home) {
          // The launcher is hidden (a phone with the chat open): fade where it is.
          this.vel[0] *= 1 - damp(6, dt);
          this.vel[1] *= 1 - damp(6, dt);
          this.alpha = Math.max(0, this.alpha - dt / 0.3);
          if (this.alpha === 0) this.docked();
          return;
        }
        this.alpha = Math.min(1, this.alpha + dt / 0.3);
        this.sizeTo = this.home.scale;
        const d = Math.hypot(this.home.x - this.pos[0], this.home.y - this.pos[1]);
        if (d > 0.6 * B) this.seek(this.home.x, this.home.y, this.fast ? 15 : 8, this.fast ? 75 : 40, 1.4);
        else {
          // The last stretch onto its pad: an eased landing, no overshoot (the thruster dims as it settles).
          const k = damp(this.fast ? 11 : 8, dt);
          this.pos = [this.pos[0] + (this.home.x - this.pos[0]) * k, this.pos[1] + (this.home.y - this.pos[1]) * k];
          this.vel = [0, 0];
        }
        if (d < 1.5 && Math.hypot(...this.vel) < 30 && Math.abs(this.size - this.home.scale) < 0.01 && qAngle(this.q) < 0.02) this.docked();
        return;
      }

      case 'QITMIR_IDLE': {
        g.lookAt = cursor ? [p.x, p.y] : null;
        g.lookK = 0.6;
        // Just out of the launcher: rises off its pad first (thrust, not a jump).
        if (s.from && t < 0.7) return this.seek(s.from[0], s.from[1], 4, 14, 1);
        this.hover(dt);
        // Calm: a trip is one visit (the logo, a heading, a card…), then home.
        if (this.persona === 'calm') {
          if (t > 0.9 && !this.startGame(now)) this.homeFromTrip(now);
          return;
        }
        if (this.touch) {
          this.park(dt, now);
        } else if (cursor && this.moving(now)) {
          this.enter('WATCHING_CURSOR', now, { until: now + 0.35 + this.random() * 0.25 });
          return;
        } else if (cursor && this.canGrab(now) && now - p.moved > 1.5) {
          return this.enter('CURSOR_APPROACH', now, { phase: 'close', ptr: [p.x, p.y] });
        }
        if (now > (s.until ?? 0)) this.startGame(now);
        return;
      }

      case 'WATCHING_CURSOR': {
        // Sees the cursor: slows, turns to it, leans back a little — then goes for it.
        g.lookAt = [p.x, p.y];
        g.body[0] -= 0.08;
        g.eyeOpen = 1.08;
        this.vel[0] *= 1 - damp(4, dt);
        this.vel[1] *= 1 - damp(4, dt);
        if (now >= (s.until ?? 0)) {
          if (this.moving(now, 0.6)) return this.chase(now);
          if (this.canGrab(now) && now - p.moved > 1.2) return this.enter('CURSOR_APPROACH', now, { phase: 'close', ptr: [p.x, p.y] });
          if (now - p.moved > 3) return this.endGame(now);
        }
        return;
      }

      case 'CHASING_CURSOR': {
        if (this.touch) return this.followFinger(now, dt);
        if (!cursor) {
          if (now - p.t > 0.6) this.endGame(now);
          this.hover(dt);
          return;
        }
        g.lookAt = [p.x, p.y];
        g.squint = 0.5;
        const k = now < this.boost.until ? this.boost.k : 1;
        // Aim where the cursor will be, not where it is: the faster it moves and the further away it is, the further
        // ahead (a better plan after a miss). Then keep a little space, so it chases rather than covers the cursor.
        const look = clamp(toPtr / (T.speed * B), 0, 0.35) * (s.lead ?? 1);
        const px = p.x + p.vx * look;
        const py = p.y + p.vy * look;
        const room = (busyPtr ? T.wide : T.personal) * B;
        const dx = this.pos[0] - px;
        const dy = this.pos[1] - py;
        const d = Math.hypot(dx, dy) || 1;
        this.seek(px + (dx / d) * room, py + (dy / d) * room, T.speed * k, T.accel * k, T.arrive);
        this.avoid(dt);
        if (now - p.moved > (s.still ?? 2) && this.canGrab(now)) return this.enter('CURSOR_APPROACH', now, { phase: 'close', ptr: [p.x, p.y] });
        if (now > (s.bored ?? 1e9) && this.startGame(now)) return;
        // Now and then a salto on the way (it keeps flying).
        const v = Math.hypot(...this.vel);
        if (v > 2 * B && v < 6 * B && (this.cool.salto ?? 0) <= now && this.lastGame !== 'salto' && this.random() < 0.18 * dt) this.salto(now);
        if (now - p.moved > 4 && now > (this.cool.any ?? 0)) this.endGame(now);
        return;
      }

      case 'CURSOR_APPROACH': {
        // Cursor still: closer, slowly, eyes on it; a small circle around it; then the pounce.
        g.lookAt = [p.x, p.y];
        g.squint = 0.55;
        g.eyeOpen = 1.05;
        const from = s.ptr ?? [p.x, p.y];
        if (!cursor || busyPtr || Math.hypot(p.x - from[0], p.y - from[1]) > 0.35 * B) return this.chase(now);
        if (s.phase === 'close') {
          const dx = this.pos[0] - p.x;
          const dy = this.pos[1] - p.y;
          const d = Math.hypot(dx, dy) || 1;
          this.seek(p.x + (dx / d) * 1.1 * B, p.y + (dy / d) * 1.1 * B, 3.2, 18, 1.2);
          if ((d < 1.35 * B && Math.hypot(...this.vel) < 2.2 * B) || t > 2.2) {
            this.plan = { ...s, phase: 'circle', t1: now, angle: Math.atan2(dy, dx), side: this.random() < 0.5 ? -1 : 1 };
          }
          return;
        }
        const u = (now - (s.t1 ?? now)) / 1.1;
        const a = (s.angle ?? 0) + (s.side ?? 1) * 4.4 * ease(clamp(u, 0, 1));
        this.seek(p.x + Math.cos(a) * 1.05 * B, p.y + Math.sin(a) * 0.8 * B, 6, 40, 0.5);
        if (u >= 1) {
          this.enter('CURSOR_GRAB', now, { from: [...this.pos], ptr: [p.x, p.y], dur: 0.38 });
          this.cool.grab = now + COOL.grab;
        }
        return;
      }

      case 'CURSOR_GRAB': {
        // The pounce: a short hop onto the cursor (toward the viewer a little), the hand reaching up for it.
        const u = clamp(t / (s.dur ?? 0.38), 0, 1);
        const [ex, ey] = this.hangDir();
        const to: Vec2 = [p.x + ex * this.rope(), p.y + ey * this.rope()];
        const from = s.from ?? this.pos;
        const ctrl: Vec2 = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - 0.6 * B];
        const at = bez2(from, ctrl, to, ease(u));
        this.vel = [(at[0] - this.pos[0]) / Math.max(dt, 1e-3), (at[1] - this.pos[1]) / Math.max(dt, 1e-3)];
        this.pos = at;
        this.hop = Math.max(this.hop, Math.sin(Math.PI * u) * 0.6);
        g.lookAt = [p.x, p.y];
        g.armL = GRIP_ARM.map((v) => v * ease(u)) as Vec3;
        g.squint = 0.3;
        g.eyeOpen = 1.15;
        if (u < 1) return;
        const ptr = s.ptr ?? [p.x, p.y];
        if (!cursor || Math.hypot(p.x - ptr[0], p.y - ptr[1]) > 0.4 * B || busyPtr) {
          // Missed: fake anger, then a new plan (aims further ahead, a little faster).
          this.vel = [this.vel[0] * 0.3, this.vel[1] * 0.3];
          this.say('miss', 0.8);
          this.enter('ANGRY', now, { dur: 0.85, next: 'CHASING_CURSOR', lead: 1.7 });
          return;
        }
        if (!this.flags.cursorFx) return this.victory(now, 'grab');
        this.say('grab');
        this.enter('CURSOR_ATTACHED', now, { until: now + 1.3 });
        return;
      }

      case 'CURSOR_ATTACHED': {
        // Hanging on the cursor by its raised hand: a pendulum on an elastic rope — it swings, lags and pulls.
        if (!cursor || busyPtr || !this.flags.cursorFx) return this.letGo(now);
        if (this.take('shook', now)) return this.throwAway(now);
        this.hang(dt);
        if (this.tension > 0.999 && Math.hypot(p.vx, p.vy) > 1800) return this.throwAway(now);
        g.armL = [...GRIP_ARM];
        g.float = 0;
        g.lookAt = null;
        g.look = [-0.1, 0.15];
        const dance = (s.until ?? 0) - now;
        if (dance > 0) {
          // Victory: a quick happy wiggle on the rope.
          const k = Math.min(1, dance / 0.3);
          g.body[1] += 0.38 * Math.sin(now * 11) * k;
          g.armR[2] += (0.5 + 0.35 * Math.sin(now * 14)) * k;
          g.smile = 1.3;
          g.smirk = 1;
          g.glow = 0.9 * k + 0.35;
          g.energy = 0.7 * k;
        } else {
          g.armR[2] += 0.12 * Math.sin(now * 2.4);
          g.head[2] += 0.08 * Math.sin(now * 1.7);
        }
        // Bored of a cursor that does nothing: lets go and looks for something else.
        if (t > 8 && now - p.moved > 3.5) {
          this.say('bored', 0.7);
          this.letGo(now, 12);
          this.plan.next = 'QITMIR_IDLE';
          this.cool.any = now;
        } else if (t > 25) this.letGo(now);
        return;
      }

      case 'THROWN_AWAY':
      case 'TUMBLING': {
        // Ballistic with angular momentum; bounces off the screen edges; the thrusters catch it after a moment.
        if (this.mode === 'THROWN_AWAY' && t > 0.2) this.mode = 'TUMBLING';
        const rec = clamp((t - 0.65) / 0.35, 0, 1);
        this.acc[1] += T.gravity * B * (1 - rec);
        const drag = 0.5 + 4 * rec;
        this.vel[0] *= 1 - damp(drag, dt);
        this.vel[1] *= 1 - damp(drag, dt);
        if (rec > 0) this.turn(UPRIGHT, 34 * rec, 0.42, dt);
        else for (let i = 0; i < 3; i++) this.w[i] *= 1 - damp(0.3, dt);
        g.float = 0;
        g.eyeOpen = 1.2;
        g.squint = 0;
        g.armL = [-0.2, 0, -0.6];
        g.armR = [-0.2, 0, 0.6];
        g.smile = 0.6;
        if ((t > 1.1 && Math.hypot(...this.vel) < 2 * B) || t > 1.7) this.enter('DIZZY', now);
        return;
      }

      case 'DIZZY': {
        // Upright but not steady: wobbles, eyes going round, a little sway; then shakes it off.
        const fade = 1 - clamp(t / 1.6, 0, 1) * 0.6;
        this.vel[0] *= 1 - damp(5, dt);
        this.vel[1] *= 1 - damp(5, dt);
        this.acc[0] += Math.sin(now * 4.2) * 1.4 * B * fade;
        this.turn(qEuler(0, 0, 0.2 * Math.sin(now * 5.5) * fade), 16, 0.3, dt);
        const r = now * 9 * fade;
        g.look = [Math.cos(r) * 0.9, Math.sin(r) * 0.7];
        g.head = [0.06 * Math.sin(now * 3.1), 0.12 * Math.sin(now * 2.3), 0.22 * Math.sin(now * 4.4) * fade];
        g.eyeOpen = 0.78;
        g.squint = 0;
        g.smirk = 0;
        g.smile = 0.5;
        g.energy = 0.45 * fade;
        g.float = 0.6;
        if (t > 1.6) this.enter('RECOVERING', now, { next: 'ANGRY', dur: 0.45, until: now + 0.45 });
        return;
      }

      case 'RECOVERING': {
        this.turn(UPRIGHT, 60, 0.75, dt);
        this.vel[0] *= 1 - damp(3, dt);
        this.vel[1] *= 1 - damp(3, dt);
        if (s.next === 'ANGRY') {
          // Shakes the dizziness off.
          g.head[1] += 0.35 * Math.sin(t * 16) * (1 - t / (s.dur ?? 0.45));
          g.eyeOpen = 0.85;
        } else g.lookAt = cursor ? [p.x, p.y] : null;
        if (t < (s.dur ?? 0.5)) return;
        if (s.next === 'ANGRY') {
          this.say('angry', 0.8);
          this.enter('ANGRY', now, { dur: 1, next: 'CHASING_CURSOR', lead: 1.4 });
        } else this.endGame(now, s.next ?? 'QITMIR_IDLE');
        return;
      }

      case 'ANGRY': {
        // A serious look at the person, redder eyes, a little huff — then the chase is on again.
        g.lookAt = cursor ? [p.x, p.y] : null;
        g.lookK = 1.2;
        g.squint = 1;
        g.smirk = 0.2;
        g.smile = 0.12;
        g.anger = Math.sin(Math.PI * clamp(t / (s.dur ?? 1), 0, 1)) * 0.6 + 0.4;
        g.glow = 0.9;
        g.armL = [0.15, 0, 0.25];
        g.armR = [0.15, 0, -0.25];
        this.offY -= 0.06 * B * Math.sin(Math.PI * clamp(t / 0.3, 0, 1));
        this.turn(qEuler(-0.08, cursor ? clamp((p.x - this.pos[0]) / (4 * B), -0.4, 0.4) : 0, 0), 50, 0.8, dt);
        this.vel[0] *= 1 - damp(5, dt);
        this.vel[1] *= 1 - damp(5, dt);
        if (t < (s.dur ?? 1)) return;
        this.boost = { k: 1.25, until: now + 4 };
        if (this.touch || !cursor) this.endGame(now);
        else this.chase(now, s.lead ?? 1.4);
        return;
      }

      case 'SURPRISED': {
        // Startled: hops back from the cursor, eyes wide, arms up.
        g.eyeOpen = 1.35;
        g.squint = 0;
        g.smirk = 0;
        g.smile = 0.7;
        g.body[0] -= 0.25 * Math.max(0, 1 - t / 0.5);
        g.armL[2] -= 0.5;
        g.armR[2] += 0.5;
        g.glow = 0.4 + 0.6 * Math.max(0, 1 - t / 0.6);
        g.lookAt = cursor ? [p.x, p.y] : null;
        this.vel[0] *= 1 - damp(3, dt);
        this.vel[1] *= 1 - damp(3, dt);
        if (t < 0.65) return;
        if (cursor) this.chase(now);
        else this.endGame(now);
        return;
      }

      case 'VICTORY': {
        // A happy hop with a twirl (a tag instead of holding on, or a tap on a phone).
        const u = clamp(t / 1.1, 0, 1);
        this.extra = qEuler(0, 2 * Math.PI * ease(u), 0);
        this.offY -= 0.35 * B * Math.sin(Math.PI * u);
        this.vel[0] *= 1 - damp(4, dt);
        this.vel[1] *= 1 - damp(4, dt);
        g.armL[2] -= 0.6;
        g.armR[2] += 0.6;
        g.smile = 1.35;
        g.smirk = 1;
        g.glow = 0.9;
        g.energy = 0.8 * (1 - u);
        if (u >= 1) {
          this.armed = false;
          this.cool.grab = now + COOL.grab;
          this.endGame(now);
        }
        return;
      }

      case 'ACROBATIC_FLIGHT': {
        // A backflip in the air, carried along by its speed.
        const u = clamp(t / 0.85, 0, 1);
        this.extra = qEuler(-2 * Math.PI * ease(u), 0, 0);
        this.offY -= 0.32 * B * Math.sin(Math.PI * u);
        this.vel[0] *= 1 - damp(1.2, dt);
        this.vel[1] *= 1 - damp(1.2, dt);
        g.armL[2] -= 0.4 * Math.sin(Math.PI * u);
        g.armR[2] += 0.4 * Math.sin(Math.PI * u);
        g.smirk = 1;
        if (u < 1) return;
        if (s.next === 'CHASING_CURSOR' && cursor) this.chase(now);
        else this.endGame(now);
        return;
      }

      case 'SLEEPING': {
        // Pretends to sleep: eyes shut, head down, the slowest float. Any movement wakes it with a start.
        g.sleep = true;
        g.eyeOpen = 0.06;
        g.head = [0.24, 0.1, 0.12];
        g.body[2] += 0.06;
        g.float = 0.35;
        g.smirk = 0.3;
        g.glow = 0.12;
        this.vel[0] *= 1 - damp(4, dt);
        this.vel[1] *= 1 - damp(4, dt);
        if (this.shadow) this.shadow = { ...this.shadow, x: this.pos[0] };
        if (now - this.userAt < 0.25) {
          this.say('wake');
          this.shadow = null;
          this.sizeTo = 1;
          this.surprise(now);
        }
        return;
      }

      case 'NOTICED': {
        // A tap: it looks at the person, a little hop and a head tilt.
        g.lookAt = p.known ? [p.x, p.y] : null;
        g.lookK = 1.1;
        g.head[2] += 0.15 * Math.sin(Math.PI * clamp(t / 0.6, 0, 1));
        g.eyeOpen = 1.12;
        this.offY -= 0.08 * B * Math.sin(Math.PI * clamp(t / 0.4, 0, 1));
        this.hover(dt);
        if (t > 0.8) this.endGame(now);
        return;
      }

      case 'PATTED': {
        // Stroked on the head: eyes soften into happy arcs, it leans into the hand, its light warms.
        const side = p.x < this.pos[0] ? 1 : -1;
        g.body[2] += 0.12 * side;
        g.head[2] += 0.18 * side;
        g.head[0] -= 0.05;
        g.eyeOpen = 0.5;
        g.smile = 1.35;
        g.squint = 0;
        g.smirk = 0.2;
        g.glow = 0.55;
        g.float = 0.5;
        this.vel[0] *= 1 - damp(6, dt);
        this.vel[1] *= 1 - damp(6, dt);
        if (now > (s.until ?? 0)) this.endGame(now);
        return;
      }

      case 'BUMPED': {
        // Pushed: knocked off balance, wobbles, catches itself.
        this.vel[0] *= 1 - damp(2.2, dt);
        this.vel[1] *= 1 - damp(2.2, dt);
        if (t > 0.25) this.turn(UPRIGHT, 30, 0.4, dt);
        g.eyeOpen = 1.25;
        g.squint = 0;
        g.smirk = 0;
        g.smile = 0.7;
        g.armL = [-0.2, 0, -0.5];
        g.armR = [-0.2, 0, 0.5];
        g.float = 0;
        if ((t > 1.1 && qAngle(this.q) < 0.25) || t > 2) this.endGame(now);
        return;
      }

      case 'ANNOYED': {
        // Hit several times: arms folded, eyes narrowed, turned half away — and it keeps its distance for a while.
        g.armL = [0.1, 0, 0.55];
        g.armR = [0.1, 0, -0.55];
        g.squint = 0.85;
        g.smile = 0.2;
        g.smirk = 0;
        g.head[1] += p.x < this.pos[0] ? 0.35 : -0.35;
        g.head[0] += 0.06;
        g.glow = 0.5;
        g.anger = 0.4;
        this.vel[0] *= 1 - damp(2.5, dt);
        this.vel[1] *= 1 - damp(2.5, dt);
        if (t > 2.2) this.endGame(now);
        return;
      }

      case 'HIGH_FIVE': {
        // Hand up, waiting for a high five (a click or a tap on the hand).
        g.armL = [...GRIP_ARM];
        g.eyeOpen = 1.15;
        g.smile = 1.25;
        g.squint = 0;
        g.lookAt = p.known ? [p.x, p.y] : null;
        g.float = 0.4;
        this.hover(dt);
        if (t > 3.5) {
          this.say('nofive', 0.8);
          this.feelEvent('nofive');
          this.endGame(now);
        }
        return;
      }

      case 'TALKING': {
        // Listening, thinking and speaking in place (the renderer shows those poses): steady, facing the person, kept
        // well inside the screen. Done a moment after the conversation ends.
        const m = this.box * 1.0;
        const tx = clamp(this.pos[0], m, this.W - m);
        const ty = clamp(this.pos[1], m, this.H - 1.2 * m);
        this.seek(tx, ty, this.fast ? 12 : 3, this.fast ? 60 : 20, 0.8);
        if (this.fast && Math.hypot(tx - this.pos[0], ty - this.pos[1]) < 4) this.fast = false;
        this.vel[0] *= 1 - damp(this.fast ? 0 : 3, dt);
        this.vel[1] *= 1 - damp(this.fast ? 0 : 3, dt);
        g.float = 0.5;
        g.lookAt = null;
        if (this.flags.talk) s.until = now + 1.2;
        else if (now > (s.until ?? 0)) {
          this.fast = false;
          if (this.persona === 'calm') this.homeFromTrip(now);
          else this.enter('QITMIR_IDLE', now, { until: now + 2 });
        }
        return;
      }

      case 'LOGO_LANDING':
        return this.logo(now, dt);
      case 'TEXT_INTERACTION':
        return this.text(now, dt);
      case 'HIDE_AND_SEEK':
        return this.hide(now, dt);
      case 'WATCHING_PAGE':
        return this.watch(now, dt);
    }
  }

  private docked() {
    this.mode = 'DOCKED';
    this.fast = false;
    this.clip = this.shadow = this.tether = null;
    this.events.push({ type: 'docked' });
  }

  private canGrab(now: number): boolean {
    const p = this.ptr;
    return this.persona === 'qitmir' && !this.touch && this.armed && (this.cool.grab ?? 0) <= now && !this.flags.interactive && !this.flags.selecting && !p.down;
  }

  private surprise(now: number) {
    const B = this.box;
    const p = this.ptr;
    const dx = this.pos[0] - p.x;
    const dy = this.pos[1] - p.y;
    const d = Math.hypot(dx, dy) || 1;
    this.vel = [(dx / d) * 5 * B, (dy / d) * 3 * B - 2 * B];
    this.cool.surprise = now + COOL.surprise;
    this.shadow = null;
    this.clip = null;
    this.enter('SURPRISED', now);
  }

  private victory(now: number, key: SayKey) {
    this.say(key);
    this.vel = [this.vel[0] * 0.3, -1.5 * this.box];
    this.enter('VICTORY', now);
  }

  private salto(now: number) {
    this.cool.salto = now + COOL.salto;
    this.lastGame = 'salto';
    this.enter('ACROBATIC_FLIGHT', now, { next: this.mode === 'CHASING_CURSOR' ? 'CHASING_CURSOR' : 'QITMIR_IDLE' });
  }

  private throwAway(now: number) {
    const B = this.box;
    const p = this.ptr;
    this.tether = null;
    this.armed = false;
    this.cool.grab = now + COOL.grab;
    // Grip broken: it keeps its own momentum and the jerk flings it the other way.
    let vx = this.vel[0] - 0.45 * p.vx;
    let vy = this.vel[1] - 0.45 * p.vy - 2 * B;
    const v = Math.hypot(vx, vy) || 1;
    const top = clamp(v, 6 * B, 16 * B);
    vx *= top / v;
    vy *= top / v;
    this.vel = [vx, vy];
    const r = () => this.random() - 0.5;
    this.w = [r() * 8, r() * 6, -(vx >= 0 ? 1 : -1) * (7 + this.random() * 3)];
    this.say('thrown');
    this.enter('THROWN_AWAY', now);
  }

  /**
   * Which way it hangs from the cursor: it holds on rather than dangling like a dead weight — its thrusters keep it
   * nearly upright, below and behind the raised hand, swinging about that.
   */
  private hangDir(): Vec2 {
    const n = Math.hypot(this.grip[0], this.grip[1]) || 1;
    const x = (-0.6 * this.grip[0]) / n;
    const y = 0.4 - (0.6 * this.grip[1]) / n;
    const m = Math.hypot(x, y) || 1;
    return [x / m, y / m];
  }

  /** Rope length: the gripping hand's distance from the origin. */
  private rope() {
    return Math.hypot(this.grip[0], this.grip[1]) * this.size;
  }

  private hang(dt: number) {
    const B = this.box;
    const p = this.ptr;
    const L = this.rope();
    const [ex, ey] = this.hangDir();
    const n = 4;
    const h = dt / n;
    let stretch = 0;
    for (let i = 0; i < n; i++) {
      const dx = this.pos[0] - p.x;
      const dy = this.pos[1] - p.y;
      const len = Math.hypot(dx, dy) || 1e-6;
      const ux = dx / len;
      const uy = dy / len;
      stretch = len - L;
      const radial = this.vel[0] * ux + this.vel[1] * uy;
      const f = -420 * stretch - 22 * radial;
      this.vel[0] += (f * ux + ex * T.gravity * B - 1.1 * this.vel[0]) * h;
      this.vel[1] += (f * uy + ey * T.gravity * B - 1.1 * this.vel[1]) * h;
      this.pos[0] += this.vel[0] * h;
      this.pos[1] += this.vel[1] * h;
    }
    // Never stretched past twice its length.
    const dx = this.pos[0] - p.x;
    const dy = this.pos[1] - p.y;
    const len = Math.hypot(dx, dy) || 1e-6;
    if (len > 2.2 * L) {
      this.pos = [p.x + (dx / len) * 2.2 * L, p.y + (dy / len) * 2.2 * L];
      stretch = 1.2 * L;
    }
    this.tension = clamp(stretch / (1.2 * L), 0, 1);
    // The body turns so the hand points up the rope.
    const roll = wrap(ang(-dx, -dy) - ang(this.grip[0], this.grip[1]));
    this.turn(qEuler(0, 0, roll), 90, 0.7, dt);
    const [hx, hy] = this.hand();
    this.tether = { hx, hy, px: p.x, py: p.y, tension: this.tension };
  }

  /** Where the gripping hand is on screen now (the body's roll applied). */
  private hand(): Vec2 {
    const q = this.q;
    const roll = Math.atan2(2 * (q[3] * q[2] + q[0] * q[1]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
    // Screen y is down: a counter-clockwise roll turns (x, y) the other way round.
    const c = Math.cos(roll);
    const sn = Math.sin(roll);
    const [gx, gy] = [this.grip[0] * this.size, this.grip[1] * this.size];
    return [this.pos[0] + gx * c + gy * sn, this.pos[1] - gx * sn + gy * c];
  }

  // ---------- games ----------

  /**
   * One of its tricks on request (a local command such as "salto qil": no AI involved). Only when it is out and free to
   * move — not on the way home, not while thrown or dizzy. Returns whether it obeyed.
   */
  command(act: string, now: number): boolean {
    // Resting in the launcher: comes out for it (unless something needs it home).
    if (this.mode === 'DOCKED' && !this.flags.dock && this.home && ['salto', 'dance', 'happy', 'wave'].includes(act)) this.liftOff(now);
    const busy = ['DOCKED', 'RETURNING', 'THROWN_AWAY', 'TUMBLING', 'DIZZY', 'CURSOR_GRAB'];
    if (busy.includes(this.mode)) return false;
    // "Sunny!": it stops what it is doing and comes to attention where the person can see it — quickly, with its
    // thruster (cinematic: acceleration, trail, banking, a controlled stop) — to listen and answer right there.
    if (act === 'summon') {
      this.tether = this.clip = this.shadow = null;
      this.sizeTo = 1;
      this.fast = true;
      this.enter('TALKING', now, { until: now + 4 });
      return true;
    }
    this.tether = this.clip = this.shadow = null;
    this.sizeTo = 1;
    if (act === 'salto') this.salto(now);
    else if (act === 'angry') this.enter('ANGRY', now, { dur: 1.3, next: 'CHASING_CURSOR', lead: 1.3 });
    else if (act === 'sleep') {
      // Asleep from now: the next sign of the person (not the key press that asked) wakes it.
      this.userAt = now - 0.5;
      this.enter('SLEEPING', now, { x: this.pos[0] });
    } else if (act === 'chase') {
      this.armed = true;
      this.chase(now);
    } else if (act === 'wave') this.enter('HIGH_FIVE', now);
    else if (act === 'dance' || act === 'happy' || act === 'peace') {
      this.vel = [this.vel[0] * 0.3, -1.5 * this.box];
      this.enter('VICTORY', now);
    } else return false;
    return true;
  }

  /** Starts one game now if the page allows it (QA and tests; the robot normally picks its own). */
  play(game: Game, now: number): boolean {
    if (this.mode === 'DOCKED' || this.mode === 'RETURNING') return false;
    this.tether = null;
    this.clip = null;
    return this.startGame(now, game);
  }

  private startGame(now: number, only?: Game): boolean {
    if (!only && now < (this.cool.any ?? -1e9)) return false;
    const T2 = this.targets;
    const options: [Game, number][] = [];
    const ok = (game: Game) => (only ? game === only : (this.cool[game] ?? -1e9) <= now && game !== this.lastGame);
    if (ok('logo') && this.perch()) options.push(['logo', 3]);
    if (ok('text') && T2.texts.some((x) => x.letters.length)) options.push(['text', 3]);
    if (ok('hide') && T2.hides.length) options.push(['hide', 2.5]);
    if (ok('watch') && T2.sights.length) options.push(['watch', 2]);
    // A calm robot does not leave its launcher just for a salto (it does one when asked).
    if (ok('salto') && (this.persona === 'qitmir' || only)) options.push(['salto', 1]);
    if (!options.length) return false;
    let r = this.random() * options.reduce((a, [, w]) => a + w, 0);
    let game = options[options.length - 1][0];
    for (const [name, w] of options) {
      r -= w;
      if (r <= 0) {
        game = name;
        break;
      }
    }
    this.cool[game] = now + COOL[game];
    this.lastGame = game;
    this.shadow = null;
    if (game === 'salto') {
      this.salto(now);
      return true;
    }
    if (game === 'logo') {
      this.enter('LOGO_LANDING', now, { phase: 'look' });
    } else if (game === 'text') {
      const list = T2.texts.filter((x) => x.letters.length);
      const pick = list[Math.floor(this.random() * list.length)];
      this.enter('TEXT_INTERACTION', now, { phase: 'fly', id: pick.id, i: 0, ...this.flight(this.letterSpot(pick.letters[0]).hover, now) });
    } else if (game === 'hide') {
      const pick = T2.hides[Math.floor(this.random() * T2.hides.length)];
      const x = 0.3 + 0.4 * this.random();
      this.enter('HIDE_AND_SEEK', now, { phase: 'fly', id: pick.id, x, ...this.flight(this.hideSpot(pick.rect, x).hover, now) });
    } else {
      this.enter('WATCHING_PAGE', now, { sight: T2.sights[Math.floor(this.random() * T2.sights.length)], until: now + 2.4 + this.random(), count: 0 });
    }
    return true;
  }

  /** A curved flight: out to one side of the straight line (it goes round, it does not slide). */
  private flight(to: Vec2, now: number, speed = 5): Plan {
    const from: Vec2 = [...this.pos];
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const d = Math.hypot(dx, dy) || 1;
    const bend = Math.min(1.2 * this.box, d * 0.45) * (this.random() < 0.5 ? -1 : 1);
    const ctrl: Vec2 = [(from[0] + to[0]) / 2 - (dy / d) * bend, (from[1] + to[1]) / 2 + (dx / d) * bend - 0.4 * this.box];
    return { from, ctrl, dur: clamp(d / (speed * this.box), 0.6, 2.2), t1: now };
  }

  /** Follows the flight toward `to` (which may move with the page); 0–1 progress. */
  private follow(to: Vec2, now: number): number {
    const s = this.plan;
    const u = clamp((now - (s.t1 ?? now)) / (s.dur ?? 1), 0, 1);
    const at = bez2(s.from ?? this.pos, s.ctrl ?? to, to, Math.min(1, ease(u) + 0.05));
    this.seek(at[0], at[1], 14, 70, 0.35);
    return u;
  }

  /** Feet on a surface at `feet` (screen y), robot at size `ps`: where the origin goes. */
  private stand(x: number, feet: number, ps: number): Vec2 {
    return [x, feet - 0.45 * this.box * ps];
  }

  private perch(): { at: Vec2; feet: number; ps: number } | null {
    const r = this.targets.logo;
    if (!r || r.w < 8 || r.y + r.h < 4 || r.y > this.H - 60 || r.x + r.w < 0 || r.x > this.W) return null;
    const ps = 0.58;
    const half = 0.45 * this.box * ps;
    // On its top edge when there is room above; under a header at the very top, on its lower lip in front of it.
    const onTop = r.y - 2 * half > 8;
    const feet = onTop ? r.y + 1 : r.y + r.h * 0.94;
    const x = clamp(r.x + r.w * 0.62, 0.45 * this.box * ps, this.W - 0.45 * this.box * ps);
    return { at: this.stand(x, Math.max(feet, 2 * half + 4), ps), feet: Math.max(feet, 2 * half + 4), ps };
  }

  private logo(now: number, dt: number) {
    const B = this.box;
    const p = this.ptr;
    const g = this.g;
    const s = this.plan;
    const t = now - this.since;
    const spot = this.perch();
    if (!spot) return this.endGame(now);
    const logo = this.targets.logo!;
    const centre: Vec2 = [logo.x + logo.w / 2, logo.y + logo.h / 2];
    if (s.phase !== 'rest' && this.moving(now, 2.5)) return this.endGame(now, 'CHASING_CURSOR');

    if (s.phase === 'look') {
      g.lookAt = centre;
      this.hover(dt);
      if (t > 0.45) this.plan = { phase: 'fly', ...this.flight([spot.at[0], spot.at[1] - 0.5 * B * spot.ps], now) };
      return;
    }
    if (s.phase === 'fly') {
      g.lookAt = centre;
      this.sizeTo = 1 - (1 - spot.ps) * clamp((now - (s.t1 ?? now)) / (s.dur ?? 1), 0, 1);
      if (this.follow([spot.at[0], spot.at[1] - 0.5 * B * spot.ps], now) >= 1) this.plan = { phase: 'land', t1: now, ptr: [p.x, p.y] };
      return;
    }
    const feetY = this.pos[1] + 0.45 * B * this.size;
    // The cursor moved since it began to land: off again.
    const ptr = s.ptr ?? [p.x, p.y];
    // A real move (not a twitch, not the pointer slowly coming over to it) sends it off again.
    const left = p.known && Math.hypot(p.x - ptr[0], p.y - ptr[1]) > 0.25 * B && this.moving(now, 2);
    if (left || (s.phase === 'rest' && now - (s.t1 ?? now) > 9)) {
      this.vel = [0, -4 * B];
      return this.endGame(now, left && !this.touch ? 'CHASING_CURSOR' : 'QITMIR_IDLE');
    }
    if (s.phase === 'land') {
      this.sizeTo = spot.ps;
      this.seek(spot.at[0], spot.at[1], 2.5, 30, 0.6);
      g.look = [0, -0.4];
      g.float = 0.3;
      const near = Math.hypot(spot.at[0] - this.pos[0], spot.at[1] - this.pos[1]);
      this.shadow = { x: this.pos[0], y: spot.feet, w: 0.6 * B * spot.ps, o: clamp(1 - near / (0.6 * B), 0, 1) * 0.5 };
      if (near < 2 || now - (s.t1 ?? now) > 1.6) {
        this.say('logo', 0.6);
        this.plan = { phase: 'rest', t1: now, ptr };
      }
      return;
    }
    // Resting on the logo: content, half-closed eyes, looking around; off again when the cursor moves.
    this.pos[0] += (spot.at[0] - this.pos[0]) * damp(10, dt);
    this.pos[1] += (spot.at[1] - this.pos[1]) * damp(10, dt);
    this.vel = [0, 0];
    this.shadow = { x: this.pos[0], y: Math.min(spot.feet, feetY + 2), w: 0.6 * B * spot.ps, o: 0.5 };
    g.float = 0.15;
    g.eyeOpen = 0.62;
    g.smirk = 0.9;
    g.smile = 1.15;
    g.head[1] += 0.25 * Math.sin((now - (s.t1 ?? now)) * 0.7);
    g.look = [0.5 * Math.sin((now - (s.t1 ?? now)) * 0.7), -0.1];
  }

  private letterSpot(r: Rect): { at: Vec2; hover: Vec2; feet: number; ps: number } {
    const ps = clamp((r.h * 1.5) / (0.9 * this.box), 0.4, 0.62);
    // The measured box includes the font's ascent above the glyph: the letter itself starts a little lower.
    const feet = r.y + r.h * 0.17;
    const at = this.stand(r.x + r.w / 2, feet, ps);
    return { at, hover: [at[0], at[1] - 0.6 * this.box * ps], feet, ps };
  }

  private text(now: number, dt: number) {
    const B = this.box;
    const g = this.g;
    const s = this.plan;
    const word = this.targets.texts.find((x) => x.id === s.id);
    const letter = word?.letters[s.i ?? 0];
    if (!word || !letter) return this.endGame(now);
    const spot = this.letterSpot(letter);
    if (this.moving(now, 2.5) || (this.ptr.inside && Math.hypot(this.ptr.x - this.pos[0], this.ptr.y - this.pos[1]) < 0.8 * B && now - this.ptr.moved < 0.2 && !this.approaching())) {
      return this.endGame(now, this.touch ? 'QITMIR_IDLE' : 'CHASING_CURSOR');
    }
    g.lookAt = [letter.x + letter.w / 2, letter.y + letter.h / 2];
    if (s.phase === 'fly') {
      this.sizeTo = spot.ps;
      if (this.follow(spot.hover, now) >= 1) this.plan = { ...s, phase: 'land', t1: now };
      return;
    }
    this.shadow = { x: this.pos[0], y: spot.feet, w: 0.5 * B * spot.ps, o: 0.35 };
    if (s.phase === 'land') {
      this.seek(spot.at[0], spot.at[1], 3, 40, 0.5);
      g.float = 0.2;
      if (Math.hypot(spot.at[0] - this.pos[0], spot.at[1] - this.pos[1]) < 2 || now - (s.t1 ?? now) > 1.2) {
        // Touches the letter: the word gives a little bounce (a visual effect on the page only).
        this.events.push({ type: 'poke', id: word.id });
        if (!s.touched) this.say('text', 0.5);
        this.plan = { ...s, phase: 'look', t1: now, touched: true };
      }
      return;
    }
    // Looks it over, head down; then hops to the next letter or flies off.
    this.pos[0] += (spot.at[0] - this.pos[0]) * damp(12, dt);
    this.pos[1] += (spot.at[1] - this.pos[1]) * damp(12, dt);
    this.vel = [0, 0];
    const u = now - (s.t1 ?? now);
    this.offY -= 0.05 * B * spot.ps * Math.max(0, Math.sin(Math.PI * clamp(u / 0.25, 0, 1)));
    g.float = 0.1;
    g.head[0] += 0.26;
    g.head[2] += 0.12 * Math.sin(u * 2.2);
    g.look = [0.1 * Math.sin(u * 3), -0.75];
    g.eyeOpen = 1.05;
    if (u < 0.9) return;
    const next = (s.i ?? 0) + 1;
    if (next < word.letters.length) {
      this.plan = { ...s, phase: 'fly', i: next, ...this.flight(this.letterSpot(word.letters[next]).hover, now, 3) };
      this.plan.dur = Math.min(this.plan.dur ?? 0.6, 0.6);
    } else {
      this.vel = [0, -3 * B];
      this.endGame(now);
    }
  }

  private hideSpot(r: Rect, x: number): { at: Vec2; hover: Vec2; hs: number } {
    const hs = 0.8;
    const cx = r.x + r.w * x;
    // Only the top of the head and the eyes stay above the card's top edge.
    return { at: [cx, r.y + 0.1 * this.box * hs], hover: [cx, r.y - 0.75 * this.box * hs], hs };
  }

  private hide(now: number, dt: number) {
    const B = this.box;
    const p = this.ptr;
    const g = this.g;
    const s = this.plan;
    const card = this.targets.hides.find((x) => x.id === s.id)?.rect;
    const gone = !card || card.y < 70 || card.y > this.H - 40;
    if (!card || (gone && s.phase !== 'pop')) {
      if (this.clip) {
        this.plan = { ...s, phase: 'pop' };
        this.vel[1] = -6 * B;
        return;
      }
      return this.endGame(now);
    }
    const spot = this.hideSpot(card, s.x ?? 0.5);
    const eyes: Vec2 = [this.pos[0], this.pos[1] - 0.2 * B * this.size];
    if (s.phase === 'fly') {
      if (this.moving(now, 2.5)) return this.endGame(now, 'CHASING_CURSOR');
      this.sizeTo = spot.hs;
      g.lookAt = [card.x + card.w / 2, card.y];
      if (this.follow(spot.hover, now) >= 1) this.plan = { ...s, phase: 'sink', t1: now };
      return;
    }
    this.clip = { edge: card.y, left: card.x, right: card.x + card.w };
    if (s.phase === 'sink' || s.phase === 'peek') {
      const bob = s.phase === 'peek' ? 0.07 * B * spot.hs * Math.max(0, Math.sin((now - (s.t1 ?? now)) * 1.4)) : 0;
      this.pos[0] += (spot.at[0] - this.pos[0]) * damp(6, dt);
      this.pos[1] += (spot.at[1] - bob - this.pos[1]) * damp(s.phase === 'sink' ? 4 : 10, dt);
      this.vel = [0, 0];
      g.float = 0;
      g.lookAt = p.known && p.inside ? [p.x, p.y] : null;
      g.lookK = 0.5;
      g.smirk = 1;
      if (s.phase === 'sink' && Math.abs(spot.at[1] - this.pos[1]) < 1.5) {
        this.say('hide', 0.6);
        this.plan = { ...s, phase: 'peek', t1: now };
      }
      // Found: the cursor (or a finger) came close to the eyes — out in a hurry, off to somewhere else.
      const found = p.known && p.inside && Math.hypot(p.x - eyes[0], p.y - eyes[1]) < 1.8 * B && now - p.moved < 0.3;
      if (found || now - (s.t1 ?? now) > 10) {
        if (found) this.say('found', 0.8);
        this.vel = [(this.random() - 0.5) * 3 * B, -7 * B];
        this.plan = { ...s, phase: 'pop' };
      }
      return;
    }
    // Popping out: up until the feet clear the edge, then on to something else.
    g.eyeOpen = 1.2;
    g.squint = 0;
    this.vel[1] = Math.min(this.vel[1], -4 * B);
    if (this.pos[1] + 0.45 * B * this.size < card.y - 2) {
      this.clip = null;
      this.cool.any = now;
      this.sizeTo = 1;
      if (!this.startGame(now)) this.endGame(now, !this.touch && p.inside ? 'CHASING_CURSOR' : 'QITMIR_IDLE');
    }
  }

  private watch(now: number, dt: number) {
    const B = this.box;
    const g = this.g;
    const s = this.plan;
    const sight = s.sight;
    if (!sight || this.moving(now) || (this.touch && this.ptr.down)) return this.endGame(now, this.touch ? 'QITMIR_IDLE' : 'CHASING_CURSOR');
    const cx = sight.x + sight.w / 2;
    const cy = sight.y + sight.h / 2;
    const side = this.pos[0] < cx ? -1 : 1;
    const tx = clamp(cx + side * (sight.w / 2 + 0.9 * B), 0.6 * B, this.W - 0.6 * B);
    const ty = clamp(cy, 0.8 * B, this.H - 0.8 * B);
    this.seek(tx, ty, 2.2, 12, 1.2);
    this.avoid(dt);
    g.lookAt = [cx, cy];
    g.lookK = 0.9;
    g.eyeOpen = 1.04;
    g.head[2] += 0.08 * Math.sin(now * 1.3);
    if (now < (s.until ?? 0)) return;
    const others = this.targets.sights.filter((x) => x !== sight);
    if ((s.count ?? 0) < 1 && others.length && this.random() < 0.6) {
      this.plan = { sight: others[Math.floor(this.random() * others.length)], until: now + 2.2 + this.random(), count: (s.count ?? 0) + 1 };
    } else this.endGame(now);
  }

  // ---------- movement ----------

  private hover(dt: number) {
    this.vel[0] *= 1 - damp(2.5, dt);
    this.vel[1] *= 1 - damp(2.5, dt);
    this.avoid(dt);
  }

  /** Phones: out of the way, just above its launcher (or at the right edge). */
  private park(dt: number, now: number) {
    if (now - this.ptr.t < 2.5) return;
    const B = this.box;
    const [x, y] = this.home ? [this.home.x - 0.2 * B, this.home.y - 1.9 * B] : [this.W - 0.7 * B, this.H * 0.6];
    this.seek(x, y, 2.5, 12, 1.5);
    void dt;
  }

  private followFinger(now: number, dt: number) {
    const B = this.box;
    const p = this.ptr;
    if (this.take('tapped', now)) return this.victory(now, 'tap');
    // A tap: looks, flies to just above the finger. A swipe: follows behind it.
    const sp = Math.hypot(p.vx, p.vy);
    const bx = sp > 200 ? (-p.vx / sp) * 0.9 * B : 0;
    const by = sp > 200 ? (-p.vy / sp) * 0.9 * B : 0;
    this.g.lookAt = [p.x, p.y];
    this.seek(p.x + bx, p.y + by - 1.1 * B, 8, 26, 1.4);
    this.avoid(dt);
    if (!p.down && now - p.t > 2.5) this.endGame(now);
  }

  private seek(tx: number, ty: number, top: number, accel: number, arrive: number) {
    const B = this.box;
    // Mood physics: a happy or angry robot flies faster, a sad or sleepy one slower.
    top *= this.feel?.speed ?? 1;
    const dx = tx - this.pos[0];
    const dy = ty - this.pos[1];
    const d = Math.hypot(dx, dy);
    const want = d < 1e-6 ? 0 : Math.min(top * B, (top * B * d) / (arrive * B));
    const wx = d < 1e-6 ? 0 : (dx / d) * want;
    const wy = d < 1e-6 ? 0 : (dy / d) * want;
    let ax = (wx - this.vel[0]) * 6;
    let ay = (wy - this.vel[1]) * 6;
    const a = Math.hypot(ax, ay);
    const max = accel * B;
    if (a > max) {
      ax *= max / a;
      ay *= max / a;
    }
    this.acc[0] += ax;
    this.acc[1] += ay;
  }

  /** Keeps off controls (buttons, links, fields): pushed out of them, with a little hop over. */
  private avoid(dt: number) {
    const B = this.box;
    const r = 0.5 * B * this.size;
    let lift = 0;
    for (const c of this.targets.colliders) {
      const cx = clamp(this.pos[0], c.x, c.x + c.w);
      const cy = clamp(this.pos[1], c.y, c.y + c.h);
      let dx = this.pos[0] - cx;
      let dy = this.pos[1] - cy;
      let d = Math.hypot(dx, dy);
      if (d >= r) continue;
      if (d < 1e-3) {
        dx = 0;
        dy = -1;
        d = 1;
      }
      const push = (r - Math.min(d, r)) / r;
      this.acc[0] += (dx / d) * push * 30 * B;
      this.acc[1] += (dy / d) * push * 30 * B;
      lift = Math.max(lift, push);
    }
    this.hop += (lift - this.hop) * damp(8, dt);
  }

  private move(dt: number) {
    const B = this.box;
    const physical = this.mode === 'THROWN_AWAY' || this.mode === 'TUMBLING' || this.mode === 'BUMPED';
    const kinematic = this.mode === 'CURSOR_GRAB' || this.mode === 'CURSOR_ATTACHED';
    if (!kinematic) {
      this.vel[0] += this.acc[0] * dt;
      this.vel[1] += this.acc[1] * dt;
      const drag = physical ? 0 : T.drag;
      this.vel[0] *= 1 - damp(drag, dt);
      this.vel[1] *= 1 - damp(drag, dt);
      const v = Math.hypot(...this.vel);
      if (!physical && v > T.cap * B) {
        this.vel[0] *= (T.cap * B) / v;
        this.vel[1] *= (T.cap * B) / v;
      }
      this.pos[0] += this.vel[0] * dt;
      this.pos[1] += this.vel[1] * dt;
    }
    if (this.mode !== 'CURSOR_GRAB') this.hop *= 1 - damp(3, dt);
    if (this.mode !== 'RETURNING') this.edges(physical);
    // Banks into its flight (roll and a turn toward where it goes); physics states and the rope set their own.
    const own = physical || this.mode === 'PATTED' || this.mode === 'CURSOR_ATTACHED' || this.mode === 'DIZZY' || this.mode === 'RECOVERING' || this.mode === 'ANGRY' || this.mode === 'RETURNING';
    if (!own) {
      const [vx, vy] = this.vel;
      const target = qEuler(clamp(vy / (12 * B), -0.22, 0.22), clamp(vx / (16 * B), -0.45, 0.45), clamp(-vx / (22 * B) - this.acc[0] / (260 * B), -0.4, 0.4));
      this.turn(target, 70 * (this.feel?.turn ?? 1), 0.85, dt);
    }
    this.spin(dt);
  }

  /** The viewport is a box: a thrown robot bounces off its walls, a flying one is held inside. */
  private edges(bounce: boolean) {
    const B = this.box;
    const s = this.size;
    const minX = 0.42 * B * s;
    const maxX = this.W - 0.42 * B * s;
    const minY = 0.5 * B * s;
    const maxY = this.H - 0.47 * B * s;
    const hit = (i: 0 | 1, lo: number, hi: number) => {
      if (this.pos[i] < lo || this.pos[i] > hi) {
        const out = this.pos[i] < lo ? -1 : 1;
        this.pos[i] = out < 0 ? lo : hi;
        if (this.vel[i] * out > 0) {
          if (bounce) {
            const tangent = this.vel[1 - i];
            this.vel[i] = -this.vel[i] * 0.5;
            this.vel[1 - i] = tangent * 0.85;
            // The knock sets it spinning the other way round.
            this.w[2] = clamp(-this.w[2] * 0.6 + (tangent / B) * 0.25 * out, -T.maxSpin, T.maxSpin);
          } else this.vel[i] = 0;
        }
      }
    };
    hit(0, minX, Math.max(minX, maxX));
    hit(1, minY, Math.max(minY, maxY));
  }

  /** Angular spring toward `target` (critically damped at zeta 1): angular momentum, not snapping. */
  private turn(target: Quat, k: number, zeta: number, dt: number) {
    let e = qMul(target, qConj(this.q));
    if (e[3] < 0) e = [-e[0], -e[1], -e[2], -e[3]];
    const sn = Math.hypot(e[0], e[1], e[2]);
    const angle = 2 * Math.atan2(sn, e[3]);
    const f = sn > 1e-9 ? angle / sn : 2;
    const c = 2 * zeta * Math.sqrt(k);
    for (let i = 0; i < 3; i++) this.w[i] += (k * e[i] * f - c * this.w[i]) * dt;
  }

  private spin(dt: number) {
    const m = Math.hypot(...this.w);
    if (m > T.maxSpin) for (let i = 0; i < 3; i++) this.w[i] *= T.maxSpin / m;
    const dq = qMul([this.w[0], this.w[1], this.w[2], 0], this.q);
    this.q = qNorm([this.q[0] + 0.5 * dq[0] * dt, this.q[1] + 0.5 * dq[1] * dt, this.q[2] + 0.5 * dq[2] * dt, this.q[3] + 0.5 * dq[3] * dt]);
  }

  // ---------- pose ----------

  private pose(now: number): QPose {
    const B = this.box;
    const g = this.g;
    const t = now;
    // The float fades in after lift-off, so the first frames match the launcher robot it replaces.
    const amp = g.float * clamp((now - this.outAt) / 0.8, 0, 1);
    const fy = amp * B * (0.03 * Math.sin(0.95 * t) + 0.01 * Math.sin(2.3 * t + 1.3));
    const fx = amp * B * 0.012 * Math.sin(0.41 * t + 0.7);
    const head: Vec3 = [g.head[0] + amp * 0.03 * Math.sin(0.8 * t - 0.5), g.head[1] + amp * 0.06 * Math.sin(0.33 * t - 0.7), g.head[2] + amp * 0.03 * Math.sin(0.57 * t + 0.4)];
    const armL: Vec3 = [g.armL[0], g.armL[1], g.armL[2] + amp * 0.05 * Math.sin(1.1 * t)];
    const armR: Vec3 = [g.armR[0], g.armR[1], g.armR[2] - amp * 0.05 * Math.sin(1.1 * t + 0.8)];
    let look = g.look;
    if (g.lookAt) {
      const dx = clamp((g.lookAt[0] - this.pos[0]) / (3 * B), -1, 1);
      const dy = clamp((g.lookAt[1] - this.pos[1]) / (3 * B), -1, 1);
      head[1] += dx * 0.55 * g.lookK;
      head[0] += dy * 0.32 * g.lookK;
      look = [dx * 0.9, -dy * 0.7];
    }
    // Blinks (not while asleep or hanging on): quick, at uneven times.
    const blink = (t % 4.7 < 0.12 || (t % 9.3 > 5.1 && t % 9.3 < 5.22)) && g.eyeOpen > 0.5;
    const hop = this.hop;
    return {
      visible: this.mode !== 'DOCKED',
      alpha: this.alpha,
      x: this.pos[0] + fx,
      y: this.pos[1] - fy + this.offY - hop * 0.22 * B,
      scale: this.size * (1 + 0.07 * hop),
      orient: qMul(this.q, this.extra),
      body: g.body,
      head,
      armL,
      armR,
      look,
      eyeOpen: blink ? 0.1 : g.eyeOpen,
      squint: g.squint,
      smirk: g.smirk,
      smile: g.smile,
      glow: g.glow,
      anger: g.anger,
      energy: g.energy,
      sleep: g.sleep,
      speed: Math.hypot(...this.vel),
      thrust: this.thrust,
      clip: this.clip,
      shadow: this.shadow,
      tether: this.mode === 'CURSOR_ATTACHED' ? this.tether : null,
    };
  }
}
