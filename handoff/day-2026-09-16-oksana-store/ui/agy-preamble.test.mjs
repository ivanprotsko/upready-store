// Преамбула по раннеру: agy → _agy-preamble.md (две строки-лекарства ag01), claude → _run-preamble.md.
import test from 'node:test'; import assert from 'node:assert/strict';
import { buildRunPrompt } from '../lib.mjs';
const cfg = { project: { base: 'dev', repo: 'x/y', mainCheckout: '/tmp/main' } };
const base = { id: 't0', title: 'T', prompt: 'm04-model-eval-plan.md' };
test('agy run gets the Gemini preamble with both cure lines', () => {
  const p = buildRunPrompt(cfg, { ...base, runner: 'agy' }, { CWD: '/tmp/w', ATTEMPT: 1, LOG_FILE: '/tmp/l' });
  assert.match(p, /runner agy \(Gemini\)/);
  assert.match(p, /не создавай подагентов и фоновых задач/);
  assert.match(p, /ТОЛЬКО относительно текущей рабочей папки/);
  assert.match(p, /cwd[^\n]*\/tmp\/w|working folder: `\/tmp\/w`/);
  assert.doesNotMatch(p, /You are a `claude -p` run/);
});
test('claude run keeps the claude preamble', () => {
  const p = buildRunPrompt(cfg, base, { CWD: '/tmp/w', ATTEMPT: 1, LOG_FILE: '/tmp/l' });
  assert.match(p, /You are a `claude -p` run/);
  assert.doesNotMatch(p, /runner agy \(Gemini\)/);
});
