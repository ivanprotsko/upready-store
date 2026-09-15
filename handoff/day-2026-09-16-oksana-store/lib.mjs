// lib.mjs — общий движок диспетчера и UI (без зависимостей). Спека: ~/upready/specs/task-dispatcher/SPEC.md, механика ~/r/s8.md
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const HOME = process.env.HOME || '/Users/ivanprotsko';
export const P = {
  tasks: path.join(DIR, 'tasks.json'),
  state: path.join(DIR, 'state.json'),
  logs: path.join(DIR, 'logs'),
  prompts: path.join(DIR, 'prompts'),
  commands: path.join(DIR, 'commands'),
  artifacts: path.join(DIR, 'artifacts'),
  report: path.join(DIR, 'REPORT.md'),
  journal: path.join(DIR, 'logs', 'dispatcher.jsonl'),
  stop: path.join(DIR, 'STOP'),
  done: path.join(DIR, 'DONE'),
};
export const CLAUDE = path.join(HOME, '.local/bin/claude');
export const MCP_NONE = path.join(HOME, '.claude/mcp-profiles/none.json');
const ENV = { ...process.env, PATH: `${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/superset/bin:${process.env.PATH || ''}` };

export const nowIso = () => new Date().toISOString();
export function wita(d = new Date()) { const t = new Date(d.getTime() + 8 * 3600e3); return t.toISOString().replace('T', ' ').slice(0, 16) + ' WITA'; }
export const minutesSince = (iso) => iso ? (Date.now() - Date.parse(iso)) / 60000 : Infinity;

export function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }
export function writeJson(p, obj) { const tmp = p + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2)); fs.renameSync(tmp, p); }
export function loadTasks() { return readJson(P.tasks, { tasks: [] }); }
export function saveTasks(t) { writeJson(P.tasks, t); }
export function emptyState() { return { dispatcher: { paused: false, limitUntil: null, startedAt: null, lastTick: null, pid: null, ticks: 0 }, tasks: {}, events: [] }; }
export function loadState() { return readJson(P.state, emptyState()); }
export function saveState(s) { writeJson(P.state, s); }
export function journal(ev) { fs.mkdirSync(P.logs, { recursive: true }); fs.appendFileSync(P.journal, JSON.stringify({ ts: nowIso(), ...ev }) + '\n'); }
export function event(state, ev) { state.events.push({ ts: nowIso(), ...ev }); if (state.events.length > 400) state.events.splice(0, state.events.length - 400); journal(ev); }

export function sh(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout || 120000, cwd: opts.cwd, env: { ...ENV, ...(opts.env || {}) }, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    return { rc: 0, out };
  } catch (e) { return { rc: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || ''), err: e.message }; }
}
export function shJson(cmd, args, opts) {
  const r = sh(cmd, args, opts);
  if (r.rc !== 0) return { rc: r.rc, error: r.out.slice(-2000) || r.err };
  try { return { rc: 0, json: JSON.parse(r.out) }; } catch { return { rc: 1, error: 'non-json: ' + r.out.slice(0, 500) }; }
}

// ---------- Superset ----------
export function worktreePath(cfg, branch) { return path.join(HOME, 'upready/worktrees', cfg.project.id, branch); }
export function wsCreate(cfg, task, promptText) {
  const args = ['ws', 'create', '--local', '--project', cfg.project.id, '--branch', task.branch, '--base-branch', cfg.project.base,
    '--name', `${task.id} · ${task.title}`.slice(0, 90), '--agent', 'claude', '--prompt', promptText, '--tag', cfg.tag || 'day-2026-09-16', '--json'];
  if (task.model) args.push('--model', task.model);
  if (task.effort) args.push('--effort', task.effort);
  const r = shJson('superset', args, { timeout: 240000 });
  if (r.rc) return r;
  const w = r.json.workspace || r.json;
  const agents = r.json.agents || [];
  const g = wsGet(w.id); const wt = g?.worktreePath || w.worktreePath || worktreePath(cfg, task.branch);
  return { rc: 0, id: w.id, branch: w.branch, worktreePath: wt, terminalId: agents[0]?.terminalId || agents[0]?.sessionId || null, raw: r.json };
}
export function wsGet(id) { const r = shJson('superset', ['ws', 'get', id, '--json']); return r.rc ? null : r.json; }
export function wsDelete(id) { return shJson('superset', ['ws', 'delete', id, '--json']); }
export function wsTerminals(wsId) { const r = shJson('superset', ['terminals', 'list', '--workspace', wsId, '--json']); return r.rc ? [] : (r.json.sessions || []); }
export function terminalRead(wsId, termId, maxLines = 80) {
  const r = sh('superset', ['terminals', 'read', '--workspace', wsId, '--terminal', termId, '--max-lines', String(maxLines), '--json']);
  if (r.rc) return '';
  try { const j = JSON.parse(r.out); return typeof j === 'string' ? j : (j.text || j.screen || (Array.isArray(j.lines) ? j.lines.join('\n') : JSON.stringify(j))); } catch { return r.out; }
}
export function terminalSend(wsId, termId, text) { return shJson('superset', ['terminals', 'send', '--workspace', wsId, '--terminal', termId, '--text', text, '--json']); }
export function agentCreate(wsId, { prompt, model, effort }) {
  const args = ['agents', 'create', '--workspace', wsId, '--agent', 'claude', '--prompt', prompt, '--json'];
  if (model) args.push('--model', model); if (effort) args.push('--effort', effort);
  const r = shJson('superset', args, { timeout: 180000 });
  if (r.rc) return r;
  const j = r.json; return { rc: 0, terminalId: j.terminalId || j.sessionId || j.agent?.terminalId || null, raw: j };
}
export function terminalClose(wsId, termId) { return shJson('superset', ['terminals', 'close', '--workspace', wsId, '--terminal', termId, '--json']); }
export function terminalById(wsId, termId) { if (!termId) return null; return wsTerminals(wsId).find(s => s.terminalId === termId && !s.exited) || null; }
// Терминал жив (exited=false) и после выхода claude: на экране «Resume this session with:» и zsh-prompt «%».
// Текст, отправленный в такой терминал, печатается в zsh (t09: «zsh: parse error»), поэтому агент считается живым
// только если хвост экрана не похож на shell-prompt.
export function agentAliveOnScreen(wsId, termId) {
  const tail = String(terminalRead(wsId, termId, 12) || '').split('\n').filter(x => x.trim()).slice(-3).join('\n');
  if (!tail) return true; // экран не прочитался — не считаем мёртвым
  return !/Resume this session with:|claude --resume [0-9a-f-]{36}|%\s*$/.test(tail);
}
export function liveAgentTerminal(wsId, preferId) {
  const cand = wsTerminals(wsId).filter(s => !s.exited);
  const ordered = [cand.find(s => s.terminalId === preferId), ...cand.filter(s => /claude/i.test(s.title || '')), ...cand].filter(Boolean);
  const seen = new Set();
  for (const t of ordered) { if (seen.has(t.terminalId)) continue; seen.add(t.terminalId); if (agentAliveOnScreen(wsId, t.terminalId)) return t; }
  return null;
}

// ---------- GitHub ----------
export function prForBranch(cfg, branch) {
  const r = shJson('gh', ['pr', 'list', '--repo', cfg.project.repo, '--head', branch, '--state', 'all', '--json', 'number,state,mergedAt,url,title,headRefName,updatedAt,isDraft', '--limit', '5']);
  if (r.rc) return { error: r.error };
  const prs = (r.json || []).sort((a, b) => b.number - a.number);
  return { pr: prs[0] || null };
}
export function prView(cfg, n) { const r = shJson('gh', ['pr', 'view', String(n), '--repo', cfg.project.repo, '--json', 'number,state,mergedAt,url,title,mergeable,headRefName']); return r.rc ? null : r.json; }
export function branchHeadDate(cfg, branch) {
  const r = shJson('gh', ['api', `repos/${cfg.project.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`]);
  if (r.rc || !Array.isArray(r.json) || !r.json[0]) return null;
  return r.json[0].commit?.committer?.date || null;
}

// ---------- claude -p (headless) ----------
export function runClaude({ cwd, prompt, model, effort, logFile, name, session }) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const args = ['-p', prompt, '--dangerously-skip-permissions', '--strict-mcp-config', '--mcp-config', MCP_NONE, '--output-format', 'text'];
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  // Постоянная сессия (один файл-транскрипт на слот лейна): первый запуск задаёт id, дальше --resume того же id.
  let sessMode = '-';
  if (session?.id) { if (fs.existsSync(transcriptPath(cwd, session.id))) { args.push('--resume', session.id); sessMode = 'resume'; } else { args.push('--session-id', session.id); sessMode = 'new'; } }
  const out = fs.openSync(logFile, 'a');
  fs.writeSync(out, `\n===== ${nowIso()} start ${name} cwd=${cwd} model=${model || 'default'} effort=${effort || 'default'} session=${session?.id || '-'}/${sessMode} =====\n`);
  const child = spawn(CLAUDE, args, { cwd, detached: true, stdio: ['ignore', out, out], env: { ...ENV, DISPATCHER_TASK: name, CLAUDE_CODE_DISPATCHER: '1' } });
  child.unref();
  return child.pid;
}
// ---------- постоянные headless-сессии: пул на лейн, чтобы приёмки/run-задачи не плодили файлы-сессии (depth) ----------
export function transcriptPath(cwd, id) { return path.join(HOME, '.claude/projects', cwd.replace(/[^A-Za-z0-9]/g, '-'), id + '.jsonl'); }
export function acquireSession(state, pool, max, maxUses = 8) {
  state.sessions ||= {}; const arr = (state.sessions[pool] ||= []);
  let s = arr.find(x => !x.inUse && x.uses < maxUses);
  if (!s) { for (const x of arr.filter(x => !x.inUse)) arr.splice(arr.indexOf(x), 1); if (arr.filter(x => x.inUse).length >= max) return null; s = { id: crypto.randomUUID(), uses: 0, createdAt: nowIso() }; arr.push(s); }
  s.inUse = true; s.uses++; s.lastUsed = nowIso(); return s;
}
export function releaseSession(state, pool, id, rotate = false) { const arr = state.sessions?.[pool]; if (!arr) return; const i = arr.findIndex(x => x.id === id); if (i < 0) return; if (rotate) arr.splice(i, 1); else arr[i].inUse = false; }
export const SESSION_BROKEN_RE = /prompt is too long|context window|No conversation found|could not resume|Resume failed|not found in this project/i;
export function pidAlive(pid) { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } }
export function tailFile(p, n = 60) { try { const s = fs.readFileSync(p, 'utf8'); const L = s.split('\n'); return L.slice(-n).join('\n'); } catch { return ''; } }
export const LIMIT_RE = /usage limit|rate limit|limit reached|hit your (weekly|daily|session)? ?limit|out of credits|not logged in|please run \/login|authentication_error|overloaded_error/i;

// ---------- prompts ----------
export function promptFile(task) { return path.join(P.prompts, task.prompt || `${task.id}.md`); }
export function loadPromptText(task) { try { return fs.readFileSync(promptFile(task), 'utf8'); } catch { return ''; } }
export function renderTemplate(text, vars) { return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m)); }
export function taskVars(cfg, task, extra = {}) {
  return { TASK_ID: task.id, TITLE: task.title, BRANCH: task.branch || '', BASE: cfg.project.base, REPO: cfg.project.repo,
    WORKTREE: task.branch ? worktreePath(cfg, task.branch) : cfg.project.mainCheckout, MISSION_DIR: DIR, MAIN_CHECKOUT: cfg.project.mainCheckout,
    MODEL: task.model || '', EFFORT: task.effort || '', ACCEPTANCE: task.acceptance || '', ...extra };
}
export function buildWorkerPrompt(cfg, task) {
  const pre = fs.readFileSync(path.join(P.prompts, '_worker-preamble.md'), 'utf8');
  return renderTemplate(pre + '\n\n---\n\n' + loadPromptText(task), taskVars(cfg, task));
}
export function buildRunPrompt(cfg, task, extra = {}) {
  const pre = fs.existsSync(path.join(P.prompts, '_run-preamble.md')) ? fs.readFileSync(path.join(P.prompts, '_run-preamble.md'), 'utf8') : '';
  return renderTemplate(pre + '\n\n---\n\n' + loadPromptText(task), taskVars(cfg, task, extra));
}
export function buildTemplatePrompt(cfg, name, task, extra = {}) {
  const t = fs.readFileSync(path.join(P.prompts, name), 'utf8');
  return renderTemplate(t, taskVars(cfg, task, extra));
}
export function runCwd(cfg, task) {
  if (!task.cwd || task.cwd === 'main') return cfg.project.mainCheckout;
  if (task.cwd === 'mission') return DIR;
  if (task.cwd.startsWith('worktree:')) return worktreePath(cfg, task.cwd.slice(9));
  return task.cwd;
}

// ---------- report ----------
const TERMINAL = new Set(['merged', 'done', 'failed', 'skipped', 'blocked', 'needs-ivan']);
export const isTerminal = (st) => TERMINAL.has(st);
export function writeReport(cfg, tasks, state) {
  const S = state.tasks; const rows = tasks.tasks;
  const cnt = {}; for (const t of rows) { const st = S[t.id]?.status || t.status || 'queued'; cnt[st] = (cnt[st] || 0) + 1; }
  const L = [];
  L.push(`# Отчёт дня — магазин Оксаны Черкашиной на upready-store`);
  L.push(`Обновлено ${wita()} диспетчером (тик ${state.dispatcher.ticks || 0}; ${state.dispatcher.paused ? 'ПАУЗА' : 'работает'}${state.dispatcher.limitUntil && Date.parse(state.dispatcher.limitUntil) > Date.now() ? '; ждём лимит до ' + wita(new Date(state.dispatcher.limitUntil)) : ''}). UI: http://localhost:${cfg.ui?.port || 5390}`);
  L.push('');
  L.push(`## Сводка`);
  L.push(Object.entries(cnt).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'задач нет');
  L.push('');
  L.push(`## Что посмотреть Ивану`);
  const look = [];
  for (const t of rows) { const s = S[t.id] || {}; if (s.pr?.url) look.push(`- ${t.id} «${t.title}» — PR ${s.pr.url} (${s.status})`); for (const a of (s.artifacts || [])) look.push(`- ${t.id}: ${a}`); }
  for (const u of (cfg.live?.links || [])) look.push(`- живой адрес: ${u}`);
  L.push(...(look.length ? look : ['- пока нечего: ни одного PR/артефакта']));
  L.push('');
  const needs = rows.filter(t => ['needs-ivan', 'failed', 'blocked'].includes(S[t.id]?.status));
  if (needs.length) { L.push(`## Требует внимания`); for (const t of needs) L.push(`- ${t.id} «${t.title}» — ${S[t.id].status}: ${S[t.id].error || S[t.id].note || ''}`); L.push(''); }
  L.push(`## Задачи (порядок = приоритет; зависимости в скобках)`);
  L.push('| # | id | задача | полоса | модель/усилие | ветка | статус | PR | попытки | начало |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const t of rows) { const s = S[t.id] || {}; L.push(`| ${t.priority ?? ''} | ${t.id} | ${t.title}${t.deps?.length ? ` (после ${t.deps.join(', ')})` : ''} | ${t.lane} | ${t.model || '-'}/${t.effort || '-'} | ${t.branch || t.cwd || ''} | **${s.status || t.status || 'queued'}** | ${s.pr?.url ? `[#${s.pr.number}](${s.pr.url})` : ''} | ${s.attempt || 0} | ${s.startedAt ? wita(new Date(s.startedAt)) : ''} |`); }
  L.push('');
  L.push(`## Последние события`);
  for (const e of state.events.slice(-40).reverse()) L.push(`- ${wita(new Date(e.ts))} · ${e.task || ''} · ${e.type}${e.msg ? ': ' + e.msg : ''}`);
  L.push('');
  L.push(`Журнал: ${P.journal} · состояние: ${P.state} · очередь: ${P.tasks}`);
  fs.writeFileSync(P.report, L.join('\n') + '\n');
}
