import assert from 'node:assert/strict';
import test from 'node:test';

await import('./integration/hooks.mjs');
const { actionReply, routeCommand, shootingsReply, tasksReply } = await import('../lib/assistant/router.ts');

test('exact commands go to the system’s own tools (no AI); everything else goes to the AI', () => {
  assert.deepEqual(routeCommand('Sunny, men keldim, davomatimni belgila', 'staff'), null, 'two requests in one: the AI');
  assert.deepEqual(routeCommand('Keldim', 'staff'), { tool: 'check_in', input: {} });
  assert.deepEqual(routeCommand('davomatimni belgilagin', 'staff'), { tool: 'check_in', input: {} });
  assert.deepEqual(routeCommand('Sunny, keldimni belgila', 'staff'), { tool: 'check_in', input: {} });
  assert.deepEqual(routeCommand('Vazifalarim', 'staff'), { tool: 'list_tasks', input: { scope: 'mine', filter: 'open' } });
  assert.deepEqual(routeCommand('bugungi vazifalarim qanday?', 'staff'), { tool: 'list_tasks', input: { scope: 'mine', filter: 'today' } });
  assert.equal(routeCommand('vazifalarim', 'client'), null, 'clients have no task list of their own: the AI answers');
  assert.deepEqual(routeCommand('muddati o‘tgan vazifalarim', 'staff'), { tool: 'list_tasks', input: { scope: 'mine', filter: 'overdue' } });
  assert.deepEqual(routeCommand('yaqin s’yomkalar', 'staff'), { tool: 'upcoming_shootings', input: {} });
  assert.deepEqual(routeCommand('vazifalar sahifasini och', 'staff'), { link: { href: '/work/tasks', label: 'Vazifalar' } });
  // Not for the public; not attendance for clients; not questions.
  assert.equal(routeCommand('keldim', 'public'), null);
  assert.equal(routeCommand('keldim', 'client'), null);
  for (const q of ['SAFI uchun bugun soat 5 da syomka vazifasi yarat', 'Bugun kimlar keldi?', 'vazifalarim haqida batafsil tushuntirib ber va reja tuz']) assert.equal(routeCommand(q, 'staff'), null, q);
});

test('the tool’s own words are the reply; a confirmation still waits for the person', () => {
  assert.deepEqual(actionReply(JSON.stringify({ holat: 'BAJARILDI', xabar: 'Davomatingiz belgilandi: 09:52.' })), { text: 'Davomatingiz belgilandi: 09:52.', ok: true, waiting: false });
  assert.equal(actionReply(JSON.stringify({ holat: 'BAJARILMADI', xabar: 'Kelganingizni 09:45 dan boshlab belgilash mumkin.' })).ok, false);
  const w = actionReply(JSON.stringify({ holat: 'TASDIQ KUTILMOQDA', xabar: 'Tasdiq kerak.' }));
  assert.ok(w.waiting && /Tasdiqlash tugmasini bosing/.test(w.text));
});

test('task and shooting lists read naturally', () => {
  const rows = [
    { vazifa: 'Reels montaji', holat: 'in_progress', muddat: '27-oktabr 18:00', muddati_otgan: false, mijoz: 'SAFI' },
    { vazifa: 'Ssenariy', holat: 'todo', muddat: '25-oktabr', muddati_otgan: true, mijoz: null },
  ];
  const t = tasksReply(JSON.stringify({ holat: 'OK', xabar: '2 ta vazifa.', malumot: rows }));
  assert.match(t, /^Sizda 2 ta ochiq vazifa bor \(1 tasi muddati o‘tgan\):/);
  assert.match(t, /1\. Reels montaji — SAFI, muddat 27-oktabr 18:00 \(jarayonda\)/);
  assert.equal(tasksReply(JSON.stringify({ holat: 'OK', xabar: 'Bunday vazifa yo‘q.', malumot: [] }), 'overdue'), 'Muddati o‘tgan vazifangiz yo‘q.');
  assert.equal(tasksReply(JSON.stringify({ holat: 'BAJARILMADI', xabar: 'Ruxsat yo‘q.' })), 'Ruxsat yo‘q.');
  assert.match(shootingsReply(JSON.stringify([{ syomka: 'SAFI Yunusobod', holat: 'confirmed', boshlanishi: '28-oktabr 11:00', joy: 'Yunusobod', mijoz: 'SAFI' }])), /1\. 28-oktabr 11:00 — SAFI Yunusobod \(SAFI\), Yunusobod/);
});
