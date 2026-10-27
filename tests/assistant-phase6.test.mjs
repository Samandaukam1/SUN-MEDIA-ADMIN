import assert from 'node:assert/strict';
import test from 'node:test';

import { fits, rankCandidates } from '../lib/assistant/delegation.ts';
import { missionLedger, stepOf } from '../lib/assistant/mission.ts';
import { assessRisks } from '../lib/assistant/predict.ts';
import { matches, searchTerms, snippet } from '../lib/assistant/recall.ts';

await import('./integration/hooks.mjs');
const { approvalsReply, partnerReply, risksReply, routeCommand } = await import('../lib/assistant/router.ts');

// ---------------------------------------------------------------------------
// Smart delegation
// ---------------------------------------------------------------------------
const person = (over) => ({ id: over.name, title: null, skill: null, titleFit: false, done: 0, sameClient: 0, open: 0, overdue: 0, dueThatDay: 0, shootingsThatDay: 0, away: null, ...over });

test('delegation: a recorded skill is found by the owner’s workflow role or by its name', () => {
  assert.deepEqual(fits('editing', [{ name: 'Video ishlovchi', workflow_role: 'editor' }], null), { skill: 'Video ishlovchi', title: false });
  assert.deepEqual(fits('editing', [{ name: 'Montajyor', workflow_role: null }], null), { skill: 'Montajyor', title: false });
  assert.deepEqual(fits('editing', [{ name: 'Operator', workflow_role: 'operator' }], 'Montajchi'), { skill: null, title: true });
  assert.deepEqual(fits('meeting', [{ name: 'Montajyor', workflow_role: 'editor' }], null), { skill: null, title: false });
});

test('delegation: the skilled, less loaded person first; anyone away goes last; every reason is a checkable fact', () => {
  const ranked = rankCandidates(
    [
      person({ name: 'Aziz', skill: 'Montajyor', done: 4, open: 2, sameClient: 2 }),
      person({ name: 'Jasur', skill: 'Montajyor', done: 6, open: 7, overdue: 3 }),
      person({ name: 'Nodira', open: 0 }),
      person({ name: 'Bekzod', skill: 'Montajyor', done: 9, away: 'o‘sha kuni ta’tilda' }),
    ],
    'editing',
    'SAFI',
  );
  assert.deepEqual(ranked.map((r) => r.ism), ['Aziz', 'Jasur', 'Nodira', 'Bekzod']);
  assert.equal(ranked[0].mos, true);
  assert.ok(ranked.slice(1).every((r) => !r.mos), 'one recommendation only');
  assert.deepEqual(ranked[0].sabablar, ['ko‘nikmasi: Montajyor', 'so‘nggi 90 kunda 4 ta montaj vazifasini yakunlagan', 'SAFI bilan 2 ta vazifada ishlagan', 'ochiq vazifalari: 2']);
  assert.match(ranked[1].sabablar.join('; '), /ochiq vazifalari: 7 \(3 tasi muddati o‘tgan\)/);
  assert.equal(ranked[3].band, 'o‘sha kuni ta’tilda');
});

test('delegation: a shooting that day counts against; with nobody skilled, the least loaded is suggested', () => {
  const busy = rankCandidates([person({ name: 'A', skill: 'Operator', shootingsThatDay: 2 }), person({ name: 'B', skill: 'Operator' })], 'shooting');
  assert.equal(busy[0].ism, 'B');
  assert.match(busy[1].sabablar.join(' '), /o‘sha kuni 2 ta s’yomkada/);
  const nobody = rankCandidates([person({ name: 'A', open: 5 }), person({ name: 'B', open: 1 })], 'design');
  assert.equal(nobody[0].ism, 'B');
  assert.equal(nobody[0].mos, true);
  assert.deepEqual(rankCandidates([person({ name: 'A', away: 'o‘sha kun ish kuni emas' })], 'design')[0].mos, false, 'someone away is never the recommendation');
});

// ---------------------------------------------------------------------------
// Predictive intelligence
// ---------------------------------------------------------------------------
const NOW = new Date('2026-10-27T07:00:00Z'); // 12:00 Tashkent
const at = (hours) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();
const content = (over) => ({ id: 'k1', title: 'Opal video', status: 'editing', due_at: null, post_at: null, client_approval_due_at: null, status_changed_at: at(-2), client: 'Opal Education', shooting_id: null, equipment_total: 0, equipment_ready: 0, ...over });
const shooting = (over) => ({ id: 's1', title: 'Opal s’yomka', status: 'planned', starts_at: at(20), ends_at: at(23), client: 'Opal Education', members: [], ...over });
const task = (over) => ({ id: 't1', title: 'SAFI montaj', status: 'todo', due_at: at(30), task_type: 'editing', client: 'SAFI', assignees: ['Aziz'], ...over });
const kinds = (risks) => risks.map((r) => `${r.tur}:${r.daraja}`);

test('risks: a script not approved before its shooting (the spec example), and equipment not ready', () => {
  const risks = assessRisks({ tasks: [], content: [content({ status: 'script', shooting_id: 's1', equipment_total: 3, equipment_ready: 1 })], shootings: [shooting()] }, NOW);
  assert.deepEqual(kinds(risks), ['ssenariy tasdiqlanmagan:yuqori', 'jihoz tayyor emas:yuqori']);
  assert.match(risks[0].nima, /“Opal video” \(Opal Education\) — s’yomka .*, lekin ssenariy hali tasdiqlanmagan/);
  assert.match(risks[0].qoida, /3 kundan kam/, 'each risk names the rule that found it');
  assert.match(risks[1].nima, /jihozlar 1\/3 tayyor/);
});

test('risks: deadline close and not started; nobody on it; a post close and still unapproved or not ready', () => {
  const risks = assessRisks(
    {
      tasks: [task(), task({ id: 't2', title: 'Dizayn', due_at: at(10), assignees: [] }), task({ id: 't3', status: 'in_progress', due_at: at(5) }), task({ id: 't4', due_at: at(100) })],
      content: [content({ id: 'k2', status: 'client_review', post_at: at(30) }), content({ id: 'k3', status: 'editing', post_at: at(8) }), content({ id: 'k4', status: 'client_review', client_approval_due_at: at(-5) }), content({ id: 'k5', status: 'internal_review', post_at: at(6) })],
      shootings: [],
    },
    NOW,
  );
  assert.deepEqual(kinds(risks).sort(), ['mas’ul yo‘q:yuqori', 'mijoz tasdig‘i kechikmoqda:yuqori', 'mijoz tasdig‘i kechikmoqda:yuqori', 'muddat yaqin, boshlanmagan:o‘rta', 'post tayyor emas:yuqori', 'tasdiq kechikmoqda:yuqori'].sort());
  assert.ok(!risks.some((r) => r.havola === '/work/tasks/t3' || r.havola === '/work/tasks/t4'), 'started or far away: no risk');
});

test('risks: one person on two overlapping shootings; editing backlog; finished work is never a risk', () => {
  const crew = [{ id: 'u1', name: 'Aziz' }];
  const risks = assessRisks(
    {
      tasks: [1, 2, 3, 4].map((n) => task({ id: `e${n}`, status: 'in_progress', due_at: at(200), assignees: ['Jasur'] })),
      content: [content({ status: 'shot', status_changed_at: at(-24 * 4) }), content({ id: 'k9', status: 'published', post_at: at(2) })],
      shootings: [shooting({ members: crew }), shooting({ id: 's2', title: 'SAFI s’yomka', starts_at: at(21), ends_at: at(22), client: 'SAFI', members: crew })],
    },
    NOW,
  );
  assert.deepEqual(kinds(risks).sort(), ['montaj navbati:o‘rta', 'montaj navbati:o‘rta', 's’yomkalar to‘qnashuvi:yuqori'].sort());
  assert.match(risks.find((r) => r.tur === 's’yomkalar to‘qnashuvi').nima, /^Aziz bir vaqtda ikki s’yomkada/);
  assert.deepEqual(assessRisks({ tasks: [], content: [], shootings: [] }, NOW), []);
});

// ---------------------------------------------------------------------------
// Universal memory search
// ---------------------------------------------------------------------------
test('search terms: subject words only, stemmed, apostrophes as one any-character; safe for a filter', () => {
  assert.deepEqual(searchTerms('Sunny, o‘tgan oy SAFI videosi bo‘yicha nima kelishgandik?'), ['safi', 'video']);
  assert.deepEqual(searchTerms('montajdagi musiqa haqida qayerda yozilgan edi'), ['monta', 'musiqa', 'yozil']);
  assert.deepEqual(searchTerms('Ko‘rsatuv ssenariysi'), ['ko_rsa', 'ssena']);
  assert.deepEqual(searchTerms('nima, qachon?'), []);
  for (const t of searchTerms('a,b) or(x); drop % _ \\ ; "SAFI"')) assert.match(t, /^[\p{L}\p{N}_]+$/u);
  assert.equal(matches('SAFI uchun ko‘rsatuv videosini kechqurun', searchTerms('safi korsatuv video')), 2);
  assert.match(snippet(`${'x '.repeat(100)}SAFI videosi 19:00 da chiqadi`, ['safi']), /^…[ x]*SAFI videosi 19:00 da chiqadi$/);
});

// ---------------------------------------------------------------------------
// Mission mode: the system's own account of each change
// ---------------------------------------------------------------------------
test('mission ledger: done, not done (with the reason) and waiting — never a single "all done" when one failed', () => {
  const steps = [
    stepOf('create_shooting', JSON.stringify({ holat: 'BAJARILDI', xabar: 'S’yomka rejalashtirildi: “SAFI — s’yomka”, 28 oktabr, 10:00–13:00.' })),
    stepOf('create_task', JSON.stringify({ holat: 'BAJARILMADI', xabar: '“Azizz” nomli xodim topilmadi.' })),
    stepOf('send_message', JSON.stringify({ holat: 'TASDIQ KUTILMOQDA', xabar: 'TASDIQ KUTILMOQDA: …', amal: 'Jamoa chatiga xabar yuboriladi.' })),
  ];
  assert.deepEqual(steps.map((s) => s.state), ['done', 'failed', 'waiting']);
  const ledger = missionLedger(steps);
  assert.equal(ledger.split('\n')[0], 'Natija — 1 ta bajarildi, 1 ta bajarilmadi, 1 ta tasdiqingizni kutmoqda:');
  assert.match(ledger, /❌ Vazifa: “Azizz” nomli xodim topilmadi\./);
  assert.match(ledger, /⏳ Xabar: Jamoa chatiga xabar yuboriladi\. Tasdiqlash tugmasini bosing\./);
  assert.equal(missionLedger(steps.slice(0, 1)), '', 'one change speaks for itself');
  assert.equal(stepOf('create_task', 'not json'), null);
});

// ---------------------------------------------------------------------------
// Deterministic routes and their replies
// ---------------------------------------------------------------------------
test('routes: staff risks; a partner’s approvals and project status — and never across audiences', () => {
  assert.deepEqual(routeCommand('Nima kechikishi mumkin?', 'staff'), { tool: 'risks', input: {} });
  assert.deepEqual(routeCommand('xavflar bormi', 'staff'), { tool: 'risks', input: {} });
  assert.deepEqual(routeCommand('Nimaga e’tibor beray?', 'staff'), { tool: 'risks', input: {} });
  assert.equal(routeCommand('xavflar', 'client'), null);
  assert.deepEqual(routeCommand('Qaysi postlar tasdiqlashimni kutyapti?', 'client'), { tool: 'my_approvals', input: {} });
  assert.deepEqual(routeCommand('Tasdiqlashim kerak bo‘lganlar', 'client'), { tool: 'my_approvals', input: {} });
  assert.deepEqual(routeCommand('Loyihamiz holati qanday?', 'client'), { tool: 'partner_status', input: {} });
  assert.deepEqual(routeCommand('Sunny, loyihamiz bo‘yicha ma’lumot bering', 'client'), { tool: 'partner_status', input: {} });
  assert.equal(routeCommand('Qaysi postlar tasdiqlashimni kutyapti?', 'staff'), null);
  assert.equal(routeCommand('Loyihamiz holati qanday?', 'public'), null);
  assert.equal(routeCommand('Bizning video qaysi bosqichda?', 'client'), null, 'a specific question goes to the AI with the tools');
});

test('replies: risks said as a forecast; approvals with the app’s place; a partner’s project at a glance', () => {
  const risks = JSON.stringify({ holat: 'OK', xabar: '2 ta', malumot: [{ daraja: 'yuqori', nima: '“Opal video” — ssenariy hali tasdiqlanmagan', tavsiya: 'Bugun tasdiqlating.' }, { daraja: 'o‘rta', nima: 'Jasurda 4 ta ochiq montaj', tavsiya: 'Bir qismini bering.' }] });
  assert.equal(risksReply(risks), 'Qoidalar bo‘yicha 2 ta ehtimoliy xavf, 1 tasi yuqori (bu taxmin, fakt emas):\n1. (yuqori) “Opal video” — ssenariy hali tasdiqlanmagan. Bugun tasdiqlating.\n2. Jasurda 4 ta ochiq montaj. Bir qismini bering.');
  assert.equal(risksReply(JSON.stringify({ holat: 'OK', xabar: 'Hozircha xavf yo‘q.', malumot: [] })), 'Hozircha xavf yo‘q.');

  const approvals = JSON.stringify({ holat: 'OK', malumot: [{ kontent: 'Tovuq reels', turi: 'reel', versiya: 2, tasdiq_muddati: '28 oktabr, 18:00', post: null, muddati_otgan: true }] });
  assert.equal(approvalsReply(approvals), '1 ta kontent tasdiqingizni kutmoqda:\n1. “Tovuq reels” (reel, 2-versiya) — tasdiq muddati 28 oktabr, 18:00, muddati o‘tgan\nUlarni Sun Media ilovasidagi «Tasdiqlash» bo‘limida ko‘rib, tasdiqlang yoki izoh qoldiring.');
  assert.equal(approvalsReply(JSON.stringify({ holat: 'OK', malumot: [] })), 'Hozir tasdiqingizni kutayotgan kontent yo‘q.');

  const status = JSON.stringify({
    holat: 'OK',
    malumot: { hamkor: 'SAFI', holat: { ishlab_chiqarishda: 3, montajda: 1, tasdiqingizni_kutmoqda: 2, shu_oy_chiqdi: 5 }, kontent: [{ kontent: 'Tovuq reels', bosqich: 'Montaj', post: '30 oktabr, 18:00' }], yaqin: [{ nima: 's’yomka', nomi: 'Menyu', vaqt: '28 oktabr, 10:00' }] },
  });
  assert.equal(partnerReply(status), 'SAFI: 3 ta kontent ishlab chiqarishda, 1 tasi montajda, 2 tasi tasdiqingizni kutmoqda, shu oy 5 ta post chiqdi.\nKontent: “Tovuq reels” — Montaj, post 30 oktabr, 18:00.\nYaqinda: s’yomka “Menyu” — 28 oktabr, 10:00.');
  assert.equal(partnerReply(JSON.stringify({ holat: 'BAJARILMADI', xabar: 'Kabinetingizga biriktirilgan loyiha topilmadi.' })), 'Kabinetingizga biriktirilgan loyiha topilmadi.');
});
