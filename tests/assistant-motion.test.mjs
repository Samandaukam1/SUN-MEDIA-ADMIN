import assert from 'node:assert/strict';
import test from 'node:test';

import { MotionDirector } from '../components/assistant/robot/motion.ts';

/** Runs the director at 60 fps from `from` to `to` seconds and returns every pose. */
function run(d, from, to, level = 0) {
  const poses = [];
  for (let t = from; t <= to; t += 1 / 60) poses.push({ t, pose: d.update(t, level), act: d.idleAct });
  return poses;
}
const seeded = () => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

test('an idle cinematic (360° turn, flight or glance) comes within seconds, then regularly, one at a time', () => {
  const d = new MotionDirector({ random: seeded() });
  const poses = run(d, 0, 120);
  assert.equal(poses.filter((p) => p.t < 4 && p.act).length, 0, 'nothing in the very first seconds');
  assert.ok(poses.some((p) => p.t < 7.5 && p.act), 'but the first one before 7.5 s: the robot is seen to be alive');
  const starts = poses.filter((p, i) => p.act && !poses[i - 1]?.act).length;
  assert.ok(starts >= 7, `at least 7 over two minutes, got ${starts}`);
  const acts = new Set(poses.map((p) => p.act).filter(Boolean));
  assert.ok(acts.size >= 2, `several kinds over two minutes, got ${[...acts]}`);
  for (const p of poses) assert.ok(Math.abs(p.pose.pos[0]) <= 1.1 && p.pose.pos[1] <= 0.75, 'the flight stays near the launcher');
});

test('no cinematic while listening or speaking, however long it lasts', () => {
  const d = new MotionDirector({ random: seeded() });
  d.setMood('speaking', 0);
  assert.equal(run(d, 0, 90, 0.5).filter((p) => p.act).length, 0);
  d.setMood('listening', 90);
  assert.equal(run(d, 90, 180, 0.3).filter((p) => p.act).length, 0);
});

test('a turn or flight in progress blends out smoothly when the chat needs the robot', () => {
  const d = new MotionDirector({ random: () => 0.6 });
  let t = 0;
  for (; !d.idleAct && t < 60; t += 1 / 60) d.update(t);
  assert.equal(d.idleAct, 'orbit');
  for (const end = t + 1.6; t < end; t += 1 / 60) d.update(t);
  d.setMood('listening', t);
  assert.equal(d.idleAct, null);
  const after = run(d, t, t + 0.7);
  const last = after[after.length - 1].pose;
  assert.ok(Math.abs(last.pos[0]) < 0.05 && Math.abs(last.pos[1]) < 0.12, 'back home within 0.7 s');
  for (let i = 1; i < after.length; i++) assert.ok(Math.abs(after[i].pose.pos[0] - after[i - 1].pose.pos[0]) < 0.05, 'no jump');
});

test('an interrupted 360° finishes the short way (no spin back across the whole turn)', () => {
  const d = new MotionDirector({ random: () => 0.1 });
  let t = 0;
  for (; !d.idleAct && t < 60; t += 1 / 60) d.update(t);
  assert.equal(d.idleAct, 'spin');
  for (const end = t + 2.2; t < end; t += 1 / 60) d.update(t);
  d.setMood('thinking', t);
  const spins = run(d, t, t + 0.48).map((p) => p.pose.spin);
  assert.ok(Math.abs(spins[spins.length - 1] - 2 * Math.PI) < 0.05, 'ends at a full turn');
  for (let i = 1; i < spins.length; i++) assert.ok(spins[i] >= spins[i - 1] - 1e-9, 'keeps turning forward');
  // After the blend the turn is dropped: 2π and 0 are the same orientation, so nothing visibly moves.
  assert.ok(Math.abs(Math.sin(d.update(t + 0.7).spin)) < 1e-9);
});

test('phones never fly; reduced motion has no cinematics, only a gentle float (still visibly alive)', () => {
  const phone = new MotionDirector({ compact: true, random: seeded() });
  assert.ok(!run(phone, 0, 200).some((p) => p.act === 'orbit'));
  const calm = new MotionDirector({ calm: true, random: seeded() });
  const poses = run(calm, 0, 60);
  assert.ok(!poses.some((p) => p.act));
  const ys = poses.map((p) => p.pose.pos[1]);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.02 && Math.max(...ys.map(Math.abs)) < 0.03);
});

test('listening faces the visitor even when the pointer is far to the side', () => {
  const d = new MotionDirector();
  d.setPointer(1, 0, true, 0);
  d.setMood('listening', 0);
  for (const { pose } of run(d, 0, 3)) assert.ok(Math.abs(pose.head[1]) < 0.2 && pose.eyeOpen > 1);
});

test('thinking dips then turns the head; the answer releases an energy burst', () => {
  const d = new MotionDirector();
  d.setMood('thinking', 0);
  const dip = d.update(0.6);
  assert.ok(dip.head[0] > 0.15 && Math.abs(dip.head[1]) < 0.1, 'head down first');
  const aside = d.update(1.6);
  assert.ok(aside.head[1] > 0.25, 'then aside');
  assert.equal(aside.flat, 1);
  d.setMood('speaking', 2);
  assert.ok(d.update(2.05).energy > 0.9);
  assert.ok(d.update(3.6, 0).energy < 0.05, 'and settles');
});

test('speaking follows the real level: the mouth opens with it, the head nods on loud syllables', () => {
  const d = new MotionDirector({ float: 0 });
  d.setMood('speaking', 0);
  const quiet = run(d, 0, 0.5, 0).pop().pose;
  const loud = run(d, 0.5, 1, 0.9).pop().pose;
  assert.equal(quiet.talk, 1);
  assert.ok(loud.mouthOpen > 0.8 && quiet.mouthOpen === 0);
  assert.ok(loud.head[0] > quiet.head[0] + 0.05);
  assert.ok(loud.glow > quiet.glow);
});

test('welcome raises the arm and waves, then everything returns to rest', () => {
  const d = new MotionDirector({ float: 0 });
  d.cue('welcome', 0);
  const mid = d.update(0.9);
  assert.ok(mid.armL[2] < -0.2, 'the pointing hand rises');
  const wave = run(d, 0.5, 1.3).map((p) => p.pose.armL[2]);
  assert.ok(Math.max(...wave) - Math.min(...wave) > 0.3, 'it waves');
  const done = d.update(2.1);
  assert.ok(Math.abs(done.armL[2]) < 1e-6 && done.body[1] === 0, 'back to the picture pose');
});

test('gestures that would turn the robot away are ignored while it listens or speaks', () => {
  const d = new MotionDirector({ float: 0 });
  d.setMood('speaking', 0);
  d.cue('welcome', 0.1);
  assert.ok(d.update(1).armL[2] > -0.15);
});

test('with the chat open beside it the robot never flies; a flight in progress comes home', () => {
  const d = new MotionDirector({ random: () => 0.6 });
  let t = 0;
  for (; !d.idleAct && t < 60; t += 1 / 60) d.update(t);
  assert.equal(d.idleAct, 'orbit');
  d.setRoam(false, t);
  assert.equal(d.idleAct, null);
  assert.ok(!run(d, t, t + 200).some((p) => p.act === 'orbit'));
});

test('working (an action running) is its own pose: turned to the console, hands typing, the energy ring on', () => {
  const d = new MotionDirector({ float: 0 });
  d.setMood('working', 0);
  const poses = run(d, 0.5, 1.5).map((p) => p.pose);
  assert.ok(poses.every((p) => p.body[1] < -0.15 && p.head[0] > 0.1 && p.energy > 0.25 && p.flat === 1));
  const left = poses.map((p) => p.armL[0]);
  const right = poses.map((p) => p.armR[0]);
  assert.ok(Math.max(...left) - Math.min(...left) > 0.2, 'the hands move');
  assert.ok(left.some((v, i) => Math.sign(v) !== Math.sign(right[i]) && Math.abs(v) > 0.05), 'in turn, like typing');
  const thinking = new MotionDirector({ float: 0 });
  thinking.setMood('thinking', 0);
  const still = run(thinking, 0.5, 1.5).map((p) => p.pose);
  assert.ok(still.every((p) => p.body[1] === 0 && p.armL[0] === 0), 'unlike thinking: no turn, no hands');
});

test('success: a hop with the hand raised and a flare, then back to rest; it plays even while Sunny speaks', () => {
  const d = new MotionDirector({ float: 0 });
  d.setMood('speaking', 0);
  d.cue('success', 0);
  const peak = run(d, 0, 2.2).map((p) => p.pose);
  assert.ok(Math.max(...peak.map((p) => p.pos[1])) > 0.15, 'hops');
  assert.ok(Math.min(...peak.map((p) => p.armL[2])) < -0.5, 'raises the hand');
  assert.ok(Math.max(...peak.map((p) => p.glow)) > 0.85 && Math.max(...peak.map((p) => p.energy)) > 0.5, 'lights up');
  const after = d.update(2.4, 0);
  assert.ok(Math.abs(after.armL[2]) < 0.15 && Math.abs(after.pos[1]) < 1e-6);
});

test('fail: a head shake with warning-coloured eyes, no smile; nothing of it is left after', () => {
  const d = new MotionDirector({ float: 0 });
  d.cue('fail', 0);
  const poses = run(d, 0, 1.7).map((p) => p.pose);
  const turns = poses.map((p) => p.head[1]);
  assert.ok(Math.max(...turns) > 0.12 && Math.min(...turns) < -0.12, 'shakes both ways');
  assert.ok(Math.max(...poses.map((p) => p.alarm)) > 0.9 && poses.some((p) => p.flat > 0.9));
  const after = d.update(1.8);
  assert.equal(after.alarm, 0);
  assert.equal(after.smile, 1);
});
