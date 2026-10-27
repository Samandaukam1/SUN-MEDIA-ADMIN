import assert from 'node:assert/strict';
import test from 'node:test';

import { localIntent } from '../lib/assistant/intents.ts';

test('short playful commands are answered locally (no AI call), the name in any spelling is ignored', () => {
  const cases = {
    'Sunny, raqsga tush!': 'dance',
    'salto qil': 'salto',
    'Sunny jahling chiqsin': 'angry',
    'uxlab qol': 'sleep',
    'xursand bo‘l': 'happy',
    "sani meni quvla": 'chase',
    "qo'l ber": 'wave',
    'yarashdik': 'peace',
    "To‘xta": 'stop',
  };
  for (const [text, act] of Object.entries(cases)) {
    const r = localIntent(text);
    assert.equal(r?.act, act, text);
    assert.ok(r.reply.length > 3);
  }
});

test('real questions and look-alike words still go to the assistant', () => {
  for (const text of [
    'Salom, Sun Media qanday xizmatlar ko‘rsatadi?',
    'oynani yop',
    'kulrang dizayn kerak',
    'Sunny, SAFI uchun bugun soat 5 da syomka vazifasi yarat',
    'raqsga tushadigan reels qanday qilinadi va narxi qancha bo‘ladi',
    'keldimni belgila',
  ]) {
    assert.equal(localIntent(text), null, text);
  }
});

test('kind and rude words touch Sunny’s mood (the message itself still goes to the assistant)', async () => {
  const { sentiment } = await import('../lib/assistant/intents.ts');
  assert.equal(sentiment('Sunny, sen hech narsani bilmaysan!'), 'insult');
  assert.equal(sentiment('barakalla, zo‘rsan'), 'praise');
  assert.equal(sentiment('rahmat'), 'praise');
  assert.equal(sentiment('Bugungi vazifalarim qanday?'), null);
});
