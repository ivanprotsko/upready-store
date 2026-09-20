// pre-pr.sh на настоящих временных git-репозиториях (bare origin + два клона) и шиме `gh`.
// Каждый сценарий — процессный отказ, который за 2026-09-17 реально стоил раунда приёмки:
// ветка отстала, конфликт в HANDOFF.json, конфликт в чужом файле, незакоммиченные правки,
// PR в состоянии CONFLICTING. Скрипт запускается как есть, вердикт берётся из rc и последней строки.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeWorld, advanceBase, ghStub, runScript, git, gitOut, commit, write, cleanup } from './git-fixture.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, '..', 'pre-pr.sh')

const MERGEABLE = { mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', number: 7, url: 'https://example.invalid/pr/7' }
const CONFLICTING = { mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY', number: 7, url: 'https://example.invalid/pr/7' }
const UNKNOWN = { mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN', number: 7, url: 'https://example.invalid/pr/7' }

function prePr(world, stub, env = {}) {
  return runScript(SCRIPT, ['dev'], {
    cwd: world.work,
    binDir: stub.bin,
    env: { GH_STUB_DIR: stub.dir, PRE_PR_PR_WAIT_SLEEP: '0', PRE_PR_PR_WAIT_TRIES: '4', ...env },
  })
}

test('ветка в актуальном состоянии и PR ещё не создан — OK, push прошёл', () => {
  const w = makeWorld('prepr-fresh')
  const stub = ghStub(w, { noPr: true })
  commit(w.work, 'apps/feature.txt', 'работа воркера\n', 'feat: работа')
  const r = prePr(w, stub)
  assert.equal(r.rc, 0, r.out)
  assert.match(r.out, /PRE-PR merge: ok ветка не отстаёт/)
  assert.match(r.out, /PRE-PR push: ok/)
  assert.match(r.out, /PRE-PR ahead: ok HEAD\.\.origin\/dev = 0/)
  assert.match(r.out, /PRE-PR pr: ok PR ещё нет/)
  assert.match(r.out, /PRE-PR: OK\s*$/)
  // push измеряется по origin, а не по словам скрипта
  assert.equal(git(w.origin, ['rev-parse', w.branch]), git(w.work, ['rev-parse', 'HEAD']))
  cleanup(w)
})

test('ветка отстала и сливается чисто — merge влит, ahead = 0', () => {
  const w = makeWorld('prepr-behind')
  const stub = ghStub(w, { noPr: true })
  commit(w.work, 'apps/feature.txt', 'работа воркера\n', 'feat: работа')
  advanceBase(w, 'apps/other.txt', 'чужая задача уехала в dev\n')
  const r = prePr(w, stub)
  assert.equal(r.rc, 0, r.out)
  assert.match(r.out, /PRE-PR merge: ok влито 1 коммит/)
  assert.match(r.out, /PRE-PR: OK\s*$/)
  assert.ok(fs.existsSync(path.join(w.work, 'apps/other.txt')), 'файл из базы приехал в ветку')
  assert.equal(git(w.work, ['rev-list', '--count', 'HEAD..origin/dev']), '0')
  cleanup(w)
})

test('конфликт ТОЛЬКО в HANDOFF.json — лечится версией базы, merge завершён коммитом', () => {
  const w = makeWorld('prepr-handoff')
  const stub = ghStub(w, { noPr: true })
  commit(w.work, 'HANDOFF.json', JSON.stringify({ status: 'моя строка воркера' }) + '\n', 'chore: свой статус')
  commit(w.other, 'HANDOFF.json', JSON.stringify({ status: 'строка штаба из dev' }) + '\n', 'chore: статус штаба')
  git(w.other, ['push', '--quiet', 'origin', 'dev'])
  const r = prePr(w, stub)
  assert.equal(r.rc, 0, r.out)
  assert.match(r.out, /PRE-PR merge: ok конфликт только в HANDOFF\.json/)
  assert.match(r.out, /PRE-PR: OK\s*$/)
  // версия базы взята целиком, своя строка не возвращена
  assert.match(fs.readFileSync(path.join(w.work, 'HANDOFF.json'), 'utf8'), /строка штаба из dev/)
  assert.doesNotMatch(fs.readFileSync(path.join(w.work, 'HANDOFF.json'), 'utf8'), /моя строка воркера/)
  // merge завершён именно коммитом, а не оставлен в состоянии слияния
  assert.ok(!fs.existsSync(path.join(w.work, '.git', 'MERGE_HEAD')), 'merge не оставлен незавершённым')
  assert.equal(git(w.work, ['rev-list', '--count', '--merges', 'HEAD', '--not', 'origin/dev~1']).length > 0, true)
  assert.equal(gitOut(w.work, ['status', '--porcelain']).out.trim(), '')
  cleanup(w)
})

test('конфликт в чужом файле — rc=2, merge прерван, файл назван', () => {
  const w = makeWorld('prepr-conflict')
  const stub = ghStub(w, { noPr: true })
  commit(w.work, 'apps/x.txt', 'версия воркера\n', 'feat: правка x')
  commit(w.other, 'apps/x.txt', 'версия базы\n', 'feat: чужая правка x')
  git(w.other, ['push', '--quiet', 'origin', 'dev'])
  const r = prePr(w, stub)
  assert.equal(r.rc, 2, r.out)
  assert.match(r.out, /PRE-PR merge: fail конфликт вне HANDOFF\.json, merge прерван: apps\/x\.txt/)
  assert.match(r.out, /PRE-PR: FAIL 2 /)
  assert.ok(!fs.existsSync(path.join(w.work, '.git', 'MERGE_HEAD')), 'merge прерван')
  assert.equal(gitOut(w.work, ['status', '--porcelain']).out.trim(), '')
  cleanup(w)
})

test('незакоммиченные правки в отслеживаемых файлах — rc=4 со списком', () => {
  const w = makeWorld('prepr-dirty')
  const stub = ghStub(w, { noPr: true })
  commit(w.work, 'apps/feature.txt', 'работа воркера\n', 'feat: работа')
  write(w.work, 'apps/feature.txt', 'недописанная правка\n')
  write(w.work, 'apps/x.txt', 'ещё одна правка\n')
  write(w.work, 'scratch.log', 'мусор вне git\n')
  const r = prePr(w, stub)
  assert.equal(r.rc, 4, r.out)
  assert.match(r.out, /PRE-PR dirty: fail незакоммиченные отслеживаемые файлы:.*apps\/feature\.txt/)
  assert.match(r.out, /apps\/x\.txt/)
  assert.doesNotMatch(r.out, /scratch\.log/, 'неотслеживаемый мусор не считается блокером')
  assert.match(r.out, /PRE-PR: FAIL 4 /)
  cleanup(w)
})

test('незакоммиченным оказался только HANDOFF.json — восстановлен из индекса, работа идёт дальше', () => {
  const w = makeWorld('prepr-dirty-handoff')
  const stub = ghStub(w, { noPr: true })
  commit(w.work, 'apps/feature.txt', 'работа воркера\n', 'feat: работа')
  write(w.work, 'HANDOFF.json', JSON.stringify({ status: 'это написал CLI, а не воркер' }) + '\n')
  const r = prePr(w, stub)
  assert.equal(r.rc, 0, r.out)
  assert.match(r.out, /PRE-PR dirty: ok HANDOFF\.json восстановлен из индекса, копия правки: /)
  assert.equal(gitOut(w.work, ['status', '--porcelain', '--untracked-files=no']).out.trim(), '')
  assert.match(r.out, /PRE-PR: OK\s*$/)
  cleanup(w)
})

test('PR существует и CONFLICTING — rc=3 с номером PR', () => {
  const w = makeWorld('prepr-pr-conflicting')
  const stub = ghStub(w, { views: [CONFLICTING] })
  commit(w.work, 'apps/feature.txt', 'работа воркера\n', 'feat: работа')
  const r = prePr(w, stub)
  assert.equal(r.rc, 3, r.out)
  assert.match(r.out, /PRE-PR pr: fail PR #7 mergeable=CONFLICTING/)
  assert.match(r.out, /PRE-PR: FAIL 3 PR #7 CONFLICTING/)
  cleanup(w)
})

test('GitHub отвечает UNKNOWN, затем MERGEABLE — скрипт дожидается и проходит', () => {
  const w = makeWorld('prepr-pr-unknown')
  const stub = ghStub(w, { views: [UNKNOWN, UNKNOWN, MERGEABLE] })
  commit(w.work, 'apps/feature.txt', 'работа воркера\n', 'feat: работа')
  const r = prePr(w, stub)
  assert.equal(r.rc, 0, r.out)
  assert.match(r.out, /PRE-PR pr: ok PR #7 mergeable=MERGEABLE mergeStateStatus=CLEAN/)
  assert.match(r.out, /PRE-PR: OK\s*$/)
  assert.equal(fs.readFileSync(path.join(stub.dir, 'counter'), 'utf8'), '4', 'три вызова gh pr view, а не один')
  cleanup(w)
})

test('запуск на базовой ветке — rc=6, ничего не пушится', () => {
  const w = makeWorld('prepr-on-base')
  const stub = ghStub(w, { noPr: true })
  git(w.work, ['checkout', '--quiet', 'dev'])
  const r = prePr(w, stub)
  assert.equal(r.rc, 6, r.out)
  assert.match(r.out, /PRE-PR env: fail ты на базовой ветке dev/)
  cleanup(w)
})
