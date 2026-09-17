// accept-stage0.sh и его сканер диффа. Две высоты: поштучные проверки регулярок (stage0-scan.mjs)
// и end-to-end прогон скрипта на временном git-репозитории с шимом `gh`.
// Улики в этом файле собираются ИЗ КУСКОВ на лету: иначе исходник теста сам стал бы находкой
// сканера в diff своего же PR.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeWorld, advanceBase, ghStub, runScript, git, commit, cleanup } from './git-fixture.mjs'
import { scan } from '../stage0-scan.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, '..', 'accept-stage0.sh')

const AWS = 'AKIA' + 'ABCDEFGHIJKLMNOP'
const ONLY = '.on' + 'ly('

function diffOf(file, addedLines) {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,1 +1,${addedLines.length + 1} @@`,
    ' контекст',
    ...addedLines.map((l) => `+${l}`),
    '',
  ].join('\n')
}

// ── сканер ────────────────────────────────────────────────────────────────────────────────────

test('сканер: подсаженный ключ в добавленной строке найден', () => {
  const r = scan(diffOf('apps/backend/src/lib/keys.ts', [`const key = "${AWS}"`]))
  assert.equal(r.secrets.length, 1)
  assert.equal(r.secrets[0].pattern, 'aws-access-key')
  assert.equal(r.secrets[0].file, 'apps/backend/src/lib/keys.ts')
})

test('сканер: имя переменной без значения, подстановка и .env.example находкой не считаются', () => {
  assert.equal(scan(diffOf('apps/backend/.env', ['YANDEX_ID_PASSWORD='])).secrets.length, 0)
  assert.equal(scan(diffOf('apps/backend/.env', ['ROBOKASSA_SECRET=${ROBOKASSA_SECRET}'])).secrets.length, 0)
  assert.equal(scan(diffOf('apps/backend/.env', ['ADMIN_PASSWORD=supersecret'])).secrets.length, 0)
  assert.equal(scan(diffOf('.env.example', ['ADMIN_PASSWORD=RealLookingValue123'])).secrets.length, 0)
})

test('сканер: настоящее значение у секретной переменной — находка, маркер stage0:allow её снимает', () => {
  assert.equal(scan(diffOf('apps/backend/.env', ['YANDEX_ID_PASSWORD=Pa55wordFromLive'])).secrets.length, 1)
  assert.equal(scan(diffOf('apps/backend/.env', ['YANDEX_ID_PASSWORD=Pa55wordFromLive # stage0:allow образец из документации'])).secrets.length, 0)
})

test('сканер: выключенный тест виден только в тестовом файле', () => {
  const inTest = scan(diffOf('apps/storefront/tests/cart.test.ts', [`describe${ONLY}"один кейс", () => {})`]))
  assert.equal(inTest.disabled.length, 1)
  assert.equal(inTest.disabled[0].pattern, 'only')
  const inCode = scan(diffOf('apps/storefront/src/lib/rows.ts', [`const one = rows${ONLY}"id")`]))
  assert.equal(inCode.disabled.length, 0, 'обычный код с похожим вызовом не считается выключенным тестом')
})

test('сканер: сужение прогона в конфиге теста — находка', () => {
  const r = scan(diffOf('apps/backend/jest.config.js', ['  testPathIgnorePatterns: ["<rootDir>/src/api/"],']))
  assert.equal(r.disabled.length, 1)
  assert.equal(r.disabled[0].pattern, 'testPathIgnorePatterns')
})

test('сканер: удалённые строки не улика, счёт добавленных верен', () => {
  const d = [
    'diff --git a/apps/backend/.env b/apps/backend/.env',
    '--- a/apps/backend/.env',
    '+++ b/apps/backend/.env',
    '@@ -1,2 +1,2 @@',
    `-ADMIN_PASSWORD=${AWS}`,
    '+ADMIN_PASSWORD=',
    '',
  ].join('\n')
  const r = scan(d)
  assert.equal(r.secrets.length, 0)
  assert.equal(r.added, 1)
})

// ── скрипт целиком ────────────────────────────────────────────────────────────────────────────

const MERGEABLE = (n = 11, extra = {}) => ({
  mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', headRefName: 'feat/pp01-fixture', baseRefName: 'dev',
  body: 'обычное тело PR', url: `https://example.invalid/pr/${n}`, ...extra,
})

function world(tag, { diff, view }) {
  const w = makeWorld(tag)
  commit(w.work, 'apps/feature.txt', 'работа воркера\n', 'feat: работа')
  git(w.work, ['push', '--quiet', '-u', 'origin', w.branch])
  const head = git(w.work, ['rev-parse', 'HEAD'])
  const stub = ghStub(w, { views: [{ ...view, headRefOid: head }], diff })
  const out = path.join(w.root, 'round-1')
  return { w, stub, out, head }
}

function stage0({ w, stub, out }, env = {}) {
  return runScript(SCRIPT, ['pp01-pre-pr-and-stage0', '11', out], {
    cwd: w.work, binDir: stub.bin, env: { GH_STUB_DIR: stub.dir, ...env },
  })
}

test('чистый diff проходит: STAGE0 PASS, rc=0, отчёты на диске', () => {
  const ctx = world('stage0-clean', { diff: diffOf('artifacts/docs/report.md', ['строка отчёта']), view: MERGEABLE() })
  const r = stage0(ctx)
  assert.equal(r.rc, 0, r.out)
  assert.match(r.out, /STAGE0: PASS\s*$/)
  const doc = JSON.parse(fs.readFileSync(path.join(ctx.out, 'stage0.json'), 'utf8'))
  assert.equal(doc.result, 'PASS')
  assert.deepEqual(doc.failed, [])
  assert.ok(doc.checks.find((c) => c.check === 'pr' && c.status === 'pass'), 'проверка pr записана')
  assert.ok(doc.checks.every((c) => ['pass', 'skip'].includes(c.status)))
  assert.match(fs.readFileSync(path.join(ctx.out, 'stage0.md'), 'utf8'), /# Этап 0 приёмки — pp01-pre-pr-and-stage0, PR #11/)
  cleanup(ctx.w)
})

test('подсаженный секрет найден: STAGE0 FAIL secrets, файл и строка в отчёте', () => {
  const ctx = world('stage0-secret', {
    diff: diffOf('apps/backend/src/lib/keys.ts', [`const key = "${AWS}"`]),
    view: MERGEABLE(),
  })
  const r = stage0(ctx)
  assert.equal(r.rc, 1, r.out)
  assert.match(r.out, /STAGE0 secrets: fail/)
  assert.match(r.out, /STAGE0: FAIL .*secrets/)
  const doc = JSON.parse(fs.readFileSync(path.join(ctx.out, 'stage0.json'), 'utf8'))
  const rec = doc.checks.find((c) => c.check === 'secrets')
  assert.equal(rec.status, 'fail')
  assert.match(rec.files[0], /apps\/backend\/src\/lib\/keys\.ts:2 \[aws-access-key\]/)
  cleanup(ctx.w)
})

test('выключенный тест без обоснования в теле PR — FAIL, с обоснованием — PASS', () => {
  const diff = diffOf('apps/storefront/tests/cart.test.ts', [`describe${ONLY}"один кейс", () => {})`])
  const bad = world('stage0-only-bad', { diff, view: MERGEABLE() })
  const r1 = stage0(bad)
  assert.equal(r1.rc, 1, r1.out)
  assert.match(r1.out, /STAGE0 disabled-tests: fail/)
  cleanup(bad.w)

  const good = world('stage0-only-ok', {
    diff,
    view: MERGEABLE(11, { body: 'что сделано\nSTAGE0-ALLOW-DISABLED-TESTS: кейс падает на чужом баге b15, вернём в t99' }),
  })
  const r2 = stage0(good)
  assert.equal(r2.rc, 0, r2.out)
  assert.match(r2.out, /STAGE0 disabled-tests: pass .*строку-обоснование/)
  cleanup(good.w)
})

test('diff трогает HANDOFF.json — FAIL forbidden-files с именем файла', () => {
  const ctx = world('stage0-forbidden', {
    diff: diffOf('HANDOFF.json', ['  "status": "моя строка",']),
    view: MERGEABLE(),
  })
  const r = stage0(ctx)
  assert.equal(r.rc, 1, r.out)
  assert.match(r.out, /STAGE0 forbidden-files: fail/)
  const doc = JSON.parse(fs.readFileSync(path.join(ctx.out, 'stage0.json'), 'utf8'))
  assert.deepEqual(doc.checks.find((c) => c.check === 'forbidden-files').files, ['HANDOFF.json'])
  cleanup(ctx.w)
})

test('PR в состоянии CONFLICTING — FAIL pr', () => {
  const ctx = world('stage0-conflicting', {
    diff: diffOf('artifacts/docs/report.md', ['строка отчёта']),
    view: MERGEABLE(11, { mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }),
  })
  const r = stage0(ctx)
  assert.equal(r.rc, 1, r.out)
  assert.match(r.out, /STAGE0 pr: fail .*CONFLICTING/)
  cleanup(ctx.w)
})

test('ветка позади базы — FAIL pr с числом коммитов', () => {
  const ctx = world('stage0-behind', {
    diff: diffOf('artifacts/docs/report.md', ['строка отчёта']),
    view: MERGEABLE(),
  })
  advanceBase(ctx.w, 'apps/other.txt', 'чужая задача уехала в dev\n')
  const r = stage0(ctx)
  assert.equal(r.rc, 1, r.out)
  assert.match(r.out, /STAGE0 pr: fail .*ветка позади базы на 1 коммит/)
  cleanup(ctx.w)
})

test('diff трогает пакет monorepo, но worktree не задан — checks пропущены с причиной, а не выданы за зелёные', () => {
  const ctx = world('stage0-pkg', {
    diff: diffOf('apps/storefront/src/lib/rows.ts', ['export const rows = []']),
    view: MERGEABLE(),
  })
  const r = stage0(ctx)
  assert.equal(r.rc, 0, r.out)
  assert.match(r.out, /STAGE0 checks: skip STAGE0_WORKTREE не задан.*apps\/storefront/)
  const doc = JSON.parse(fs.readFileSync(path.join(ctx.out, 'stage0.json'), 'utf8'))
  assert.equal(doc.checks.find((c) => c.check === 'checks').status, 'skip')
  cleanup(ctx.w)
})

test('worktree задан, но стоит не на голове PR — checks пропущены, чтобы не мерить чужой код', () => {
  const ctx = world('stage0-stale-wt', {
    diff: diffOf('apps/storefront/src/lib/rows.ts', ['export const rows = []']),
    view: MERGEABLE(),
  })
  fs.mkdirSync(path.join(ctx.w.other, 'node_modules'), { recursive: true })
  const r = stage0(ctx, { STAGE0_WORKTREE: ctx.w.other })
  assert.equal(r.rc, 0, r.out)
  assert.match(r.out, /STAGE0 checks: skip worktree .* стоит на .*, а голова PR —/)
  cleanup(ctx.w)
})

test('PR не читается (gh отвечает ошибкой) — это FAIL, а не тихий PASS', () => {
  const ctx = world('stage0-no-gh', { diff: '', view: MERGEABLE() })
  fs.writeFileSync(path.join(ctx.stub.bin, 'gh'), '#!/bin/sh\nprintf \'could not resolve to a PullRequest\\n\' >&2\nexit 1\n')
  fs.chmodSync(path.join(ctx.stub.bin, 'gh'), 0o755)
  const r = stage0(ctx)
  assert.equal(r.rc, 1, r.out)
  assert.match(r.out, /STAGE0 pr: fail gh pr view 11: could not resolve to a PullRequest/)
  assert.match(r.out, /STAGE0: FAIL pr/)
  const doc = JSON.parse(fs.readFileSync(path.join(ctx.out, 'stage0.json'), 'utf8'))
  assert.equal(doc.result, 'FAIL')
  cleanup(ctx.w)
})
