// ui/summary.mjs — сводка по законченной задаче для UI: что сделано, где результат, статистика сессии воркера
// (старт, последний ход, длительность, токены input/output/cache read/cache write) из стенограмм ~/.claude/projects.
// Зерно токенов: одна запись = один requestId (usage повторяется во всех строках запроса), сумма — по ключам, не по строкам (правило 20a).
import fs from 'node:fs';
import path from 'node:path';
import * as L from '../lib.mjs';

const RO = new Set(['pr_open', 'accepting', 'fixing', 'merged', 'done']);
export const isReadonly = (st) => RO.has(st);

export function transcriptDir(cwd) { return path.join(L.HOME, '.claude/projects', cwd.replace(/[^A-Za-z0-9]/g, '-')); }

// ---------- стенограммы ----------
const statCache = new Map(); // file -> { mtimeMs, size, rows }
function readRows(file) {
  let st; try { st = fs.statSync(file); } catch { return []; }
  const c = statCache.get(file); if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.rows;
  const rows = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) { if (!line) continue; try { rows.push(JSON.parse(line)); } catch { /* обрезанная строка живой сессии */ } }
  statCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, rows });
  return rows;
}
function subagentFiles(file) {
  const sidDir = file.replace(/\.jsonl$/, ''); const sub = path.join(sidDir, 'subagents'); const out = [];
  if (!fs.existsSync(sub)) return out;
  for (const e of fs.readdirSync(sub, { withFileTypes: true })) {
    if (e.isFile() && /^agent-.*\.jsonl$/.test(e.name)) out.push(path.join(sub, e.name));
    if (e.isDirectory() && e.name === 'workflows') for (const run of fs.readdirSync(path.join(sub, 'workflows'), { withFileTypes: true })) {
      if (!run.isDirectory()) continue; const rd = path.join(sub, 'workflows', run.name);
      for (const f of fs.readdirSync(rd)) if (/^agent-.*\.jsonl$/.test(f)) out.push(path.join(rd, f));
    }
  }
  return out;
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
// files: [{ file, from?, to? }] — окно нужно для пуловых сессий (claude -p --resume), где в одном файле несколько задач подряд.
export function transcriptStats(files) {
  const tok = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }; const models = {}; let requests = 0, userMsgs = 0, toolCalls = 0;
  let first = null, last = null; let subCount = 0; const seen = new Set(); const used = [];
  for (const { file, from, to } of files) {
    const all = [file, ...subagentFiles(file)]; subCount += all.length - 1;
    for (const f of all) {
      const rows = readRows(f); if (!rows.length) continue; let hit = false;
      const byKey = new Map();
      for (const r of rows) {
        const ts = r.timestamp ? Date.parse(r.timestamp) : NaN; if (!Number.isFinite(ts)) continue;
        if (from && ts < Date.parse(from) - 60e3) continue; if (to && ts > Date.parse(to) + 60e3) continue;
        hit = true; if (first === null || ts < first) first = ts; if (last === null || ts > last) last = ts;
        if (r.type === 'user') { const c = r.message?.content; const isTool = Array.isArray(c) && c.some(b => b?.type === 'tool_result'); if (!isTool) userMsgs++; continue; }
        if (r.type !== 'assistant') continue;
        const u = r.message?.usage, model = r.message?.model; if (!u || !model || model === '<synthetic>') continue;
        const c = r.message?.content; if (Array.isArray(c)) toolCalls += c.filter(b => b?.type === 'tool_use').length;
        const key = `${r.message?.id ?? ''}|${r.requestId ?? ''}`; if (key === '|') byKey.set(Symbol(), { u, model }); else byKey.set(key, { u, model }); // последняя строка запроса несёт итоговый usage
      }
      for (const { u, model } of byKey.values()) {
        requests++; tok.input += num(u.input_tokens); tok.output += num(u.output_tokens); tok.cacheRead += num(u.cache_read_input_tokens); tok.cacheWrite += num(u.cache_creation_input_tokens);
        models[model] = (models[model] || 0) + 1;
      }
      if (hit && !seen.has(f)) { seen.add(f); used.push(f); }
    }
  }
  const startIso = first === null ? null : new Date(first).toISOString(), endIso = last === null ? null : new Date(last).toISOString();
  return { files: used, subagents: subCount, requests, userMsgs, toolCalls, tokens: tok, models, start: startIso, end: endIso, durationMin: first === null ? null : Math.round((last - first) / 60000) };
}

// Какие стенограммы принадлежат задаче: build → все файлы в каталоге worktree (одна ветка = один worktree = один воркер);
// run с постоянной сессией → её файл в окне [старт, финиш]; run без сессии (старые запуски) → файлы каталога cwd, созданные в окне задачи.
export function taskTranscripts(cfg, t, s) {
  const out = []; let method = '';
  if (t.kind === 'build') {
    if (!s.worktree) return { files: out, method: 'worktree не записан' };
    const dir = transcriptDir(s.worktree); method = `все стенограммы каталога ${path.basename(dir)}`;
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) out.push({ file: path.join(dir, f) });
    return { files: out, method };
  }
  const cwd = L.runCwd(cfg, t); const dir = transcriptDir(cwd);
  const from = s.startedAt || s.run?.startedAt || null, to = s.finishedAt || null;
  const sessions = new Set([s.run?.session].filter(Boolean));
  if (sessions.size) { method = `постоянная сессия ${[...sessions].join(', ')}, окно ${from || '?'} … ${to || 'сейчас'}`; for (const id of sessions) out.push({ file: L.transcriptPath(cwd, id), from, to }); return { files: out, method }; }
  method = `стенограммы каталога ${path.basename(dir)}, созданные в окне задачи (session id не записан — claude -p в текстовом режиме)`;
  if (fs.existsSync(dir) && from) { const a = Date.parse(from) - 120e3, b = to ? Date.parse(to) + 120e3 : Infinity;
    for (const f of fs.readdirSync(dir)) { if (!f.endsWith('.jsonl')) continue; const p = path.join(dir, f); const st = fs.statSync(p); const born = st.birthtimeMs || st.ctimeMs; if (born >= a && born <= b) out.push({ file: p, from, to }); } }
  return { files: out, method };
}

// ---------- PR ----------
const prCache = new Map();
export function prInfo(cfg, n) {
  if (!n) return null; const c = prCache.get(n); if (c && (c.data.state === 'MERGED' || Date.now() - c.at < 60e3)) return c.data;
  const r = L.shJson('gh', ['pr', 'view', String(n), '--repo', cfg.project.repo, '--json', 'number,title,body,state,mergedAt,additions,deletions,changedFiles,url,headRefName']);
  if (r.rc || !r.json) return c?.data || { number: n, error: 'gh pr view не ответил' };
  prCache.set(n, { at: Date.now(), data: r.json }); return r.json;
}

// ---------- результаты: артефакты, отчёты, логи ----------
const IMG = /\.(png|jpe?g|webp|gif|svg)$/i, TXT = /\.(md|txt|log|json|jsonl|csv|html|ts|tsx|js|mjs|yml|yaml|sql|diff|patch)$/i;
function entry(p) { const abs = p.startsWith('file://') ? p.slice(7) : p; const rel = path.relative(L.DIR, abs); let size = null; try { size = fs.statSync(abs).size; } catch { return { path: abs, rel, kind: 'missing' }; }
  return { path: abs, rel: rel.startsWith('..') ? null : rel, kind: IMG.test(abs) ? 'img' : TXT.test(abs) ? 'text' : 'other', size }; }
function walk(dir, out, depth = 0) { if (!fs.existsSync(dir) || out.length > 300) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (depth < 3) walk(p, out, depth + 1); } else out.push(p); } }
export function taskResults(t, s) {
  const seen = new Set(); const groups = [];
  const add = (title, list) => { const items = []; for (const p of list) { const e = entry(p); const k = e.path; if (seen.has(k)) continue; seen.add(k); items.push(e); } if (items.length) groups.push({ title, items }); };
  add('Ссылки и артефакты из state', (s.artifacts || []).filter(x => !/^https?:/.test(x)));
  const urls = (s.artifacts || []).filter(x => /^https?:/.test(x));
  const own = []; walk(path.join(L.P.artifacts, t.id), own); add(`artifacts/${t.id}/`, own.sort());
  const acc = []; if (fs.existsSync(L.P.artifacts)) for (const d of fs.readdirSync(L.P.artifacts)) if (d.startsWith(`accept-${t.id}-`)) walk(path.join(L.P.artifacts, d), acc); add('Скриншоты и файлы приёмки', acc.sort());
  const logs = []; if (fs.existsSync(L.P.logs)) for (const f of fs.readdirSync(L.P.logs)) if (f.startsWith(`accept-${t.id}-`) || f.startsWith(`${t.id}-`) || f === `blocked-${t.id}.md`) logs.push(path.join(L.P.logs, f)); add('Логи приёмки и запуска', logs.sort());
  return { groups, urls };
}

// «Что сделано»: тело PR (build) или отчёт artifacts/<id>/report.md, иначе заметка диспетчера / хвост лога запуска.
function doneText(cfg, t, s, pr) {
  if (pr?.body) return { source: `тело PR #${pr.number}`, text: pr.body };
  const rep = path.join(L.P.artifacts, t.id, 'report.md'); if (fs.existsSync(rep)) return { source: `artifacts/${t.id}/report.md`, text: fs.readFileSync(rep, 'utf8') };
  if (s.note) return { source: 'последняя строка воркера (state.note)', text: s.note };
  if (s.run?.log && fs.existsSync(s.run.log)) return { source: `хвост ${path.basename(s.run.log)}`, text: L.tailFile(s.run.log, 40) };
  return { source: null, text: '' };
}

export function summary(cfg, state, id) {
  const t = cfg.tasks.find(x => x.id === id); if (!t) return null; const s = state.tasks[id] || {};
  const pr = s.pr?.number ? prInfo(cfg, s.pr.number) : null;
  const tr = taskTranscripts(cfg, t, s); const stats = transcriptStats(tr.files);
  const wita = (iso) => iso ? L.wita(new Date(iso)) : null;
  return {
    id, status: s.status || t.status || 'queued', kind: t.kind, readonly: isReadonly(s.status),
    branch: t.branch || null, worktree: s.worktree || null, cwd: t.kind === 'run' ? L.runCwd(cfg, t) : null,
    pr: pr && { number: pr.number, url: pr.url || s.pr.url, title: pr.title, state: pr.state, mergedAt: wita(pr.mergedAt), additions: pr.additions, deletions: pr.deletions, changedFiles: pr.changedFiles, error: pr.error || null },
    acceptance: (s.acceptance || []).map(a => ({ n: a.n, verdict: a.verdict || '…', startedAt: wita(a.startedAt), log: path.basename(a.log), findings: a.findings && fs.existsSync(a.findings) ? path.basename(a.findings) : null })),
    done: doneText(cfg, t, s, pr), results: taskResults(t, s),
    dispatcher: { launchedAt: wita(s.launchedAt || s.startedAt), finishedAt: wita(s.finishedAt), attempt: s.attempt || 0, relaunched: !!s.relaunched, nudges: s.nudges || 0 },
    stats: { ...stats, start: wita(stats.start), end: wita(stats.end), method: tr.method, files: stats.files.map(f => f.replace(L.HOME, '~')) },
  };
}
