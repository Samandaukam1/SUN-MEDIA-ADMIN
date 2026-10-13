import assert from 'node:assert/strict';
import test from 'node:test';

import { BUBBLE_TIMINGS, BubbleController, MAX_BUBBLES } from '../lib/site/bubbles.ts';

const partners = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Hamkor ${i + 1}`, logoUrl: `https://x/p${i + 1}.webp` }));

/** Deterministic random so timings are reproducible. */
function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

function make(capacity, n, extra = {}) {
  const c = new BubbleController({ capacity, edgesForSlot: (slot) => (slot % 2 ? ['right'] : ['left', 'top']), random: seeded(), ...extra });
  c.setPartners(partners(n));
  return c;
}

/** Runs the frame loop and checks the invariants on every frame. */
function run(c, seconds, onFrame) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    c.tick(1 / 30);
    const ids = c.bubbles.map((b) => b.partner.id);
    assert.equal(new Set(ids).size, ids.length, `same partner twice at t=${c.now.toFixed(2)}: ${ids}`);
    assert.ok(c.bubbles.length <= MAX_BUBBLES, 'never more than five bubbles');
    const slots = c.bubbles.map((b) => b.slot);
    assert.equal(new Set(slots).size, slots.length, 'one bubble per slot');
    onFrame?.(c);
  }
}

test('no partners with a logo → no bubbles at all', () => {
  const c = make(5, 0);
  run(c, 30);
  assert.equal(c.bubbles.length, 0);
});

test('1, 3 and 5 partners → that many bubbles; 8 and 20 partners → five on desktop, three on a phone', () => {
  for (const [capacity, n, expected] of [[5, 1, 1], [5, 3, 3], [5, 5, 5], [5, 8, 5], [5, 20, 5], [3, 8, 3], [3, 1, 1]]) {
    const c = make(capacity, n);
    run(c, 4);
    assert.equal(c.bubbles.length, expected, `${n} partners, capacity ${capacity}`);
    assert.ok(c.bubbles.every((b) => b.phase === 'floating'), 'all settled after the first appearance');
  }
});

test('capacity above five is clamped to five', () => {
  const c = make(9, 12);
  run(c, 60);
  assert.ok(c.bubbles.length <= 5);
});

test('with 8 partners all eight appear in turn, without a click', () => {
  const c = make(5, 8);
  const seen = new Set();
  run(c, 120, (ctl) => ctl.bubbles.forEach((b) => seen.add(b.partner.id)));
  assert.equal(seen.size, 8);
});

test('the slow rotation swaps one bubble at a time, every 15–25 s, without bursting it', () => {
  const c = make(5, 8);
  let exits = 0;
  let lastExitAt = -Infinity;
  const gaps = [];
  const exiting = new Set();
  run(c, 200, (ctl) => {
    const now = ctl.bubbles.filter((b) => b.phase === 'exiting');
    assert.ok(now.length <= 1, 'only one bubble leaves at a time');
    assert.ok(!ctl.bubbles.some((b) => b.phase === 'popping'), 'rotation never pops');
    for (const b of now) {
      if (!exiting.has(b.key)) {
        exiting.add(b.key);
        exits++;
        if (lastExitAt > -Infinity) gaps.push(ctl.now - lastExitAt);
        lastExitAt = ctl.now;
      }
    }
  });
  assert.ok(exits >= 7, `rotated ${exits} times in 200 s`);
  assert.ok(gaps.every((g) => g >= BUBBLE_TIMINGS.rotateMin - 0.1 && g <= BUBBLE_TIMINGS.rotateMax + 6), `gaps ${gaps.map((g) => g.toFixed(1))}`);
});

test('the least recently shown partner comes next', () => {
  const c = make(5, 8);
  run(c, 4);
  const first = c.bubbles.map((b) => b.partner.id).sort();
  assert.deepEqual(first, ['p1', 'p2', 'p3', 'p4', 'p5'], 'first five in the admin order');
  const target = c.bubbles.find((b) => b.partner.id === 'p3');
  assert.ok(c.pop(target.key));
  run(c, BUBBLE_TIMINGS.pop + BUBBLE_TIMINGS.respawnMax + BUBBLE_TIMINGS.enterMax + 0.5);
  const now = c.bubbles.map((b) => b.partner.id);
  assert.ok(now.includes('p6'), `the never-shown p6 replaced the popped bubble: ${now}`);
  assert.ok(!now.includes('p3'), 'the popped partner waits for its turn');
});

test('a popped bubble comes back after 2–4 s, entering from an edge (not in place)', () => {
  const c = make(5, 3);
  run(c, 4);
  const b = c.bubbles[0];
  const poppedAt = c.now;
  assert.ok(c.pop(b.key));
  let returned = null;
  run(c, 10, (ctl) => {
    const back = ctl.bubbles.find((x) => x.slot === b.slot && x.key !== b.key);
    if (back && !returned) returned = { at: ctl.now, bubble: { ...back } };
  });
  assert.ok(returned, 'came back');
  const delay = returned.at - poppedAt;
  assert.ok(delay >= BUBBLE_TIMINGS.pop + 2 - 0.05 && delay <= BUBBLE_TIMINGS.pop + 4 + 0.1, `delay ${delay.toFixed(2)}`);
  assert.notEqual(returned.bubble.edge, 'here', 'travels in from an edge');
  assert.equal(returned.bubble.partner.id, b.partner.id, 'with three partners the same logo returns');
  assert.ok(returned.bubble.phaseDuration >= 1.5 && returned.bubble.phaseDuration <= 3, 'arrives in 1.5–3 s');
});

test('rapid repeated clicks burst a bubble once and schedule one return', () => {
  const c = make(5, 3);
  run(c, 4);
  const b = c.bubbles[1];
  assert.equal(c.pop(b.key), true);
  for (let i = 0; i < 10; i++) assert.equal(c.pop(b.key), false, 'a bursting bubble ignores clicks');
  let spawned = 0;
  const keys = new Set(c.bubbles.map((x) => x.key));
  run(c, 12, (ctl) => ctl.bubbles.forEach((x) => {
    if (!keys.has(x.key)) {
      keys.add(x.key);
      spawned++;
    }
  }));
  assert.equal(spawned, 1, 'exactly one replacement');
  assert.equal(c.bubbles.length, 3);
});

test('popping every bubble at once never creates duplicates or exceeds the limit', () => {
  const c = make(5, 6);
  run(c, 4);
  for (const b of [...c.bubbles]) c.pop(b.key);
  run(c, 15);
  assert.equal(c.bubbles.length, 5);
});

test('admin changes: a removed partner leaves, a new one comes in, the limit holds', () => {
  const c = make(5, 3);
  run(c, 4);
  c.setPartners(partners(3).filter((p) => p.id !== 'p2'));
  run(c, 4);
  assert.ok(!c.bubbles.some((b) => b.partner.id === 'p2'), 'removed partner is gone');
  assert.equal(c.bubbles.length, 2);
  c.setPartners(partners(7));
  run(c, 6);
  assert.equal(c.bubbles.length, 5, 'new partners fill up to five');
  c.setPartners([]);
  run(c, 4);
  assert.equal(c.bubbles.length, 0, 'everything leaves when no partner is active');
});

test('a replaced logo is treated as a new bubble', () => {
  const c = make(5, 2);
  run(c, 4);
  const list = partners(2);
  list[0] = { ...list[0], logoUrl: 'https://x/new.webp' };
  c.setPartners(list);
  run(c, 6);
  assert.equal(c.bubbles.find((b) => b.partner.id === 'p1')?.partner.logoUrl, 'https://x/new.webp');
});

test('turning a phone into a desktop and back changes 3 ↔ 5 bubbles', () => {
  const c = make(3, 8);
  run(c, 4);
  assert.equal(c.bubbles.length, 3);
  c.setCapacity(5);
  run(c, 5);
  assert.equal(c.bubbles.length, 5);
  c.setCapacity(3);
  run(c, 4);
  assert.equal(c.bubbles.length, 3);
});

test('reduced motion: everything fades in place and still swaps partners calmly', () => {
  const c = make(5, 7, { reducedMotion: true });
  const seen = new Set();
  run(c, 90, (ctl) => {
    ctl.bubbles.forEach((b) => seen.add(b.partner.id));
    assert.ok(ctl.bubbles.every((b) => b.edge === 'here'), 'no travel');
  });
  assert.equal(seen.size, 7);
});
