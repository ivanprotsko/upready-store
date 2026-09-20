#!/usr/bin/env bash
# pre-pr.sh — детерминированный гейт, который воркер запускает ИЗ СВОЕГО worktree перед `gh pr create`
# и после каждого push. Заменяет текстовую инструкцию «слей origin/dev, вылечи CONFLICTING» в
# _worker-preamble.md: за день 2026-09-17 22 из 34 отклонённых раундов приёмки были процессными
# (ветка отстала от базы, конфликт HANDOFF.json, PR CONFLICTING, незакоммиченные файлы), хотя
# инструкция стояла у каждого воркера. Инструкция агенту — не гейт (правило 41: guardrails = код).
#
#   handoff/day-2026-09-16-oksana-store/pre-pr.sh [<база>]
#
# База по умолчанию `dev` (upready-store); для agent-creatr — `main`, передаётся аргументом
# или переменной PRE_PR_BASE. Интерактива нет ни в одном шаге, все внешние вызовы с таймаутом.
#
# Каждый шаг печатает строку `PRE-PR <шаг>: ok|fail|skip <детали>`, последняя строка —
# `PRE-PR: OK` либо `PRE-PR: FAIL <код> <причина>`.
#
# Коды возврата:
#   0 — всё в порядке, можно создавать PR;
#   2 — конфликт merge вне HANDOFF.json (merge прерван, список файлов в строке шага);
#   3 — PR существует и `mergeable=CONFLICTING`;
#   4 — незакоммиченные изменения в отслеживаемых файлах (решает воркер, что коммитить);
#   5 — push не прошёл, либо база ушла вперёд уже после push;
#   6 — окружение: не git-worktree, нет remote/базовой ветки, ты на базовой ветке, fetch не прошёл.

set -uo pipefail

BASE="${1:-${PRE_PR_BASE:-dev}}"
REMOTE="${PRE_PR_REMOTE:-origin}"
# Ожидание, пока GitHub досчитает mergeable (сразу после push он отвечает UNKNOWN): 6 × 10 с.
PR_WAIT_TRIES="${PRE_PR_PR_WAIT_TRIES:-6}"
PR_WAIT_SLEEP="${PRE_PR_PR_WAIT_SLEEP:-10}"
FETCH_TIMEOUT="${PRE_PR_FETCH_TIMEOUT:-120}"
PUSH_TIMEOUT="${PRE_PR_PUSH_TIMEOUT:-180}"
GH_TIMEOUT="${PRE_PR_GH_TIMEOUT:-60}"

# Коммит внутри скрипта проходит через гейт правила 21 ровно так же, как набранный руками.
export IVAN_OK=1
# Никакого интерактива: ни редактора для merge-сообщения, ни промпта за паролем.
export GIT_TERMINAL_PROMPT=0
export GIT_EDITOR=true
export GIT_MERGE_AUTOEDIT=no
export GIT_PAGER=cat
export GH_PAGER=cat

say() { printf 'PRE-PR %s: %s %s\n' "$1" "$2" "$3"; }
die() { printf 'PRE-PR: FAIL %s %s\n' "$1" "$2"; exit "$1"; }

# На этой машине (Darwin, BSD userland) нет ни `timeout`, ни `gtimeout` — замер 2026-09-13,
# правило 19d. Поэтому таймаут даёт perl: он есть в базовой системе macOS и Linux.
if command -v timeout >/dev/null 2>&1; then TIMEOUT_BIN=timeout
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN=gtimeout
else TIMEOUT_BIN=""; fi

with_timeout() { # with_timeout <секунды> <команда...>; rc=124 — не уложились
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

# Одно поле строкового типа из компактного JSON `gh --json`.
json_field() { printf '%s' "$1" | tr -d '\n' | sed -n 's/.*"'"$2"'":"\([^"]*\)".*/\1/p' | head -1; }

# ── шаг env ───────────────────────────────────────────────────────────────────────────────────
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  say env fail "$(pwd) — не git-worktree"
  die 6 "не git-worktree"
fi
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
if [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then
  say env fail "detached HEAD — задача ведётся на именованной ветке (правило 21k)"
  die 6 "detached HEAD"
fi
if [ "$BRANCH" = "$BASE" ]; then
  say env fail "ты на базовой ветке $BASE — коммиты и PR идут с ветки задачи (правило 21k)"
  die 6 "ветка задачи = база"
fi
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  say env fail "нет remote $REMOTE"
  die 6 "нет remote $REMOTE"
fi
say env ok "ветка $BRANCH, база $REMOTE/$BASE, worktree $(pwd)"

# ── шаг fetch ─────────────────────────────────────────────────────────────────────────────────
if ! with_timeout "$FETCH_TIMEOUT" git fetch --quiet "$REMOTE" "$BASE" 2>/tmp/pre-pr-fetch.$$; then
  say fetch fail "git fetch $REMOTE $BASE: $(tr '\n' ' ' </tmp/pre-pr-fetch.$$ | cut -c1-200)"
  rm -f /tmp/pre-pr-fetch.$$
  die 6 "fetch не прошёл"
fi
rm -f /tmp/pre-pr-fetch.$$
if ! git rev-parse --verify --quiet "$REMOTE/$BASE" >/dev/null; then
  say fetch fail "$REMOTE/$BASE не существует"
  die 6 "нет ветки $REMOTE/$BASE"
fi
say fetch ok "$REMOTE/$BASE = $(git rev-parse --short "$REMOTE/$BASE")"

# ── шаг dirty ─────────────────────────────────────────────────────────────────────────────────
# Только отслеживаемые файлы: неотслеживаемый мусор (логи, кадры) воркер вправе оставить в дереве.
DIRTY="$(git status --porcelain --untracked-files=no | sed 's/^...//' | sed 's/.* -> //')"
if [ -n "$DIRTY" ]; then
  OTHER="$(printf '%s\n' "$DIRTY" | grep -v '^HANDOFF\.json$' || true)"
  if [ -z "$OTHER" ]; then
    # HANDOFF.json — общий журнал дня, ветка задачи не должна нести его правку вовсе
    # (приказ штаба 2026-09-15 22:57): любой CLI мог тронуть его сам. Копию кладём рядом.
    BK="${TMPDIR:-/tmp}/pre-pr-HANDOFF-$(date +%Y%m%d-%H%M%S).json"
    cp HANDOFF.json "$BK" 2>/dev/null || BK="(копия не снята)"
    git checkout -- HANDOFF.json
    say dirty ok "HANDOFF.json восстановлен из индекса, копия правки: $BK"
  else
    say dirty fail "незакоммиченные отслеживаемые файлы: $(printf '%s\n' "$OTHER" | tr '\n' ' ')"
    die 4 "незакоммиченные изменения"
  fi
else
  say dirty ok "дерево чистое"
fi

# ── шаг merge ─────────────────────────────────────────────────────────────────────────────────
BEHIND="$(git rev-list --count "HEAD..$REMOTE/$BASE" 2>/dev/null || echo 0)"
if [ "$BEHIND" = "0" ]; then
  say merge ok "ветка не отстаёт от $REMOTE/$BASE"
else
  if with_timeout 120 git merge --no-edit "$REMOTE/$BASE" >/tmp/pre-pr-merge.$$ 2>&1; then
    say merge ok "влито $BEHIND коммит(ов) из $REMOTE/$BASE"
  else
    CONFLICTED="$(git diff --name-only --diff-filter=U)"
    OTHERC="$(printf '%s\n' "$CONFLICTED" | grep -v '^HANDOFF\.json$' | grep -v '^$' || true)"
    if [ -n "$CONFLICTED" ] && [ -z "$OTHERC" ]; then
      # Конфликт только в общем журнале: берём версию базы целиком, свою строку не возвращаем.
      git checkout "$REMOTE/$BASE" -- HANDOFF.json
      git add -- HANDOFF.json
      # Частичный коммит во время merge git запрещает, поэтому pathspec тут не ставится:
      # `git commit -- <путь>` в состоянии merge падает с «cannot do a partial commit during a merge».
      if git commit -q --no-edit; then
        say merge ok "конфликт только в HANDOFF.json — взята версия $REMOTE/$BASE, merge завершён $(git rev-parse --short HEAD)"
      else
        say merge fail "не удалось завершить merge-коммит после лечения HANDOFF.json"
        rm -f /tmp/pre-pr-merge.$$
        die 2 "merge-коммит не прошёл"
      fi
    else
      git merge --abort >/dev/null 2>&1
      LIST="$(printf '%s\n' "$CONFLICTED" | grep -v '^$' | tr '\n' ' ')"
      [ -z "$LIST" ] && LIST="$(tr '\n' ' ' </tmp/pre-pr-merge.$$ | cut -c1-200)"
      say merge fail "конфликт вне HANDOFF.json, merge прерван: $LIST"
      rm -f /tmp/pre-pr-merge.$$
      die 2 "конфликт: $LIST"
    fi
  fi
fi
rm -f /tmp/pre-pr-merge.$$

# ── шаг push ──────────────────────────────────────────────────────────────────────────────────
if ! with_timeout "$PUSH_TIMEOUT" git push -u "$REMOTE" HEAD >/tmp/pre-pr-push.$$ 2>&1; then
  say push fail "git push -u $REMOTE HEAD: $(tr '\n' ' ' </tmp/pre-pr-push.$$ | cut -c1-300)"
  rm -f /tmp/pre-pr-push.$$
  die 5 "push не прошёл"
fi
rm -f /tmp/pre-pr-push.$$
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "$REMOTE/$BRANCH" 2>/dev/null || echo '')"
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  say push fail "HEAD=$LOCAL_SHA, $REMOTE/$BRANCH=${REMOTE_SHA:-нет}"
  die 5 "push не долетел: OID расходятся"
fi
say push ok "$REMOTE/$BRANCH = $LOCAL_SHA"

# ── шаг ahead ─────────────────────────────────────────────────────────────────────────────────
# База могла уехать, пока мы сливали и пушили: замеряем ПОСЛЕ push, а не до.
with_timeout "$FETCH_TIMEOUT" git fetch --quiet "$REMOTE" "$BASE" >/dev/null 2>&1
BEHIND_AFTER="$(git rev-list --count "HEAD..$REMOTE/$BASE" 2>/dev/null || echo '?')"
if [ "$BEHIND_AFTER" != "0" ]; then
  say ahead fail "после push база ушла вперёд на $BEHIND_AFTER коммит(ов) — запусти pre-pr.sh ещё раз"
  die 5 "HEAD..$REMOTE/$BASE = $BEHIND_AFTER"
fi
say ahead ok "HEAD..$REMOTE/$BASE = 0"

# ── шаг pr ────────────────────────────────────────────────────────────────────────────────────
if ! command -v gh >/dev/null 2>&1; then
  say pr skip "gh не найден в PATH — состояние PR не замерено"
else
  TRY=0
  PR_JSON=""
  PR_RC=1
  MERGEABLE=""
  while [ "$TRY" -lt "$PR_WAIT_TRIES" ]; do
    PR_JSON="$(with_timeout "$GH_TIMEOUT" gh pr view --json mergeable,mergeStateStatus,number,url 2>&1)"
    PR_RC=$?
    if [ "$PR_RC" -ne 0 ]; then break; fi
    MERGEABLE="$(json_field "$PR_JSON" mergeable)"
    if [ "$MERGEABLE" != "UNKNOWN" ] && [ -n "$MERGEABLE" ]; then break; fi
    TRY=$((TRY + 1))
    [ "$TRY" -lt "$PR_WAIT_TRIES" ] && sleep "$PR_WAIT_SLEEP"
  done
  if [ "$PR_RC" -ne 0 ]; then
    # Это нормальный путь ПЕРЕД созданием PR: gh отвечает «no pull requests found».
    say pr ok "PR ещё нет — создавай ($(printf '%s' "$PR_JSON" | tr '\n' ' ' | cut -c1-120))"
  else
    STATE="$(json_field "$PR_JSON" mergeStateStatus)"
    NUM="$(printf '%s' "$PR_JSON" | tr -d '\n' | sed -n 's/.*"number":\([0-9]*\).*/\1/p' | head -1)"
    if [ "$MERGEABLE" = "CONFLICTING" ]; then
      say pr fail "PR #$NUM mergeable=CONFLICTING mergeStateStatus=$STATE — merge base ещё раз и разреши конфликт"
      die 3 "PR #$NUM CONFLICTING"
    fi
    if [ "$MERGEABLE" = "UNKNOWN" ] || [ -z "$MERGEABLE" ]; then
      say pr skip "PR #$NUM: GitHub за $((PR_WAIT_TRIES * PR_WAIT_SLEEP)) с не досчитал mergeable (UNKNOWN)"
    else
      say pr ok "PR #$NUM mergeable=$MERGEABLE mergeStateStatus=$STATE"
    fi
  fi
fi

printf 'PRE-PR: OK\n'
exit 0
