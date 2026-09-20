// testkit.mjs — общая оснастка тестов оператора: временный корпус, временная база, заглушка claude.
// Ни один тест не трогает живую operator.db и живой каталог штаба.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function tmpRoot(name) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `op-${name}-`))
  return d
}

/** Корпус-фикстура: русские словоформы, секрет в значении переменной, запретные зоны. */
export function makeCorpus(root) {
  const c = path.join(root, 'corpus')
  fs.mkdirSync(path.join(c, 'docs'), { recursive: true })
  fs.mkdirSync(path.join(c, '.private'), { recursive: true })
  fs.writeFileSync(path.join(c, 'docs', 'wb.md'),
    '# Сопоставление карточек\n\nСопоставление карточек товара с Wildberries делает воркер w13.\nКлюч стенда: WB_API_KEY=ochen-sekretnoe-znachenie-123\n\n## Решение\n\nМодуль интеграций gorgojs не взяли: учётки на инстанс, а не на магазин.\n')
  fs.writeFileSync(path.join(c, 'docs', 'admin.md'),
    '# Как попасть в админку\n\nПанель управления магазином открывается по адресу панели, логин лежит отдельно.\n')
  fs.writeFileSync(path.join(c, '.private', 'owner.md'), 'логин: kto-to\nпароль: ne-chitat\n')
  fs.writeFileSync(path.join(c, 'docs', '.env.local'), 'SECRET_TOKEN=nikogda-ne-v-indekse\n')
  fs.writeFileSync(path.join(c, 'docs', 'session.jsonl'), '{"type":"text","text":"стенограмма, читать целиком запрещено"}\n')
  return c
}

export function makeConfig(root, corpusDir, dayDir = null) {
  const cfg = {
    roots: [{ path: corpusDir, kind: 'report' }],
    ext: ['.md'],
    excludeDir: ['.private', 'node_modules', '.git'],
    excludeName: ['^\\.env', '\\.jsonl$', '\\.pid$', '^operator\\.db'],
    secretNames: 'TOKEN|SECRET|PASSWORD|API_KEY|APIKEY|COOKIE|PASS|PRIVATE_KEY|CREDENTIAL',
    maxBody: 2000,
    live: { dayDir: dayDir || corpusDir, repo: corpusDir, privateDir: path.join(corpusDir, '.private'), hosts: [{ name: 'витрина', url: 'http://127.0.0.1:9' }] },
  }
  const f = path.join(root, 'corpus.json')
  fs.writeFileSync(f, JSON.stringify(cfg, null, 1))
  return f
}

/** Каталог штаба-фикстура для типовых документов status/where. */
export function makeDayDir(root) {
  const d = path.join(root, 'day')
  fs.mkdirSync(path.join(d, 'logs'), { recursive: true })
  fs.mkdirSync(path.join(d, 'artifacts', 'p01-demo'), { recursive: true })
  fs.writeFileSync(path.join(d, 'tasks.json'), JSON.stringify({ tasks: [
    { id: 'p01-demo', title: 'Демонстрационная задача очереди дня', lane: 'build', status: 'queued' },
    { id: 'p02-run', title: 'Вторая задача, она сейчас в работе', lane: 'build', status: 'queued' },
  ] }, null, 2))
  fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({
    dispatcher: { paused: false, ticks: 7 },
    tasks: { 'p01-demo': { status: 'merged', pr: { number: 100, url: 'https://github.com/x/y/pull/100' } }, 'p02-run': { status: 'running', startedAt: new Date(Date.now() - 600000).toISOString() } },
    events: [{ ts: new Date().toISOString(), task: 'p01-demo', type: 'merged', msg: 'задача смёржена в dev' }],
  }, null, 2))
  fs.writeFileSync(path.join(d, 'logs', 'dispatcher.jsonl'),
    [1, 2, 3, 4, 5, 6].map((n) => JSON.stringify({ ts: new Date(Date.now() - n * 60000).toISOString(), task: 'p01-demo', type: 'tick', msg: `событие журнала диспетчера номер ${n}` })).reverse().join('\n') + '\n')
  fs.writeFileSync(path.join(d, 'REPORT.md'), '# Отчёт дня\n\nСводка по задачам очереди дня: что смёржено, что в работе, что осталось.\n')
  fs.writeFileSync(path.join(d, 'artifacts', 'p01-demo', 'report.json'), JSON.stringify({ task: 'p01-demo', done: ['сделано и смёржено'] }, null, 2))
  fs.mkdirSync(path.join(d, 'artifacts', 'docs', 'p01-demo'), { recursive: true })
  return d
}

/** Заглушка `claude`: exit=1 (провал разбора) или печать готового JSON-ответа CLI. */
export function makeClaudeStub(root, { exitCode = 0, records = null, stderr = '' } = {}) {
  const f = path.join(root, 'claude-stub.sh')
  const payload = records ? JSON.stringify({ type: 'result', is_error: false, result: JSON.stringify({ records }), structured_output: { records }, usage: { input_tokens: 11, output_tokens: 22 }, total_cost_usd: 0.001 }) : ''
  const body = exitCode === 0
    ? `#!/bin/sh\ncat > /dev/null\ncat <<'PAYLOAD'\n${payload}\nPAYLOAD\n`
    : `#!/bin/sh\ncat > /dev/null\necho '${stderr || 'OAuth session expired'}' >&2\nexit ${exitCode}\n`
  fs.writeFileSync(f, body, { mode: 0o755 })
  return f
}

export const cleanup = (d) => { try { fs.rmSync(d, { recursive: true, force: true }) } catch {} }
