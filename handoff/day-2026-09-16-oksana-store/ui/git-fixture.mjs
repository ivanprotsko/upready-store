// git-fixture.mjs — временные git-репозитории и шим `gh` для тестов pre-pr.sh и accept-stage0.sh.
// Схема мира: bare origin с базовой веткой `dev`, клон `work` на ветке задачи (там работает воркер)
// и клон `other`, которым тест двигает базу вперёд — так конфликт и отставание получаются настоящими,
// а не имитацией.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const IDENT = {
  GIT_AUTHOR_NAME: 'pp01 fixture',
  GIT_AUTHOR_EMAIL: 'pp01@example.invalid',
  GIT_COMMITTER_NAME: 'pp01 fixture',
  GIT_COMMITTER_EMAIL: 'pp01@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
  HOME: os.tmpdir(),
}

export function git(cwd, args, extraEnv = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...IDENT, ...extraEnv } })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} в ${cwd}: rc=${r.status}\n${r.stdout}${r.stderr}`)
  return r.stdout.trim()
}

export function gitOut(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...IDENT } })
  return { rc: r.status, out: `${r.stdout}${r.stderr}` }
}

export function write(dir, rel, text) {
  const p = path.join(dir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
  return p
}

export function commit(dir, rel, text, message) {
  write(dir, rel, text)
  git(dir, ['add', '--', rel])
  git(dir, ['commit', '-q', '-m', message, '--', rel])
  return git(dir, ['rev-parse', 'HEAD'])
}

// Мир: origin.git (bare, база `dev`), work (ветка задачи), other (клон на базе).
export function makeWorld(tag, { branch = 'feat/pp01-fixture', base = 'dev' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${tag}-`))
  const origin = path.join(root, 'origin.git')
  git(root, ['init', '--quiet', '--bare', '-b', base, origin])

  const seed = path.join(root, 'seed')
  fs.mkdirSync(seed)
  git(seed, ['init', '--quiet', '-b', base])
  commit(seed, 'README.md', '# fixture\n', 'chore: seed')
  commit(seed, 'HANDOFF.json', JSON.stringify({ status: 'база', tasks: [] }, null, 2) + '\n', 'chore: handoff')
  commit(seed, 'apps/x.txt', 'база строка 1\n', 'chore: app file')
  git(seed, ['remote', 'add', 'origin', origin])
  git(seed, ['push', '--quiet', '-u', 'origin', base])

  const work = path.join(root, 'work')
  git(root, ['clone', '--quiet', origin, work])
  git(work, ['config', 'user.email', IDENT.GIT_AUTHOR_EMAIL])
  git(work, ['config', 'user.name', IDENT.GIT_AUTHOR_NAME])
  git(work, ['checkout', '--quiet', '-b', branch])

  const other = path.join(root, 'other')
  git(root, ['clone', '--quiet', origin, other])
  git(other, ['config', 'user.email', IDENT.GIT_AUTHOR_EMAIL])
  git(other, ['config', 'user.name', IDENT.GIT_AUTHOR_NAME])

  return { root, origin, work, other, branch, base }
}

// Двигает базу вперёд чужим коммитом — так ветка задачи оказывается позади по-настоящему.
export function advanceBase(world, rel, text, message = 'chore: база уехала вперёд') {
  commit(world.other, rel, text, message)
  git(world.other, ['push', '--quiet', 'origin', world.base])
}

// Шим `gh`: отвечает заготовленным JSON на `gh pr view` и заготовленным диффом на `gh pr diff`.
// Несколько ответов подряд (views[]) моделируют GitHub, который сперва отдаёт mergeable=UNKNOWN.
export function ghStub(world, { views = [], diff = '', noPr = false, diffFails = false } = {}) {
  const dir = path.join(world.root, 'gh-stub')
  const bin = path.join(world.root, 'bin')
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(bin, { recursive: true })
  if (noPr) fs.writeFileSync(path.join(dir, 'no-pr'), '')
  if (diffFails) fs.writeFileSync(path.join(dir, 'diff-fail'), '')
  views.forEach((v, i) => fs.writeFileSync(path.join(dir, `view-${i + 1}.json`), typeof v === 'string' ? v : JSON.stringify(v)))
  fs.writeFileSync(path.join(dir, 'diff.txt'), diff)
  const gh = path.join(bin, 'gh')
  fs.writeFileSync(gh, `#!/bin/sh
D="\${GH_STUB_DIR:-${dir}}"
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  if [ -f "$D/no-pr" ]; then printf 'no pull requests found for branch\\n' >&2; exit 1; fi
  n=1; [ -f "$D/counter" ] && n=$(cat "$D/counter")
  f="$D/view-$n.json"
  if [ ! -f "$f" ]; then
    m=$((n - 1))
    while [ "$m" -gt 1 ] && [ ! -f "$D/view-$m.json" ]; do m=$((m - 1)); done
    f="$D/view-$m.json"
  fi
  printf '%s' $((n + 1)) > "$D/counter"
  cat "$f"
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "diff" ]; then
  if [ -f "$D/diff-fail" ]; then printf 'could not find pull request diff: HTTP 403: API rate limit exceeded\\n' >&2; exit 1; fi
  cat "$D/diff.txt"
  exit 0
fi
printf 'gh stub: не поддержано: %s\\n' "$*" >&2
exit 1
`)
  fs.chmodSync(gh, 0o755)
  return { dir, bin }
}

export function runScript(script, args, { cwd, env = {}, binDir = null }) {
  const PATH = binDir ? `${binDir}:${process.env.PATH}` : process.env.PATH
  const r = spawnSync('bash', [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...IDENT, PATH, ...env },
  })
  return { rc: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout, stderr: r.stderr }
}

export function cleanup(world) {
  try { fs.rmSync(world.root, { recursive: true, force: true }) } catch {}
}
