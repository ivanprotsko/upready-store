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
export function branchHead(cfg, branch) {
  // Через git, не через REST GitHub API: квота 5000/ч одна на все инструменты и хост Superset,
  // 2026-09-16 она была исчерпана целиком (resume 0638). git fetch по HTTPS в квоту API не входит.
  // Возвращает { oid, date } головы origin/<branch>: OID — «что лежит на GitHub», дата — «когда закоммичено».
  // Пуш старых коммитов дату не омолаживает (w21 11:23 WITA: единственный дефект приёмки был «не запушено»,
  // воркер запушил через минуту, а диспетчер 210 мин ждал коммита моложе fixStartedAt) — поэтому «правка
  // выложена» судится по СМЕНЕ OID относительно головы, которую видел приёмщик, а дата остаётся запасным критерием.
  const cwd = cfg.project.mainCheckout;
  const f = sh('git', ['fetch', '-q', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { cwd, timeout: 60000 });
  if (f.rc) return null;
  const r = sh('git', ['log', '-1', '--format=%H%n%cI', `refs/remotes/origin/${branch}`], { cwd });
  if (r.rc) return null;
  const [oid, date] = String(r.out || '').trim().split('\n');
  return oid ? { oid, date: date || null } : null;
}
export function branchHeadDate(cfg, branch) { return branchHead(cfg, branch)?.date || null; }

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
// ---------- Antigravity CLI (agy) — раннер задач тестов/моков (заказ Ивана 0.1, 2026-09-18 04:53 WITA; план в INTAKE «Заказ 0.1 — план внедрения штаба») ----------
export const AGY = path.join(HOME, '.local/bin/agy');
// Разбор вывода `agy -p "/usage"` (TSV: <пул>\t<лимит>\t<N%>\t<ISO сброса>; замер 2026-09-18 05:49 WITA). Чужие строки пропускаются.
export function parseAgyUsage(text) {
  const pools = {};
  for (const line of String(text || '').split('\n')) {
    const f = line.split('\t'); if (f.length < 4) continue;
    const pct = parseInt(f[2], 10); if (!/^\s*\d+\s*%\s*$/.test(f[2]) || Number.isNaN(pct)) continue;
    const key = /five hour/i.test(f[1]) ? 'fiveHour' : /weekly/i.test(f[1]) ? 'weekly' : f[1].trim();
    (pools[f[0].trim()] ||= {})[key] = { pct, resetAt: f[3].trim() };
  }
  return pools;
}
// Пул квоты по id модели agy: gemini-* → «Gemini Models», остальное (claude-*, gpt-oss-*) → «Claude and GPT models».
export function agyPool(model) { return /^gemini/i.test(String(model || '')) ? 'Gemini Models' : 'Claude and GPT models'; }
export function agyUsage() { const r = sh(AGY, ['-p', '/usage'], { timeout: 90e3 }); return { rc: r.rc, pools: r.rc ? {} : parseAgyUsage(r.out), raw: String(r.out || r.err || '').slice(0, 600) }; }
// Решение до запуска: run — квота ≥ порога или прибор молчит; wait — ниже порога и задача может ждать (wakeAt = плановый сброс, а если он уже в прошлом — через 10 мин);
// delegate — ниже порога, ждать нельзя → раннер claude с fallbackModel.
export function agyQuotaDecision({ pct, resetAt, minPct = 10, waitOk = false, now = Date.now() }) {
  if (pct == null) return { action: 'run', reason: 'квота не прочитана — запускаю' };
  if (pct >= minPct) return { action: 'run', reason: `квота ${pct}% ≥ ${minPct}%` };
  if (waitOk) { const t = resetAt ? Date.parse(resetAt) : NaN; const wakeAt = (t > now ? new Date(t) : new Date(now + 10 * 60e3)).toISOString(); return { action: 'wait', wakeAt, reason: `квота ${pct}% < ${minPct}%, жду сброса ${resetAt || '(момент неизвестен)'}` }; }
  return { action: 'delegate', reason: `квота ${pct}% < ${minPct}%, ждать нельзя` };
}
// Запуск agy неинтерактивно. Код выхода detached-процесса теряется, поэтому sh ждёт agy и дописывает AGY_RC=<rc> в лог; группа процессов = pid sh (detached) — убивать группой (kill -pid).
// --effort не передаём: у gemini-моделей усилие зашито в id (gemini-3.1-pro-high), совместимость флага с таким id не замерена.
export function runAgy({ cwd, prompt, model, logFile, name, timeoutMin }) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const args = ['-p', prompt, '--dangerously-skip-permissions', '--output-format', 'json', '--print-timeout', `${timeoutMin || 150}m`];
  if (model) args.push('--model', model);
  const out = fs.openSync(logFile, 'a');
  fs.writeSync(out, `\n===== ${nowIso()} start ${name} runner=agy cwd=${cwd} model=${model || 'default'} =====\n`);
  const child = spawn('/bin/sh', ['-c', '"$0" "$@"; rc=$?; echo; echo "AGY_RC=$rc"; exit $rc', AGY, ...args], { cwd, detached: true, stdio: ['ignore', out, out], env: { ...ENV, DISPATCHER_TASK: name, DISPATCHER_RUNNER: 'agy' } });
  child.unref();
  return child.pid;
}
// Лог agy в print-режиме json — одна JSON-строка {conversation_id,status,response,duration_seconds,num_turns,usage:{input_tokens,output_tokens,thinking_tokens,cache_read_tokens,total_tokens}} (замер 2026-09-18 05:55 WITA).
// Для разбора RESULT/ARTIFACT отдаём текст ответа вместо JSON, метаданные — отдельно (в state.run.agy).
export function agyParseLog(tail) {
  let meta = null; const lines = [];
  for (const line of String(tail || '').split('\n')) {
    if (line.startsWith('{') && line.includes('"response"')) { try { const o = JSON.parse(line); meta = { conversation: o.conversation_id || null, status: o.status || null, durationSec: o.duration_seconds ?? null, turns: o.num_turns ?? null, usage: o.usage || null }; lines.push(`[agy status=${meta.status} conversation=${meta.conversation} tokens=${meta.usage?.total_tokens ?? '?'}]`, String(o.response || '')); continue; } catch { } }
    lines.push(line);
  }
  return { text: lines.join('\n'), meta };
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
  // runner agy (Gemini) получает свою преамбулу — две строки-лекарства из замера ag01 (2026-09-18): без подагентов, запись только относительно cwd.
  const preName = task.runner === 'agy' ? '_agy-preamble.md' : '_run-preamble.md';
  const pre = fs.existsSync(path.join(P.prompts, preName)) ? fs.readFileSync(path.join(P.prompts, preName), 'utf8') : '';
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
const TERMINAL = new Set(['merged', 'done', 'failed', 'skipped', 'blocked', 'needs-ivan', 'backlog']); // backlog (заказ Ивана 2026-09-18 03:59): задача заведена, но не в очереди — в работу только cmd launch
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
  const needs = rows.filter(t => ['needs-ivan', 'failed', 'blocked', 'waiting-quota'].includes(S[t.id]?.status));
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

// ---------- процессы воркеров: кто запустил — тот и закрывает (приказ Ивана 2026-09-15 23:27 WITA) ----------
// Замер 23:27: 66 dev-серверов/watcher'ов 17 смёрженных задач жили часами после закрытия терминалов (nohup/&, ppid 1).
export function listProcs() {
  try { return execFileSync('ps', ['-axo', 'pid=,ppid=,etime=,command='], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } }).split('\n').map(l => l.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)).filter(Boolean).map(m => ({ pid: +m[1], ppid: +m[2], etime: m[3], cmd: m[4] })); } catch { return []; }
}
// Процессы, чей argv указывает внутрь каталога (dev-серверы, watcher'ы, esbuild в worktree воркера). Свой pid, claude и хуки не трогаем.
export function procsUnder(dir, procs = listProcs()) {
  if (!dir) return []; const d = dir.replace(/\/+$/, '') + '/';
  return procs.filter(p => p.pid !== process.pid && p.cmd.includes(d) && !/\.local\/bin\/claude|\.claude\/hooks\//.test(p.cmd));
}
export function killProcsUnder(dir, procs) {
  const ps = procsUnder(dir, procs); if (!ps.length) return { killed: 0, left: 0, list: [] };
  for (const p of ps) { try { process.kill(p.pid, 'SIGTERM'); } catch {} }
  const t0 = Date.now(); while (Date.now() - t0 < 2000 && procsUnder(dir).length) { try { execFileSync('sleep', ['0.2']); } catch {} }
  for (const p of procsUnder(dir)) { try { process.kill(p.pid, 'SIGKILL'); } catch {} }
  return { killed: ps.length, left: procsUnder(dir).length, list: ps.map(p => `${p.pid} ${p.etime} ${p.cmd.slice(0, 100)}`) };
}

// Стенограмма воркера на диске (~/.claude/projects/<путь worktree, все не-[A-Za-z0-9] → '-'>/<sid>.jsonl):
// строка {"type":"system","subtype":"compact_boundary","timestamp":…} новее sinceIso = компакция прошла, независимо от экрана.
export function transcriptDir(worktree) { return path.join(process.env.HOME || '', '.claude', 'projects', String(worktree || '').replace(/[^A-Za-z0-9]/g, '-')); }
export function compactDone(worktree, sinceIso, tailBytes = 400000) {
  const dir = transcriptDir(worktree); if (!worktree || !fs.existsSync(dir)) return null;
  const since = new Date(sinceIso).getTime() - 60000;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.jsonl'))) {
    const p = path.join(dir, f); let st; try { st = fs.statSync(p); } catch { continue; }
    if (st.mtimeMs < since) continue;
    const start = Math.max(0, st.size - tailBytes); const buf = Buffer.alloc(st.size - start); const fd = fs.openSync(p, 'r');
    try { fs.readSync(fd, buf, 0, buf.length, start); } finally { fs.closeSync(fd); }
    for (const line of buf.toString('utf8').split('\n')) {
      if (!line.includes('"compact_boundary"')) continue;
      const m = line.match(/"timestamp":"([^"]+)"/); const ts = m ? new Date(m[1]).getTime() : st.mtimeMs;
      if (ts >= since) return { file: p, ts: m ? m[1] : null };
    }
  }
  return null;
}
