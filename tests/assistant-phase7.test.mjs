import assert from 'node:assert/strict';
import test from 'node:test';

import { categoryOf, DEFAULT_PREFS, nudgeFor, readPrefs, ritualFor } from '../components/assistant/proactive.ts';
import { cardsFor } from '../lib/assistant/cards.ts';
import { milestone } from '../lib/assistant/mission.ts';
import { modePrompt } from '../lib/assistant/qitmir.ts';

await import('./integration/hooks.mjs');
const { briefingReply, routeCommand } = await import('../lib/assistant/router.ts');

const href = (id) => `/work/tasks/${id}`;
const ok = (malumot) => JSON.stringify({ holat: 'OK', xabar: '…', malumot });

test('holographic cards: the facts of a task list — title, client, time, status, one link; at most six', () => {
  const tasks = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, vazifa: `Vazifa ${i}`, holat: 'todo', muddat: '28 oktabr, 17:00', muddati_otgan: i === 0, mijoz: 'SAFI' }));
  const deck = cardsFor('list_tasks', ok(tasks), href);
  assert.equal(deck.title, 'Vazifalar');
  assert.equal(deck.items.length, 6);
  assert.equal(deck.more, 2);
  assert.deepEqual(deck.items[0], { title: 'Vazifa 0', sub: 'SAFI', time: '28 oktabr, 17:00', status: 'Navbatda', warn: true, href: '/work/tasks/t0' });
  assert.equal(cardsFor('list_tasks', ok([]), href), null, 'nothing to show: no cards');
  assert.equal(cardsFor('list_tasks', JSON.stringify({ holat: 'BAJARILMADI', xabar: 'yo‘q' }), href), null);
  assert.equal(cardsFor('check_in', ok({}), href), null, 'a change is not a list');
});

test('holographic cards: shootings (a plain array), today’s briefing, approvals and candidates', () => {
  const shoots = cardsFor('upcoming_shootings', JSON.stringify([{ syomka: 'Menyu', holat: 'planned', boshlanishi: '28 oktabr, 10:00', joy: 'Yunusobod', mijoz: 'SAFI' }]), href);
  assert.deepEqual(shoots.items[0], { title: 'Menyu', sub: 'SAFI · Yunusobod', time: '28 oktabr, 10:00', status: 'Rejada' });
  const day = cardsFor('briefing', ok({ syomkalar: [{ syomka: 'Menyu', mijoz: 'SAFI', vaqt: '17:00–19:00', joy: null, havola: null }], vazifalar: [{ id: 'a', vazifa: 'Montaj', holat: 'in_progress', muddat: 'bugun, 18:00', mijoz: null }], kontent: [] }), href);
  assert.deepEqual(day.items.map((c) => c.title), ['Menyu', 'Montaj'], 'shootings first (they have a time), then tasks');
  assert.equal(day.title, 'Bugungi kun');
  const approvals = cardsFor('my_approvals', ok([{ kontent: 'Tovuq reels', turi: 'reel', versiya: 2, tasdiq_muddati: '28 oktabr', post: null, muddati_otgan: true }]), href);
  assert.deepEqual(approvals.items[0], { title: 'Tovuq reels', sub: 'reel · 2-versiya', time: '28 oktabr', warn: true, status: 'Muddati o‘tgan' });
  const people = cardsFor('suggest_assignee', ok({ nomzodlar: [{ ism: 'Jasur', tavsiya: true, band: null, sabablar: ['ko‘nikmasi: Montajyor', 'ochiq vazifalari: 2', 'x'] }] }), href);
  assert.deepEqual(people.items[0], { title: 'Jasur', sub: 'ko‘nikmasi: Montajyor · ochiq vazifalari: 2', status: 'Tavsiya', warn: false });
});

test('celebration only for genuine accomplishments: a task done, content approved or published', () => {
  assert.equal(milestone('update_task', { task: 'x', status: 'done' }), true);
  assert.equal(milestone('set_content_status', { content: 'x', status: 'approved' }), true);
  assert.equal(milestone('set_content_status', { content: 'x', status: 'published' }), true);
  assert.equal(milestone('update_task', { task: 'x', status: 'in_progress' }), false);
  assert.equal(milestone('update_task', { task: 'x', due: '2026-10-28T10:00' }), false);
  assert.equal(milestone('check_in', {}), false, 'routine is not a celebration');
  assert.equal(milestone('create_task', { title: 'x', status: 'done' }), false);
});

test('rituals: once a day per kind — morning for everyone signed in, evening for staff; the mode sets the tone', () => {
  const morning = ritualFor(8, 'staff', 'normal', []);
  assert.equal(morning.key, 'morning');
  assert.equal(morning.ask, 'Bugun qanday ishlarim bor?');
  assert.equal(ritualFor(8, 'client', 'normal', []).ask, 'Loyihamiz holati qanday?');
  assert.equal(ritualFor(8, 'staff', 'normal', ['morning']), null, 'not twice a day');
  assert.equal(ritualFor(13, 'staff', 'normal', []), null, 'midday: quiet');
  assert.equal(ritualFor(18, 'staff', 'normal', []).ask, 'Vazifalarim');
  assert.equal(ritualFor(18, 'client', 'normal', []), null);
  assert.doesNotMatch(ritualFor(8, 'staff', 'professional', []).text, /[☀️😏]/u, 'professional: no emoji');
  assert.match(ritualFor(8, 'staff', 'qitmir', []).text, /😏/u);
  // Each ritual's question is one the system answers itself (no AI).
  for (const r of [morning, ritualFor(18, 'staff', 'normal', [])]) assert.ok(routeCommand(r.ask, 'staff'), r.ask);
  assert.ok(routeCommand('Loyihamiz holati qanday?', 'client'));
});

test('proactive: notifications sorted into the person’s choices; chat stays quiet unless chosen; speech off by default', () => {
  assert.equal(categoryOf('task.assigned'), 'tasks');
  assert.equal(categoryOf('task.deadline_soon'), 'deadlines');
  assert.equal(categoryOf('content.approved'), 'approvals');
  assert.equal(categoryOf('shooting.assigned'), 'shootings');
  assert.equal(categoryOf('chat.message'), 'chat');
  assert.equal(categoryOf('game.reward'), null);
  assert.equal(DEFAULT_PREFS.chat, false);
  assert.equal(DEFAULT_PREFS.speak, false);

  const n = { id: '1', type: 'task.assigned', title: 'Yangi montaj vazifasi biriktirildi', body: 'SAFI reels. Deadline: 28.10 18:00', href: '/work/tasks/1' };
  assert.deepEqual(nudgeFor(n, DEFAULT_PREFS), { key: 'n:1', text: 'Sizga yangi vazifa kelibdi: “SAFI reels”. Ko‘rib chiqamizmi?', href: '/work/tasks/1', label: 'Ochish' });
  assert.equal(nudgeFor({ ...n, type: 'chat.message' }, DEFAULT_PREFS), null);
  assert.equal(nudgeFor(n, { ...DEFAULT_PREFS, tasks: false }), null);
  assert.deepEqual(readPrefs('{"chat":true,"speak":"yes","rituals":false}'), { ...DEFAULT_PREFS, chat: true, rituals: false });
  assert.deepEqual(readPrefs('not json'), DEFAULT_PREFS);
});

test('briefing: "bugun qanday ishlarim bor" is answered by the system, only from what it has', () => {
  assert.deepEqual(routeCommand('Sunny, bugun qanday ishlarim bor?', 'staff'), { tool: 'briefing', input: {} });
  assert.deepEqual(routeCommand('kunlik brifing', 'staff'), { tool: 'briefing', input: {} });
  assert.equal(routeCommand('bugun qanday ishlarim bor', 'client'), null);
  const day = ok({ vazifalar: [{ muddati_otgan: false }, { muddati_otgan: false }, { muddati_otgan: false }, { muddati_otgan: true }], syomkalar: [{ syomka: 'Menyu', mijoz: 'SAFI', vaqt: '17:00–19:00', joy: null }], kontent: [] });
  assert.equal(briefingReply(day), 'Bugun 3 ta vazifangiz muddati tugaydi, 1 ta s’yomkangiz bor.\n1 ta vazifa muddati o‘tgan — avval shularni yoping.\nSAFI s’yomkasi soat 17:00 da.');
  assert.equal(briefingReply(ok({ vazifalar: [], syomkalar: [{ syomka: 'Menyu', mijoz: 'SAFI', vaqt: '10:00–12:00', joy: 'Yunusobod' }], kontent: [] })), 'Bugun 1 ta s’yomkangiz bor.\nSAFI s’yomkasi soat 10:00 da (Yunusobod).');
  assert.match(briefingReply(ok({ vazifalar: [], syomkalar: [], kontent: [] })), /^Bugun rejangizda .* yo‘q/);
});

test('modes: professional is serious and concise; every mode keeps the same rules', () => {
  assert.match(modePrompt('professional'), /PROFESSIONAL REJIM/);
  assert.match(modePrompt('professional'), /Hazil, qitmirlik, emoji/);
  assert.match(modePrompt('qitmir'), /QITMIR REJIM/);
  assert.equal(modePrompt(undefined), '');
  for (const m of ['professional', 'qitmir']) assert.match(modePrompt(m), /asbobsiz yoki natijasiz "bajardim" dema/);
});
