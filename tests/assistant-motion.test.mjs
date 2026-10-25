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

test('an idle cinematic (360° turn, flight or glance) starts only after a quiet while, one at a time', () => {
  const d = new MotionDirector({ random: seeded() });
  const poses = run(d, 0, 120);
  assert.equal(poses.filter((p) => p.t < 8 && p.act).length, 0, 'nothing in the first seconds');
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

test('phones never fly; reduced motion has no cinematics and no float', () => {
  const phone = new MotionDirector({ compact: true, random: seeded() });
  assert.ok(!run(phone, 0, 200).some((p) => p.act === 'orbit'));
  const calm = new MotionDirector({ calm: true, random: seeded() });
  const poses = run(calm, 0, 60);
  assert.ok(!poses.some((p) => p.act));
  assert.ok(poses.every((p) => p.pose.pos[1] === 0));
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
  const d = new MotionDirector({ calm: true });
  d.setMood('speaking', 0);
  const quiet = run(d, 0, 0.5, 0).pop().pose;
  const loud = run(d, 0.5, 1, 0.9).pop().pose;
  assert.equal(quiet.talk, 1);
  assert.ok(loud.mouthOpen > 0.8 && quiet.mouthOpen === 0);
  assert.ok(loud.head[0] > quiet.head[0] + 0.05);
  assert.ok(loud.glow > quiet.glow);
});

test('welcome raises the arm and waves, then everything returns to rest', () => {
  const d = new MotionDirector({ calm: true });
  d.cue('welcome', 0);
  const mid = d.update(0.9);
  assert.ok(mid.armL[2] < -0.2, 'the pointing hand rises');
  const wave = run(d, 0.5, 1.3).map((p) => p.pose.armL[2]);
  assert.ok(Math.max(...wave) - Math.min(...wave) > 0.3, 'it waves');
  const done = d.update(2.1);
  assert.ok(Math.abs(done.armL[2]) < 1e-6 && done.body[1] === 0, 'back to the picture pose');
});

test('gestures that would turn the robot away are ignored while it listens or speaks', () => {
  const d = new MotionDirector({ calm: true });
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
