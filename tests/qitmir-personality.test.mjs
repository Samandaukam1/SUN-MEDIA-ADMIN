import assert from 'node:assert/strict';
import test from 'node:test';

import { pick, quip, say } from '../components/assistant/qitmir/quips.ts';
import { modePrompt, QITMIR_PERSONA } from '../lib/assistant/qitmir.ts';
import { speechSsml } from '../lib/assistant/speech.ts';

test('a confirmed action keeps the system’s message word for word, then adds one short joke', () => {
  const message = 'Vazifa yaratildi: «Reels montaji», muddat 27-oktabr 18:00';
  const text = quip(message, 'create_task', true);
  assert.ok(text.startsWith(`${message}. `), text);
  const tail = text.slice(message.length + 2);
  assert.ok(tail.length > 5 && tail.length < 60, `short: "${tail}"`);
  assert.equal(quip('Davomat belgilandi.', 'check_in', true).split('. ')[0], 'Davomat belgilandi');
});

test('a failed or refused action gets no joke: the reason is shown exactly', () => {
  for (const name of ['create_task', 'check_in', 'send_message', 'unknown']) {
    const message = 'Bu amal rolingizga ochiq emas.';
    assert.equal(quip(message, name, false), message);
  }
});

test('lines do not repeat back to back', () => {
  let s = 1;
  const random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (const key of ['grab', 'thrown', 'angry', 'logo', 'miss']) {
    let last = '';
    for (let i = 0; i < 40; i++) {
      const line = say(key, random);
      assert.ok(line.length > 0 && line.length < 60);
      assert.notEqual(line, last, `${key} repeated "${line}"`);
      last = line;
    }
  }
  let previous = '';
  for (let i = 0; i < 20; i++) {
    const tail = quip('Xabar yuborildi.', 'send_message', true, random);
    assert.notEqual(tail, previous);
    previous = tail;
  }
  assert.equal(pick('one', ['only']), 'only', 'a single line is fine');
});

test('nothing rude or scary in the lines', () => {
  const rude = /(ahmoq|tentak|jinni|o‘ldir|o'ldir|qo‘rq|qorq|yomon odam|la’nat|la'nat|bo‘g‘|xafa qil)/i;
  for (const key of ['grab', 'miss', 'thrown', 'angry', 'logo', 'hide', 'found', 'wake', 'text', 'tap', 'bored']) {
    for (let i = 0; i < 12; i++) assert.ok(!rude.test(say(key)), key);
  }
  for (const name of ['check_in', 'create_task', 'update_task', 'set_content_status', 'send_message', 'edit_message', 'delete_message', 'cancelled', 'x']) {
    for (let i = 0; i < 8; i++) assert.ok(!rude.test(quip('Bajarildi.', name, true)), name);
  }
});

test('the Qitmir prompt is added only in Qitmir mode, and keeps every rule about actions', () => {
  assert.equal(modePrompt(undefined), '');
  assert.equal(modePrompt(null), '');
  assert.equal(modePrompt('qitmir'), QITMIR_PERSONA);
  // Tone only: actions, confirmations and facts are explicitly unchanged; no jokes on errors.
  assert.match(QITMIR_PERSONA, /tasdiq kerak bo‘lsa tasdiq so‘ra/);
  assert.match(QITMIR_PERSONA, /asbobsiz yoki natijasiz "bajardim" dema/);
  assert.match(QITMIR_PERSONA, /BAJARILMADI/);
  assert.match(QITMIR_PERSONA, /hazil qilma/);
  assert.match(QITMIR_PERSONA, /Haqorat, masxara, qo‘rqitish, kamsitish/);
});

test('the voice: unchanged SSML normally; in Qitmir mode the same voice with short comic pauses', () => {
  const opts = { lang: 'uz-UZ', voice: 'uz-UZ-SardorNeural', rate: '+4%', pitch: '+25%' };
  assert.equal(
    speechSsml('Salom! Men Sunny & <do‘st>.', opts),
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="uz-UZ"><voice name="uz-UZ-SardorNeural"><prosody rate="+4%" pitch="+25%">Salom! Men Sunny &amp; &lt;do‘st&gt;.</prosody></voice></speak>',
  );
  const playful = speechSsml('Vazifani yaratdim. Endi qochib ko‘ring-chi! Tamom', { ...opts, rate: '+9%', pitch: '+28%', playful: true });
  assert.match(playful, /<voice name="uz-UZ-SardorNeural"><prosody rate="\+9%" pitch="\+28%">/);
  assert.match(playful, /yaratdim\.<break time="200ms"\/> Endi/);
  assert.match(playful, /chi!<break time="280ms"\/> Tamom/);
  assert.ok(!/<break[^>]*>\s*<\/prosody>/.test(playful), 'no pause at the very end');
});

test('a mood only colours the tone: facts, actions and serious matters stay professional', async () => {
  const { feelingPrompt } = await import('../lib/assistant/qitmir.ts');
  assert.equal(feelingPrompt(undefined), '');
  assert.equal(feelingPrompt('calm'), '');
  const sulky = feelingPrompt('offended');
  assert.match(sulky, /arazlab/);
  assert.match(sulky, /so‘ralgan ishni to‘liq va aniq bajar/);
  assert.match(sulky, /professional javob ber/);
});
