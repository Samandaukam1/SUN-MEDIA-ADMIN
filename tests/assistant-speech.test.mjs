import assert from 'node:assert/strict';
import test from 'node:test';

import { firstSentence, speakable, speechChunks, textLanguage, uzNumber, uzOrdinal } from '../lib/assistant/speech.ts';

test('numbers are read in literary Uzbek', () => {
  assert.equal(uzNumber(0), 'nol');
  assert.equal(uzNumber(14), 'o‘n to‘rt');
  assert.equal(uzNumber(125), 'yuz yigirma besh');
  assert.equal(uzNumber(1000), 'ming');
  assert.equal(uzNumber(2026), 'ikki ming yigirma olti');
  assert.equal(uzNumber(1_500_000), 'bir million besh yuz ming');
  assert.equal(uzNumber(4_990_000), 'to‘rt million to‘qqiz yuz to‘qson ming');
  assert.equal(uzOrdinal(1), 'birinchi');
  assert.equal(uzOrdinal(2), 'ikkinchi');
  assert.equal(uzOrdinal(20), 'yigirmanchi');
  assert.equal(uzOrdinal(25), 'yigirma beshinchi');
});

test('prices, percents, dates, times and ranges become words', () => {
  assert.equal(speakable('Narxi 5 000 000 so‘m.'), 'Narxi besh million soʻm.');
  assert.equal(speakable('150 000 000 so‘m'), 'yuz ellik million soʻm');
  assert.equal(speakable('Qamrov 30% ga oshdi'), 'Qamrov oʻttiz foiz ga oshdi');
  assert.equal(speakable('25.10.2026 kuni'), 'yigirma beshinchi oktabr ikki ming yigirma oltinchi yil kuni');
  assert.equal(speakable('Soat 14:30 da'), 'Soat oʻn toʻrt oʻttiz da');
  assert.equal(speakable('3-bosqich'), 'uchinchi bosqich');
  assert.equal(speakable('5-7 kun'), 'besh–yetti kun');
  assert.equal(speakable('1,5 mln'), 'bir butun oʻndan besh million');
});

test('phones are read in groups, prices are not mistaken for phones', () => {
  assert.equal(speakable('+998 90 123 45 67'), 'plyus toʻqqiz yuz toʻqson sakkiz, toʻqson, yuz yigirma uch, qirq besh, oltmish yetti');
  assert.match(speakable('120 000 000 soʻm'), /^yuz yigirma million/);
});

test('brand, abbreviations, markdown, links and emoji are spoken naturally', () => {
  assert.equal(speakable('SUN MEDIA — SMM agentligi'), 'San Media — es-em-em agentligi');
  assert.equal(speakable('**Tariflar** [bu yerda](/tariflar) 🚀'), 'Tariflar bu yerda');
  assert.equal(speakable('Batafsil: https://sunmediagroup.uz/tariflar'), 'Batafsil:');
  assert.equal(speakable('/keyslar/restoran sahifasi'), 'keyslar restoran sahifasi');
  assert.equal(speakable('Instagram: @sun.media_uz'), 'Instagram: San Media uz');
  assert.equal(speakable('Telegram: @ali_brand'), 'Telegram: ali brand');
});

test("o' and g' become the official letter; list lines become sentences", () => {
  assert.equal(speakable("Biz o'zbek tilida g'oya beramiz"), 'Biz oʻzbek tilida gʻoya beramiz');
  assert.equal(speakable('Xizmatlar:\n- SMM\n- Video'), 'Xizmatlar: es-em-em. Video');
  assert.equal(speakable('1. Strategiya\n2. Kontent'), 'Strategiya. Kontent');
});

test('Cyrillic and other languages keep their digits; the brand is still said right', () => {
  assert.equal(speakable('SUN MEDIA предлагает 3 тарифа', 'ru-RU'), 'Сан Медиа предлагает 3 тарифа');
  assert.equal(speakable('We have 3 plans', 'en-US'), 'We have 3 plans');
});

test('the first finished sentence is spoken while the rest is still being written', () => {
  assert.equal(firstSentence('Salom!'), null);
  assert.equal(firstSentence('Salom! Men Sunny, SUN MEDIA yordamchisiman. Sizga'), 'Salom! Men Sunny, SUN MEDIA yordamchisiman. ');
  assert.equal(firstSentence('SUN MEDIA SMM bilan shug‘ullanadi.'), null, 'a sentence is finished only when more text follows');
  const long = 'SUN MEDIA brendingiz uchun SMM strategiya, professional foto va video syomka, montaj, grafik dizayn hamda maqsadli target reklamani birlashtirgan kompleks xizmatlarni';
  assert.ok(firstSentence(long)?.endsWith(', '));
});

test('speech chunks stay under the limit and are cut between sentences', () => {
  const text = Array.from({ length: 30 }, (_, i) => `Bu ${i + 1}-gap bo‘lib, biroz uzunroq yozilgan.`).join(' ');
  const chunks = speechChunks(text, 200);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.length <= 200, c);
    assert.match(c, /\.$/);
  }
  assert.equal(chunks.join(' ').replace(/\s+/g, ' '), text);
  assert.deepEqual(speechChunks('   '), []);
});

test('the reply language follows the visitor: Uzbek Latin or Cyrillic, Russian, English', () => {
  assert.deepEqual(textLanguage('Salom, Sun Media qanday xizmatlar ko‘rsatadi?'), { lang: 'uz-UZ', cyrillic: false });
  assert.deepEqual(textLanguage('Ассалому алайкум, нархлар қанча?'), { lang: 'uz-UZ', cyrillic: true });
  assert.deepEqual(textLanguage('Салом, нархлар канча?'), { lang: 'uz-UZ', cyrillic: true });
  assert.deepEqual(textLanguage('Сколько стоит SMM?'), { lang: 'ru-RU', cyrillic: true });
  assert.deepEqual(textLanguage('How much does video production cost?'), { lang: 'en-US', cyrillic: false });
  assert.deepEqual(textLanguage('SMM narxi?'), { lang: 'uz-UZ', cyrillic: false });
  assert.deepEqual(textLanguage('Restoran uchun keyslar bormi?'), { lang: 'uz-UZ', cyrillic: false });
});
