import assert from 'node:assert/strict';
import test from 'node:test';

// The app's TypeScript modules with Next-only imports stubbed (as in the agent integration test).
await import('./integration/hooks.mjs');
const { configuredProviders } = await import('../lib/assistant/providers.ts');
const { openaiChat, functionTools } = await import('../lib/assistant/openai.ts');
const sunny = await import('../lib/assistant/sunny.ts');

const ids = () => configuredProviders().map((p) => p.id);
const env = (vars) => {
  for (const k of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'ASSISTANT_PROVIDERS']) delete process.env[k];
  Object.assign(process.env, vars);
};

test('Sunny 2.0: OpenAI is the brain; Gemini and Claude answer only when the owner lists them explicitly', () => {
  env({ OPENAI_API_KEY: 'o' });
  assert.deepEqual(ids(), ['openai']);
  env({ OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' });
  assert.deepEqual(ids(), ['openai'], 'Gemini is out of the reply path even when its key exists (it stays for speech only)');
  env({ GEMINI_API_KEY: 'g' });
  assert.deepEqual(ids(), [], 'no OpenAI key: the route answers "not connected" instead of silently using Gemini');
  env({ OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g', ASSISTANT_PROVIDERS: 'openai,gemini' });
  assert.deepEqual(ids(), ['openai', 'gemini'], 'an explicit fallback order is still possible');
  env({});
  assert.deepEqual(ids(), []);
});

// --- A fake OpenAI Responses API (server-sent events), recording every request ---------------------------------------
const sse = (events) => {
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(new ReadableStream({ start: (c) => (c.enqueue(new TextEncoder().encode(body)), c.close()) }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
};
const usage = (input, output, cached = 0, reasoning = 0) => ({ input_tokens: input, output_tokens: output, input_tokens_details: { cached_tokens: cached }, output_tokens_details: { reasoning_tokens: reasoning } });
function fakeOpenAI(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.Authorization });
    const next = script.shift();
    return typeof next === 'function' ? next(body) : next;
  };
  return { calls, fetchImpl };
}
const opts = (extra = {}) => ({ model: 'gpt-6-luna', effort: 'none', maxTokens: 240, maxTokensData: 700, cacheKey: 'sunny-staff-primary', ...extra });
const TOOLS = [{ name: 'list_tasks', description: 'Vazifalar', input_schema: { type: 'object', properties: { scope: { type: 'string' } }, required: ['scope'] } }];

test('OpenAI: streamed text, a tool round with the person’s own tool, usage split into cached and reasoning tokens', async () => {
  env({ OPENAI_API_KEY: 'sk-test-secret-key-123456' });
  const call = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'list_tasks', arguments: '{"scope":"mine"}', status: 'completed' };
  const { calls, fetchImpl } = fakeOpenAI([
    sse([{ type: 'response.output_item.done', item: call }, { type: 'response.completed', response: { status: 'completed', output: [call], usage: usage(1500, 20, 1024) } }]),
    sse([
      { type: 'response.output_text.delta', delta: 'Bugun sizga ' },
      { type: 'response.output_text.delta', delta: '4 ta vazifa biriktirilgan.' },
      { type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Bugun sizga 4 ta vazifa biriktirilgan.' }] }], usage: usage(1600, 30, 1408, 5) } },
    ]),
  ]);
  const ran = [];
  const chunks = [];
  const used = [];
  const rounds = [];
  const reply = await openaiChat('SYSTEM', [{ role: 'user', text: 'Bugun nechta vazifam bor?' }], TOOLS, async (name, input) => (ran.push([name, input]), 'vazifalar: 4 ta'), {
    ...opts(),
    fetchImpl,
    onText: (d) => chunks.push(d),
    onUsage: (u) => used.push(u),
    onRound: (r) => rounds.push(r),
  });
  assert.equal(reply, 'Bugun sizga 4 ta vazifa biriktirilgan.');
  assert.deepEqual(chunks, ['Bugun sizga ', '4 ta vazifa biriktirilgan.'], 'text reaches the widget piece by piece');
  assert.deepEqual(ran, [['list_tasks', { scope: 'mine' }]], 'only the allowlisted tool runs, with parsed arguments');
  assert.equal(calls.length, 2);
  const [a, b] = calls.map((c) => c.body);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].auth, 'Bearer sk-test-secret-key-123456', 'the key goes in the header only');
  for (const body of [a, b]) {
    assert.ok(!JSON.stringify(body).includes('sk-test'), 'never in the body');
    assert.equal(body.stream, true);
    assert.equal(body.store, false, 'nothing kept at OpenAI');
    assert.equal(body.model, 'gpt-6-luna');
    assert.deepEqual(body.reasoning, { effort: 'none' });
    assert.equal(body.instructions, 'SYSTEM');
    assert.equal(body.prompt_cache_key, 'sunny-staff-primary');
  }
  assert.equal(a.max_output_tokens, 240, 'short conversational cap');
  assert.equal(b.max_output_tokens, 700, 'more room once the system returned data');
  assert.deepEqual(a.tools, functionTools(TOOLS));
  const out = b.input.find((i) => i.type === 'function_call_output');
  assert.deepEqual(out, { type: 'function_call_output', call_id: 'call_1', output: 'vazifalar: 4 ta' });
  const carried = b.input.find((i) => i.type === 'function_call');
  assert.equal(carried.call_id, 'call_1');
  assert.equal(carried.id, undefined, 'item ids are not resent with store=false');
  assert.deepEqual(used, [
    { model: 'gpt-6-luna', input: 1500, output: 20, cached: 1024, thoughts: 0 },
    { model: 'gpt-6-luna', input: 1600, output: 25, cached: 1408, thoughts: 5 },
  ]);
  assert.equal(rounds.length, 2);
  assert.ok(rounds.every((r) => typeof r.ms === 'number' && r.firstEventMs !== null));
});

test('OpenAI: the advanced model unavailable → the everyday model answers; refused reasoning setting → retried without it', async () => {
  env({ OPENAI_API_KEY: 'sk-x' });
  const done = (text) => sse([{ type: 'response.output_text.delta', delta: text }, { type: 'response.completed', response: { status: 'completed', output: [], usage: usage(10, 2) } }]);
  const a = fakeOpenAI([new Response('{"error":{"message":"The model `gpt-6.1-terra` does not exist"}}', { status: 404 }), done('Javob.')]);
  const r1 = await openaiChat('S', [{ role: 'user', text: 'Hisobotlarni solishtir' }], [], async () => '', { ...opts({ model: 'gpt-6.1-terra', fallback: 'gpt-6-luna' }), fetchImpl: a.fetchImpl });
  assert.equal(r1, 'Javob.');
  assert.deepEqual(a.calls.map((c) => c.body.model), ['gpt-6.1-terra', 'gpt-6-luna']);
  const b = fakeOpenAI([new Response('{"error":{"message":"Unsupported value: \'reasoning.effort\' does not support \'none\'"}}', { status: 400 }), done('OK')]);
  const r2 = await openaiChat('S', [{ role: 'user', text: 'Salom, savol' }], [], async () => '', { ...opts({ model: 'gpt-test-old' }), fetchImpl: b.fetchImpl });
  assert.equal(r2, 'OK');
  const c = fakeOpenAI([new Response('{"error":{"message":"Unknown parameter: \'prompt_cache_key\'."}}', { status: 400 }), done('Yaxshi')]);
  assert.equal(await openaiChat('S', [{ role: 'user', text: 'Savol bor' }], [], async () => '', { ...opts({ model: 'gpt-test-nocache' }), fetchImpl: c.fetchImpl }), 'Yaxshi');
  assert.equal(c.calls[1].body.prompt_cache_key, undefined, 'an optional parameter the model refuses is dropped, never a broken Sunny');
  assert.deepEqual(b.calls[0].body.reasoning, { effort: 'none' });
  assert.equal(b.calls[1].body.reasoning, undefined);
});

test('OpenAI: failures are short and honest (no key, no request), one retry on a passing error, never endless', async () => {
  env({ OPENAI_API_KEY: 'sk-live-should-never-appear' });
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    const bad = fakeOpenAI([new Response('{"error":{"message":"Incorrect API key provided: sk-live-should-never-appear"}}', { status: 401 })]);
    await assert.rejects(openaiChat('S', [{ role: 'user', text: 'savol' }], [], async () => '', { ...opts(), fetchImpl: bad.fetchImpl }), (e) => /kaliti/.test(e.message) && !e.message.includes('sk-'));
    assert.ok(errors.every((line) => !line.includes('sk-live-should-never-appear')), 'the key is masked even in server logs');
    const busy = fakeOpenAI([new Response('busy', { status: 503 }), new Response('busy', { status: 503 }), new Response('busy', { status: 503 })]);
    await assert.rejects(openaiChat('S', [{ role: 'user', text: 'savol' }], [], async () => '', { ...opts(), fetchImpl: busy.fetchImpl }), /javob bermayapti/);
    assert.equal(busy.calls.length, 2, 'one retry, then the person is told');
  } finally {
    console.error = orig;
  }
  env({});
  await assert.rejects(openaiChat('S', [{ role: 'user', text: 'x' }], [], async () => '', opts()), /OPENAI_API_KEY/);
});

test('OpenAI: a reply cut at the length limit keeps what was written; a stopped request ends quietly', async () => {
  env({ OPENAI_API_KEY: 'sk-x' });
  const cut = fakeOpenAI([sse([{ type: 'response.output_text.delta', delta: 'Uzun javobning boshi' }, { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [], usage: usage(10, 240) } }])]);
  assert.equal(await openaiChat('S', [{ role: 'user', text: 'x' }], [], async () => '', { ...opts(), fetchImpl: cut.fetchImpl }), 'Uzun javobning boshi');
  const ctl = new AbortController();
  ctl.abort();
  const stopped = fakeOpenAI([]);
  assert.match(await openaiChat('S', [{ role: 'user', text: 'x' }], [], async () => '', { ...opts(), fetchImpl: stopped.fetchImpl, signal: ctl.signal }), /tayyorlay olmadim/);
  assert.equal(stopped.calls.length, 0, 'nothing is sent for a request the person already stopped');
});

test('Model routing: greetings and lookups on the everyday model; real analysis on the advanced one; visitors never escalate', () => {
  const cfg = sunny.sunnyConfig({}, {});
  assert.equal(cfg.primary, 'gpt-6-luna');
  assert.equal(cfg.complex, 'gpt-6.1-terra');
  assert.equal(cfg.effort, 'none');
  assert.equal(cfg.maxOutput, 240);
  const r = (t, a = 'staff', c = cfg) => sunny.routeModel(t, a, c);
  assert.equal(r('Salom').tier, 'primary');
  assert.equal(r('Bugun nechta vazifam bor?').tier, 'primary');
  assert.equal(r('Davomatim qanday, bugun kechikdimmi yoki yo‘qmi?').tier, 'primary');
  assert.equal(r('Oktabr va noyabr hisobotlarini solishtirib, nima uchun lidlar soni pasayganini tahlil qilib ber').tier, 'complex');
  assert.equal(r('SAFI uchun keyingi oyga kontent strategiyasini tuzib ber, bosqichma-bosqich').tier, 'complex');
  assert.equal(r('Сравни продажи за два месяца и объясни причины падения, пожалуйста').tier, 'complex');
  assert.equal(r('Oktabr va noyabr hisobotlarini solishtirib, nima uchun lidlar soni pasayganini tahlil qilib ber', 'public').tier, 'primary', 'visitors stay on the fast model');
  assert.equal(r('Oktabr va noyabr hisobotlarini solishtirib tahlil qilib ber', 'staff', { ...cfg, escalation: false }).tier, 'primary', 'escalation can be switched off');
  // The owner's saved settings override the environment; invalid values are ignored.
  const c2 = sunny.sunnyConfig({ SUNNY_PRIMARY_MODEL: 'env-model', SUNNY_MAX_OUTPUT_TOKENS: '300' }, { primary: 'saved-model', max_output: 'abc', enabled: false });
  assert.deepEqual([c2.primary, c2.maxOutput, c2.enabled], ['saved-model', 300, false]);
  assert.equal(sunny.sunnyConfig({ SUNNY_PRIMARY_MODEL: 'bad model; drop' }, null).primary, 'gpt-6-luna');
});

test('Context: only the recent conversation goes to the model; older questions travel as one line each', () => {
  const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `${i % 2 ? 'Javob' : 'Savol'} ${i} ${'x'.repeat(i % 2 ? 900 : 50)}` }));
  const { history, dropped } = sunny.compactHistory(long, 10, 6000);
  assert.ok(history.length <= 10);
  assert.equal(history[0].role, 'user', 'starts with the person');
  assert.equal(history.at(-1).text, long.at(-1).text, 'the latest message is kept whole');
  assert.ok(history.reduce((n, m) => n + m.text.length, 0) <= 6000);
  assert.ok(dropped.length >= 10 && dropped.every((d) => d.startsWith('Savol')), 'dropped questions are kept as a thread');
  assert.ok(history.slice(0, -3).filter((m) => m.role === 'assistant').every((m) => m.text.length <= 482), 'old replies shortened (the last three messages stay whole)');
  assert.ok(history.slice(0, -3).some((m) => m.role === 'assistant'));
  const one = sunny.compactHistory([{ role: 'user', text: 'y'.repeat(9000) }], 10, 3000);
  assert.equal(one.history[0].text.length, 3000, 'an over-long question is cut, never dropped');
});

test('Local replies: a bare greeting or wake word needs no AI; anything with a request goes to the AI', () => {
  for (const t of ['Salom', 'Sunny', 'Sunny, salom!', 'Assalomu alaykum', 'Hey Sunny', 'salom sunny', 'Qalaysan?']) assert.ok(sunny.greetingReply(t, 'staff', 0), t);
  assert.equal(sunny.greetingReply('Salom', 'staff', 0), 'Salom! Eshitaman.');
  assert.match(sunny.greetingReply('Привет', 'staff', 0), /Слушаю/);
  assert.match(sunny.greetingReply('Salom', 'public', 0), /SUN MEDIA/);
  for (const t of ['Salom, bugun nechta vazifam bor?', 'Sunny, davomatimni ko‘rsat', 'Salom! SMM narxi qancha?', 'Bugun nima qilishim kerak']) assert.equal(sunny.greetingReply(t, 'staff', 0), null, t);
});
