import assert from 'node:assert/strict';
import test from 'node:test';

await import('./integration/hooks.mjs');
const E = await import('../lib/brief/engine.ts');
const { classifyText } = await import('../lib/brief/industries.ts');
const G = await import('../lib/brief/guard.ts');
const { buildFacts } = await import('../lib/brief/report.ts');
const AI = await import('../lib/brief/openai.ts');

const bank = E.builtinBank();

/**
 * Plays an interview through the engine. `script` answers by key; anything not scripted gets a neutral answer
 * (first option / short text). Returns the keys in the order asked and the final context.
 */
function play(script, { classified = null, known = [], max = 60 } = {}) {
  const ctx = { bank, answers: {}, order: [], classified, known, ai: [] };
  const asked = [];
  for (let i = 0; i < max; i++) {
    const n = E.nextQuestion(ctx);
    if (n.done) break;
    const q = n.question;
    asked.push(q.key);
    const raw = script[q.key] ?? (q.type === 'text' ? { text: 'Javob matni' } : { choice: [n.options[0].key] });
    const v = E.validateAnswer(q, n.options, raw);
    assert.ok(v.ok, `${q.key}: ${v.error}`);
    ctx.answers[q.key] = v.value;
    ctx.order.push(q.key);
  }
  return { asked, ctx };
}
const records = (ctx) =>
  ctx.order.map((key) => {
    const q = bank.find((b) => b.key === key);
    const eff = E.effectiveAnswers(bank, ctx.answers);
    const { industry } = E.industryOfAnswers(ctx.answers, ctx.classified);
    return { key, question: { text: q.text, type: q.type, stage: q.stage, category: q.category, purpose: q.purpose, options: E.optionsFor(q, bank, eff, industry), source: q.source }, value: ctx.answers[key] };
  });

// ------------------------------------------------------------------------------------------------ scenarios

test('1. polyclinic: 3 branches, 18 doctors, wants booking → branch, schedule and doctor-aware website questions', () => {
  const { asked, ctx } = play({
    'id.industry': { choice: ['clinic'] },
    'id.sub': { choice: ['multi'] },
    'cl.services': { choice: ['therapy', 'diagnostics', 'lab', 'cardiology'] },
    'cl.branches': { choice: ['2_3'] },
    'cl.doctors': { choice: ['11_25'] },
    'cl.schedule': { choice: ['excel'] },
    'mk.has_site': { choice: ['no'] },
    'web.need': { choice: ['new'] },
    'ws.modules.clinic': { choice: ['doctors', 'booking', 'branches', 'prices'] },
    'ws.must': { choice: ['booking', 'doctors'] },
    'wh.branch_diff': { choice: ['doctors', 'hours'] },
  });
  for (const k of ['cl.services', 'cl.branches', 'cl.branch_ops', 'cl.doctors', 'cl.schedule', 'web.need', 'ws.modules.clinic', 'wh.doctor_pages', 'wh.branch_diff', 'wh.booking_choose', 'wh.booking_confirm', 'wh.schedule_source'])
    assert.ok(asked.includes(k), `asked ${k}`);
  assert.ok(!asked.some((k) => /^(sa|fd|b2|mf|rt|ed)\./.test(k)), 'no other industry’s questions');
  assert.ok(!asked.includes('wh.schedule_sync'), 'no MIS sync question when the schedule is in Excel');
  const doctorQ = E.interpolate(bank.find((q) => q.key === 'wh.doctor_pages').text, bank, ctx.answers, 'clinic');
  assert.match(doctorQ, /11–25 ta shifokor/, 'the question refers to the earlier answer');
  const core = asked.filter((k) => ['identity', 'industry', 'marketing'].includes(bank.find((q) => q.key === k).stage));
  assert.ok(core.length >= 12 && core.length <= 20, `core length ${core.length}`);
});

test('2. education consulting: countries, multi-country handling, process, focus, qualification — not clinic questions', () => {
  const { asked } = play({
    'id.industry': { choice: ['study_abroad'] },
    'id.sub': { choice: ['admissions'] },
    'sa.countries': { choice: ['korea', 'germany', 'turkey'] },
    'web.need': { choice: ['not_now'] },
  });
  for (const k of ['sa.countries', 'sa.multi_country', 'sa.services', 'sa.process', 'sa.focus']) assert.ok(asked.includes(k), `asked ${k}`);
  assert.ok(!asked.some((k) => k.startsWith('cl.')));
  const one = play({ 'id.industry': { choice: ['study_abroad'] }, 'sa.countries': { choice: ['korea'] } }).asked;
  assert.ok(!one.includes('sa.multi_country'), 'one country → no multi-country question');
});

test('3. B2B manufacturer selling to shops and restaurants: distribution and partners; followers are not the goal', () => {
  const { asked, ctx } = play({
    'id.industry': { choice: ['manufacturing'] },
    'id.sub': { choice: ['food_products'] },
    'id.customers': { choice: ['resellers'] },
    'b2.buyers': { choice: ['stores', 'horeca'] },
    'web.need': { choice: ['not_now'] },
  });
  for (const k of ['b2.buyers', 'b2.coverage', 'mf.capacity', 'b2.logistics', 'b2.sales_team']) assert.ok(asked.includes(k), `asked ${k}`);
  assert.ok(!asked.some((k) => /^(fd|cl|rt)\./.test(k)));
  const facts = buildFacts(records(ctx), { industry: 'manufacturing', sub: 'food_products' });
  assert.ok(facts.notes.some((n) => /Instagram obunachilari asosiy maqsad emas/.test(n.text)));
});

test('4. restaurant without delivery that needs no website: restaurant questions, website branch skipped', () => {
  const { asked } = play({ 'id.industry': { choice: ['food'] }, 'fd.format': { choice: ['dine_in'] }, 'web.need': { choice: ['not_now'] } });
  assert.ok(asked.includes('fd.format') && asked.includes('fd.slow'));
  assert.ok(!asked.some((k) => k.startsWith('ws.') || k.startsWith('wf.') || k.startsWith('wh.')), 'no website questions');
  assert.ok(asked.includes('wr.timeline'), 'reaches the wrap-up');
});

test('5. unknown / unusual industry: classified from the client’s words, or handled with useful generic questions', () => {
  assert.equal(classifyText('Toshkentda parranda go‘shti ishlab chiqaramiz va do‘konlarga sotamiz').industry, 'manufacturing');
  assert.equal(classifyText("Bolalar uchun IELTS va ingliz tili kurslari o'tamiz").industry, 'edu_center');
  const vague = classifyText('Biz to‘y marosimlarini tashkil qilamiz');
  assert.equal(vague.industry, 'other');
  assert.equal(vague.confidence, 0);
  const viaText = play({ 'id.industry': { choice: ['other'] }, 'id.industry_text': { text: 'Parranda go‘shti ishlab chiqaramiz' } }, { classified: { industry: 'manufacturing', sub: 'food_products' } });
  assert.ok(viaText.asked.includes('id.industry_text'));
  assert.ok(viaText.asked.includes('b2.buyers'), 'continues with the classified industry');
  const unknown = play({ 'id.industry': { choice: ['other'] }, 'id.industry_text': { text: 'To‘y marosimlari' } });
  for (const k of ['ot.offer_type', 'ot.purchase', 'ot.decision']) assert.ok(unknown.asked.includes(k), `generic ${k}`);
});

test('6. contradiction: no website, then “update the current one” → a polite clarification before going on', () => {
  const ctx = { bank, answers: {}, order: [], ai: [] };
  const script = { 'id.industry': { choice: ['beauty'] }, 'mk.has_site': { choice: ['no'] }, 'web.need': { choice: ['update'] } };
  let clarify = null;
  for (let i = 0; i < 40; i++) {
    const n = E.nextQuestion(ctx);
    assert.equal(n.done, false);
    if (n.question.key === 'clarify.site') {
      clarify = n;
      break;
    }
    const v = E.validateAnswer(n.question, n.options, script[n.question.key] ?? (n.question.type === 'text' ? { text: 'Javob' } : { choice: [n.options[0].key] }));
    ctx.answers[n.question.key] = v.value;
    ctx.order.push(n.question.key);
  }
  assert.ok(clarify, 'clarification asked');
  assert.equal(ctx.order.at(-1), 'web.need', 'right after the contradicting answer');
  ctx.answers['clarify.site'] = { choice: ['none_new'] };
  ctx.order.push('clarify.site');
  const eff = E.effectiveAnswers(bank, ctx.answers);
  assert.deepEqual(eff['web.need'], { choice: ['new'] });
  assert.deepEqual(ctx.answers['web.need'], { choice: ['update'] }, 'the original answer stays as given');
  const next = E.nextQuestion(ctx);
  assert.equal(next.question.stage, 'website', 'the website flow opens');
  assert.notEqual(next.question.key, 'ws.current_issues', 'no “what is wrong with the current site” after it turned out there is none');
});

test('7. AI failure: timeouts, outages, a missing model and bad output fail closed — the engine does not need them', async () => {
  process.env.OPENAI_API_KEY = 'sk-test-not-real';
  const call = (fetchImpl) =>
    AI.respond({ purpose: 'question', instructions: 'x', input: 'y', schemaName: 's', schema: {}, parse: (d) => d, fetchImpl, sleep: async () => {}, timeoutMs: 5000 });
  const down = await call(async () => {
    throw new TypeError('fetch failed');
  });
  assert.equal(down.ok, false);
  const busy = await call(async () => new Response('{}', { status: 503 }));
  assert.equal(busy.kind, 'server');
  const invalid = await call(async () => new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }], usage: { input_tokens: 5, output_tokens: 2 } })));
  assert.equal(invalid.kind, 'invalid_output');
  assert.deepEqual([invalid.usage.input, invalid.usage.output], [5, 2], 'usage recorded even when the output is rejected');
  const missing = await call(async () => new Response(JSON.stringify({ error: { code: 'model_not_found' } }), { status: 404 }));
  assert.equal(missing.kind, 'model');
  assert.equal(AI.modelBlocked(AI.aiConfig().models.question), true, 'skipped for a while');
  let calls = 0;
  const after = await call(async () => (calls++, new Response('{}')));
  assert.equal(after.kind, 'model');
  assert.equal(calls, 0, 'no further calls to a missing model');
  // Meanwhile the interview goes on with the curated questions.
  const { asked } = play({ 'id.industry': { choice: ['retail'] }, 'web.need': { choice: ['not_now'] } });
  assert.ok(asked.includes('rt.channels'));
  delete process.env.OPENAI_API_KEY;
});

test('7b. a good structured answer is parsed; one retry after a passing failure; no key → nothing is called', async () => {
  process.env.OPENAI_API_KEY = 'sk-test-not-real';
  process.env.OPENAI_ANALYSIS_MODEL = 'test-analysis-model';
  let n = 0;
  const ok = await AI.respond({
    purpose: 'analysis',
    instructions: 'x',
    input: 'y',
    schemaName: 's',
    schema: {},
    parse: (d) => (d.industry ? d : null),
    sleep: async () => {},
    fetchImpl: async (url, init) => {
      n++;
      assert.match(String(url), /\/v1\/responses$/);
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'test-analysis-model');
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(body.text.format.strict, true);
      assert.equal(body.store, false);
      if (n === 1) return new Response('{}', { status: 429 });
      return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"industry":"clinic"}' }] }], usage: { input_tokens: 10, output_tokens: 3 } }));
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.industry, 'clinic');
  assert.equal(n, 2);
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_ANALYSIS_MODEL;
  let touched = false;
  const none = await AI.respond({ purpose: 'question', instructions: '', input: '', schemaName: 's', schema: {}, parse: (d) => d, fetchImpl: async () => ((touched = true), new Response('{}')) });
  assert.equal(none.kind, 'config');
  assert.equal(touched, false);
  assert.equal(AI.redact('Tel: +998 90 123-45-67, mail a.b@c.uz'), 'Tel: [telefon], mail [email]');
});

test('8. interrupted session: the same stored answers and order give the same next question', () => {
  const { ctx } = play({ 'id.industry': { choice: ['dental'] } }, { max: 9 });
  const before = E.nextQuestion(ctx);
  const restored = { bank, answers: JSON.parse(JSON.stringify(ctx.answers)), order: [...ctx.order], ai: [] };
  const after = E.nextQuestion(restored);
  assert.equal(after.question.key, before.question.key);
  assert.equal(after.progress.answered, ctx.order.length);
});

test('9. what a client sends is checked against the question on screen only', () => {
  const q = bank.find((b) => b.key === 'cl.branches');
  const options = E.optionsFor(q, bank, {}, 'clinic');
  assert.equal(E.validateAnswer(q, options, { choice: ['admin_override'] }).ok, false, 'unknown option refused');
  assert.equal(E.validateAnswer(q, options, { choice: ['one', '2_3'] }).ok, false, 'one choice only');
  assert.equal(E.validateAnswer(q, options, { skipped: true }).ok, false, 'a required question cannot be skipped');
  assert.equal(E.validateAnswer(q, options, { choice: ['one'], extra: '<script>' }).value.extra, undefined, 'unknown fields dropped');
  const ch = bank.find((b) => b.key === 'mk.challenge');
  assert.equal(E.validateAnswer(ch, E.optionsFor(ch, bank, {}, 'clinic'), { choice: ['few_leads', 'no_buy', 'ads_cost', 'slow_reply'] }).ok, false, 'max 3');
  assert.equal(E.validateAnswer(ch, E.optionsFor(ch, bank, {}, 'clinic'), { choice: ['other'] }).ok, false, '“Boshqa” needs words');
  assert.deepEqual(E.validateAnswer(ch, E.optionsFor(ch, bank, {}, 'clinic'), { choice: ['other'], other: '  Kadrlar\u0000 yetishmaydi ' }).value, { choice: ['other'], other: 'Kadrlar yetishmaydi' });
  assert.deepEqual(E.validateAnswer(ch, [], { unknown: true }).value, { unknown: true });
  const diff = bank.find((b) => b.key === 'wh.branch_diff');
  assert.equal(E.validateAnswer(diff, diff.options, { choice: ['nothing', 'prices'] }).ok, false, 'exclusive option');
});

test('10. website requirements: online booking and branch details are linked to the answers, nothing invented', () => {
  const { ctx } = play({
    'id.industry': { choice: ['clinic'] },
    'cl.branches': { choice: ['2_3'] },
    'cl.doctors': { choice: ['26_plus'] },
    'cl.schedule': { choice: ['mis'] },
    'mk.has_site': { choice: ['yes'] },
    'web.need': { choice: ['update'] },
    'ws.modules.clinic': { choice: ['booking', 'branches', 'doctors'] },
    'ws.must': { choice: ['booking'] },
    'wh.branch_diff': { choice: ['doctors', 'hours'] },
    'wh.booking_choose': { choice: ['branch', 'doctor', 'slot'] },
    'wh.schedule_sync': { choice: ['yes'] },
    'ws.integrations': { unknown: true },
  });
  const f = buildFacts(records(ctx), { industry: 'clinic', sub: null });
  const must = f.website.must.map((r) => r.id);
  for (const id of ['booking', 'branch_doctors', 'branch_hours', 'booking_branch', 'booking_doctor', 'booking_slots']) assert.ok(must.includes(id), `must ${id}`);
  assert.ok(f.website.should.some((r) => r.id === 'branches'), 'chosen but not essential → should');
  assert.ok(f.website.notNeeded.some((r) => r.id === 'checkups'), 'not chosen → not needed');
  assert.ok(![...f.website.must, ...f.website.should].some((r) => ['checkups', 'articles', 'reviews', 'branch_prices'].includes(r.id)), 'nothing the client did not choose');
  assert.ok(f.website.must.find((r) => r.id === 'booking').evidence.includes('ws.must'));
  assert.ok(f.website.assumptions.some((a) => /Tibbiy dastur/.test(a)), 'integration kept as an assumption');
  assert.ok(f.website.unknown.length >= 1, 'unknown integrations listed');
  assert.equal(f.website.need, 'Hozirgi saytni yangilash');
});

// ------------------------------------------------------------------------------------------------ engine details

test('back navigation and branch changes: previous question; answers that no longer apply are dropped, not lost silently', () => {
  assert.equal(E.previousKey(['a', 'b', 'c'], null), 'c');
  assert.equal(E.previousKey(['a', 'b', 'c'], 'c'), 'b');
  assert.equal(E.previousKey(['a', 'b', 'c'], 'a'), null);
  const { ctx } = play({ 'id.industry': { choice: ['clinic'] }, 'web.need': { choice: ['not_now'] } }, { max: 14 });
  assert.ok(ctx.order.some((k) => k.startsWith('cl.')));
  const changed = { ...ctx, answers: { ...ctx.answers, 'id.industry': { choice: ['food'] } } };
  const p = E.prune(changed);
  assert.ok(p.dropped.some((k) => k.startsWith('cl.')));
  assert.ok(!p.order.some((k) => k.startsWith('cl.')));
  assert.ok(p.order.includes('id.company'));
  assert.equal(p.answers['id.sub'], undefined, 'the old sub-industry no longer fits');
});

test('known facts are not asked again; optional questions can be skipped; stage budgets cap the length', () => {
  const { asked } = play({ 'id.industry': { choice: ['tech'] }, 'web.need': { choice: ['not_now'] } }, { known: ['company'] });
  assert.ok(!asked.includes('id.company'));
  const opt = bank.find((b) => b.key === 'mk.budget');
  assert.deepEqual(E.validateAnswer(opt, opt.options, { skipped: true }).value, { skipped: true });
  const counts = {};
  for (const k of asked) {
    const s = bank.find((b) => b.key === k).stage;
    counts[s] = (counts[s] ?? 0) + 1;
  }
  for (const [s, n] of Object.entries(counts)) assert.ok(n <= E.STAGE_BUDGET[s] + 1, `${s}: ${n}`);
});

test('question versions: a newer manager edit replaces the built-in; an inactive one hides it; old snapshots are untouched', () => {
  const base = bank.find((b) => b.key === 'cl.branches');
  const edited = { ...base, version: 2, text: 'Nechta filialingiz bor (yangi matn)?' };
  const merged = E.mergeBank(bank, [edited]);
  assert.equal(merged.find((q) => q.key === 'cl.branches').text, edited.text);
  assert.equal(merged.find((q) => q.key === 'cl.branches').source, 'bank');
  assert.ok(!E.mergeBank(bank, [{ ...edited, version: 3, active: false }]).some((q) => q.key === 'cl.branches'));
  assert.equal(E.mergeBank(bank, [{ ...base, version: 1, text: 'eski' }]).find((q) => q.key === 'cl.branches').text, base.text, 'not newer → ignored');
  const added = { ...base, key: 'cl.new_q', version: 1, text: 'Yangi savolmi?' };
  assert.ok(E.mergeBank(bank, [added]).some((q) => q.key === 'cl.new_q'));
  // A finished interview's report reads its own snapshot, not the bank.
  const rec = [{ key: 'cl.branches', question: { text: 'Eski matn?', type: 'single', stage: 'industry', category: 'Tuzilma', options: [{ key: 'one', label: 'Bitta' }] }, value: { choice: ['one'] } }];
  assert.match(buildFacts(rec, { industry: 'clinic', sub: null }).answers[0].question, /Eski matn/);
});

test('every built-in question is well-formed; keys are unique; option keys unique per question', () => {
  const keys = new Set();
  for (const q of bank) {
    assert.ok(!keys.has(q.key), `duplicate ${q.key}`);
    keys.add(q.key);
    assert.ok(q.purpose.length > 4, `${q.key} purpose`);
    assert.ok(q.text.length >= 8 && q.text.length <= 240, `${q.key} text`);
    assert.ok(!/[Ѐ-ӿ]/.test(q.text), `${q.key} Latin script`);
    if (q.options) assert.equal(new Set(q.options.map((o) => o.key)).size, q.options.length, `${q.key} options`);
    assert.ok(!G.isSensitive(q.text), `${q.key} sensitive`);
  }
});

// ------------------------------------------------------------------------------------------------ AI guards

const decision = (over = {}) => ({
  action: 'ASK',
  question_id: null,
  suggested_question: 'Bemorlar onlayn to‘lov qilishni xohlaydimi?',
  answer_type: 'single',
  selectable_options: ['Ha, ko‘pchiligi', 'Ba’zilari', 'Yo‘q', 'Bilmayman'],
  business_purpose: 'Onlayn to‘lov modulining zarurligini aniqlash.',
  relevant_prior_answer_ids: ['cl.booking', 'nope'],
  reasoning_summary: 'Mijoz onlayn yozilishni tanladi.',
  confidence: 0.8,
  missing_information_category: 'payments',
  target_stage: 'marketing',
  ...over,
});
const env = { existing: ['Hozir yangi mijozlar asosan qayerdan keladi?'], answeredKeys: ['cl.booking'], websiteOpen: false, serial: 7 };

test('AI questions: validated, deduplicated, never sensitive, Latin only, interface options not duplicated', () => {
  const ok = G.checkAiQuestion(decision(), env);
  assert.equal(ok.ok, true);
  assert.equal(ok.question.source, 'ai');
  assert.equal(ok.question.required, false);
  assert.equal(ok.question.allowUnknown, true);
  assert.deepEqual(ok.question.options.map((o) => o.label), ['Ha, ko‘pchiligi', 'Ba’zilari', 'Yo‘q'], '“Bilmayman” is the interface’s own');
  assert.deepEqual(ok.question.provenance.refs, ['cl.booking'], 'only real answer keys');
  assert.equal(G.checkAiQuestion(decision({ suggested_question: 'Yangi mijozlar asosan qayerdan keladi hozir?' }), env).ok, false, 'duplicate');
  assert.equal(G.checkAiQuestion(decision({ suggested_question: 'Bemorning tashxisi qanday bo‘lgan?' }), env).ok, false, 'health detail');
  assert.equal(G.checkAiQuestion(decision({ suggested_question: 'Pasport seriyangizni yozasizmi?' }), env).ok, false, 'document');
  assert.equal(G.checkAiQuestion(decision({ suggested_question: 'Сколько у вас филиалов в городе?' }), env).ok, false, 'Cyrillic');
  assert.equal(G.checkAiQuestion(decision({ suggested_question: 'Filiallar' }), env).ok, false, 'not a question');
  assert.equal(G.checkAiQuestion(decision({ selectable_options: ['Ha', 'Ha'] }), env).ok, false, 'duplicate options');
  assert.equal(G.checkAiQuestion(decision({ action: 'CONTINUE' }), env).ok, false);
  assert.equal(G.checkAiQuestion(decision({ confidence: 0.2 }), env).ok, false, 'low confidence');
  assert.equal(G.checkAiQuestion(decision({ target_stage: 'website' }), env).ok, false, 'website stage closed');
  assert.equal(G.parseDecision({ action: 'DROP TABLE' }), null);
  assert.equal(G.parseDecision(decision({ confidence: 7 })).confidence, 1);
});

test('AI analysis: evidence limited to real answers, unsupported “confirmed” downgraded, hype and invented numbers removed', () => {
  const raw = {
    profile_summary: 'Ko‘p tarmoqli klinika, 3 filial.',
    how_business_works: [
      { text: 'Qabul telefon orqali.', basis: 'confirmed', evidence: ['cl.booking', 'made.up'] },
      { text: 'Administratorlar band.', basis: 'confirmed', evidence: ['made.up'] },
    ],
    goals: [{ text: 'Sotuv 300% oshadi.', basis: 'inferred', evidence: [] }],
    problems: [],
    marketing_current: [],
    marketing_weaknesses: [],
    marketing_opportunities: [{ text: 'Natija kafolatlanadi.', basis: 'inferred', evidence: [] }],
    services: [
      { service: 'SMM', reason: 'Kontent yo‘q.', basis: 'confirmed', evidence: ['mk.social'] },
      { service: 'Hacking', reason: 'x', basis: 'confirmed', evidence: [] },
      { service: 'SMM', reason: 'takror', basis: 'inferred', evidence: [] },
    ],
    website: { objectives: [], users: [], pages: ['Bosh sahifa'], assumptions: [], unresolved: [], priorities: [] },
    meeting_questions: ['Nechta administrator bor?'],
    conclusion: 'Klinika marketingi tartibga solinishi kerak.',
  };
  const a = G.sanitizeAnalysis(raw, ['cl.booking', 'mk.social'], false);
  assert.deepEqual(a.how_business_works[0].evidence, ['cl.booking']);
  assert.equal(a.how_business_works[0].basis, 'confirmed');
  assert.equal(a.how_business_works[1].basis, 'inferred', 'no real evidence → not confirmed');
  assert.equal(a.goals.length, 0, '“300%” removed');
  assert.equal(a.marketing_opportunities.length, 0, 'guarantee removed');
  assert.equal(a.sanitized, 2);
  assert.deepEqual(a.services.map((s) => s.service), ['SMM'], 'only known services, once');
  assert.equal(a.website, null, 'no website section unless the client asked for one');
  assert.equal(G.sanitizeAnalysis(null, [], false), null);
});

test('rule-based services cite their evidence; the client’s own request is confirmed, the rest inferred', () => {
  const { ctx } = play({
    'id.industry': { choice: ['consulting'] },
    'id.reason': { choice: ['smm', 'automation'] },
    'mk.ads': { choice: ['regular'] },
    'mk.tracking': { choice: ['no'] },
    'co.expert': { choice: ['yes'] },
    'web.need': { choice: ['not_now'] },
  });
  const f = buildFacts(records(ctx), { industry: 'consulting', sub: null });
  const smm = f.services.find((s) => s.service === 'SMM');
  assert.equal(smm.basis, 'confirmed');
  assert.ok(smm.evidence.includes('id.reason'));
  const crm = f.services.find((s) => s.service === 'CRM / avtomatlashtirish');
  assert.ok(crm.evidence.includes('mk.tracking'));
  assert.ok(f.services.some((s) => s.service === 'Video kontent' && s.evidence.includes('co.expert')));
  assert.ok(!f.services.some((s) => s.service === 'Veb-sayt'), 'not recommended without the client asking');
  assert.equal(f.website, null);
});
