#!/usr/bin/env node
// ui/server.mjs — локальный UI диспетчера: таблица задач, редактор промптов, RUN/SKIP/RETRY, пауза, отчёт, логи. http://localhost:5390
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import * as L from '../lib.mjs';
import { summary } from './summary.mjs';
const { P } = L;
const cfg0 = L.loadTasks(); const PORT = Number(process.env.PORT || cfg0.ui?.port || 5390);
const HTML = path.join(L.DIR, 'ui', 'index.html');
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const text = (res, code, s, ct = 'text/plain; charset=utf-8') => { res.writeHead(code, { 'content-type': ct, 'cache-control': 'no-store' }); res.end(s); };
const body = (req) => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => r(b)); });
const safe = (base, f) => { const p = path.resolve(base, f); return p.startsWith(base) ? p : null; };
const REPO = path.resolve(L.DIR, '..', '..');
// Путь из отчёта воркера может быть относительным к корню репозитория (как в PR) — сначала папка штаба, затем репо.
const safeAny = (f) => { const a = safe(L.DIR, f); if (a && fs.existsSync(a)) return a; const b = safe(REPO, f); return b && fs.existsSync(b) ? b : a; };

// ---------- страница «Оператор» (OPERATOR-SPEC §7) ----------
// Модули оператора подгружаются лениво: UI штаба обязан подниматься и тогда, когда базы оператора ещё нет.
let OP = null;
async function op() {
  if (OP === null) {
    try {
      const [db, operator, gate] = await Promise.all([import('../intake/db.mjs'), import('../intake/operator.mjs'), import('../intake/gate.mjs')]);
      OP = { db, operator, gate, cfg: db.loadCorpusConfig() };
    } catch (e) { OP = { error: String(e.message) }; }
  }
  return OP;
}
/** Источник, на который ссылается документ ответа: внутри корпуса, и никогда .private/.env/стенограмма. */
async function safeSource(f) {
  const o = await op();
  if (!o || o.error || !f) return null;
  const p = path.resolve(f);
  if (o.gate.forbidden(p)) return null;
  const roots = o.gate.corpusRoots(o.cfg);
  return roots.some((r) => p === r || p.startsWith(r.endsWith('/') ? r : r + '/')) && fs.existsSync(p) ? p : null;
}
function cmd(op, id) { fs.mkdirSync(P.commands, { recursive: true }); const f = path.join(P.commands, `${Date.now()}-${op}-${id || 'all'}.json`); fs.writeFileSync(f, JSON.stringify({ op, id: id || null, ts: L.nowIso() })); return f; }
function dispatcherAlive(state) { const d = state.dispatcher || {}; return L.pidAlive(d.pid) && L.minutesSince(d.lastTick) < 5; }

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const q = Object.fromEntries(u.searchParams);
  try {
    if (u.pathname === '/') return text(res, 200, fs.readFileSync(HTML, 'utf8'), 'text/html; charset=utf-8');
    if (u.pathname === '/api/state') { const cfg = L.loadTasks(); const state = L.loadState(); return json(res, 200, { cfg: { ...cfg, tasks: cfg.tasks.map(t => ({ ...t, promptFile: path.relative(L.DIR, L.promptFile(t)) })) }, state, alive: dispatcherAlive(state), now: L.wita(), dir: L.DIR, doneFile: fs.existsSync(P.done), stopFile: fs.existsSync(P.stop) }); }
    if (u.pathname === '/api/prompt') {
      const cfg = L.loadTasks(); const t = cfg.tasks.find(x => x.id === q.id); if (!t) return json(res, 404, { error: 'no task' });
      if (req.method === 'PUT') { fs.mkdirSync(P.prompts, { recursive: true }); fs.writeFileSync(L.promptFile(t), await body(req)); return json(res, 200, { ok: true }); }
      const rendered = q.rendered ? (t.kind === 'build' ? L.buildWorkerPrompt(cfg, t) : L.buildRunPrompt(cfg, t, { LOG_FILE: '<log>', ATTEMPT: '<n>', CWD: L.runCwd(cfg, t) })) : null;
      return json(res, 200, { text: L.loadPromptText(t), file: L.promptFile(t), rendered });
    }
    if (u.pathname === '/api/template') { const f = safe(P.prompts, q.name || ''); if (!f) return json(res, 400, { error: 'bad name' }); if (req.method === 'PUT') { fs.writeFileSync(f, await body(req)); return json(res, 200, { ok: true }); } return json(res, 200, { text: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '' }); }
    if (u.pathname === '/api/templates') return json(res, 200, fs.readdirSync(P.prompts).filter(f => f.startsWith('_')));
    if (u.pathname === '/api/task' && req.method === 'PUT') { const cfg = L.loadTasks(); const t = cfg.tasks.find(x => x.id === q.id); if (!t) return json(res, 404, { error: 'no task' }); const patch = JSON.parse(await body(req)); for (const k of ['model', 'effort', 'priority', 'lane', 'title', 'deps', 'branch', 'acceptance', 'maxMin']) if (k in patch) t[k] = patch[k]; L.saveTasks(cfg); return json(res, 200, { ok: true, task: t }); }
    if (u.pathname === '/api/task' && req.method === 'POST') { const cfg = L.loadTasks(); const t = JSON.parse(await body(req)); if (!t.id || cfg.tasks.some(x => x.id === t.id)) return json(res, 400, { error: 'id пустой или занят' }); cfg.tasks.push(t); L.saveTasks(cfg); return json(res, 200, { ok: true }); }
    if (u.pathname === '/api/cmd' && req.method === 'POST') { const c = JSON.parse(await body(req)); const f = cmd(c.op, c.id); const state = L.loadState(); if (!dispatcherAlive(state)) { const { tick } = await import('../dispatcher.mjs'); tick(); return json(res, 200, { ok: true, ranInline: true }); } return json(res, 200, { ok: true, queued: path.basename(f) }); }
    if (u.pathname === '/api/report') return text(res, 200, fs.existsSync(P.report) ? fs.readFileSync(P.report, 'utf8') : 'отчёта ещё нет');
    if (u.pathname === '/api/log') { const f = safe(P.logs, q.file || '') || safe(P.artifacts, q.file || ''); if (!f || !fs.existsSync(f)) return text(res, 404, 'нет файла'); return text(res, 200, L.tailFile(f, Number(q.n || 400))); }
    if (u.pathname === '/api/logs') return json(res, 200, fs.existsSync(P.logs) ? fs.readdirSync(P.logs).map(f => ({ f, size: fs.statSync(path.join(P.logs, f)).size, m: fs.statSync(path.join(P.logs, f)).mtime })).sort((a, b) => b.m - a.m) : []);
    if (u.pathname === '/api/screen') { const state = L.loadState(); const s = state.tasks[q.id]; if (!s?.ws) return text(res, 404, 'нет workspace'); const term = L.liveAgentTerminal(s.ws); if (!term) return text(res, 200, '(живого терминала нет)\n' + (s.lastScreen || '')); return text(res, 200, L.terminalRead(s.ws, term.terminalId, Number(q.n || 60))); }
    if (u.pathname === '/api/summary') { const cfg = L.loadTasks(); const state = L.loadState(); const sm = summary(cfg, state, q.id); if (!sm) return json(res, 404, { error: 'no task' }); return json(res, 200, sm); }
    if (u.pathname === '/api/artifact') { const f = safeAny(q.f || ''); if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return text(res, 404, 'нет файла'); const ext = path.extname(f).slice(1).toLowerCase(); const ct = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', json: 'application/json; charset=utf-8', pdf: 'application/pdf' }[ext] || 'text/plain; charset=utf-8'; res.writeHead(200, { 'content-type': ct, 'cache-control': 'no-store' }); return fs.createReadStream(f).pipe(res); }
    if (u.pathname === '/api/file') {
      const f = safeAny(q.f || '');
      if (f && fs.existsSync(f) && !fs.statSync(f).isDirectory()) return text(res, 200, fs.readFileSync(f, 'utf8'));
      // Источники оператора лежат за пределами репозитория (канон ~/upready/memory, resume-блоки) —
      // отдаём их только из корней корпуса и только после проверки запретной зоны.
      const s2 = await safeSource(q.f || '');
      if (!s2) return text(res, 404, 'нет файла');
      if (fs.statSync(s2).isDirectory()) return text(res, 200, fs.readdirSync(s2).join('\n'));
      return text(res, 200, fs.readFileSync(s2, 'utf8'));
    }
    if (u.pathname === '/api/op/prompt' && req.method === 'POST') {
      const o = await op(); if (o.error) return json(res, 500, { error: o.error });
      const b = JSON.parse(await body(req) || '{}');
      if (!String(b.text || '').trim()) return json(res, 400, { error: 'пустой текст' });
      return json(res, 200, o.operator.dropPrompt(String(b.text), 'ui'));
    }
    if (u.pathname === '/api/op/thread') {
      const o = await op(); if (o.error) return json(res, 200, { error: o.error, thread: [] });
      const d = o.db.open({ readOnly: true });
      if (!d) return json(res, 200, { thread: [], now: L.wita(), note: 'оператор ещё не создал базу' });
      try { return json(res, 200, { thread: o.operator.thread(d, Number(q.n || 30)), now: L.wita() }); } finally { d.close(); }
    }
    if (u.pathname === '/api/op/answer') {
      const o = await op(); if (o.error) return text(res, 500, o.error);
      const d = o.db.open({ readOnly: true }); if (!d) return text(res, 404, 'базы нет');
      try {
        const row = d.prepare('select doc_path from answers where record_id = ? order by ts desc limit 1').get(q.id || '');
        if (!row?.doc_path || !fs.existsSync(row.doc_path)) return text(res, 404, 'документа ещё нет');
        return text(res, 200, fs.readFileSync(row.doc_path, 'utf8'), 'text/markdown; charset=utf-8');
      } finally { d.close(); }
    }
    if (u.pathname === '/api/op/verdict' && req.method === 'POST') {
      const o = await op(); if (o.error) return json(res, 500, { error: o.error });
      const b = JSON.parse(await body(req) || '{}');
      if (!['ok', 'wrong', 'queue'].includes(b.verdict)) return json(res, 400, { error: 'вердикт ∉ ok|wrong|queue' });
      const d = o.db.open();
      try { const r = o.operator.setVerdict(d, String(b.record_id || ''), b.verdict); return r ? json(res, 200, r) : json(res, 404, { error: 'нет записи' }); } finally { d.close(); }
    }
    return text(res, 404, 'not found');
  } catch (e) { return json(res, 500, { error: String(e.stack || e) }); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`ui http://localhost:${PORT} (${L.DIR})`));
