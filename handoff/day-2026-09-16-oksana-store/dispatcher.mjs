#!/usr/bin/env node
// dispatcher.mjs — планировщик дня (спека ~/upready/specs/task-dispatcher/SPEC.md §3, полосы по типу задачи).
// Команды: run (цикл) · tick (один проход) · status · cmd <op> [id] · add-task <file.json>
// Поля задачи для раннера agy (заказ 0.1): runner:"agy", model = id из `agy models`, waitOk (ждать сброса пятичасовой квоты), fallbackModel (делегирование claude); cfg.quotaMinPct, cfg.fallbackModel.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';
const { P } = L;

const ACTIVE_BUILD = ['running', 'pr_open', 'fixing'];
function ensure(state, t) { const s = (state.tasks[t.id] ||= { status: t.status || 'queued', attempt: 0, artifacts: [] }); if (!s.status) s.status = t.status || 'queued'; s.artifacts ||= []; return s; }
function laneCounts(cfg, state) {
  const c = {}; let total = 0;
  for (const t of cfg.tasks) {
    const s = state.tasks[t.id]; if (!s) continue;
    if (t.kind === 'build') {
      if (ACTIVE_BUILD.includes(s.status)) { c[t.lane] = (c[t.lane] || 0) + 1; total++; }
      if (s.status === 'accepting') { c.accept = (c.accept || 0) + 1; total++; }
    } else if (s.status === 'running') { c[t.lane] = (c[t.lane] || 0) + 1; total++; }
  }
  return { c, total };
}
const OKDEP = ['merged', 'done', 'skipped'];
const BADDEP = ['failed', 'blocked', 'needs-ivan'];
const depsSatisfied = (state, t) => (t.deps || []).every(d => OKDEP.includes(state.tasks[d]?.status)) && (t.softDeps || []).every(d => L.isTerminal(state.tasks[d]?.status));
const depsFailed = (state, t) => (t.deps || []).filter(d => BADDEP.includes(state.tasks[d]?.status));
function setLimit(state, text, task) { state.dispatcher.limitUntil = new Date(Date.now() + 15 * 60e3).toISOString(); L.event(state, { type: 'limit', task, msg: text.replace(/\s+/g, ' ').slice(0, 220) }); }
const limited = (state) => !!(state.dispatcher.limitUntil && Date.parse(state.dispatcher.limitUntil) > Date.now());

// ---------- запуск ----------
function launchBuild(cfg, state, t) {
  const s = ensure(state, t);
  // Класс b04/#35: ветка с именем уже смёрженного PR — хост находит старый PR по head и задача мгновенно «merged». Проверяем ДО создания workspace.
  if (t.branch) { const q = L.shJson('gh', ['pr', 'list', '--head', t.branch, '--state', 'all', '--repo', cfg.project.repo, '--json', 'number,state']); const hit = !q.rc && Array.isArray(q.json) && q.json.length ? q.json[0] : null;
    if (hit) { s.status = 'failed'; s.error = `ветка ${t.branch} уже несёт PR #${hit.number} (${hit.state}) — переименуй branch в tasks.json и retry`; L.event(state, { task: t.id, type: 'branch-has-pr', msg: s.error }); return false; } }
  const prompt = L.buildWorkerPrompt(cfg, t);
  const r = L.wsCreate(cfg, t, prompt);
  if (r.rc) { s.status = 'failed'; s.error = 'superset ws create: ' + String(r.error).slice(0, 400); L.event(state, { task: t.id, type: 'ws-create-failed', msg: s.error }); return false; }
  s.ws = r.id; s.worktree = r.worktreePath; s.terminalId = r.terminalId;
  if (r.raw?.alreadyExists && !r.terminalId) { // workspace на этой ветке уже был — чужие/мёртвые терминалы закрываем, агента поднимаем
    for (const tt of L.wsTerminals(r.id)) { if (!tt.exited) { L.terminalClose(r.id, tt.terminalId); L.event(state, { task: t.id, type: 'terminal-closed', msg: `${tt.terminalId} (${tt.title || ''})` }); } }
    const a = L.agentCreate(r.id, { prompt, model: t.model, effort: t.effort });
    if (a.rc) { s.status = 'failed'; s.error = 'agents create: ' + String(a.error).slice(0, 300); L.event(state, { task: t.id, type: 'agent-create-failed', msg: s.error }); return false; }
    s.terminalId = a.terminalId;
  }
  s.status = 'running'; s.launchedAt = L.nowIso(); s.startedAt ||= s.launchedAt; s.attempt = (s.attempt || 0) + 1; s.nudges = 0; s.relaunched = false; s.error = null;
  L.event(state, { task: t.id, type: 'launched', msg: `ws ${s.ws} · ${t.model || 'default'}/${t.effort || 'default'} · ${t.branch}` });
  return true;
}
function launchRun(cfg, state, t) {
  const s = ensure(state, t); const n = (s.attempt || 0) + 1;
  const log = path.join(P.logs, `${t.id}-${n}.log`);
  const cwd = L.runCwd(cfg, t);
  if (!fs.existsSync(cwd)) { s.status = 'failed'; s.error = 'cwd не существует: ' + cwd; L.event(state, { task: t.id, type: 'run-failed', msg: s.error }); return false; }
  const prompt = L.buildRunPrompt(cfg, t, { LOG_FILE: log, ATTEMPT: n, CWD: cwd });
  // Раннер agy (заказ 0.1): до запуска — прибор `agy -p "/usage"` по пулу модели; ниже cfg.quotaMinPct → waitOk ? waiting-quota + wakeAt : делегирование claude/fallbackModel.
  let runner = t.runner || 'claude', model = t.model, effort = t.effort, quota = null;
  if (runner === 'agy') {
    const u = L.agyUsage(); const qpool = L.agyPool(model); const q = u.pools[qpool]?.fiveHour || {};
    quota = { pool: qpool, pct: q.pct ?? null, resetAt: q.resetAt || null, usageRc: u.rc, at: L.nowIso() };
    const d = L.agyQuotaDecision({ pct: q.pct, resetAt: q.resetAt, minPct: cfg.quotaMinPct ?? 10, waitOk: !!t.waitOk });
    if (d.action === 'wait') { s.status = 'waiting-quota'; s.wakeAt = d.wakeAt; s.error = null; s.note = `agy ${qpool}: ${d.reason}; next wake ${d.wakeAt}`; s.quota = quota; L.event(state, { task: t.id, type: 'waiting-quota', msg: s.note }); return false; }
    if (d.action === 'delegate') { runner = 'claude'; model = t.fallbackModel || cfg.fallbackModel || 'sonnet'; s.note = `делегировано claude/${model}: agy ${qpool} — ${d.reason}`; L.event(state, { task: t.id, type: 'quota-delegated', msg: s.note }); }
    else if (u.rc) L.event(state, { task: t.id, type: 'quota-unread', msg: `agy -p /usage rc=${u.rc}: ${u.raw.slice(0, 200)}` });
  }
  const pool = `run:${t.lane || 'run'}@${cwd}`; const sess = runner === 'claude' ? L.acquireSession(state, pool, cfg.lanes?.[t.lane] || 1, cfg.persistent?.maxUses || 8) : null;
  const pid = runner === 'agy' ? L.runAgy({ cwd, prompt, model, logFile: log, name: t.id, timeoutMin: t.maxMin || 150 }) : L.runClaude({ cwd, prompt, model, effort, logFile: log, name: t.id, session: sess });
  s.status = 'running'; s.attempt = n; s.run = { pid, log, startedAt: L.nowIso(), session: sess?.id || null, sessionPool: pool, runner, model, ...(quota ? { quotaBefore: quota } : {}) }; s.startedAt ||= s.run.startedAt; s.error = null; delete s.wakeAt;
  L.event(state, { task: t.id, type: 'launched', msg: `${runner === 'agy' ? 'agy -p' : 'claude -p'} pid ${pid} · ${model || 'default'}/${runner === 'agy' ? '-' : (effort || 'default')} · cwd ${cwd}${quota ? ` · квота ${quota.pool} ${quota.pct ?? '?'}%` : ''}` });
  return true;
}
function launchAccept(cfg, state, t, headOid = null) {
  const s = state.tasks[t.id]; const n = (s.acceptance?.length || 0) + 1;
  const log = path.join(P.logs, `accept-${t.id}-${n}.log`); const findings = path.join(P.logs, `accept-${t.id}-${n}.findings.md`);
  const prompt = L.buildTemplatePrompt(cfg, '_acceptor.md', t, { PR_NUMBER: s.pr.number, PR_URL: s.pr.url, FINDINGS_FILE: findings, ROUND: n, LOG_FILE: log });
  const pool = `accept@${cfg.project.mainCheckout}`; const sess = L.acquireSession(state, pool, cfg.lanes?.accept || 2, cfg.persistent?.maxUses || 8);
  const pid = L.runClaude({ cwd: cfg.project.mainCheckout, prompt, model: cfg.acceptor?.model || 'opus', effort: cfg.acceptor?.effort || 'medium', logFile: log, name: 'accept-' + t.id, session: sess });
  (s.acceptance ||= []).push({ n, pid, log, findings, startedAt: L.nowIso(), session: sess?.id || null, sessionPool: pool, headOid }); // headOid — голова ветки, которую судит этот раунд
  s.status = 'accepting';
  L.event(state, { task: t.id, type: 'accept-started', msg: `раунд ${n}, PR #${s.pr.number}, pid ${pid}` });
}
function sendToWorker(cfg, state, t, text, why) {
  const s = state.tasks[t.id];
  const term = L.liveAgentTerminal(s.ws, s.terminalId);
  if (term) { const r = L.terminalSend(s.ws, term.terminalId, text); if (!r.rc) { s.terminalId = term.terminalId; L.event(state, { task: t.id, type: why + '-sent', msg: 'в живой терминал ' + term.terminalId }); return true; } }
  const r = L.agentCreate(s.ws, { prompt: text, model: t.model, effort: t.effort });
  if (!r.rc) { s.terminalId = r.terminalId; L.event(state, { task: t.id, type: why + '-agent', msg: 'новый агент в workspace ' + s.ws }); return true; }
  s.status = 'needs-ivan'; s.error = `не удалось передать ${why}: ${String(r.error).slice(0, 200)}`; L.event(state, { task: t.id, type: why + '-failed', msg: s.error }); return false;
}
function fixRound(cfg, state, t, findingsFile) {
  const s = state.tasks[t.id];
  if ((s.attempt || 1) >= (cfg.stall?.maxAttempts || 3)) { s.status = 'needs-ivan'; s.error = `приёмка отклонила ${s.acceptance.length} раз(а) — смотри ${findingsFile}`; L.event(state, { task: t.id, type: 'needs-ivan', msg: s.error }); return; }
  if (sendToWorker(cfg, state, t, fixPrompt(cfg, state, t, findingsFile), 'fix')) { s.status = 'running'; s.attempt = (s.attempt || 1) + 1; s.fixStartedAt = L.nowIso(); s.fixBaseHead = s.acceptance?.at(-1)?.headOid || null; s.nudges = 0; s.relaunched = false; s.fixRelaunched = false; }
}
function fixPrompt(cfg, state, t, findingsFile) {
  const s = state.tasks[t.id];
  const findings = fs.existsSync(findingsFile) ? fs.readFileSync(findingsFile, 'utf8') : `(файл замечаний не найден — прочитай хвост лога приёмки ${s.acceptance.at(-1).log})`;
  return L.buildTemplatePrompt(cfg, '_fix-round.md', t, { FINDINGS: findings, PR_NUMBER: s.pr.number, PR_URL: s.pr.url, ROUND: s.acceptance.length });
}

// ---------- закрытие после merge: сироты → /compact с именем ветки → терминал (приказ Ивана 2026-09-15 23:27 WITA) ----------
const TERMINAL = ['merged', 'done', 'skipped', 'failed'];
function compactPrompt(cfg, t, s) {
  return `/compact Compact this session for a cheap later resume. Task ${t.id} «${t.title}», branch ${t.branch}, worktree ${s.worktree || ''}, PR #${s.pr?.number || '?'} ${s.pr?.url || ''} ${s.pr?.state || ''}${s.pr?.mergedAt ? ' merged ' + s.pr.mergedAt : ''}. Keep verbatim: the branch name ${t.branch}, the PR number and url, what was delivered and where the results are (report paths, artifacts, stands and ports and whether they are stopped), unresolved nits and open questions. Drop command outputs, terminal screens, guard texts, screenshots, intermediate counters.`;
}
function finishTask(cfg, state, t, s, why) {
  const term = s.ws && s.terminalId ? L.terminalById(s.ws, s.terminalId) : null;
  if (s.worktree) { const k = L.killProcsUnder(s.worktree); if (k.killed) L.event(state, { task: t.id, type: 'orphans-killed', msg: `${k.killed} процессов под worktree (${why}): ${k.list.join(' | ').slice(0, 400)}` }); }
  if (term && !s.compactSentAt) { const r = L.terminalSend(s.ws, s.terminalId, compactPrompt(cfg, t, s)); s.compactSentAt = L.nowIso(); L.event(state, { task: t.id, type: 'compact-sent', msg: r.rc ? 'не отправлен: ' + String(r.error || '').slice(0, 80) : `терминал ${s.terminalId}, ветка ${t.branch}` }); }
  else if (!term) s.closedAt = s.closedAt || L.nowIso();
}
function closeAfterCompact(cfg, state, t, s) {
  const term = L.terminalById(s.ws, s.terminalId); if (!term) { s.closedAt = L.nowIso(); return; }
  const tail = L.terminalRead(s.ws, s.terminalId, 120) || ''; const onScreen = /Compacted|Compaction (complete|canceled)/i.test(tail); const inLog = onScreen ? null : L.compactDone(s.worktree, s.compactSentAt); const done = onScreen || !!inLog; const late = L.minutesSince(s.compactSentAt) > 8;
  if (!done && !late) return;
  const c = L.terminalClose(s.ws, s.terminalId); s.closedAt = L.nowIso();
  L.event(state, { task: t.id, type: 'worker-closed', msg: (c.rc ? 'не закрылся: ' + String(c.error || '').slice(0, 80) : `терминал ${s.terminalId} закрыт`) + (done ? (onScreen ? ' после /compact (по экрану)' : ` после /compact (compact_boundary ${inLog.ts || '?'} в стенограмме)`) : ` по таймауту /compact (8 мин); хвост экрана: ${tail.trim().split('\n').slice(-6).join(' ⏎ ').slice(-300)}`) });
  if (s.worktree) { const k = L.killProcsUnder(s.worktree); if (k.killed) L.event(state, { task: t.id, type: 'orphans-killed', msg: `${k.killed} после закрытия: ${k.list.join(' | ').slice(0, 300)}` }); }
}
// Каждый тик: процессы под worktree задач в конечном статусе — сироты, убить и записать (кто запустил, тот и закрывает).
function sweepOrphans(cfg, state) {
  const procs = L.listProcs(); if (!procs.length) return;
  for (const t of cfg.tasks) { const s = state.tasks[t.id]; if (!s?.worktree || !TERMINAL.includes(s.status) || (s.compactSentAt && !s.closedAt)) continue; const k = L.killProcsUnder(s.worktree, procs); if (k.killed) L.event(state, { task: t.id, type: 'orphans-killed', msg: `${k.killed} сирот (${s.status}): ${k.list.join(' | ').slice(0, 400)}` }); }
}

// ---------- наблюдение ----------
function checkBuild(cfg, state, t) {
  const s = state.tasks[t.id];
  const blockedFile = path.join(P.logs, `blocked-${t.id}.md`);
  if (fs.existsSync(blockedFile)) { s.status = 'needs-ivan'; s.error = 'воркер заблокирован: ' + fs.readFileSync(blockedFile, 'utf8').slice(0, 300).replace(/\s+/g, ' '); L.event(state, { task: t.id, type: 'blocked-by-worker', msg: s.error }); return; }
  const { pr, error } = L.prForBranch(cfg, t.branch);
  if (error) { L.event(state, { task: t.id, type: 'gh-error', msg: String(error).slice(0, 200) }); }
  if (pr) {
    s.pr = { number: pr.number, url: pr.url, state: pr.state, mergedAt: pr.mergedAt, isDraft: pr.isDraft };
    if (pr.state === 'MERGED') { s.status = 'merged'; s.finishedAt = L.nowIso(); L.event(state, { task: t.id, type: 'merged', msg: pr.url }); finishTask(cfg, state, t, s, 'merged'); return; }
    if (pr.state === 'OPEN' && !pr.isDraft && s.status === 'running') { s.status = 'pr_open'; s.prOpenedAt = L.nowIso(); L.event(state, { task: t.id, type: 'pr-open', msg: pr.url }); }
    if (pr.state === 'CLOSED' && !pr.mergedAt) { s.status = 'needs-ivan'; s.error = 'PR закрыт без мержа: ' + pr.url; L.event(state, { task: t.id, type: 'needs-ivan', msg: s.error }); return; }
  }
  if (s.status !== 'running') return;
  const term = L.liveAgentTerminal(s.ws, s.terminalId);
  if (term) {
    s.terminalId = term.terminalId;
    // Двойня агентов в одном workspace (t14: два claude с одним брифом с разницей 4 с в одном worktree) —
    // лишних живых агентов закрываем, владелец задачи — терминал из state.
    for (const x of L.wsTerminals(s.ws)) {
      if (x.exited || x.terminalId === term.terminalId || !L.agentAliveOnScreen(s.ws, x.terminalId)) continue;
      L.terminalClose(s.ws, x.terminalId); L.event(state, { task: t.id, type: 'dup-agent-closed', msg: `${x.terminalId} (${x.title || ''}) — второй живой агент в workspace, владелец ${term.terminalId}` });
    }
    const screen = L.terminalRead(s.ws, term.terminalId, 40);
    s.lastScreen = screen.slice(-800); s.lastScreenAt = L.nowIso();
    if (L.LIMIT_RE.test(screen)) {
      if (t.model === 'fable' && !s.modelFallback) { // лимит fable — та же задача на opus (PLAN §2)
        s.modelFallback = true; t.model = 'opus'; L.saveTasks(cfg);
        const r = L.agentCreate(s.ws, { prompt: L.buildWorkerPrompt(cfg, t), model: 'opus', effort: t.effort });
        L.event(state, { task: t.id, type: 'model-fallback', msg: r.rc ? 'agents create failed: ' + String(r.error).slice(0, 200) : 'fable→opus, terminal ' + r.terminalId });
        if (!r.rc) { s.terminalId = r.terminalId; s.launchedAt = L.nowIso(); }
      } else setLimit(state, screen, t.id);
    }
  }
  const since = L.minutesSince(s.fixStartedAt || s.launchedAt);
  const nudgeMin = cfg.stall?.nudgeMin || 150, relaunchMin = cfg.stall?.relaunchMin || 210;
  const nudge = () => L.buildTemplatePrompt(cfg, '_finish-nudge.md', t, { MINUTES: Math.round(since) });
  if (!term && L.minutesSince(s.launchedAt) > 5) {
    const all = L.wsTerminals(s.ws);
    if (!all.length || all.every(x => x.exited)) {
      if (!s.relaunched) { s.relaunched = true; L.event(state, { task: t.id, type: 'agent-exited', msg: 'агент вышел без PR — поднимаю нового' }); sendToWorker(cfg, state, t, nudge(), 'relaunch'); }
      else { s.status = 'needs-ivan'; s.error = 'агент дважды завершился без PR'; L.event(state, { task: t.id, type: 'needs-ivan', msg: s.error }); }
      return;
    }
  }
  if (since > relaunchMin * 1.6) { s.status = 'needs-ivan'; s.error = `воркер не открыл PR за ${Math.round(since)} мин`; L.event(state, { task: t.id, type: 'needs-ivan', msg: s.error }); return; }
  if (since > relaunchMin && s.nudges >= 1 && !s.relaunched) { s.relaunched = true; L.event(state, { task: t.id, type: 'stall-relaunch', msg: `${Math.round(since)} мин без PR` }); const r = L.agentCreate(s.ws, { prompt: nudge(), model: t.model, effort: t.effort }); if (!r.rc) s.terminalId = r.terminalId; return; }
  if (since > nudgeMin && !s.nudges) { s.nudges = 1; L.event(state, { task: t.id, type: 'stall-nudge', msg: `${Math.round(since)} мин без PR` }); if (term) L.terminalSend(s.ws, term.terminalId, nudge()); }
}
function maybeAccept(cfg, state, t, counts) {
  const s = state.tasks[t.id];
  if ((counts.c.accept || 0) >= (cfg.lanes?.accept ?? 2)) return;
  // pr_open уже сидит в ACTIVE_BUILD и в counts.total — переход в accepting слотов не добавляет; проверка total здесь
  // давала взаимную блокировку (4 pr_open + 1 accepting + 1 run = 6 → приёмка не стартует, слоты не освобождаются).
  if (limited(state) || state.dispatcher.paused) return;
  const h = L.branchHead(cfg, t.branch); const head = h?.date || null; const ageMin = head ? (Date.now() - Date.parse(head)) / 60000 : 99;
  // «Правка выложена» = голова origin/<branch> сменилась относительно той, что судил приёмщик (fixBaseHead);
  // дата коммита — запасной критерий (когда fixBaseHead не записан). Пуш старых коммитов дату не меняет — w21 11:23 WITA.
  const fixPushed = !s.fixStartedAt || (s.fixBaseHead && h?.oid && h.oid !== s.fixBaseHead) || (head && Date.parse(head) >= Date.parse(s.fixStartedAt));
  if (!fixPushed) { // правка после отказа ещё не запушена
    const term = L.liveAgentTerminal(s.ws, s.terminalId);
    if (!term) {
      if (!s.fixRelaunched) { s.fixRelaunched = true; L.event(state, { task: t.id, type: 'fix-relaunch', msg: 'агент вышел, не запушив правку — поднимаю нового с теми же замечаниями' }); if (sendToWorker(cfg, state, t, fixPrompt(cfg, state, t, s.acceptance.at(-1).findings), 'fix-relaunch')) s.fixStartedAt = L.nowIso(); }
      else { s.status = 'needs-ivan'; s.error = `агент дважды вышел, не запушив правку раунда ${s.acceptance?.length || 0}`; L.event(state, { task: t.id, type: 'needs-ivan', msg: s.error }); }
    } else if (L.minutesSince(s.fixStartedAt) > (cfg.stall?.relaunchMin || 210)) { s.status = 'needs-ivan'; s.error = `правка после приёмки не запушена за ${Math.round(L.minutesSince(s.fixStartedAt))} мин`; L.event(state, { task: t.id, type: 'needs-ivan', msg: s.error }); }
    return;
  }
  if (ageMin < (cfg.acceptor?.headQuietMin ?? 4)) return; // воркер ещё пушит
  launchAccept(cfg, state, t, h?.oid || null); counts.c.accept = (counts.c.accept || 0) + 1;
}
function checkAccepting(cfg, state, t) {
  const s = state.tasks[t.id]; const a = s.acceptance.at(-1);
  if (L.pidAlive(a.pid)) { if (L.minutesSince(a.startedAt) > (cfg.acceptor?.maxMin || 90)) { try { process.kill(a.pid, 'SIGTERM'); } catch { } a.verdict = 'TIMEOUT'; } else return; }
  const tail = L.tailFile(a.log, 300);
  if (a.session && !a.sessionReleased) { const broken = L.SESSION_BROKEN_RE.test(tail) || a.verdict === 'TIMEOUT'; L.releaseSession(state, a.sessionPool, a.session, broken); a.sessionReleased = true; if (broken) L.event(state, { task: t.id, type: 'session-rotated', msg: `постоянная сессия приёмки ${a.session} снята (${a.verdict === 'TIMEOUT' ? 'timeout' : 'resume/context error'})` }); }
  const m = tail.match(/VERDICT:\s*(MERGED|REJECTED|BLOCKED)/g); let verdict = m ? m[m.length - 1].split(/\s+/)[1] : (a.verdict || 'NONE');
  if (verdict === 'NONE' && fs.existsSync(a.findings) && fs.statSync(a.findings).size > 50) { verdict = 'REJECTED'; L.event(state, { task: t.id, type: 'verdict-by-findings-file', msg: 'VERDICT не напечатан, но есть файл замечаний' }); }
  for (const x of (tail.match(/ARTIFACT:\s*(\S+)/g) || [])) s.artifacts.push(x.replace(/ARTIFACT:\s*/, ''));
  const pr = L.prView(cfg, s.pr.number);  // истина — GitHub, не текст приёмщика (17a)
  if (pr?.state === 'MERGED') { s.status = 'merged'; s.pr.mergedAt = pr.mergedAt; s.pr.state = 'MERGED'; s.finishedAt = L.nowIso(); a.verdict = 'MERGED';
    // Работа закончена — закрываем терминал воркера (приказ Ивана 22:03 WITA: сессии, чья работа закончилась, не держать)
    finishTask(cfg, state, t, s, 'merged'); L.event(state, { task: t.id, type: 'merged', msg: `${pr.url} (приёмка раунд ${a.n})` }); return; }
  a.verdict = verdict;
  if (verdict === 'REJECTED') { L.event(state, { task: t.id, type: 'rejected', msg: `раунд ${a.n}: ${a.findings}` }); fixRound(cfg, state, t, a.findings); return; }
  if (verdict === 'MERGED') { L.event(state, { task: t.id, type: 'accept-claim-unverified', msg: 'приёмщик написал MERGED, GitHub не подтвердил — повтор' }); }
  if (L.LIMIT_RE.test(tail)) { setLimit(state, tail, t.id); s.status = 'pr_open'; return; }
  if (s.acceptance.length < (cfg.acceptor?.maxRounds || 2)) { s.status = 'pr_open'; L.event(state, { task: t.id, type: 'accept-retry', msg: `вердикт ${verdict} — повтор приёмки` }); }
  else { s.status = 'needs-ivan'; s.error = `приёмка без вердикта (${verdict}); лог ${a.log}`; L.event(state, { task: t.id, type: 'needs-ivan', msg: s.error }); }
}
function checkRun(cfg, state, t) {
  const s = state.tasks[t.id]; const r = s.run;
  if (L.pidAlive(r.pid)) { if (L.minutesSince(r.startedAt) > (t.maxMin || 150)) { try { process.kill(r.runner === 'agy' ? -r.pid : r.pid, 'SIGTERM'); } catch { } r.timeout = true; } else return; }
  let tail = L.tailFile(r.log, 300);
  if (r.runner === 'agy') { const a = L.agyParseLog(tail); tail = a.text; if (a.meta) r.agy = a.meta; }
  if (r.session && !r.sessionReleased) { const broken = L.SESSION_BROKEN_RE.test(tail) || !!r.timeout; L.releaseSession(state, r.sessionPool, r.session, broken); r.sessionReleased = true; if (broken) L.event(state, { task: t.id, type: 'session-rotated', msg: `постоянная run-сессия ${r.session} снята (${r.timeout ? 'timeout' : 'resume/context error'})` }); }
  const m = tail.match(/RESULT:\s*(OK|FAIL)[^\n]*/g); const last = m ? m[m.length - 1] : null;
  for (const x of (tail.match(/ARTIFACT:\s*(\S+)/g) || [])) s.artifacts.push(x.replace(/ARTIFACT:\s*/, ''));
  if (!last && r.runner === 'agy') {
    // agy: строка ошибки исчерпания не замерена — прибор /usage сразу после выхода: пул ниже порога → квота (waitOk ? ждать сброса : в очередь, launchRun делегирует claude), иначе обычный failed/retry.
    const rcm = tail.match(/AGY_RC=(\d+)/g); const agyRc = rcm ? Number(rcm[rcm.length - 1].slice(7)) : null;
    const u = L.agyUsage(); const qpool = L.agyPool(r.model); const q = u.pools[qpool]?.fiveHour || {};
    r.quotaAfter = { pool: qpool, pct: q.pct ?? null, resetAt: q.resetAt || null, usageRc: u.rc, agyRc, at: L.nowIso() };
    if (q.pct != null && q.pct < (cfg.quotaMinPct ?? 10)) {
      s.attempt = Math.max(0, s.attempt - 1);
      const d = L.agyQuotaDecision({ pct: q.pct, resetAt: q.resetAt, minPct: cfg.quotaMinPct ?? 10, waitOk: !!t.waitOk });
      if (d.action === 'wait') { s.status = 'waiting-quota'; s.wakeAt = d.wakeAt; s.note = `agy ${qpool}: квота кончилась в работе (rc=${agyRc}); ${d.reason}; next wake ${d.wakeAt}`; L.event(state, { task: t.id, type: 'waiting-quota', msg: s.note }); return; }
      s.status = 'queued'; s.error = `agy ${qpool}: квота ${q.pct}% кончилась в работе (rc=${agyRc}) — повтор с делегированием`; L.event(state, { task: t.id, type: 'run-quota', msg: s.error }); return;
    }
  }
  if (!last && r.runner !== 'agy' && L.LIMIT_RE.test(tail)) { setLimit(state, tail, t.id); s.status = 'queued'; s.attempt = Math.max(0, s.attempt - 1); L.event(state, { task: t.id, type: 'run-limit', msg: 'лимит — вернул в очередь' }); return; }
  let ok = !!last && /RESULT:\s*OK/.test(last);
  if (!last && /✓ safe to \/clear/.test(tail) && /ARTIFACT:|file:\/\//.test(tail)) { ok = true; s.note = 'финал по маркеру auto-save (✓ safe to /clear) — RESULT не напечатан'; L.event(state, { task: t.id, type: 'result-by-autosave-marker', msg: 'RESULT отсутствует, принят по ✓ safe to /clear + артефакты' }); }
  if (ok && t.doneCheck?.url) {
    const rr = L.sh('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '30', '-L', t.doneCheck.url]);
    if (rr.out.trim() !== String(t.doneCheck.expect || 200)) { ok = false; s.error = `doneCheck ${t.doneCheck.url} → ${rr.out.trim() || 'нет ответа'}`; }
  }
  if (ok) { s.status = 'done'; s.finishedAt = L.nowIso(); s.note = last.slice(0, 200); L.event(state, { task: t.id, type: 'done', msg: last.slice(0, 200) }); return; }
  const reason = s.error || (last ? last.slice(0, 200) : (r.timeout ? 'таймаут' : 'нет строки RESULT в логе'));
  if (s.attempt < (t.maxAttempts || 2)) { s.status = 'queued'; s.error = reason; L.event(state, { task: t.id, type: 'run-retry', msg: reason }); }
  else { s.status = 'failed'; s.error = reason; L.event(state, { task: t.id, type: 'failed', msg: reason }); }
}

// ---------- команды из UI ----------
function processCommands(cfg, state) {
  fs.mkdirSync(P.commands, { recursive: true });
  for (const f of fs.readdirSync(P.commands).filter(x => x.endsWith('.json')).sort()) {
    const fp = path.join(P.commands, f); const c = L.readJson(fp, null); try { fs.unlinkSync(fp); } catch { }
    if (!c) continue;
    const t = c.id ? cfg.tasks.find(x => x.id === c.id) : null;
    const s = t ? ensure(state, t) : null;
    switch (c.op) {
      case 'launch': if (s && !['running', 'pr_open', 'accepting', 'fixing'].includes(s.status)) { s.status = 'queued'; s.force = true; s.error = null; s.relaunched = false; s.nudges = 0; } break;
      case 'skip': if (s && !['running', 'accepting'].includes(s.status)) { s.status = 'skipped'; if (s.ws && s.terminalId && L.terminalById(s.ws, s.terminalId)) { L.terminalClose(s.ws, s.terminalId); s.closedAt = L.nowIso(); L.event(state, { task: t.id, type: 'worker-closed', msg: 'терминал закрыт по skip' }); } if (s.worktree) { const k = L.killProcsUnder(s.worktree); if (k.killed) L.event(state, { task: t.id, type: 'orphans-killed', msg: `${k.killed} по skip: ${k.list.join(' | ').slice(0, 300)}` }); } } break;
      case 'retry': if (s) { s.status = 'queued'; s.error = null; s.relaunched = false; s.nudges = 0; } break;
      case 'mark-done': if (s) { s.status = t.kind === 'build' ? 'merged' : 'done'; s.note = 'отмечено вручную'; if (t.kind === 'build') finishTask(cfg, state, t, s, 'mark-done'); } break;
      case 'pause': state.dispatcher.paused = true; break;
      case 'resume': state.dispatcher.paused = false; state.dispatcher.limitUntil = null; try { fs.unlinkSync(P.stop); } catch { } break;
      case 'clear-limit': state.dispatcher.limitUntil = null; break;
      // Правка записи задачи извне идёт ТОЛЬКО через очередь команд: прямая запись в state.json теряется, если диспетчер в этот момент внутри тика (откат b08/b14 02:4x).
      case 'set-task': if (s && c.patch && typeof c.patch === 'object') { Object.assign(s, c.patch); L.event(state, { task: t.id, type: 'set-task', msg: 'правка по команде: ' + Object.keys(c.patch).join(', ').slice(0, 200) }); } break;
      case 'fix': if (s && t.kind === 'build' && s.acceptance?.length && !['accepting'].includes(s.status)) { s.attempt = Math.min(s.attempt || 1, (cfg.stall?.maxAttempts || 3) - 1); fixRound(cfg, state, t, s.acceptance.at(-1).findings); } break;
    }
    L.event(state, { type: 'command', task: c.id, msg: c.op });
  }
}

// ---------- тик ----------
// Последняя сохранённая копия state: если файл на диске оказался СТАРШЕ (меньше ticks) — его кто-то откатил (git stash чужой сессии, восстановление из копии); работаем со своей копией и пишем событие.
let LAST_SAVED = null; const save = (s) => { L.saveState(s); LAST_SAVED = structuredClone(s); };
export function tick() {
  const cfg = L.loadTasks(); let state = L.loadState();
  if (LAST_SAVED && (state.dispatcher?.ticks || 0) < (LAST_SAVED.dispatcher?.ticks || 0)) { const disk = state; state = LAST_SAVED; L.event(state, { type: 'state-rollback', msg: `state.json на диске откачен: ticks ${disk.dispatcher?.ticks} < ${state.dispatcher.ticks}, lastTick диска ${disk.dispatcher?.lastTick}; работаю с последней сохранённой копией, диск перезапишу` }); }
  state.dispatcher.lastTick = L.nowIso(); state.dispatcher.ticks = (state.dispatcher.ticks || 0) + 1; state.dispatcher.pid = process.pid; state.dispatcher.startedAt ||= L.nowIso();
  for (const t of cfg.tasks) ensure(state, t);
  if (fs.existsSync(P.done)) { L.writeReport(cfg, cfg, state); save(state); return 'done'; }
  if (fs.existsSync(P.stop)) state.dispatcher.paused = true;
  processCommands(cfg, state);
  for (const t of cfg.tasks) {
    const s = state.tasks[t.id];
    try {
      if (t.kind === 'build') { if (['running', 'fixing', 'pr_open'].includes(s.status)) checkBuild(cfg, state, t); else if (s.status === 'accepting') checkAccepting(cfg, state, t); }
      else if (s.status === 'running') checkRun(cfg, state, t);
    } catch (e) { L.event(state, { task: t.id, type: 'monitor-error', msg: String(e.stack || e.message).slice(0, 400) }); }
  }
  for (const t of cfg.tasks) { const s = state.tasks[t.id]; if (s.status === 'queued' && !s.force) { const bad = depsFailed(state, t); if (bad.length) { s.status = 'blocked'; s.error = 'зависимость провалена: ' + bad.join(', '); L.event(state, { task: t.id, type: 'blocked', msg: s.error }); } } }
  for (const t of cfg.tasks) { const s = state.tasks[t.id]; if (s.status === 'waiting-quota' && s.wakeAt && Date.parse(s.wakeAt) <= Date.now()) { s.status = 'queued'; s.force = true; L.event(state, { task: t.id, type: 'quota-wake', msg: `плановый сброс квоты ${s.wakeAt} наступил — в очередь` }); } }
  let counts = laneCounts(cfg, state);
  for (const t of cfg.tasks) { const s = state.tasks[t.id]; if (t.kind === 'build' && s.status === 'pr_open') { try { maybeAccept(cfg, state, t, counts); } catch (e) { L.event(state, { task: t.id, type: 'accept-error', msg: String(e.message).slice(0, 300) }); } } }
  for (const t of cfg.tasks) { const s = state.tasks[t.id]; if (s?.compactSentAt && !s.closedAt) { try { closeAfterCompact(cfg, state, t, s); } catch (e) { L.event(state, { task: t.id, type: 'close-error', msg: String(e.message).slice(0, 200) }); } } }
  try { sweepOrphans(cfg, state); } catch (e) { L.event(state, { type: 'sweep-error', msg: String(e.message).slice(0, 200) }); }
  if (!state.dispatcher.paused && !limited(state)) {
    counts = laneCounts(cfg, state);
    const queue = cfg.tasks.filter(t => state.tasks[t.id].status === 'queued' && (state.tasks[t.id].force || depsSatisfied(state, t))).sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    for (const t of queue) {
      if (counts.total >= (cfg.maxSlots || 6)) break;
      const cap = cfg.lanes?.[t.lane] ?? 1; if ((counts.c[t.lane] || 0) >= cap) continue;
      const ok = t.kind === 'build' ? launchBuild(cfg, state, t) : launchRun(cfg, state, t);
      state.tasks[t.id].force = false;
      if (ok) { counts.c[t.lane] = (counts.c[t.lane] || 0) + 1; counts.total++; }
      save(state);
    }
  }
  const allT = cfg.tasks.length > 0 && cfg.tasks.every(t => L.isTerminal(state.tasks[t.id].status));
  state.dispatcher.allTerminalTicks = allT ? (state.dispatcher.allTerminalTicks || 0) + 1 : 0;
  if (allT && state.dispatcher.allTerminalTicks >= 3) { fs.writeFileSync(P.done, L.wita() + ' все задачи в конечном статусе\n'); L.event(state, { type: 'all-terminal', msg: 'DONE' }); }
  L.writeReport(cfg, cfg, state); save(state);
  return 'ok';
}

const argv = process.argv.slice(2); const cmd = argv[0] || 'run';
if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === 'tick') { console.log(tick()); }
  else if (cmd === 'run') {
    const others = String(L.sh('pgrep', ['-f', 'node dispatcher.mjs run']).out || '').split(/\s+/).map(Number).filter(p => p && p !== process.pid);
    if (others.length) { console.error(`dispatcher уже работает (pid ${others.join(', ')}) — второй экземпляр не запускаю (по пульсу сторожа 07:12 WITA три экземпляра дали дубли запусков у 10 задач)`); process.exit(3); }
    const sec = L.loadTasks().tickSec || 60; let busy = false;
    const loop = () => { if (busy) return; busy = true; try { const r = tick(); if (r === 'done') { console.log('DONE — выхожу'); process.exit(0); } } catch (e) { L.journal({ type: 'tick-crash', msg: String(e.stack || e).slice(0, 800) }); } finally { busy = false; } };
    loop(); setInterval(loop, sec * 1000); console.log(`dispatcher pid ${process.pid}, тик ${sec}с`);
  }
  else if (cmd === 'status') { const cfg = L.loadTasks(); const st = L.loadState(); for (const t of cfg.tasks) { const s = st.tasks[t.id] || {}; console.log(`${String(t.priority ?? '').padStart(3)} ${t.id.padEnd(28)} ${(s.status || t.status || 'queued').padEnd(11)} ${t.lane.padEnd(7)} ${(t.model || '-')}/${t.effort || '-'}  ${s.pr?.url || ''} ${s.error ? '! ' + s.error : ''}`); } console.log(`paused=${st.dispatcher.paused} limitUntil=${st.dispatcher.limitUntil || '-'} lastTick=${st.dispatcher.lastTick || '-'}`); }
  else if (cmd === 'cmd') { fs.mkdirSync(P.commands, { recursive: true }); const f = path.join(P.commands, `${Date.now()}-${argv[1]}.json`); const patch = argv[3] ? (argv[3].startsWith('@') ? L.readJson(argv[3].slice(1), null) : JSON.parse(argv[3])) : undefined; fs.writeFileSync(f, JSON.stringify({ op: argv[1], id: argv[2] || null, ...(patch ? { patch } : {}) })); console.log('queued', f, patch ? 'patch keys: ' + Object.keys(patch).join(',') : ''); }
  else if (cmd === 'add-task') { const cfg = L.loadTasks(); const add = JSON.parse(fs.readFileSync(argv[1], 'utf8')); const arr = Array.isArray(add) ? add : [add]; const ids = new Set(cfg.tasks.map(t => t.id)); let n = 0; for (const t of arr) { if (ids.has(t.id)) continue; cfg.tasks.push(t); n++; } L.saveTasks(cfg); console.log(`added ${n}`); }
  else { console.log('usage: dispatcher.mjs run|tick|status|cmd <op> [id]|add-task <file>'); }
}
