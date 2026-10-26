import assert from 'node:assert/strict';
import test from 'node:test';

import { qAngle, QitmirBrain } from '../components/assistant/qitmir/brain.ts';

const B = 116;
const W = 1440;
const H = 900;
const HOME = { x: W - 91, y: H - 105, scale: 150 / B };
const seeded = (s = 7) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

/** A brain out of its launcher, plus a clock that runs it at 60 fps and records what happens. */
function rig({ touch = false, seed = 7, targets } = {}) {
  const b = new QitmirBrain({ box: B, touch, random: seeded(seed), now: 0, home: HOME, viewport: [W, H] });
  if (targets) b.setTargets({ logo: null, texts: [], hides: [], sights: [], colliders: [], ...targets });
  b.setFlags({ dock: false });
  const r = { b, t: 0, poses: [], states: [], events: [], pose: null };
  r.run = (seconds, each) => {
    const end = r.t + seconds;
    while (r.t < end - 1e-9) {
      r.t += 1 / 60;
      each?.(r.t);
      r.pose = b.update(r.t);
      r.poses.push({ t: r.t, state: b.state, ...r.pose });
      if (r.states.at(-1)?.state !== b.state) r.states.push({ t: r.t, state: b.state });
      for (const e of b.drain()) r.events.push({ t: r.t, ...e });
    }
    return r;
  };
  r.until = (state, limit, each) => {
    const end = r.t + limit;
    while (b.state !== state && r.t < end) r.run(1 / 60, each);
    return b.state === state;
  };
  r.move = (x, y) => b.pointer('move', x, y, r.t);
  return r;
}

/** Puts the robot on the cursor (still at x, y) and returns once it hangs there. */
function attached(x = 700, y = 420) {
  const r = rig();
  r.move(x - 300, y);
  r.run(1, (t) => r.move(x - 300 + t * 300, y));
  r.move(x, y);
  assert.ok(r.until('CURSOR_ATTACHED', 8), `grabbed the cursor (states: ${r.states.map((s) => s.state).join(' → ')})`);
  r.run(1.5);
  return r;
}

const inside = (p) => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;

test('lifts off from the launcher where the normal robot stands, and docks there again exactly', () => {
  const r = rig();
  r.run(1 / 60);
  assert.ok(Math.hypot(r.pose.x - HOME.x, r.pose.y - HOME.y) < 4, 'first frame at home');
  assert.ok(Math.abs(r.pose.scale - HOME.scale) < 0.03, 'at the launcher robot’s size');
  assert.deepEqual(r.events.map((e) => e.type), ['out']);
  r.run(3);
  assert.ok(Math.hypot(r.pose.x - HOME.x, r.pose.y - HOME.y) > 60, 'it flew out');
  r.b.setFlags({ dock: true });
  r.run(1 / 60);
  assert.equal(r.b.state, 'RETURNING');
  r.until('NORMAL_IDLE', 6);
  assert.equal(r.b.state, 'NORMAL_IDLE');
  assert.ok(r.events.some((e) => e.type === 'docked'));
  assert.ok(Math.hypot(r.b.position[0] - HOME.x, r.b.position[1] - HOME.y) < 1.6);
  assert.equal(r.pose.visible, false, 'the launcher robot takes over (the stage fades its last frame out)');
  // Docked: the cursor no longer moves it.
  r.run(2, (t) => r.move(400 + t * 200, 300));
  assert.ok(Math.hypot(r.b.position[0] - HOME.x, r.b.position[1] - HOME.y) < 1e-6);
  assert.equal(r.b.state, 'NORMAL_IDLE');
});

test('chases a moving cursor with mass: no teleport, bounded speed, smooth turns, banking', () => {
  const r = rig();
  const path = (t) => [720 + 420 * Math.sin(t * 1.3), 450 + 220 * Math.sin(t * 2.6)];
  r.move(...path(0));
  r.run(12, (t) => r.move(...path(t)));
  const chase = r.poses.filter((p) => p.state === 'CHASING_CURSOR');
  assert.ok(chase.length > 300, 'mostly chasing');
  let far = 0;
  let maxTurn = 0;
  let maxRoll = 0;
  for (let i = 1; i < r.poses.length; i++) {
    const a = r.poses[i - 1];
    const p = r.poses[i];
    // No teleport: one frame never moves it further than the flight speed cap allows (plus the visual hop/float).
    assert.ok(Math.hypot(p.x - a.x, p.y - a.y) < (14 * B) / 60 + 6, `step at ${p.t.toFixed(2)} s`);
    if (p.state !== 'CHASING_CURSOR' || a.state !== 'CHASING_CURSOR') continue;
    const [cx, cy] = path(p.t);
    far = Math.max(far, Math.hypot(p.x - cx, p.y - cy));
    if (a.speed > 100 && p.speed > 100) {
      const i0 = r.poses[i - 2];
      if (i0) {
        const v1 = [a.x - i0.x, a.y - i0.y];
        const v2 = [p.x - a.x, p.y - a.y];
        const turn = Math.abs(Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]));
        if (Math.hypot(...v1) > 3 && Math.hypot(...v2) > 3) maxTurn = Math.max(maxTurn, turn);
      }
    }
    maxRoll = Math.max(maxRoll, Math.abs(Math.atan2(2 * (p.orient[3] * p.orient[2] + p.orient[0] * p.orient[1]), 1 - 2 * (p.orient[1] ** 2 + p.orient[2] ** 2))));
  }
  assert.ok(maxTurn < 0.6, `direction changes gradually (max ${maxTurn.toFixed(2)} rad per frame)`);
  assert.ok(maxRoll > 0.08, `banks into the flight (max roll ${maxRoll.toFixed(2)})`);
  const late = chase.filter((p) => p.t > 4);
  const avg = late.reduce((a, p) => a + Math.hypot(p.x - path(p.t)[0], p.y - path(p.t)[1]), 0) / late.length;
  assert.ok(avg < 2.6 * B, `keeps up with the cursor (avg ${avg.toFixed(0)} px)`);
  assert.ok(far > 0.5 * B, 'but does not sit on it');
});

test('a sudden reversal of the cursor does not flip the robot round in one frame (inertia)', () => {
  const r = rig();
  let x = 150;
  r.move(x, 450);
  r.run(2.5, () => r.move((x += 7), 450));
  const before = r.b.velocity[0];
  assert.ok(before > 200, 'flying right');
  r.run(1 / 60, () => r.move((x -= 30), 450));
  r.run(4 / 60, () => r.move((x -= 30), 450));
  assert.ok(r.b.velocity[0] > 0, 'still moving right a few frames after the cursor turned');
  r.run(0.8, () => r.move((x -= 12), 450));
  assert.ok(r.b.velocity[0] < 0, 'then it turns and follows');
});

test('a still cursor is noticed after 1.5–2.5 s, approached, circled and grabbed by the hand', () => {
  for (const seed of [3, 7, 11, 19]) {
    const r = rig({ seed });
    r.move(300, 400);
    r.run(2, (t) => r.move(300 + t * 150, 400));
    r.move(600, 400);
    const stopped = r.t;
    assert.ok(r.until('CURSOR_APPROACH', 6), 'approaches');
    const waited = r.t - stopped;
    assert.ok(waited >= 1.45 && waited <= 2.6, `after ${waited.toFixed(2)} s still`);
    const seen = [];
    r.run(4, () => seen.push(r.b.state));
    const order = [...new Set(seen)];
    assert.deepEqual(order.slice(0, 3), ['CURSOR_APPROACH', 'CURSOR_GRAB', 'CURSOR_ATTACHED']);
    assert.ok(r.events.some((e) => e.type === 'say' && e.key === 'grab'));
    r.run(1.5);
    const { tether } = r.pose;
    assert.ok(tether, 'holds the cursor');
    assert.ok(Math.hypot(tether.hx - 600, tether.hy - 400) < 0.12 * B, `hand on the cursor (${Math.hypot(tether.hx - 600, tether.hy - 400).toFixed(1)} px)`);
    assert.ok(r.pose.y > 400, 'hangs below it');
  }
});

test('hanging on the cursor: drags behind with weight, the tether pulls, a smooth drag does not throw it', () => {
  const r = attached();
  let x = 700;
  let pull = 0;
  r.run(0.5, () => {
    r.move((x += 14), 420);
    pull = Math.max(pull, r.pose?.tether?.tension ?? 0);
  });
  assert.equal(r.b.state, 'CURSOR_ATTACHED', 'a steady drag keeps it on');
  assert.ok(pull > 0.25, `the rope stretches (${pull.toFixed(2)})`);
  assert.ok(r.pose.x < x - 10, 'it lags behind the cursor');
  r.run(2);
  assert.ok(Math.abs(r.pose.x - x) < 20, 'and swings back under it');
});

test('a shake throws it off: tumbles in 3D, stays on screen, dizzy, upright again, angry, then chases', () => {
  const r = attached();
  let x = 700;
  r.run(0.25, (t) => r.move((x += Math.round(t * 60) % 4 < 2 ? 45 : -45), 420));
  assert.ok(['THROWN_AWAY', 'TUMBLING'].includes(r.b.state), `thrown (${r.b.state})`);
  assert.equal(r.pose.tether, null, 'let go of the cursor');
  assert.ok(r.events.some((e) => e.type === 'say' && e.key === 'thrown'));
  const from = r.poses.length;
  r.run(6, (t) => t > 4.5 && r.move(700 + (t - 4.5) * 400, 300));
  const after = r.poses.slice(from);
  const seen = [...new Set(after.map((p) => p.state))];
  for (const s of ['TUMBLING', 'DIZZY', 'RECOVERING', 'ANGRY']) assert.ok(seen.includes(s), `${s} in ${seen.join(' → ')}`);
  assert.ok(seen.indexOf('TUMBLING') < seen.indexOf('DIZZY') && seen.indexOf('DIZZY') < seen.indexOf('ANGRY'));
  assert.ok(Math.max(...after.filter((p) => p.state === 'TUMBLING').map((p) => qAngle(p.orient))) > 1, 'really tumbles');
  for (const p of after) assert.ok(inside(p), `on screen at ${p.t.toFixed(2)} (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
  const angry = after.filter((p) => p.state === 'ANGRY');
  assert.ok(angry.some((p) => p.squint === 1 && p.anger > 0.5), 'serious, redder eyes');
  assert.ok(qAngle(angry.at(-1).orient) < 0.45, 'upright again');
  assert.ok(seen.includes('CHASING_CURSOR'), 'and back after the cursor');
});

test('dock has priority over everything: it lets go, comes home and stays (chat busy, mode off, a dialog)', () => {
  const r = attached();
  r.b.setFlags({ dock: true, chat: 'thinking' });
  r.run(1 / 60);
  assert.equal(r.b.state, 'RETURNING');
  assert.equal(r.pose.tether, null);
  r.until('THINKING', 6);
  assert.equal(r.b.state, 'THINKING', 'the chat state is the label at home');
  r.b.setFlags({ chat: 'speaking' });
  assert.equal(r.b.state, 'SPEAKING');
  r.run(3, (t) => r.move(300 + t * 100, 300));
  assert.ok(Math.hypot(r.b.position[0] - HOME.x, r.b.position[1] - HOME.y) < 1e-6, 'no chase while the chat works');
  r.b.setFlags({ chat: 'idle', dock: false });
  r.run(0.5);
  assert.notEqual(r.b.state, 'NORMAL_IDLE', 'out again when free');
});

test('Escape and a control under the cursor make it let go; a cursor over a control is never grabbed', () => {
  const r = attached();
  r.b.escape(r.t);
  r.run(1 / 60);
  assert.equal(r.pose.tether, null);
  assert.equal(r.b.state, 'RECOVERING');
  r.run(9);
  assert.ok(!r.states.slice(-5).some((s) => s.state === 'CURSOR_ATTACHED' && s.t > r.t - 9), 'does not grab the same still cursor again');

  const c = attached();
  c.b.setFlags({ interactive: true });
  c.run(1 / 60);
  assert.equal(c.pose.tether, null, 'lets go over a button or field');
  c.move(500, 300);
  c.run(8);
  assert.ok(!c.poses.slice(-400).some((p) => p.state === 'CURSOR_GRAB' || p.state === 'CURSOR_ATTACHED'), 'and leaves a cursor over a control alone');
  const near = c.poses.slice(-120).filter((p) => p.state === 'CHASING_CURSOR');
  for (const p of near) assert.ok(Math.hypot(p.x - 500, p.y - 300) > 0.9 * B, 'keeps its distance from it');
});

test('with cursor effects off it only tags the cursor: no holding, no tether', () => {
  const r = rig();
  r.b.setFlags({ cursorFx: false });
  r.move(300, 400);
  r.run(1, (t) => r.move(300 + t * 300, 400));
  r.move(600, 400);
  r.run(10);
  const seen = new Set(r.poses.map((p) => p.state));
  assert.ok(seen.has('CURSOR_GRAB') && seen.has('VICTORY'), [...seen].join(', '));
  assert.ok(!seen.has('CURSOR_ATTACHED'));
  assert.ok(r.poses.every((p) => p.tether === null));
});

test('a missed pounce: fake anger, then a new plan', () => {
  const r = rig();
  r.move(300, 400);
  r.run(1, (t) => r.move(300 + t * 300, 400));
  r.move(600, 400);
  assert.ok(r.until('CURSOR_GRAB', 6));
  r.run(0.1);
  r.run(0.15, (t) => r.move(600 + (t % 1) * 2000, 200));
  r.run(0.4);
  assert.ok(r.states.some((s) => s.state === 'ANGRY'), r.states.map((s) => s.state).join(' → '));
});

test('lands on the logo with a contact shadow, rests, and takes off when the cursor moves', () => {
  const logo = { x: 40, y: 22, w: 104, h: 44 };
  const r = rig({ targets: { logo } });
  r.move(700, 500);
  r.run(0.5, (t) => r.move(700 + t * 100, 500));
  r.b.escape(r.t);
  assert.ok(r.until('LOGO_LANDING', 60), r.states.map((s) => s.state).join(' → '));
  r.run(8);
  const rest = r.poses.filter((p) => p.state === 'LOGO_LANDING' && p.shadow?.o === 0.5);
  assert.ok(rest.length > 30, 'rests on it');
  const p = rest.at(-1);
  assert.ok(p.x > logo.x && p.x < logo.x + logo.w, 'over the logo');
  assert.ok(p.y - 0.45 * B * p.scale >= 0, 'whole robot on screen');
  assert.ok(Math.abs(p.shadow.x - p.x) < 2 && p.shadow.y >= logo.y && p.shadow.y <= logo.y + logo.h + 2, 'shadow under it, on the logo');
  assert.ok(p.scale < 0.7, 'small enough to sit there');
  r.run(0.5, (t) => r.move(700 - t * 300, 500));
  assert.notEqual(r.b.state, 'LOGO_LANDING', 'off again when the cursor moves');
});

test('plays with heading letters: lands on each, pokes the word, flies on', () => {
  const letters = [
    { x: 300, y: 300, w: 30, h: 60 },
    { x: 420, y: 300, w: 30, h: 60 },
  ];
  const r = rig({ targets: { texts: [{ id: 4, rect: { x: 280, y: 300, w: 200, h: 60 }, letters }] } });
  r.move(900, 600);
  r.run(0.5, (t) => r.move(900 + t * 50, 600));
  r.b.escape(r.t);
  assert.ok(r.until('TEXT_INTERACTION', 60));
  r.run(6);
  const pokes = r.events.filter((e) => e.type === 'poke');
  assert.equal(pokes.length, 2, 'one touch per letter');
  assert.ok(pokes.every((e) => e.id === 4));
  const standing = r.poses.filter((p) => p.state === 'TEXT_INTERACTION' && p.shadow);
  assert.ok(standing.some((p) => Math.abs(p.x - 315) < 6 && Math.abs(p.y + 0.45 * B * p.scale - (300 + 10)) < 8), 'stands on the first letter');
});

test('hides behind a card with only its eyes above the edge, and pops out when the cursor comes', () => {
  const card = { x: 300, y: 380, w: 360, h: 240 };
  const r = rig({ targets: { hides: [{ id: 2, rect: card }] } });
  r.move(1000, 200);
  r.run(0.5, (t) => r.move(1000 + t * 50, 200));
  r.b.escape(r.t);
  assert.ok(r.until('HIDE_AND_SEEK', 60));
  r.run(4);
  const p = r.pose;
  assert.deepEqual(p.clip, { edge: card.y, left: card.x, right: card.x + card.w }, 'clipped at the card’s top edge');
  const eyes = p.y - 0.219 * B * p.scale;
  assert.ok(eyes < card.y - 3, 'eyes above the edge');
  assert.ok(p.y + 0.45 * B * p.scale > card.y + 20, 'the body below it, hidden');
  assert.ok(p.x > card.x && p.x < card.x + card.w);
  r.run(0.4, (t) => r.move(p.x + 200 - (t % 1) * 400, card.y - 30));
  r.run(1);
  assert.equal(r.pose.clip, null, 'out again');
  assert.notEqual(r.b.state, 'HIDE_AND_SEEK', 'and off to something else');
});

test('sleeps after a long quiet spell, wakes with a start', () => {
  const r = rig();
  r.move(500, 400);
  r.run(0.3, (t) => r.move(500 + t * 100, 400));
  r.b.escape(r.t);
  r.run(35);
  assert.equal(r.b.state, 'SLEEPING');
  assert.ok(r.pose.sleep && r.pose.eyeOpen < 0.1, 'eyes shut');
  r.move(520, 420);
  r.run(2 / 60);
  assert.equal(r.b.state, 'SURPRISED');
  assert.ok(r.events.some((e) => e.type === 'say' && e.key === 'wake'));
  assert.ok(r.pose.eyeOpen > 1.2, 'wide eyes');
});

test('touch: follows a tap and a swipe, never grabs, a tap on it is a little game', () => {
  const r = rig({ touch: true });
  r.run(1);
  r.b.pointer('down', 200, 500, r.t);
  r.run(2.5);
  assert.ok(Math.hypot(r.pose.x - 200, r.pose.y - (500 - 1.1 * B)) < 0.6 * B, 'flies to just above the finger');
  let x = 200;
  r.run(1, () => r.b.pointer('move', (x += 8), 500, r.t));
  assert.ok(r.pose.x < x && r.pose.x > x - 3 * B, 'follows the swipe from behind');
  r.b.pointer('up', x, 500, r.t);
  r.run(8);
  assert.ok(!r.poses.some((p) => ['CURSOR_APPROACH', 'CURSOR_GRAB', 'CURSOR_ATTACHED'].includes(p.state)), 'no cursor games on touch');
  r.b.pointer('down', r.pose.x, r.pose.y, r.t);
  r.b.pointer('up', r.pose.x, r.pose.y, r.t);
  r.run(1 / 60);
  assert.equal(r.b.state, 'VICTORY');
  assert.ok(r.events.some((e) => e.type === 'say' && e.key === 'tap'));
});

test('frequency limits: a salto at most every 14 s, no game twice in a row', () => {
  const r = rig({ targets: { logo: { x: 40, y: 200, w: 104, h: 44 }, sights: [{ x: 500, y: 300, w: 300, h: 80 }] } });
  const path = (t) => [720 + 420 * Math.sin(t * 0.9), 450 + 220 * Math.sin(t * 1.7)];
  r.run(240, (t) => (Math.floor(t / 20) % 2 ? null : r.move(...path(t))));
  const saltos = r.states.filter((s) => s.state === 'ACROBATIC_FLIGHT').map((s) => s.t);
  assert.ok(saltos.length >= 2, `some saltos (${saltos.length})`);
  for (let i = 1; i < saltos.length; i++) assert.ok(saltos[i] - saltos[i - 1] >= 14, 'not more often than every 14 s');
  const games = r.states.map((s) => s.state).filter((s) => ['LOGO_LANDING', 'WATCHING_PAGE', 'TEXT_INTERACTION', 'HIDE_AND_SEEK', 'ACROBATIC_FLIGHT'].includes(s));
  for (let i = 1; i < games.length; i++) assert.notEqual(games[i], games[i - 1], 'varies what it does');
});

test('anything the person does, it never leaves the screen and never spins too fast', () => {
  for (const seed of [1, 2, 3]) {
    const rnd = seeded(seed * 101);
    const r = rig({ seed, targets: { logo: { x: 40, y: 22, w: 104, h: 44 }, hides: [{ id: 1, rect: { x: 200, y: 500, w: 400, h: 300 } }], sights: [{ x: 900, y: 200, w: 300, h: 200 }] } });
    let x = 700;
    let y = 400;
    r.run(90, (t) => {
      const phase = Math.floor(t / 3) % 5;
      if (phase === 0) r.move((x = 700 + 600 * Math.sin(t * 3)), (y = 450 + 400 * Math.cos(t * 2.1)));
      else if (phase === 2) r.move((x += rnd() < 0.5 ? 60 : -60), y);
      else if (phase === 4 && rnd() < 0.02) r.b.escape(t);
    });
    let prev = null;
    for (const p of r.poses) {
      assert.ok(inside(p), `seed ${seed}: on screen at ${p.t.toFixed(2)} s, ${p.state} (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
      if (prev && prev.state !== 'ACROBATIC_FLIGHT' && p.state !== 'ACROBATIC_FLIGHT' && prev.state !== 'VICTORY' && p.state !== 'VICTORY') {
        const dq = Math.abs(prev.orient[0] * p.orient[0] + prev.orient[1] * p.orient[1] + prev.orient[2] * p.orient[2] + prev.orient[3] * p.orient[3]);
        const rate = (2 * Math.acos(Math.min(1, dq))) * 60;
        assert.ok(rate < 12.5, `seed ${seed}: spin ${rate.toFixed(1)} rad/s at ${p.t.toFixed(2)} (${p.state})`);
      }
      prev = p;
    }
  }
});

test('if the reason to go home goes away on the way (a field lost focus), it plays on from where it is', () => {
  const r = rig();
  r.move(400, 300);
  r.run(2, (t) => r.move(400 + t * 100, 300));
  r.b.setFlags({ dock: true });
  r.run(0.3);
  assert.equal(r.b.state, 'RETURNING');
  const [x, y] = r.b.position;
  r.b.setFlags({ dock: false });
  r.run(1 / 60);
  assert.notEqual(r.b.state, 'RETURNING');
  assert.notEqual(r.b.state, 'NORMAL_IDLE');
  assert.ok(Math.hypot(r.b.position[0] - x, r.b.position[1] - y) < 20, 'no jump');
});
