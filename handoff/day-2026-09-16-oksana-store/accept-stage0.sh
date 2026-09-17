#!/usr/bin/env bash
# accept-stage0.sh — машинный ЭТАП 0 приёмки: детерминированные проверки, которые идут ДО
# модели-приёмщика (заказ Ивана 2026-09-18 04:53, п. 1.1 «каскад приёмки»). Смысл: за 2026-09-17
# 22 из 34 отклонённых раундов были процессными или ловились grep-ом по диффу — раунд модели на
# такой PR тратить незачем. Скрипт ничего не чинит и ничего не мержит: он МЕРЯЕТ и пишет отчёт.
#
#   accept-stage0.sh <task-id> <pr-number> <out-dir>
#
# Переменные окружения:
#   STAGE0_BASE       база PR (по умолчанию dev)
#   STAGE0_REMOTE     remote (origin)
#   STAGE0_WORKTREE   worktree воркера — там и только там запускаются lint/tsc/тесты пакетов;
#                     без него шаг checks даёт skip, потому что главный чекаут стоит на базе
#                     и мерил бы не PR (правило 18f)
#   STAGE0_TIMEOUT_TOTAL  общий бюджет шага checks в секундах (900 = 15 мин)
#   STAGE0_BUILD=1    дополнительно прогнать сборочные гейты (по умолчанию НЕТ: `medusa build` и
#                     `next build` переписывают .medusa/.next под живым dev-сервером того же
#                     worktree — правило 5d, инцидент aie-20260915-080025-d004)
#
# Выход: 0 — PASS, 1 — FAIL (хотя бы одна проверка провалена), 2 — не смогли прочитать PR.
# Артефакты: <out-dir>/stage0.json, <out-dir>/stage0.md, <out-dir>/pr.json, <out-dir>/pr.diff,
#            <out-dir>/checks/<проверка>.log

set -uo pipefail

TASK_ID="${1:-}"
PR_NUMBER="${2:-}"
OUT="${3:-}"
if [ -z "$TASK_ID" ] || [ -z "$PR_NUMBER" ] || [ -z "$OUT" ]; then
  printf 'usage: accept-stage0.sh <task-id> <pr-number> <out-dir>\n' >&2
  printf 'STAGE0: FAIL usage\n'
  exit 2
fi

BASE="${STAGE0_BASE:-dev}"
REMOTE="${STAGE0_REMOTE:-origin}"
WT="${STAGE0_WORKTREE:-}"
TOTAL="${STAGE0_TIMEOUT_TOTAL:-900}"
GH_TIMEOUT="${STAGE0_GH_TIMEOUT:-60}"
FETCH_TIMEOUT="${STAGE0_FETCH_TIMEOUT:-120}"
HERE="$(cd "$(dirname "$0")" && pwd)"

export GIT_TERMINAL_PROMPT=0
export GIT_PAGER=cat
export GH_PAGER=cat

mkdir -p "$OUT/checks"
OUT="$(cd "$OUT" && pwd)"
RECS="$OUT/.stage0-records.jsonl"
: > "$RECS"
FAILED=""

# Таймаут без GNU userland (на Darwin нет ни timeout, ни gtimeout — замер 2026-09-13, правило 19d).
if command -v timeout >/dev/null 2>&1; then TIMEOUT_BIN=timeout
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN=gtimeout
else TIMEOUT_BIN=""; fi

with_timeout() {
  local secs="$1"; shift
  if [ -n "$TIMEOUT_BIN" ]; then
    "$TIMEOUT_BIN" "$secs" "$@"
  else
    perl -e '
      my $secs = shift @ARGV;
      my $pid = fork();
      if (!defined $pid) { exit 127 }
      if ($pid == 0) { exec @ARGV; exit 127 }
      $SIG{ALRM} = sub { kill 9, $pid; waitpid($pid, 0); exit 124 };
      alarm $secs;
      waitpid($pid, 0);
      my $rc = $?;
      alarm 0;
      exit($rc & 127 ? 128 + ($rc & 127) : $rc >> 8);
    ' "$secs" "$@"
  fi
}

rec() { # rec <check> <pass|fail|skip> <details> [файлы через \n]
  node -e 'const a=process.argv.slice(1);process.stdout.write(JSON.stringify({check:a[0],status:a[1],details:a[2],files:(a[3]||"").split("\n").filter(Boolean)})+"\n")' \
    "$1" "$2" "$3" "${4:-}" >> "$RECS"
  printf 'STAGE0 %s: %s %s\n' "$1" "$2" "$3"
  if [ "$2" = "fail" ]; then FAILED="$FAILED $1"; fi
}

finish() {
  node -e '
    const fs = require("node:fs")
    const [recs, out, task, pr, base] = process.argv.slice(1)
    const checks = fs.readFileSync(recs, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    const failed = checks.filter((c) => c.status === "fail").map((c) => c.check)
    const result = failed.length ? "FAIL" : "PASS"
    const doc = { task, pr: Number(pr), base, generatedAt: new Date().toISOString(), result, failed, checks }
    fs.writeFileSync(out + "/stage0.json", JSON.stringify(doc, null, 2) + "\n")
    const mark = { pass: "ok", fail: "ПРОВАЛ", skip: "пропуск" }
    const md = [
      `# Этап 0 приёмки — ${task}, PR #${pr}`,
      "",
      `Замер: ${doc.generatedAt} · база ${base} · итог **${result}**${failed.length ? ` (${failed.join(", ")})` : ""}`,
      "",
      "| проверка | статус | детали |",
      "|---|---|---|",
      ...checks.map((c) => `| ${c.check} | ${mark[c.status] || c.status} | ${String(c.details).replace(/\|/g, "\\|")} |`),
      "",
      ...checks.filter((c) => c.files && c.files.length).flatMap((c) => [`## ${c.check} — файлы`, "", ...c.files.map((f) => `- ${f}`), ""]),
    ].join("\n")
    fs.writeFileSync(out + "/stage0.md", md + "\n")
  ' "$RECS" "$OUT" "$TASK_ID" "$PR_NUMBER" "$BASE"
  if [ -n "$FAILED" ]; then
    printf 'STAGE0: FAIL%s\n' "$FAILED"
    exit 1
  fi
  printf 'STAGE0: PASS\n'
  exit 0
}

json_field() { printf '%s' "$1" | tr -d '\n' | sed -n 's/.*"'"$2"'":"\([^"]*\)".*/\1/p' | head -1; }

# ── PR: метаданные и дифф ─────────────────────────────────────────────────────────────────────
if ! command -v gh >/dev/null 2>&1; then
  rec pr fail "gh не найден в PATH — состояние PR не замерено"
  finish
fi
PR_JSON="$(with_timeout "$GH_TIMEOUT" gh pr view "$PR_NUMBER" --json mergeable,mergeStateStatus,headRefName,headRefOid,baseRefName,body,url 2>&1)"
if [ $? -ne 0 ]; then
  rec pr fail "gh pr view $PR_NUMBER: $(printf '%s' "$PR_JSON" | tr '\n' ' ' | cut -c1-200)"
  finish
fi
printf '%s\n' "$PR_JSON" > "$OUT/pr.json"
HEAD_REF="$(json_field "$PR_JSON" headRefName)"
HEAD_OID="$(json_field "$PR_JSON" headRefOid)"
BASE_REF="$(json_field "$PR_JSON" baseRefName)"
MERGEABLE="$(json_field "$PR_JSON" mergeable)"
MERGE_STATE="$(json_field "$PR_JSON" mergeStateStatus)"
[ -n "$BASE_REF" ] && BASE="$BASE_REF"
PR_BODY="$(node -e 'const fs=require("node:fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(j.body||""))' "$OUT/pr.json" 2>/dev/null || printf '')"

with_timeout "$GH_TIMEOUT" gh pr diff "$PR_NUMBER" > "$OUT/pr.diff" 2>"$OUT/checks/gh-diff.err"
DIFF_RC=$?
DIFF_SRC="gh pr diff $PR_NUMBER"

# ── проверка pr: не CONFLICTING и не позади базы ──────────────────────────────────────────────
PR_DETAILS="mergeable=$MERGEABLE mergeStateStatus=$MERGE_STATE head=$HEAD_REF base=$BASE"
PR_STATUS=pass
if [ "$MERGEABLE" = "CONFLICTING" ]; then
  PR_STATUS=fail
  PR_DETAILS="$PR_DETAILS — PR конфликтует с базой, слить $REMOTE/$BASE и запушить"
fi
BEHIND="?"
if with_timeout "$FETCH_TIMEOUT" git fetch --quiet "$REMOTE" "$BASE" "$HEAD_REF" >/dev/null 2>&1; then
  BEHIND="$(git rev-list --count "$REMOTE/$HEAD_REF..$REMOTE/$BASE" 2>/dev/null || echo '?')"
  if [ "$BEHIND" != "0" ] && [ "$BEHIND" != "?" ]; then
    PR_STATUS=fail
    PR_DETAILS="$PR_DETAILS — ветка позади базы на $BEHIND коммит(ов)"
  else
    PR_DETAILS="$PR_DETAILS behind=$BEHIND"
  fi
else
  PR_DETAILS="$PR_DETAILS behind=? (fetch $REMOTE $BASE $HEAD_REF не прошёл)"
fi
rec pr "$PR_STATUS" "$PR_DETAILS"

if [ "$DIFF_RC" -ne 0 ]; then
  # Квота GitHub API — одна на все инструменты и бывает исчерпана целиком (замер 2026-09-18 06:24 WITA:
  # `gh pr diff` → HTTP 403 «API rate limit exceeded» при живом `gh pr view`). Дифф PR — это ровно
  # `git diff <base>...<head>` (merge-base..head), его берём локально и в квоту API не ходим.
  GH_ERR="$(tr '\n' ' ' <"$OUT/checks/gh-diff.err" | cut -c1-160)"
  if with_timeout "$FETCH_TIMEOUT" git fetch --quiet "$REMOTE" "$BASE" "$HEAD_REF" >/dev/null 2>&1 &&
     with_timeout 120 git diff "$REMOTE/$BASE...$REMOTE/$HEAD_REF" > "$OUT/pr.diff" 2>>"$OUT/checks/gh-diff.err"; then
    DIFF_RC=0
    DIFF_SRC="git diff $REMOTE/$BASE...$REMOTE/$HEAD_REF (gh pr diff недоступен: $GH_ERR)"
  else
    rec diff fail "ни gh pr diff, ни git diff $REMOTE/$BASE...$REMOTE/$HEAD_REF не дали дифф: $GH_ERR"
    finish
  fi
fi

SCAN="$OUT/.stage0-scan.json"
if ! node "$HERE/stage0-scan.mjs" "$OUT/pr.diff" > "$SCAN" 2>"$OUT/checks/scan.err"; then
  rec diff fail "stage0-scan.mjs: $(tr '\n' ' ' <"$OUT/checks/scan.err" | cut -c1-200)"
  finish
fi
FILES="$(node -e 'const j=require(process.argv[1]);process.stdout.write(j.files.join("\n"))' "$SCAN")"
ADDED="$(node -e 'const j=require(process.argv[1]);process.stdout.write(String(j.added))' "$SCAN")"
rec diff pass "источник: $DIFF_SRC · файлов $(printf '%s\n' "$FILES" | grep -c . | tr -d ' '), добавленных строк $ADDED"

# ── проверка forbidden: общий журнал дня и файлы движка ───────────────────────────────────────
FORBIDDEN="$(printf '%s\n' "$FILES" | grep -E '(^|/)HANDOFF\.json$|^handoff/[^/]+/(state|tasks)\.json$' || true)"
if [ -n "$FORBIDDEN" ]; then
  rec forbidden-files fail "ветка задачи трогает общий журнал/движок — эти файлы принадлежат штабу и делают PR CONFLICTING при первом же merge чужого PR" "$FORBIDDEN"
else
  rec forbidden-files pass "HANDOFF.json, state.json и tasks.json движка не тронуты"
fi

# ── проверка secrets ──────────────────────────────────────────────────────────────────────────
SECRETS="$(node -e 'const j=require(process.argv[1]);process.stdout.write(j.secrets.map(s=>`${s.file}:${s.line} [${s.pattern}] ${s.evidence}`).join("\n"))' "$SCAN")"
if [ -n "$SECRETS" ]; then
  rec secrets fail "в добавленных строках найдены значения, похожие на ключи ($(printf '%s\n' "$SECRETS" | grep -c .) шт.); осознанный пример помечается в строке маркером stage0:allow" "$SECRETS"
else
  rec secrets pass "в добавленных строках ключей не найдено"
fi

# ── проверка disabled-tests ───────────────────────────────────────────────────────────────────
DISABLED="$(node -e 'const j=require(process.argv[1]);process.stdout.write(j.disabled.map(s=>`${s.file}:${s.line} [${s.pattern}] ${s.evidence}`).join("\n"))' "$SCAN")"
if [ -n "$DISABLED" ]; then
  if printf '%s' "$PR_BODY" | grep -qE '^[[:space:]]*STAGE0-ALLOW-DISABLED-TESTS:[[:space:]]*[^[:space:]]'; then
    rec disabled-tests pass "выключенные тесты есть, но тело PR несёт строку-обоснование STAGE0-ALLOW-DISABLED-TESTS" "$DISABLED"
  else
    rec disabled-tests fail "в diff выключены/сужены тесты, а в теле PR нет строки «STAGE0-ALLOW-DISABLED-TESTS: <причина>»" "$DISABLED"
  fi
else
  rec disabled-tests pass "выключенных тестов в diff нет"
fi

# ── проверка checks: lint/tsc/тесты затронутых пакетов ────────────────────────────────────────
PKGS=""
add_pkg() { case " $PKGS " in *" $1 "*) ;; *) PKGS="$PKGS $1" ;; esac }
for f in $FILES; do
  case "$f" in
    apps/backend/*) add_pkg apps/backend ;;
    apps/storefront/*) add_pkg apps/storefront ;;
    apps/*/*) add_pkg "$(printf '%s' "$f" | cut -d/ -f1-2)" ;;
    tools/test-methods/*) add_pkg tools/test-methods ;;
    handoff/*/ui/*|handoff/*/intake/*) add_pkg "$(printf '%s' "$f" | cut -d/ -f1-2)/ui" ;;
  esac
done
PKGS="$(printf '%s' "$PKGS" | sed 's/^ *//')"

DEADLINE=$(( $(date +%s) + TOTAL ))
run_check() { # run_check <ярлык> <каталог> <команда...>
  local label="$1" dir="$2"; shift 2
  local left=$(( DEADLINE - $(date +%s) ))
  if [ "$left" -le 10 ]; then rec "$label" skip "бюджет ${TOTAL}s исчерпан"; return; fi
  local log="$OUT/checks/$(printf '%s' "$label" | tr '/:' '__').log"
  ( cd "$dir" && with_timeout "$left" "$@" ) > "$log" 2>&1
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    rec "$label" pass "rc=0 · $* · лог $log"
  elif [ "$rc" -eq 124 ]; then
    rec "$label" fail "таймаут ${left}s · $* · лог $log"
  else
    rec "$label" fail "rc=$rc · $* · $(tail -3 "$log" | tr '\n' ' ' | cut -c1-180) · лог $log"
  fi
}

if [ -z "$PKGS" ]; then
  rec checks skip "diff не трогает пакетов monorepo (только документы/скрипты штаба)"
elif [ -z "$WT" ]; then
  rec checks skip "STAGE0_WORKTREE не задан — lint/tsc мерили бы базу, а не PR (правило 18f); пакеты в diff: $PKGS"
else
  WT_HEAD="$(cd "$WT" && git rev-parse HEAD 2>/dev/null || echo '')"
  if [ -n "$HEAD_OID" ] && [ "$WT_HEAD" != "$HEAD_OID" ]; then
    rec checks skip "worktree $WT стоит на $WT_HEAD, а голова PR — $HEAD_OID: проверки мерили бы не тот код (правило 18f)"
  else
    for p in $PKGS; do
      # node_modules нужны пакетам, которые зовут npx/npm; `node --test` в handoff/<день>/ui — нет.
      case "$p" in
        */ui) ;;
        *) if [ ! -d "$WT/node_modules" ]; then rec "checks:$p" skip "в $WT нет node_modules — зависимости не установлены"; continue; fi ;;
      esac
      case "$p" in
        apps/backend)
          run_check "checks:backend:tsc" "$WT/apps/backend" npx tsc --noEmit
          run_check "checks:backend:lint" "$WT/apps/backend" npx medusa lint
          run_check "checks:backend:test:unit" "$WT/apps/backend" npm run --silent test:unit
          rec "checks:backend:test:integration" skip "integration:http и integration:modules требуют живого Postgres (AGENTS.md) — остаются модели-приёмщику"
          if [ "${STAGE0_BUILD:-0}" = "1" ]; then
            run_check "checks:backend:build" "$WT" npm run --silent check:backend-build
          else
            rec "checks:backend:build" skip "сборочный гейт pnpm check:backend-build выключен: medusa build переписывает .medusa под живым dev-сервером (правило 5d); включается STAGE0_BUILD=1"
          fi
          ;;
        apps/storefront)
          run_check "checks:storefront:tsc" "$WT/apps/storefront" npx tsc --noEmit
          run_check "checks:storefront:lint" "$WT/apps/storefront" npx next lint
          run_check "checks:storefront:test" "$WT/apps/storefront" npm run --silent test
          ;;
        tools/test-methods)
          run_check "checks:test-methods" "$WT" node --test tools/test-methods/__tests__/
          ;;
        */ui)
          if [ -d "$WT/$p" ]; then
            run_check "checks:$p" "$WT" node --test "$p/"
          else
            rec "checks:$p" skip "каталога $p нет в worktree"
          fi
          ;;
        *)
          if [ ! -f "$WT/$p/package.json" ]; then
            rec "checks:$p" skip "в $p нет package.json"
          else
            HAS="$(node -e 'const j=require(process.argv[1]+"/package.json");process.stdout.write(Object.keys(j.scripts||{}).join(" "))' "$WT/$p")"
            RAN=0
            for s in lint typecheck type-check test; do
              case " $HAS " in *" $s "*) run_check "checks:$p:$s" "$WT/$p" npm run --silent "$s"; RAN=1 ;; esac
            done
            [ "$RAN" = "0" ] && rec "checks:$p" skip "в package.json нет ни lint, ни typecheck, ни test"
          fi
          ;;
      esac
    done
  fi
fi

finish
