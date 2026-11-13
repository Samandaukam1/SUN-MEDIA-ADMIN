import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

await import('./integration/hooks.mjs');
const V = await import('../lib/assistant/voice-profile.ts');
const S = await import('../lib/assistant/speech.ts');
const M = await import('../lib/assistant/mood.ts');
const Q = await import('../lib/assistant/qitmir.ts');
const { VOICE_SAMPLES } = await import('../lib/assistant/voice-samples.ts');

test('mood: decided by what really happened, calm by default; Qitmir leans mischievous; professional stays neutral', () => {
  const m = (o) => M.replyMood({ reply: 'Tayyor.', ...o });
  assert.equal(m({}), 'neutral');
  assert.equal(m({ ok: true }), 'happy');
  assert.equal(m({ ok: true, celebrate: true }), 'proud');
  assert.equal(m({ ok: false }), 'sad');
  assert.equal(m({ ok: false, mode: 'qitmir' }), 'mock_angry');
  assert.equal(m({ mode: 'qitmir' }), 'mischievous');
  assert.equal(m({ mode: 'qitmir', repeated: true }), 'annoyed');
  assert.equal(M.replyMood({ reply: 'Albatta-da, men hamma narsani bilaman 😏', mode: 'qitmir' }), 'sarcastic');
  assert.equal(M.replyMood({ reply: 'Qaysi mijoz haqida?' }), 'thinking');
  assert.equal(M.replyMood({ reply: 'Zo‘r! Loyiha topshirildi.' }), 'excited');
  assert.equal(M.replyMood({ reply: 'Voy, bu kutilmagan!' }), 'surprised');
  assert.equal(M.replyMood({ reply: 'Yaxshi tun.', hour: 1 }), 'sleepy');
  assert.equal(m({ ok: false, mode: 'professional' }), 'thinking');
  assert.equal(m({ ok: true, mode: 'professional' }), 'neutral');
});

test('repeated question: same words (or nearly) twice in a row', () => {
  const h = (...q) => q.flatMap((t) => [{ role: 'user', text: t }, { role: 'assistant', text: 'javob' }]).slice(0, -1);
  assert.equal(M.isRepeat(h('Bugun nechta vazifam bor?', 'bugun nechta vazifam bor')), true);
  assert.equal(M.isRepeat(h('Bugun nechta vazifam bor?', 'Ertaga nechta vazifam bor?')), false);
  assert.equal(M.isRepeat(h('Salom')), false);
});

test('Qitmir prompt: intensity levels and one playful protest on a repeat; other modes untouched', () => {
  assert.match(Q.modePrompt('qitmir', { intensity: 1 }), /YENGIL/);
  assert.match(Q.modePrompt('qitmir', { intensity: 3, repeated: true }), /KUCHLI[\s\S]*takrorlandi/);
  assert.ok(!/takrorlandi/.test(Q.modePrompt('qitmir', { repeated: false })));
  assert.equal(Q.modePrompt(undefined, { repeated: true }), '');
  assert.match(Q.modePrompt('professional'), /PROFESSIONAL/);
  assert.match(Q.QITMIR_PERSONA, /Faktlar[\s\S]*aniq/, 'never misleads about results');
});

test('voice SSML: only prosody and breaks (no unsupported express-as); moods change rate/pitch/volume/pauses', () => {
  const base = { rate: 4, pitch: 25 };
  for (const mood of V.MOODS) {
    const x = V.moodSsml('Salom, dunyo. Qalaysiz?', { lang: 'uz-UZ', voice: 'uz-UZ-SardorNeural', mood, base });
    assert.match(x, /^<speak version="1.0"[^>]*xml:lang="uz-UZ"><voice name="uz-UZ-SardorNeural"><prosody rate="[+-]\d+%" pitch="[+-]\d+%" volume="[+-]\d+%">/);
    assert.ok(!/express-as|mstts/.test(x), mood);
  }
  const p = (m) => V.prosodyFor(m, base);
  assert.ok(parseInt(p('happy').rate) > parseInt(p('neutral').rate));
  assert.ok(parseInt(p('sleepy').rate) < parseInt(p('neutral').rate) && parseInt(p('sleepy').volume) < 0);
  assert.ok(p('thinking').sentence > 0 && parseInt(p('mock_angry').volume) > 0);
  assert.ok(parseInt(V.prosodyFor('mischievous', base, 3).pitch) > parseInt(V.prosodyFor('mischievous', base, 1).pitch), 'Qitmir intensity scales');
  assert.match(V.moodSsml('A, b. C', { lang: 'uz-UZ', voice: 'v', mood: 'thinking', base }), /,<break time="160ms"\/> b\.<break time="380ms"\/> C/);
  assert.equal(V.moodSsml('<b>&"', { lang: 'uz-UZ', voice: 'v', mood: 'neutral', base }).includes('&lt;b&gt;&amp;&quot;'), true, 'escaped');
  assert.equal(V.moodOf('qitmir'), 'mischievous');
  assert.equal(V.moodOf('bright'), 'happy');
  assert.equal(V.moodOf('nonsense'), 'neutral');
});

test('voice settings and the free-quota guard: Sardor by default, Madina fallback, never paid without the owner', () => {
  const s = V.voiceSettings({}, {});
  assert.deepEqual([s.provider, s.voice, s.fallbackVoice, s.rate, s.pitch, s.monthlyChars, s.paidAllowed], ['azure', 'uz-UZ-SardorNeural', 'uz-UZ-MadinaNeural', 4, 25, 500000, false]);
  assert.equal(V.voiceSettings({ SUNNY_TTS_PROVIDER: 'off' }, {}).provider, 'off');
  assert.equal(V.voiceSettings({}, { voice: 'bad voice' }).voice, 'uz-UZ-SardorNeural');
  assert.equal(V.voiceSettings({}, { rate: '+12%' }).rate, 12);
  assert.deepEqual(V.voiceAllowed(s, 499990, 20), { ok: false, reason: 'quota' });
  assert.deepEqual(V.voiceAllowed({ ...s, paidAllowed: true }, 499990, 20), { ok: true });
  assert.deepEqual(V.voiceAllowed({ ...s, enabled: false }, 0, 5), { ok: false, reason: 'off' });
  const stt = V.sttSettings({});
  assert.deepEqual([stt.provider, stt.monthlyMs], ['gemini', 300 * 60000]);
  assert.equal(V.sttAllowed(stt, 300 * 60000 - 1000, 2000), false);
  assert.equal(V.sttAllowed(V.sttSettings({ SUNNY_STT_PROVIDER: 'off' }), 0, 1), false);
});

test('audio cache: only fixed phrases; the key binds voice, prosody, mood, text and format', () => {
  assert.ok(V.isFixedPhrase('Eshitaman!') && V.isFixedPhrase('tayyor.'));
  assert.ok(!V.isFixedPhrase('Bugun sizga 4 ta vazifa biriktirilgan.'), 'dynamic replies are never cached');
  const h = (s) => createHash('sha256').update(s).digest('hex').slice(0, 40);
  const k = (o) => V.voiceCacheKey({ provider: 'azure', voice: 'uz-UZ-SardorNeural', rate: 4, pitch: 25, mood: 'neutral', intensity: 2, spoken: 'Eshitaman!', format: 'pcm', ...o }, h);
  assert.equal(k({}), k({}));
  for (const o of [{ voice: 'uz-UZ-MadinaNeural' }, { rate: 5 }, { pitch: 20 }, { mood: 'happy' }, { spoken: 'Tayyor.' }, { intensity: 3 }]) assert.notEqual(k(o), k({}), JSON.stringify(o));
  assert.match(k({ format: 'mp3' }), /^fixed\/mp3\/[0-9a-f]{40}\.mp3$/);
});

test('Uzbek speech text: 50 representative phrases normalised for the voice (display text untouched)', () => {
  assert.equal(VOICE_SAMPLES.length, 50);
  const out = VOICE_SAMPLES.map((s) => S.spokenText(s.text, 'uz-UZ'));
  for (const [i, t] of out.entries()) {
    assert.ok(t.length > 0, VOICE_SAMPLES[i].text);
    assert.ok(!/\d/.test(t), `no digits left: ${t}`);
    assert.ok(!/[o g]['‘’`]/i.test(t.replace(/oʻ|gʻ/gi, '')), `o‘/g‘ unified: ${t}`);
  }
  const say = (t) => S.spokenText(t, 'uz-UZ');
  assert.equal(say('Uchrashuv ertaga soat 14:30 da.'), 'Uchrashuv ertaga soat oʻn toʻrt oʻttiz da.');
  assert.match(say('S’yomka 2026-11-20 kuni bo‘ladi.'), /yigirmanchi noyabr ikki ming yigirma oltinchi yil/);
  assert.match(say('SMM tarifi oyiga 3 500 000 so‘m.'), /es-em-em tarifi oyiga uch million besh yuz ming soʻm/);
  assert.match(say('Konversiya 12% ga oshdi!'), /oʻn ikki foiz/);
  assert.match(say('Telefon raqam: +998 90 123 45 67.'), /plyus toʻqqiz yuz toʻqson sakkiz, toʻqson, yuz yigirma uch, qirq besh, oltmish yetti/);
  assert.match(say('Saytimiz: sunmediagroup.uz'), /sunmediagroup nuqta uz/);
  assert.match(say('SUN MEDIA jamoasi'), /San Media/);
  assert.match(say('KPI hisobotini tayyorladim.'), /ka-pi-ay/);
  assert.match(say('Reels va Story uchun 3 ta g‘oya bor.'), /rils va stori uchun uch ta gʻoya/);
  assert.match(say('5-6 kun ichida'), /besh–olti kun/);
  assert.match(say('Bu amalga oshirildi.'), /Bu bajarildi\./);
  assert.match(say('Bu ma’lumot mavjud emas.'), /yoʻq/);
  assert.equal(say('😏 Tayyor!'), 'Tayyor!');
});

test('pronunciation lexicon: the owner’s fixes, whole words, longest first, case-insensitive; never inside other words', () => {
  const lex = [
    { word: 'SAFI', say_as: 'Safi' },
    { word: 'SUN MEDIA GROUP', say_as: 'San Media Grup' },
    { word: 'WEDRINK', say_as: 'Vidrink' },
  ];
  assert.equal(S.applyLexicon('SAFI va WEDRINK uchun SUN MEDIA GROUP', lex), 'Safi va Vidrink uchun San Media Grup');
  assert.equal(S.applyLexicon('SAFIYA keldi', lex), 'SAFIYA keldi');
  assert.equal(S.applyLexicon('safi', lex), 'Safi');
  assert.equal(S.applyLexicon('a.b (c)', [{ word: '(c)', say_as: 'si' }]), 'a.b si', 'special characters are literal');
  assert.match(S.spokenText('SAFI s’yomkasi 10:00 da', 'uz-UZ', lex), /^Safi s’yomkasi oʻn da$/);
});
