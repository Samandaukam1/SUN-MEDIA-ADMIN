import assert from 'node:assert/strict';
import test from 'node:test';

import { answers } from '../components/assistant/answers.ts';

test('a short yes (typed or heard) confirms', () => {
  for (const t of ['ha', 'Ha.', 'xa', 'ha, bajar', 'tasdiqlayman', 'Mayli', 'ok', 'ha qil', 'Да', 'yes']) assert.equal(answers(t), 'yes', t);
});

test('a short no cancels', () => {
  for (const t of ['yo‘q', "yo'q", 'yoq', 'bekor qil', 'kerak emas', 'Bekor', 'нет', 'qilma']) assert.equal(answers(t), 'no', t);
});

test('anything else is a new message, not an answer to the card', () => {
  for (const t of ['ha, lekin soat 6 ga qo‘y', 'ha kerak emas', 'Jasurga ham yoz', 'nima bu?', '', 'yo‘q, ertaga qil desam ham bajar']) assert.equal(answers(t), null, t);
});
