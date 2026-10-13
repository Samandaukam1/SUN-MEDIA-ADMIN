/**
 * One controller for every partner bubble in the hero: which partner is in which slot, the queue, the limits,
 * popping, coming back and the slow rotation. Pure logic (no DOM, no three.js, no timers): the scene calls
 * tick(dt) from its frame loop, so nothing runs while the hero is off screen or the tab is hidden.
 */

export type Edge = 'left' | 'right' | 'top' | 'here';
export type BubblePhase = 'entering' | 'floating' | 'exiting' | 'popping';
export type BubblePartner = { id: string; name: string; logoUrl: string };

export type Bubble = {
  key: number;
  slot: number;
  partner: BubblePartner;
  phase: BubblePhase;
  /** Controller time (s) the phase started; may lie in the future for staggered first appearances. */
  phaseStart: number;
  phaseDuration: number;
  /** Edge it enters from or leaves to; 'here' = grows / fades in place. */
  edge: Edge;
  floatingSince: number | null;
  /** Random 0…1 picked at spawn: entry offset and arc, so no two arrivals take the same path. */
  seed: number;
};

/** Never more than five bubbles at once, whatever the screen or the number of partners. */
export const MAX_BUBBLES = 5;

export const BUBBLE_TIMINGS = {
  pop: 0.38,
  respawnMin: 2,
  respawnMax: 4,
  enterMin: 1.6,
  enterMax: 2.8,
  exit: 2.4,
  rotateMin: 15,
  rotateMax: 25,
  appear: 1.1,
  appearDelay: 0.9,
  appearStagger: 0.3,
  /** prefers-reduced-motion: short fades in place instead of travel. */
  calmPop: 0.2,
  calmAppear: 0.6,
  calmExit: 0.8,
} as const;

export type BubbleOptions = {
  capacity: number;
  /** Edges a bubble in this slot may enter from / leave to (chosen so the path never crosses text). */
  edgesForSlot: (slot: number) => Edge[];
  reducedMotion?: boolean;
  random?: () => number;
};

export class BubbleController {
  private time = 0;
  private items: Bubble[] = [];
  private respawnAt: (number | null)[] = [];
  private partnerList: BubblePartner[] = [];
  private lastShown = new Map<string, number>();
  private nextKey = 1;
  private nextRotation = Infinity;
  private started = false;
  private capacity: number;
  private edgesForSlot: (slot: number) => Edge[];
  private calm: boolean;
  private random: () => number;
  /** Bumps whenever bubbles appear, disappear or change phase (the overlay buttons re-render on it). */
  version = 0;

  constructor(options: BubbleOptions) {
    this.capacity = Math.max(0, Math.min(MAX_BUBBLES, Math.floor(options.capacity)));
    this.edgesForSlot = options.edgesForSlot;
    this.calm = options.reducedMotion ?? false;
    this.random = options.random ?? Math.random;
  }

  get now() {
    return this.time;
  }

  get bubbles(): readonly Bubble[] {
    return this.items;
  }

  get partners(): readonly BubblePartner[] {
    return this.partnerList;
  }

  /** Bubbles that stay: everything except the ones leaving or bursting. */
  private get settledCount() {
    return this.items.filter((b) => b.phase === 'entering' || b.phase === 'floating').length;
  }

  /** How many slots are in use: the capacity, or fewer when there are fewer partners. */
  get target() {
    return Math.min(this.capacity, this.partnerList.length);
  }

  progress(b: Bubble): number {
    if (b.phaseDuration <= 0) return 1;
    return Math.min(1, Math.max(0, (this.time - b.phaseStart) / b.phaseDuration));
  }

  private between(min: number, max: number) {
    return min + (max - min) * this.random();
  }

  private edgeFor(slot: number): Edge {
    if (this.calm) return 'here';
    const edges = this.edgesForSlot(slot).filter((e) => e !== 'here');
    if (!edges.length) return 'here';
    return edges[Math.min(edges.length - 1, Math.floor(this.random() * edges.length))];
  }

  private bump() {
    this.version++;
  }

  /** Least recently shown partner that no bubble (arriving, floating, leaving or bursting) is showing. */
  private nextPartner(): BubblePartner | null {
    const shown = new Set(this.items.map((b) => b.partner.id));
    let best: BubblePartner | null = null;
    let bestAt = Infinity;
    for (const p of this.partnerList) {
      if (shown.has(p.id)) continue;
      const at = this.lastShown.get(p.id) ?? -Infinity;
      if (best === null || at < bestAt) {
        best = p;
        bestAt = at;
      }
    }
    return best;
  }

  private spawn(slot: number, edge: Edge, duration: number, start = this.time): boolean {
    if (this.items.length >= this.capacity || this.settledCount >= this.target) return false;
    if (this.items.some((b) => b.slot === slot)) return false;
    const partner = this.nextPartner();
    if (!partner) return false;
    this.lastShown.set(partner.id, start);
    this.items.push({ key: this.nextKey++, slot, partner, phase: 'entering', phaseStart: start, phaseDuration: duration, edge, floatingSince: null, seed: this.random() });
    this.respawnAt[slot] = null;
    this.bump();
    return true;
  }

  /** Sends a bubble off to the side (no burst): rotation, a removed partner or a smaller screen. */
  private retire(b: Bubble) {
    if (b.phase === 'exiting' || b.phase === 'popping') return;
    b.phase = 'exiting';
    b.phaseStart = Math.max(this.time, b.phaseStart);
    b.phaseDuration = this.calm ? BUBBLE_TIMINGS.calmExit : BUBBLE_TIMINGS.exit;
    b.edge = this.edgeFor(b.slot);
    this.bump();
  }

  private scheduleEmptySlots(delay: number) {
    for (let slot = 0; slot < this.target; slot++) {
      if (!this.items.some((b) => b.slot === slot && (b.phase === 'entering' || b.phase === 'floating')) && this.respawnAt[slot] == null) {
        this.respawnAt[slot] = this.time + delay;
      }
    }
  }

  private scheduleRotation() {
    if (this.partnerList.length > this.target && this.target > 0) {
      if (this.nextRotation === Infinity) this.nextRotation = this.time + this.between(BUBBLE_TIMINGS.rotateMin, BUBBLE_TIMINGS.rotateMax);
    } else {
      this.nextRotation = Infinity;
    }
  }

  /** Bubbles in slots the current target no longer uses leave; bubbles of partners that are gone leave too. */
  private reconcile() {
    const byId = new Map(this.partnerList.map((p) => [p.id, p]));
    for (const b of this.items) {
      const current = byId.get(b.partner.id);
      if (!current || current.logoUrl !== b.partner.logoUrl || b.slot >= this.target) this.retire(b);
      else b.partner = current;
    }
    for (let slot = this.target; slot < this.respawnAt.length; slot++) this.respawnAt[slot] = null;
    this.scheduleEmptySlots(this.started ? 0.4 : 0);
    this.scheduleRotation();
  }

  /** Active partners with a logo, in the order the admin set. Duplicates are ignored. */
  setPartners(partners: readonly BubblePartner[]) {
    const seen = new Set<string>();
    this.partnerList = partners.filter((p) => p.id && p.logoUrl && !seen.has(p.id) && seen.add(p.id));
    for (const id of [...this.lastShown.keys()]) if (!seen.has(id)) this.lastShown.delete(id);

    if (!this.started && this.partnerList.length) {
      this.started = true;
      // First view: grow in place one after another while the logo settles.
      for (let slot = 0; slot < this.target; slot++) {
        const start = this.time + BUBBLE_TIMINGS.appearDelay + slot * BUBBLE_TIMINGS.appearStagger;
        this.spawn(slot, 'here', this.calm ? BUBBLE_TIMINGS.calmAppear : BUBBLE_TIMINGS.appear, start);
      }
      this.scheduleRotation();
      this.bump();
      return;
    }
    this.reconcile();
    this.bump();
  }

  /** 5 on wide screens, 3 on phones (never more than five). */
  setCapacity(capacity: number, edgesForSlot?: (slot: number) => Edge[]) {
    const next = Math.max(0, Math.min(MAX_BUBBLES, Math.floor(capacity)));
    if (edgesForSlot) this.edgesForSlot = edgesForSlot;
    if (next === this.capacity && !edgesForSlot) return;
    this.capacity = next;
    if (this.started) this.reconcile();
    this.bump();
  }

  setReducedMotion(calm: boolean) {
    this.calm = calm;
  }

  /** A click or Enter on a bubble. Only an arrived or arriving bubble bursts, and only once. */
  pop(key: number): boolean {
    const b = this.items.find((x) => x.key === key);
    if (!b || (b.phase !== 'floating' && b.phase !== 'entering') || b.phaseStart > this.time) return false;
    b.phase = 'popping';
    b.phaseStart = this.time;
    b.phaseDuration = this.calm ? BUBBLE_TIMINGS.calmPop : BUBBLE_TIMINGS.pop;
    this.respawnAt[b.slot] = this.time + b.phaseDuration + this.between(BUBBLE_TIMINGS.respawnMin, BUBBLE_TIMINGS.respawnMax);
    this.bump();
    return true;
  }

  isInteractive(b: Bubble): boolean {
    return (b.phase === 'floating' || b.phase === 'entering') && b.phaseStart <= this.time;
  }

  tick(dt: number) {
    this.time += Math.min(Math.max(dt, 0), 0.1);
    let changed = false;

    for (const b of this.items) {
      if (b.phase === 'entering' && this.time >= b.phaseStart + b.phaseDuration) {
        b.phase = 'floating';
        b.floatingSince = this.time;
        changed = true;
      }
    }
    const before = this.items.length;
    this.items = this.items.filter((b) => {
      const done = (b.phase === 'popping' || b.phase === 'exiting') && this.time >= b.phaseStart + b.phaseDuration;
      if (done && b.phase === 'exiting' && b.slot < this.target && this.respawnAt[b.slot] == null) {
        // The next partner takes the slot a moment after the previous one has left.
        this.respawnAt[b.slot] = this.time + 0.35;
      }
      return !done;
    });
    if (this.items.length !== before) changed = true;

    for (let slot = 0; slot < this.target; slot++) {
      const due = this.respawnAt[slot];
      if (due == null || due > this.time || this.items.some((b) => b.slot === slot)) continue;
      const duration = this.calm ? BUBBLE_TIMINGS.calmAppear : this.between(BUBBLE_TIMINGS.enterMin, BUBBLE_TIMINGS.enterMax);
      if (!this.spawn(slot, this.edgeFor(slot), duration)) this.respawnAt[slot] = this.time + 1;
    }

    if (this.time >= this.nextRotation) {
      const moving = this.items.some((b) => b.phase === 'exiting' || b.phase === 'entering');
      const oldest = this.items
        .filter((b) => b.phase === 'floating')
        .sort((a, z) => (a.floatingSince ?? 0) - (z.floatingSince ?? 0))[0];
      if (moving || !oldest || this.partnerList.length <= this.target) {
        this.nextRotation = this.partnerList.length > this.target ? this.time + 3 : Infinity;
      } else {
        this.retire(oldest);
        this.nextRotation = this.time + this.between(BUBBLE_TIMINGS.rotateMin, BUBBLE_TIMINGS.rotateMax);
      }
    }

    if (changed) this.bump();
  }
}
