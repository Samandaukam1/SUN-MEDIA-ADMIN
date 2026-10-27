import assert from 'node:assert/strict';
import test from 'node:test';

import { expressionOf } from '../components/assistant/robot/emotion.ts';
import { qAngle, QitmirBrain } from '../components/assistant/qitmir/brain.ts';

const B = 116;
const W = 1440;
const H = 900;
const HOME = { x: W - 91, y: H - 105, scale: 150 / B };
const LOGO = { x: 40, y: 22, w: 104, h: 44 };
const seeded = (s = 7) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

function rig({ persona = 'qitmir', targets = {}, seed = 7, docked = false } = {}) {
  const b = new QitmirBrain({ box: B, persona, random: seeded(seed), now: 0, home: HOME, viewport: [W, H] });
  b.setTargets({ logo: null, texts: [], hides: [], sights: [], colliders: [], ...targets });
  b.setFlags({ dock: docked });
  const r = { b, t: 0, poses: [], events: [], states: [] };
  r.run = (seconds, each) => {
    const end = r.t + seconds;
    while (r.t < end - 1e-9) {
      r.t += 1 / 60;
      each?.(r.t);
      r.pose = b.update(r.t);
      r.poses.push({ t: r.t, state: b.state, ...r.pose });
      if (r.states.at(-1) !== b.state) r.states.push(b.state);
      for (const e of b.drain()) r.events.push({ t: r.t, ...e });
    }
    return r;
  };
  r.until = (state, limit, each) => {
    const end = r.t + limit;
    while (b.state !== state && r.t < end) r.run(1 / 60, each);
    return b.state === state;
  };
  return r;
}
const feels = (r) => r.events.filter((e) => e.type === 'feel').map((e) => e.kind);
/** The person slowly moves the mouse to a point next to the robot (as one does before patting or clicking it). */
function approach(r, dx = 0, dy = 0) {
  const [x0, y0] = r.b.position;
  r.b.pointer('move', x0 + 400, y0 + 200, r.t);
  r.run(1.5);
  for (let i = 1; i <= 60; i++) {
    const [x, y] = r.b.position;
    const k = i / 60;
    r.b.pointer('move', x + dx + (1 - k) * 400, y + dy + (1 - k) * 200, r.t);
    r.run(1 / 30);
  }
}

test('calm (normal mode): stays home while the person works, takes a short trip when they are idle, never chases', () => {
  const r = rig({ persona: 'calm', targets: { logo: LOGO } });
  // The person keeps moving the pointer: no trip.
  r.run(20, (t) => r.b.pointer('move', 600 + 200 * Math.sin(t), 400, t));
  assert.ok(r.poses.every((p) => !p.visible), 'home the whole time someone is working');
  // Idle now: out after a few seconds, one visit, then home again.
  r.run(40);
  const seen = new Set(r.states);
  assert.ok(seen.has('LOGO_LANDING'), [...seen].join(' → '));
  assert.ok(seen.has('RETURNING'), 'comes back');
  assert.equal(r.b.state, 'NORMAL_IDLE');
  for (const s of ['WATCHING_CURSOR', 'CHASING_CURSOR', 'CURSOR_APPROACH', 'CURSOR_GRAB', 'CURSOR_ATTACHED']) assert.ok(!seen.has(s), `no ${s}`);
  // The next trip waits a while.
  const outs = () => r.events.filter((e) => e.type === 'out').map((e) => e.t);
  r.run(120);
  const t = outs();
  for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] > 35, 'trips are spaced out');
});

test('calm: the person moving the pointer during a trip sends it home', () => {
  const r = rig({ persona: 'calm', targets: { logo: LOGO } });
  r.until('LOGO_LANDING', 30);
  r.run(0.6, (t) => r.b.pointer('move', 300 + (t % 1) * 900, 500, t));
  r.run(0.2);
  assert.equal(r.b.state, 'RETURNING');
});

test('a pat on the head (strokes back and forth): eyes soften, it leans in, it feels happy', () => {
  const r = rig({ persona: 'calm', targets: { logo: LOGO } });
  r.until('LOGO_LANDING', 30);
  r.run(4);
  approach(r, 0, -0.25 * B);
  const [x, y] = r.b.position;
  // Smooth strokes, about three a second (a hand, not a jerk).
  r.run(1.4, (t) => r.b.pointer('move', x + 20 * Math.sin(2 * Math.PI * 3 * t), y - 0.25 * B, t));
  assert.ok(r.states.includes('PATTED'), r.states.join(' → '));
  assert.ok(feels(r).includes('pat'));
  const patted = r.poses.filter((p) => p.state === 'PATTED');
  assert.ok(patted.some((p) => p.eyeOpen <= 0.6 && p.smile > 1.2), 'soft happy eyes');
});

test('a fast swipe through its body pushes it off balance; it wobbles and rights itself', () => {
  const r = rig({ targets: { sights: [{ x: 400, y: 300, w: 300, h: 100 }] } });
  r.run(2);
  r.b.play('watch', r.t);
  r.run(0.5);
  const [x, y] = r.b.position;
  r.b.pointer('move', x - 150, y, r.t);
  r.run(1 / 60);
  r.b.pointer('move', x + 150, y, r.t + 0.001);
  r.run(1 / 60);
  assert.equal(r.b.state, 'BUMPED');
  assert.ok(feels(r).includes('push'));
  r.run(0.3);
  assert.ok(Math.max(...r.poses.filter((p) => p.state === 'BUMPED').map((p) => qAngle(p.orient))) > 0.15, 'tips over');
  r.run(2.5);
  assert.notEqual(r.b.state, 'BUMPED');
  assert.ok(qAngle(r.b.orientation) < 0.3, 'upright again');
});

test('hit three times: annoyed (arms folded, says so), and it slips away from the next poke', () => {
  const r = rig({ persona: 'calm', targets: { logo: LOGO } });
  r.until('LOGO_LANDING', 30);
  r.run(4);
  approach(r);
  const hit = () => {
    const [x, y] = r.b.position;
    r.b.pointer('down', x, y, r.t);
    r.b.pointer('up', x, y, r.t);
    r.run(0.2);
  };
  hit();
  assert.equal(r.b.state, 'NOTICED', 'one tap: it notices');
  hit();
  hit();
  assert.equal(r.b.state, 'ANNOYED');
  assert.ok(feels(r).includes('hits'));
  assert.ok(r.events.some((e) => e.type === 'say' && e.key === 'hit'));
  assert.ok(r.pose.armL[2] > 0.4 && r.pose.armR[2] < -0.4, 'arms folded');
  r.run(2.3);
  const before = r.b.position;
  hit();
  r.run(0.3);
  assert.notEqual(r.b.state, 'NOTICED', 'no friendly notice while cross');
  assert.ok(Math.hypot(r.b.position[0] - before[0], r.b.position[1] - before[1]) > 20, 'dodges');
});

test('"qo‘l ber": hand up, waits for a high five; a click on the hand is celebrated, no click is a little awkward', () => {
  const r = rig({ persona: 'calm' });
  r.b.setFlags({ dock: false });
  assert.ok(r.b.command('wave', r.t), 'comes out of the launcher for it');
  r.run(1);
  assert.equal(r.b.state, 'HIGH_FIVE');
  const hand = r.pose.tether ? null : r.b.position;
  void hand;
  // Click on the raised hand (up-left of the body).
  const [x, y] = r.b.position;
  r.b.pointer('down', x - 0.25 * B * 1, y - 0.3 * B, r.t);
  r.run(0.2);
  assert.equal(r.b.state, 'VICTORY');
  assert.ok(feels(r).includes('five'));
  const q = rig({ persona: 'calm' });
  q.b.command('wave', q.t);
  q.run(4);
  assert.ok(feels(q).includes('nofive'));
});

test('mood physics: a sad robot chases slower and lower than a happy one; the thruster follows the flight', () => {
  const chase = (feeling) => {
    const r = rig();
    r.b.setEmotion(expressionOf(feeling));
    r.run(1);
    const path = (t) => [720 + 420 * Math.sin(t * 1.3), 450 + 220 * Math.sin(t * 2.6)];
    r.run(8, (t) => r.b.pointer('move', ...path(t), t));
    const flying = r.poses.filter((p) => p.state === 'CHASING_CURSOR');
    return { speed: flying.reduce((a, p) => a + p.speed, 0) / flying.length, thrust: Math.max(...flying.map((p) => p.thrust)) };
  };
  const happy = chase({ name: 'happy', k: 1 });
  const sad = chase({ name: 'sad', k: 1 });
  assert.ok(sad.speed < happy.speed * 0.8, `sad ${sad.speed.toFixed(0)} vs happy ${happy.speed.toFixed(0)} px/s`);
  assert.ok(happy.thrust > 0.5, `thruster bright in flight (${happy.thrust.toFixed(2)})`);
  const r = rig({ targets: { logo: LOGO } });
  r.run(1);
  r.b.play('logo', r.t);
  r.run(6);
  const rest = r.poses.filter((p) => p.state === 'LOGO_LANDING' && p.shadow?.o === 0.5);
  assert.ok(rest.length && rest.at(-1).thrust < 0.15, 'thruster almost off while it rests on the logo');
});

test('"Sunny!": a robot out on the page comes to attention where it is (quickly, inside the screen) and talks there', () => {
  const r = rig({ targets: { sights: [{ x: 100, y: 100, w: 300, h: 100 }] } });
  r.b.pointer('move', 200, 200, 0);
  r.run(4, (t) => r.b.pointer('move', 200 + 60 * Math.sin(t * 3), 200, t));
  assert.ok(r.b.command('summon', r.t));
  r.run(1 / 60);
  assert.equal(r.b.state, 'TALKING');
  // The conversation: it stays out, steady, well inside the screen — it does not fly home to answer.
  r.b.setFlags({ talk: true });
  const from = r.poses.length;
  r.run(6);
  const talking = r.poses.slice(from);
  assert.ok(talking.every((p) => p.state === 'TALKING' && p.visible), 'answers where it is');
  const last = talking.at(-1);
  assert.ok(last.x > B && last.x < W - B && last.y > B && last.y < H - B, 'inside the screen');
  assert.ok(last.speed < 30, 'steady while it talks');
  // Conversation over: back to its own business (Qitmir) a moment later.
  r.b.setFlags({ talk: false });
  r.run(2);
  assert.notEqual(r.b.state, 'TALKING');
});

test('calm robot: after talking out on the page it goes home; the text panel (dock) brings it home at once', () => {
  const r = rig({ persona: 'calm', targets: { logo: LOGO } });
  r.until('LOGO_LANDING', 30);
  r.b.setFlags({ talk: true });
  r.run(0.5);
  assert.equal(r.b.state, 'TALKING');
  r.b.setFlags({ talk: false });
  r.run(1.6);
  assert.equal(r.b.state, 'RETURNING');
  const q = rig({ persona: 'calm', targets: { logo: LOGO } });
  q.until('LOGO_LANDING', 30);
  q.b.setFlags({ talk: true });
  q.run(0.5);
  q.b.setFlags({ dock: true, talk: false });
  q.run(1 / 60);
  assert.equal(q.b.state, 'RETURNING');
});
