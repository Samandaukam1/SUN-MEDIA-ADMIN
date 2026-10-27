import assert from 'node:assert/strict';
import test from 'node:test';

// The app's TypeScript modules with Next-only imports stubbed (as in the agent integration test).
await import('./integration/hooks.mjs');
const { configuredProviders } = await import('../lib/assistant/providers.ts');

const ids = () => configuredProviders().map((p) => p.id);
const env = (vars) => {
  for (const k of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'ASSISTANT_PROVIDERS']) delete process.env[k];
  Object.assign(process.env, vars);
};

test('Gemini is the primary provider; Claude only joins when its key is set; no OpenAI key is needed', () => {
  env({ GEMINI_API_KEY: 'g' });
  assert.deepEqual(ids(), ['gemini']);
  env({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' });
  assert.deepEqual(ids(), ['gemini', 'anthropic']);
  env({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' });
  assert.deepEqual(ids(), ['gemini'], 'an OpenAI key alone activates nothing (not connected yet)');
  env({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', ASSISTANT_PROVIDERS: 'anthropic,gemini' });
  assert.deepEqual(ids(), ['anthropic', 'gemini'], 'order is configurable');
  env({});
  assert.deepEqual(ids(), [], 'nothing configured: the route answers "not connected"');
});
