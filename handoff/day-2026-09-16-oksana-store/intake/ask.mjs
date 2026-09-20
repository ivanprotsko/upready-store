#!/usr/bin/env node
// ask.mjs — уровень «скрипт» (OPERATOR-SPEC §4, §6). Отвечает документом из НАЙДЕННЫХ пассажей и
// живых замеров; своей прозы не сочиняет — на Э1 модель не участвует вовсе.
// CLI: passages "<вопрос>" [--n 8] | status | where [<task-id>] | live <url> | howto "<вопрос>"
// Печатает JSON ответа по answer.schema.json (level:"script").
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { open, loadCorpusConfig, nowIso, wita } from './db.mjs'

// Вопросительные и служебные слова: в trigram-индексе они только шумят.
export const STOP = new Set(`и в на по что как для это мы я не то из же а но или его ее её их там где когда почему зачем
если ли бы был была было быть есть у о об от до за при так уже еще ещё нам мне нас вы он она они все всё который которые
какой какие какая сейчас надо нужно можно мы наш наша наши тот та те этот эта эти чтобы про без над под между тут вот
кто чей чем чём кому кого туда сюда потом теперь очень просто только даже разве же ну да нет`.split(/\s+/).filter(Boolean))

/** Основы слов для trigram-FTS: запрос должен быть ПОДСТРОКОЙ (замер: «карточк» не находит «карточек», «карточ» находит). */
export function stems(q, { max = 8 } = {}) {
  const words = String(q).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(Boolean)
  const out = []
  for (const w of words) {
    if (w.length < 4 || STOP.has(w)) continue
    const s = w.slice(0, 6)
    if (!out.includes(s)) out.push(s)
  }
  return out.slice(0, max)
}

const lit = (s) => `"${String(s).replace(/"/g, '""')}"`
export const matchAnd = (ss) => ss.map(lit).join(' AND ')
export const matchOr = (ss) => ss.map(lit).join(' OR ')

const ageDays = (mtimeMs) => (Date.now() - mtimeMs) / 86400e3
/** Бонус свежести: только разводит равные по bm25 (bm25 здесь 7…20), но не перебивает релевантность. */
export const recencyBonus = (mtimeMs) => 1.5 * Math.exp(-Math.max(0, ageDays(mtimeMs)) / 14)

/** Кусок ТЕКСТА ФАЙЛА, дословный (гейт правило 2 проверяет его grep-ом по диску). */
export function verbatimQuote(file, body, terms, want = 520) {
  let raw
  try { raw = fs.readFileSync(file, 'utf8') } catch { return '' }
  const lines = String(body).split('\n').filter((l) => l.trim().length)
  if (!lines.length) return ''
  const score = (l) => { const low = l.toLowerCase(); let n = 0; for (const t of terms) if (low.includes(t)) n++; return n }
  let best = 0
  for (let i = 1; i < lines.length; i++) if (score(lines[i]) > score(lines[best])) best = i
  if (!raw.includes(lines[best].trim())) {
    const alt = lines.findIndex((l) => l.trim().length >= 20 && raw.includes(l.trim()))
    if (alt < 0) return ''
    best = alt
  }
  let acc = lines[best].trim()
  if (!raw.includes(acc)) return ''
  for (let j = best + 1; j < lines.length && acc.length < want; j++) {
    const next = acc + '\n' + lines[j]
    if (!raw.includes(next)) break
    acc = next
  }
  if (acc.length > want) {
    const cut = acc.slice(0, want)
    const dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'), cut.lastIndexOf('; '))
    acc = dot > 120 ? cut.slice(0, dot + 1) : cut
    if (!raw.includes(acc)) acc = cut
  }
  return acc.trim()
}

const fileDate = (p) => { try { return new Date(fs.statSync(p).mtime).toISOString().slice(0, 10) } catch { return '' } }

/**
 * Поиск пассажей. Один вопрос — НЕСКОЛЬКО запросов к одному индексу, и это тюнинг к ВОПРОСУ, а не к имени файла:
 *  1) AND по всем основам, встречающимся в корпусе (самый узкий, вес наибольший);
 *  2) AND по 3 и по 2 САМЫМ РЕДКИМ основам — редкое слово несёт смысл вопроса («gorgoj», «roboka»),
 *     частое («интегр», «через») только сужает выдачу до документа, где Иван написал ровно ту же фразу;
 *  3) OR по всем — подстраховка, когда пересечения нет вовсе.
 * Итоговая оценка = -bm25 + бонус свежести + вес запроса; берётся максимум по запросам. Не более 2 пассажей из файла.
 */
export function passages(question, { n = 8, db = null, roots = null, boostRoots = null } = {}) {
  const base = db || open()
  const own = !db
  try {
    const ss0 = stems(question)
    if (!ss0.length) return { passages: [], stems: ss0, mode: 'none', queries: [] }
    const cnt = base.prepare('select count(*) c from corpus_fts where corpus_fts match ?')
    const df = new Map()
    for (const s of ss0) { try { df.set(s, cnt.get(lit(s)).c) } catch { df.set(s, 0) } }
    const ss = ss0.filter((s) => df.get(s) > 0)
    if (!ss.length) return { passages: [], stems: ss0, mode: 'none', queries: [] }
    const rare = ss.slice().sort((a, b) => df.get(a) - df.get(b))
    const queries = []
    if (ss.length > 1) queries.push({ m: matchAnd(ss), w: 3, tag: `AND(${ss.length})` })
    if (rare.length > 3) queries.push({ m: matchAnd(rare.slice(0, 3)), w: 2, tag: `AND-rare3(${rare.slice(0, 3).join('+')})` })
    if (rare.length > 2) queries.push({ m: matchAnd(rare.slice(0, 2)), w: 1, tag: `AND-rare2(${rare.slice(0, 2).join('+')})` })
    queries.push({ m: matchOr(ss), w: 0, tag: `OR(${ss.length})` })
    const sql = `select path, heading, body, bm25(corpus_fts, 0.5, 5.0, 1.0) b from corpus_fts where corpus_fts match ? order by b limit 120`
    const mt = new Map()
    for (const r of base.prepare('select path, mtime, kind from corpus').all()) mt.set(r.path, r)
    const best = new Map()
    const used = []
    for (const qy of queries) {
      let rows = []
      try { rows = base.prepare(sql).all(qy.m) } catch { rows = [] }
      if (rows.length) used.push(`${qy.tag}=${rows.length}`)
      for (const r of rows) {
        if (roots && !roots.some((x) => r.path.startsWith(x))) continue
        const meta = mt.get(r.path) || { mtime: 0, kind: '' }
        let s = -r.b + recencyBonus(meta.mtime) + qy.w * 3
        if (boostRoots && boostRoots.some((x) => r.path.startsWith(x))) s += 6
        const key = r.path + '\u0000' + r.heading + '\u0000' + r.body.slice(0, 40)
        const prev = best.get(key)
        if (!prev || prev.score < s) best.set(key, { path: r.path, heading: r.heading, body: r.body, kind: meta.kind, score: s })
      }
    }
    const scored = [...best.values()].sort((a, b) => b.score - a.score)
    const perFile = new Map()
    const out = []
    for (const r of scored) {
      if (out.length >= n) break
      const c = perFile.get(r.path) || 0
      if (c >= 2) continue
      const quote = verbatimQuote(r.path, r.body, ss)
      if (quote.length < 20) continue
      perFile.set(r.path, c + 1)
      out.push({ path: r.path, heading: r.heading, date: fileDate(r.path), kind: r.kind, quote, score: Number(r.score.toFixed(3)) })
    }
    return { passages: out, stems: ss, mode: used.join(' '), queries: used }
  } finally { if (own) base.close() }
}

// ---------- сборка документа ----------
const q = (s) => String(s).split('\n').map((l) => '> ' + l).join('\n')

// Шапку уровня (уровень · время · гейт) ставит operator.mjs один раз на весь документ — здесь её нет,
// иначе в ленте две одинаковые строки подряд.
export function docFromPassages(question, ps, { title = null, preface = null, tail = null } = {}) {
  const L = [`# ${title || 'Ответ на вопрос Ивана'}`, '']
  L.push('**Вопрос Ивана (дословно):**', '', q(question), '')
  if (preface) L.push(preface, '')
  if (!ps.length) L.push('_В корпусе ничего не найдено._', '')
  ps.forEach((p, i) => {
    L.push(`## ${i + 1}. ${p.heading}`)
    L.push(`[${path.basename(p.path)}](file://${p.path}) · запись от ${p.date}${p.kind ? ` · ${p.kind}` : ''}`, '')
    L.push(q(p.quote), '')
  })
  if (tail) L.push(tail, '')
  L.push('---', '_Документ собран скриптом ask.mjs из индекса корпуса (FTS5 trigram). Цитаты дословные — их проверяет гейт по файлам на диске._')
  return L.join('\n')
}

const answerShell = (kind, question, extra = {}) => ({
  answered: true, kind, question, level: 'script', ts: nowIso(),
  doc_md: '', sources: [], pointers: [], confidence: 0, live: [], not_found: [], ...extra,
})

/** `question` — то, по чему ИЩЕМ (заголовок + текст Ивана); `opts.display` — то, что ПОКАЗЫВАЕМ Ивану
 *  (его собственная фраза, дословно). Разделены, иначе в документе стоит склейка «вопрос Заголовок». */
export function askPassages(question, opts = {}) {
  const r = passages(question, opts)
  const shown = opts.display || question
  const a = answerShell(opts.kind || 'fact', shown)
  a.sources = r.passages.map((p) => ({ path: p.path, heading: p.heading, date: p.date, quote: p.quote }))
  a.doc_md = docFromPassages(shown, r.passages, { title: opts.title || 'Что нашлось в корпусе' })
  a.confidence = r.passages.length ? Math.min(0.9, 0.3 + 0.1 * r.passages.length) : 0
  a.answered = r.passages.length > 0
  if (!r.passages.length) a.not_found.push(`FTS по основам [${r.stems.join(', ')}] (${r.mode}) не дал ни одного пассажа`)
  a.stems = r.stems
  return a
}

// ---------- типовой документ: howto ----------
function privateNames(question, cfg) {
  const dir = cfg.live.privateDir
  const ss = stems(question)
  const hits = []
  const walk = (d, depth = 0) => {
    if (depth > 3) return
    let ents = []
    try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p, depth + 1); continue }
      const low = p.toLowerCase()
      if (ss.some((s) => low.includes(s)) || /(owner|login|логин|access|admin|креден|passw)/i.test(e.name)) hits.push(p)
    }
  }
  walk(dir)
  return hits.slice(0, 8)
}

export function askHowto(question, opts = {}) {
  const cfg = opts.cfg || loadCorpusConfig()
  const memRoot = cfg.roots.find((r) => r.kind === 'memory')?.path
  const r = passages(question, { ...opts, n: opts.n || 8, boostRoots: memRoot ? [memRoot] : null })
  const ptr = privateNames(question, cfg)
  const shown = opts.display || question
  const a = answerShell('howto', shown)
  a.sources = r.passages.map((p) => ({ path: p.path, heading: p.heading, date: p.date, quote: p.quote }))
  a.pointers = ptr.map((p) => ({ path: p, why: 'файл с доступами — содержимое НЕ читается и НЕ индексируется, откройте сами' }))
  const tail = ptr.length
    ? ['## Где лежат доступы (содержимое не читается)', '', ...ptr.map((p) => `- [${path.basename(p)}](file://${p}) — открыть самому, оператор в .private не заглядывает`)].join('\n')
    : null
  a.doc_md = docFromPassages(shown, r.passages, { title: 'Как это сделать — что записано в каноне', tail })
  a.answered = r.passages.length > 0
  a.confidence = r.passages.length ? Math.min(0.9, 0.3 + 0.1 * r.passages.length) : 0
  if (!r.passages.length) a.not_found.push('в памяти и корпусе не нашлось ни одного пассажа')
  a.stems = r.stems
  return a
}

// ---------- типовые документы: status / where ----------
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return d } }

/** Дословный кусок файла вокруг иголки — источник для гейта (правило 2: цитата ≥20 знаков, найдена grep-ом). */
export function pickQuote(file, needle, min = 20) {
  let raw
  try { raw = fs.readFileSync(file, 'utf8') } catch { return '' }
  const lines = raw.split('\n')
  let i = needle ? lines.findIndex((l) => l.includes(needle)) : 0
  if (i < 0) i = 0
  let acc = lines[i] ?? ''
  for (let j = i + 1; j < lines.length && acc.length < Math.max(min, 200); j++) acc += '\n' + lines[j]
  acc = acc.trim()
  return raw.includes(acc) ? acc : ''
}

const minutesSince = (iso) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 60000) : null)

export function askStatus(question = 'что в очереди дня', opts = {}) {
  const cfg = opts.cfg || loadCorpusConfig()
  const dir = opts.dayDir || cfg.live.dayDir
  const fTasks = path.join(dir, 'tasks.json')
  const fState = path.join(dir, 'state.json')
  const fJournal = path.join(dir, 'logs', 'dispatcher.jsonl')
  const tasks = readJson(fTasks, { tasks: [] }).tasks || []
  const state = readJson(fState, { tasks: {}, events: [], dispatcher: {} })
  const by = {}
  const running = []
  for (const t of tasks) {
    const s = state.tasks?.[t.id] || {}
    const st = s.status || t.status || 'queued'
    by[st] = (by[st] || 0) + 1
    if (['running', 'accepting', 'fixing', 'pr_open'].includes(st)) running.push({ id: t.id, title: t.title, st, min: minutesSince(s.startedAt || s.updatedAt) })
  }
  let events = []
  try {
    const tail = fs.readFileSync(fJournal, 'utf8').trimEnd().split('\n').slice(-5)
    events = tail.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch {}
  const flags = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^(DONE|STOP)/.test(f)) : []
  const L = [`# Состояние очереди дня — ${wita()}`, '', `Каталог штаба: [${path.basename(dir)}](file://${dir}) · всего задач ${tasks.length}`, '',
    '## По статусам', '', '| статус | задач |', '|---|---|',
    ...Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), '',
    '## Сейчас в работе', '']
  if (running.length) {
    L.push('| id | задача | статус | минут |', '|---|---|---|---|')
    for (const r of running) L.push(`| ${r.id} | ${r.title || ''} | ${r.st} | ${r.min ?? '—'} |`)
  } else L.push('_ни одной задачи в работе_')
  L.push('', '## Последние события диспетчера', '')
  if (events.length) for (const e of events) L.push(`- ${String(e.ts || '').replace('T', ' ').slice(0, 19)} · **${e.task || '—'}** · ${e.type}${e.msg ? ': ' + String(e.msg).slice(0, 180) : ''}`)
  else L.push('_журнал пуст_')
  L.push('', '## Флаги остановки', '', flags.length ? `Файлы-маркеры в каталоге штаба: ${flags.join(', ')}` : 'ни DONE, ни STOP не выставлены', '',
    '---', '_Собрано скриптом ask.mjs напрямую из tasks.json, state.json и журнала диспетчера ЖИВОГО каталога штаба._')
  const a = answerShell('status', question)
  a.doc_md = L.join('\n')
  const src = []
  const anyId = tasks[0]?.id
  for (const [f, needle] of [[fTasks, anyId], [fState, anyId], [fJournal, null]]) {
    if (!fs.existsSync(f)) continue
    const quote = pickQuote(f, needle)
    if (quote.length >= 20) src.push({ path: f, heading: path.basename(f), date: fileDate(f), quote: quote.slice(0, 400) })
  }
  a.sources = src
  a.answered = src.length > 0
  a.confidence = 0.9
  if (!src.length) a.not_found.push(`не читаются ${fTasks} / ${fState}`)
  return a
}

export function askWhere(taskId = null, question = 'где результат по выполненным задачам', opts = {}) {
  const cfg = opts.cfg || loadCorpusConfig()
  const dir = opts.dayDir || cfg.live.dayDir
  const repo = opts.repo || cfg.live.repo
  const tasks = readJson(path.join(dir, 'tasks.json'), { tasks: [] }).tasks || []
  const state = readJson(path.join(dir, 'state.json'), { tasks: {} })
  const pick = taskId ? tasks.filter((t) => t.id === taskId) : tasks.filter((t) => ['merged', 'done'].includes(state.tasks?.[t.id]?.status || t.status))
  const rows = []
  const sources = []
  const seen = new Set()
  const addSource = (f, needle) => {
    if (!f || seen.has(f) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return
    const quote = pickQuote(f, needle)
    if (quote.length < 20) return
    seen.add(f)
    sources.push({ path: f, heading: path.basename(f), date: fileDate(f), quote: quote.slice(0, 400) })
  }
  for (const t of pick) {
    const s = state.tasks?.[t.id] || {}
    const reportMd = path.join(repo, 'artifacts', 'docs', t.id, 'report.md')
    const reportJson = path.join(dir, 'artifacts', t.id, 'report.json')
    const shots = ['shots', 'frames', 'screens'].map((x) => path.join(repo, 'artifacts', 'docs', t.id, x)).find((x) => fs.existsSync(x))
    rows.push({ id: t.id, title: t.title, status: s.status || t.status || 'queued', pr: s.pr || null, reportMd: fs.existsSync(reportMd) ? reportMd : null, reportJson: fs.existsSync(reportJson) ? reportJson : null, shots: shots || null })
  }
  for (const r of rows.slice(0, 6)) { addSource(r.reportMd, null); addSource(r.reportJson, null) }
  addSource(path.join(dir, 'REPORT.md'), null)
  // Всё, на что документ СОШЛЁТСЯ, но не процитирует (каталоги кадров, отчёты сверх первых шести),
  // уходит в pointers: гейт проверяет их существование на диске, но цитаты с каталога не берёт.
  const pointers = []
  const addPointer = (f, why) => { if (f && !seen.has(f) && fs.existsSync(f) && !pointers.some((x) => x.path === f)) pointers.push({ path: f, why }) }
  for (const r of rows.slice(-25)) { addPointer(r.reportMd, 'отчёт воркера'); addPointer(r.reportJson, 'карточка отчёта в UI штаба'); addPointer(r.shots, 'каталог кадров') }
  const MAX_ROWS = 25
  const shown = rows.slice(-MAX_ROWS).reverse()
  const L = [`# Где смотреть результат${taskId ? ` задачи ${taskId}` : ' выполненных задач'} — ${wita()}`, '',
    `Задач в выборке: ${rows.length}${rows.length > MAX_ROWS ? ` (показаны последние ${MAX_ROWS})` : ''}. Для каждой: PR на GitHub, отчёт воркера, карточка отчёта в UI штаба, кадры.`, '',
    '| задача | статус | PR | отчёт | карточка | кадры |', '|---|---|---|---|---|---|']
  for (const r of shown) {
    L.push(`| ${r.id} | ${r.status} | ${r.pr?.url ? `[#${r.pr.number}](${r.pr.url})` : '—'} | ${r.reportMd ? `[report.md](file://${r.reportMd})` : '—'} | ${r.reportJson ? `[report.json](file://${r.reportJson})` : '—'} | ${r.shots ? `[кадры](file://${r.shots})` : '—'} |`)
  }
  L.push('', '## Сводка дня и живые адреса', '', `- Общий отчёт штаба: [REPORT.md](file://${path.join(dir, 'REPORT.md')})`)
  for (const h of cfg.live.hosts) L.push(`- ${h.name}: ${h.url}`)
  L.push('', '---', '_Собрано скриптом ask.mjs из tasks.json и state.json живого каталога штаба; наличие каждого файла проверено на диске (existsSync)._')
  const a = answerShell('where', question)
  a.doc_md = L.join('\n')
  a.sources = sources
  a.pointers = pointers
  a.answered = sources.length > 0
  a.confidence = 0.85
  if (!sources.length) a.not_found.push('ни одного отчёта воркера на диске не нашлось')
  return a
}

export function askLive(url, opts = {}) {
  const cfg = opts.cfg || loadCorpusConfig()
  const ts = nowIso()
  const cmd = `curl -s -o /dev/null -w '%{http_code} %{time_total}' ${url}`
  let result = ''
  try {
    result = execFileSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code} %{time_total}', '--max-time', '20', url], { encoding: 'utf8', timeout: 30000 }).trim()
  } catch (e) { result = `ошибка: ${String(e.message).slice(0, 200)}` }
  const dirOut = path.join(opts.answersDir || path.join(path.dirname(fileURLToPath(import.meta.url)), 'answers'), 'live')
  fs.mkdirSync(dirOut, { recursive: true })
  const logFile = path.join(dirOut, `${ts.replace(/[:.]/g, '-')}.txt`)
  const logBody = `замер оператора ${wita()} (${ts})\nкоманда: ${cmd}\nрезультат: ${result}\n`
  fs.writeFileSync(logFile, logBody)
  const ps = passages(url.replace(/^https?:\/\//, '').split('/')[0], { n: 3 }).passages
  const a = answerShell('live', url)
  a.live = [{ cmd, result, ts }]
  a.sources = [{ path: logFile, heading: 'замер', date: fileDate(logFile), quote: logBody.trim() }]
    .concat(ps.map((p) => ({ path: p.path, heading: p.heading, date: p.date, quote: p.quote })))
  const head = ['## Живой замер', '', '| адрес | код HTTP и время | когда |', '|---|---|---|', `| ${url} | ${result} | ${wita()} |`, '',
    `Протокол замера: [${path.basename(logFile)}](file://${logFile})`].join('\n')
  a.doc_md = docFromPassages(url, ps, { title: `Живая проба ${url}`, preface: head })
  a.answered = /^\d{3}\s/.test(result)
  a.confidence = a.answered ? 0.95 : 0.2
  if (!a.answered) a.not_found.push(`curl не дал кода ответа: ${result}`)
  return a
}

// ---------- CLI ----------
function main(argv) {
  const [cmd, ...rest] = argv
  const nIdx = rest.indexOf('--n')
  const n = nIdx >= 0 ? Number(rest[nIdx + 1]) : 8
  const arg = rest.filter((x, i) => x !== '--n' && rest[i - 1] !== '--n').join(' ').trim()
  let a
  if (cmd === 'passages') a = askPassages(arg, { n })
  else if (cmd === 'status') a = askStatus(arg || 'что в очереди дня')
  else if (cmd === 'where') a = askWhere(arg || null)
  else if (cmd === 'live') a = askLive(arg)
  else if (cmd === 'howto') a = askHowto(arg, { n })
  else { console.error('ask.mjs passages "<вопрос>" [--n 8] | status | where [<task-id>] | live <url> | howto "<вопрос>"'); process.exit(2) }
  console.log(JSON.stringify(a, null, 1))
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
