#!/usr/bin/env node
// ui/report-backfill.mjs — отчёты для карточек UI задним числом (приказ Ивана 2026-09-15 23:11 WITA): для задач в конечном статусе
// без artifacts/<id>/report.json собрать источники (задача, PR, журнал приёмки, логи run-задачи, артефакты) и попросить
// claude -p (sonnet) выписать report.json по схеме ui/report.schema.json; результат валидируется validateReport, при ошибках — один повтор.
// Запуск: node ui/report-backfill.mjs [--ids a,b] [--force] [--dry] [--model sonnet] [--concurrency 3]
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import * as L from '../lib.mjs';
import { validateReport } from './report-validate.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const MODEL = opt('--model', 'sonnet'); const CONC = Number(opt('--concurrency', 3)); const IDS = opt('--ids', '') ? opt('--ids', '').split(',') : null;
const FORCE = has('--force'); const DRY = has('--dry');
const REPO = path.resolve(L.DIR, '..', '..');
const cfg = L.loadTasks(); const state = L.loadState();
const JOURNAL = path.join(L.P.logs, 'report-backfill.jsonl');
const SCHEMA = fs.readFileSync(path.join(L.DIR, 'ui', 'report.schema.json'), 'utf8');

const cut = (s, n) => (s || '').length > n ? s.slice(0, n) + `\n…[обрезано, всего ${s.length} символов]` : (s || '');
const tail = (f, n = 150, max = 9000) => fs.existsSync(f) ? cut(fs.readFileSync(f, 'utf8').split('\n').slice(-n).join('\n'), max) : '';
const sh = (cmd, args, cwd) => { try { return execFileSync(cmd, args, { encoding: 'utf8', cwd, timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };

function sources(t, s) {
  const out = []; const id = t.id;
  out.push(`## Task (tasks.json)\n${JSON.stringify({ id, title: t.title, kind: t.kind, branch: t.branch, acceptance: t.acceptance, why: t.why }, null, 1)}`);
  out.push(`## State (state.json)\n${JSON.stringify({ status: s.status, pr: s.pr, attempt: s.attempt, acceptance: (s.acceptance || []).map(a => ({ round: a.round, verdict: a.verdict, findings: a.findings })) }, null, 1)}`);
  if (s.pr?.number) {
    const pr = sh('gh', ['pr', 'view', String(s.pr.number), '--repo', cfg.project.repo, '--json', 'title,body,url,mergedAt,files'], REPO);
    try { const j = JSON.parse(pr); out.push(`## PR #${s.pr.number} ${j.url} merged ${j.mergedAt}\n### title\n${j.title}\n### body\n${cut(j.body, 7000)}\n### files (${(j.files || []).length})\n${(j.files || []).slice(0, 60).map(f => f.path).join('\n')}`); } catch { out.push(`## PR #${s.pr.number}: gh view failed`); }
  }
  const logs = fs.existsSync(L.P.logs) ? fs.readdirSync(L.P.logs).filter(f => f.startsWith(`accept-${id}-`) || f.startsWith(`${id}-`)) : [];
  const findings = logs.filter(f => f.endsWith('.findings.md')).sort();
  const acceptLogs = logs.filter(f => f.startsWith(`accept-${id}-`) && f.endsWith('.log')).sort();
  const runLogs = logs.filter(f => f.startsWith(`${id}-`) && f.endsWith('.log')).sort();
  for (const f of findings.slice(-2)) out.push(`## Acceptance findings ${f}\n${cut(fs.readFileSync(path.join(L.P.logs, f), 'utf8'), 6000)}`);
  if (acceptLogs.length) out.push(`## Last acceptance log (tail) ${acceptLogs.at(-1)}\n${tail(path.join(L.P.logs, acceptLogs.at(-1)), 160, 9000)}`);
  if (runLogs.length) out.push(`## Last run log (tail) ${runLogs.at(-1)}\n${tail(path.join(L.P.logs, runLogs.at(-1)), 200, 12000)}`);
  const art = path.join(L.P.artifacts, id);
  if (fs.existsSync(art)) { const files = sh('find', [art, '-type', 'f', '-not', '-name', 'report.json'], REPO).trim().split('\n').filter(Boolean).slice(0, 60); out.push(`## Mission artifacts (absolute paths, exist on disk)\n${files.join('\n')}`); for (const f of files.filter(x => /\.(md|txt)$/.test(x)).slice(0, 3)) out.push(`### ${f}\n${tail(f, 120, 5000)}`); }
  const stem = id.replace(/^([a-z]\d+)-.*/, '$1');
  const repoDocs = sh('sh', ['-c', `ls -d ${REPO}/artifacts/docs/*${id}* ${REPO}/artifacts/docs/*${stem}-* 2>/dev/null | sort -u`], REPO).trim().split('\n').filter(Boolean).slice(0, 8);
  if (repoDocs.length) { out.push(`## Repo artifacts dirs (absolute paths)\n${repoDocs.join('\n')}`); for (const d of repoDocs.slice(0, 2)) { const files = sh('find', [d, '-type', 'f'], REPO).trim().split('\n').filter(Boolean).slice(0, 40); out.push(`### files in ${d}\n${files.join('\n')}`); const rep = files.find(f => /report\.md$/i.test(f)) || files.find(f => /\.md$/.test(f)); if (rep) out.push(`### ${rep} (head)\n${cut(fs.readFileSync(rep, 'utf8'), 6000)}`); } }
  return out.join('\n\n');
}

function prompt(t, s, src, errors) {
  return `You write a SHORT report card for a task board UI. Output ONLY a JSON object (no prose, no markdown fences) that validates against this JSON schema:
${SCHEMA}

Rules:
- Language of all text: Russian. Concise: 3–8 "done" items, each one concrete sentence of what was delivered (feature, script, fix, measurement), verifiable from the sources.
- Links and paths: use ONLY URLs and file paths that literally appear in the sources below (PR url, absolute paths under /Users/ivanprotsko/…, stand URLs). Never invent a path or a URL. Prefer: PR url, the worker's report.md, screenshots, findings file.
- "results": where to look — 1–6 entries: the PR (url), report/artifact files (path), a stand/live URL only if it appears in the sources.
- "access": include ONLY if a login AND a password (or a secret reference) appear literally in the sources. For the live host never put a password — use secretRef with the file path named in the sources. Otherwise omit the field.
- "notes": first line exactly: "Составлен штабом задним числом (${MODEL}) по PR и журналу приёмки; воркер задачи отчёта не писал." Then up to 3 lines: unresolved nits or caveats from the acceptance findings, if any.
- "task": "${t.id}". "branch": "${t.branch || ''}" (omit if empty). "pr": ${s.pr?.number ? `{"number": ${s.pr.number}, "url": "${s.pr.url}"}` : 'omit'}.
- Do not use tools other than Read/Glob/Grep, and only to open a file path listed in the sources if you need detail. Do not run commands.
${errors ? `\nYour previous answer failed validation with these errors — fix them:\n${errors.map(e => '- ' + e).join('\n')}\n` : ''}
# Sources
${src}`;
}

function runClaudeText(p, cwd) {
  return new Promise((resolve) => {
    const args = ['-p', p, '--model', MODEL, '--output-format', 'stream-json', '--verbose', '--allowedTools', 'Read,Glob,Grep', '--strict-mcp-config', '--mcp-config', L.MCP_NONE];
    const ch = spawn(L.CLAUDE, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CLAUDE_CODE_DISPATCHER: '1', DISPATCHER_TASK: 'report-backfill' } });
    let out = '', err = ''; ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => err += d);
    const timer = setTimeout(() => { try { ch.kill('SIGKILL'); } catch {} }, 6 * 60000);
    ch.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}
function extractJson(s) { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } }
// stream-json: все текстовые блоки ассистента (последний — ответ на Stop-хук, не отчёт), кандидаты с конца.
function assistantTexts(stream) { const out = []; for (const line of stream.split('\n')) { let o; try { o = JSON.parse(line); } catch { continue; } if (o.type === 'assistant' && Array.isArray(o.message?.content)) for (const c of o.message.content) if (c.type === 'text' && c.text) out.push(c.text); else if (o.type === 'result' && typeof o.result === 'string') out.push(o.result); } return out; }
function pickReport(stream) { const texts = assistantTexts(stream); let firstErr = null; for (const t of texts.reverse()) { const d = extractJson(t); if (!d) continue; const e = validateReport(d); if (!e.length) return { data: d, errors: [] }; if (!firstErr) firstErr = e; } return { data: null, errors: firstErr || [`no JSON object in ${texts.length} assistant messages`] }; }

async function one(t) {
  const s = state.tasks[t.id]; const file = path.join(L.P.artifacts, t.id, 'report.json'); const t0 = Date.now();
  const src = sources(t, s);
  if (DRY) { console.log(`${t.id}: sources ${src.length} chars`); return { id: t.id, dry: true, chars: src.length }; }
  let errors = null, data = null, attempt = 0, lastOut = '';
  while (attempt < 2) {
    attempt++;
    const r = await runClaudeText(prompt(t, s, src, errors), L.DIR); lastOut = r.out;
    const pick = pickReport(r.out); data = pick.data; errors = pick.errors.length ? pick.errors.map(e => `${e} (exit ${r.code})`) : [];
    if (!errors.length) break;
  }
  const rec = { ts: L.nowIso(), id: t.id, ok: !errors.length, attempts: attempt, ms: Date.now() - t0, errors: errors.slice(0, 5), srcChars: src.length };
  if (!errors.length) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); rec.file = path.relative(L.DIR, file); rec.done = data.done.length; rec.results = data.results.length; }
  else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.failed.txt', lastOut); }
  fs.appendFileSync(JOURNAL, JSON.stringify(rec) + '\n'); console.log(JSON.stringify(rec));
  return rec;
}

const TERMINAL = ['merged', 'done'];
const todo = cfg.tasks.filter(t => { const s = state.tasks[t.id]; if (!s || !TERMINAL.includes(s.status)) return false; if (IDS && !IDS.includes(t.id)) return false; return FORCE || !fs.existsSync(path.join(L.P.artifacts, t.id, 'report.json')); });
console.log(`backfill: ${todo.length} tasks, model ${MODEL}, concurrency ${CONC}${DRY ? ', DRY' : ''}`);
const results = []; let i = 0;
await Promise.all(Array.from({ length: Math.min(CONC, todo.length) }, async () => { while (i < todo.length) { const t = todo[i++]; try { results.push(await one(t)); } catch (e) { results.push({ id: t.id, ok: false, error: String(e) }); console.log(`${t.id}: ERROR ${e}`); } } }));
const ok = results.filter(r => r.ok).length; console.log(`backfill done: ok ${ok} / ${results.length}`);
