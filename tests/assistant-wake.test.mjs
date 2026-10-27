import assert from 'node:assert/strict';
import test from 'node:test';

import { bargeIn, isEcho, wakeIn, WakeListener } from '../components/assistant/wake.ts';

test('the name is heard however the recognizer writes it, and the command after it is kept', () => {
  assert.deepEqual(wakeIn('Sunny, bugungi vazifalarim qanday?'), { found: true, rest: 'bugungi vazifalarim qanday' });
  assert.equal(wakeIn('Sani!').found, true);
  assert.equal(wakeIn('санни').found, true);
  assert.equal(wakeIn('sanoat haqida').found, false, 'not inside other words');
  assert.equal(wakeIn('Salom').found, false);
});

test('Sunny’s own voice through the speakers is an echo; the person’s "to‘xta" is not', () => {
  const spoken = 'Bugun sizda beshta vazifa bor, ulardan ikkitasi syomka bilan bog‘liq.';
  assert.equal(isEcho('bugun sizda beshta vazifa bor', spoken), true);
  assert.equal(bargeIn('bugun sizda beshta vazifa', spoken), null);
  assert.deepEqual(bargeIn("To‘xta, avval SAFI'ni ayt", spoken), { rest: 'safini ayt' });
  assert.deepEqual(bargeIn('Sunny', spoken), { rest: '' });
  assert.equal(bargeIn('ha mayli', spoken), null, 'other talk does not stop it');
});

/** A fake browser recognizer: the test says what was "heard". */
function fake() {
  const made = [];
  const make = () => {
    const r = { started: 0, aborted: 0, start() { this.started++; }, abort() { this.aborted++; }, onresult: null, onerror: null, onend: null };
    made.push(r);
    return r;
  };
  const say = (text, isFinal) => {
    const r = made.at(-1);
    const result = Object.assign([{ transcript: text }], { isFinal });
    r.onresult({ resultIndex: 0, results: [result] });
  };
  return { made, make, say };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('wake listener: summons at once, then hands over the command said in the same breath', () => {
  const f = fake();
  const calls = [];
  const w = new WakeListener(f.make, 'uz-UZ', { onWake: (rest, final) => calls.push([rest, final]), onBargeIn: () => {} });
  w.enable();
  assert.equal(w.state, 'waiting');
  f.say('Sunny bugungi', false);
  f.say('Sunny bugungi vazifalarim qanday', true);
  assert.deepEqual(calls, [['', false], ['bugungi vazifalarim qanday', true]]);
  w.disable();
});

test('wake listener: just the name → the robot answers and listens (empty command); restarts when the browser stops it', async () => {
  const f = fake();
  const calls = [];
  const w = new WakeListener(f.make, 'uz-UZ', { onWake: (rest, final) => calls.push([rest, final]), onBargeIn: () => {} });
  w.enable();
  f.say('Sunny', true);
  assert.deepEqual(calls.at(-1), ['', true]);
  f.made.at(-1).onend();
  await tick(400);
  assert.equal(f.made.length, 2, 'listening again');
  w.pause();
  assert.equal(w.state, 'paused');
  assert.ok(f.made.at(-1).aborted, 'one recognizer at a time: the chat listens now');
  w.resume();
  assert.equal(f.made.length, 3);
  w.disable();
});

test('wake listener: while Sunny speaks only a real interruption counts; no mic permission → off for good', () => {
  const f = fake();
  const barge = [];
  const wakes = [];
  const w = new WakeListener(f.make, 'uz-UZ', { onWake: (r, fin) => wakes.push(fin), onBargeIn: (rest) => barge.push(rest) });
  w.enable();
  w.speaking('Bugun sizda beshta vazifa bor');
  f.say('bugun sizda beshta vazifa', true);
  f.say("to'xta avval safini ayt", true);
  assert.deepEqual(barge, ['safini ayt']);
  assert.equal(wakes.length, 0);
  f.made.at(-1).onerror({ error: 'not-allowed' });
  assert.equal(w.state, 'denied');
});
