#!/usr/bin/env bash
# deploy/auto/release-agent.sh: the release agent of ONE production host (t-2026-10-12-30).
#
# Ivan, 12.10.2026 18:04: «вливай и делай деплой, в следующий раз не жди и сразу делай это».
# Ivan, 11.10.2026: «нужно сделать чтобы агенты сами не могли ничего делать, всё это должно управляться
# снаружи системы… чтобы случайная ошибка агентов не могло ничего поломать».
#
# A systemd timer on the host runs this every two minutes (deploy/auto/install.sh writes it). No agent
# session, no Mac and no GitHub Actions job starts a release: the host releases itself. One run (a tick):
#
#   1. Takes the lock; a record still «running» from a run that died (a reboot) becomes «interrupted».
#   2. Signs in to GitHub as the release App (or a token file) and re-publishes any status it could not
#      publish before.
#   3. Reads Ivan's switch, the repository variable AUTO_RELEASE_DEV. Anything but on (missing, off,
#      unreadable) means no new release starts. A release already running is never stopped.
#   4. Picks the sha. Among the commits of dev newer than the last one this host released, the newest one
#      whose required checks (the jobs of pr-checks.yml) are all green. On RU it must also carry the
#      commit status release/intl = success, which only the INTL agent publishes after its step 6 is
#      green: INTL first, RU after, and still no SSH between the hosts (docs/instances/RULES.md §4).
#      A sha already in the journal is never taken again, so a failed one is not retried.
#   5. Releases it. The tarball of the sha goes into memory (/dev/shm), only the paths of
#      deploy/release-paths.txt reach the disk, then that sha's own deploy-instance.sh runs with
#      --on-host: a --verify-only baseline of what is red on the live stack first, then the seven steps.
#      A check that is red after the release and was red before is a known red, not a failure. A new red
#      gets three minutes to come back (the panel answers 502 right after its restart).
#   6. Writes the record into the journal and publishes release/<instance> on the commit: pending at the
#      start, success or failure at the end. A failure status is the signal for lead-upready-store and
#      coo; the reader on the Mac turns it into their inbox signal.
#
# Files (RELEASE_STATE_DIR, default /var/lib/upready-store-release):
#   journal.json  one record per release, schema deploy/auto/journal.schema.json
#   state.json    the switch, what the agent waits for, the current and the last release,
#                 schema deploy/auto/state.schema.json
#   logs/<id>/    baseline.out, release.out and the deploy-instance.sh log of every release
#   etags/        the ETag and the body of the last answer to each GET: the next tick asks with
#                 If-None-Match, and an answer 304 (unchanged) does not count against GitHub's limit
#   github-auth   App only: the Authorization header of the installation token, 600, the one file here
#                 that holds a secret. GitHub gives the token an hour; github-auth.expires holds when it
#                 ends (epoch seconds), and the agent signs in again five minutes before that
#
# Configuration: RELEASE_AGENT_CONF (default /etc/upready-store-release/release.env), shell variables:
#   RELEASE_INSTANCE        intl | ru (required)
#   RELEASE_ENV_FILE        the host's own env file of the stack (required), passed to --env-file
#   GITHUB_APP_ID, GITHUB_APP_KEY_FILE [, GITHUB_APP_INSTALLATION_ID]   the release App, or
#   GITHUB_TOKEN_FILE       a file holding a token
#   RELEASE_REPO (ivanprotsko/upready-store), RELEASE_BRANCH (dev), RELEASE_WORKFLOW (pr-checks.yml),
#   RELEASE_REQUIRED_JOBS («Backend|Storefront|Panel And Repository|Deploy Checks»),
#   RELEASE_SWITCH_VARIABLE (AUTO_RELEASE_DEV), RELEASE_STATE_DIR, RELEASE_TMP (/dev/shm),
#   RELEASE_GRACE_TRIES (12) × RELEASE_GRACE_SLEEP (15 s), RELEASE_COMMITS_DEPTH (30), GITHUB_API_URL.
#
# No secret is ever printed: the key and the token are read into a 600 header file curl reads with
# -H @file, never into an argument, a log line or any other file. The env file is passed by path only.
#
# Exit code: 0 on every tick, a failed release included (it is in the journal and on the commit);
# 2 on a configuration error.
set -uo pipefail

CONF="${RELEASE_AGENT_CONF:-/etc/upready-store-release/release.env}"
if [ -f "$CONF" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$CONF"
  set +a
fi

INSTANCE="${RELEASE_INSTANCE:-}"
ENV_FILE="${RELEASE_ENV_FILE:-}"
REPO="${RELEASE_REPO:-ivanprotsko/upready-store}"
BRANCH="${RELEASE_BRANCH:-dev}"
WORKFLOW="${RELEASE_WORKFLOW:-pr-checks.yml}"
REQUIRED_JOBS="${RELEASE_REQUIRED_JOBS:-Backend|Storefront|Panel And Repository|Deploy Checks}"
SWITCH_VAR="${RELEASE_SWITCH_VARIABLE:-AUTO_RELEASE_DEV}"
STATE_DIR="${RELEASE_STATE_DIR:-/var/lib/upready-store-release}"
TMP_ROOT="${RELEASE_TMP:-/dev/shm}"
API="${GITHUB_API_URL:-https://api.github.com}"
GRACE_TRIES="${RELEASE_GRACE_TRIES:-12}"
GRACE_SLEEP="${RELEASE_GRACE_SLEEP:-15}"
DEPTH="${RELEASE_COMMITS_DEPTH:-30}"
CONTEXT="release/$INSTANCE"

case "$INSTANCE" in intl|ru) ;; *) echo "RELEASE_INSTANCE must be intl or ru, got: '$INSTANCE'" >&2; exit 2 ;; esac
[ -n "$ENV_FILE" ] || { echo "RELEASE_ENV_FILE is not set" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "jq is not installed" >&2; exit 2; }

JOURNAL="$STATE_DIR/journal.json"
STATE="$STATE_DIR/state.json"
mkdir -p "$STATE_DIR/logs" "$STATE_DIR/etags" || exit 2
WORK="$(umask 077; mktemp -d "${TMPDIR:-/tmp}/release-agent.XXXXXX")" || exit 2
trap 'rm -rf "$WORK"' EXIT
AUTH="$WORK/auth"
BODY="$WORK/body"
API_CODE=000
KEPT_AUTH="$STATE_DIR/github-auth"
KEPT_UNTIL="$STATE_DIR/github-auth.expires"
AUTH_KEPT=0
ETAGS="$STATE_DIR/etags"
# The answers of commits and runs gone from dev's list are not asked for again.
find "$ETAGS" -type f -mtime +2 -exec rm -f {} + 2>/dev/null

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
say() { echo "[$(now)] [release-agent $INSTANCE] $*"; }

# ------------------------------------------------------------------ the lock
# systemd never starts the unit twice, the lock covers a run by hand next to the timer.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$STATE_DIR/lock"
  flock -n 9 || { say "another run holds $STATE_DIR/lock"; exit 0; }
fi

# ---------------------------------------------------------- journal and state
# Every write is atomic: jq into a temporary file in the same folder, then mv.
jwrite() { # <file> <jq filter> [jq args…]
  local file="$1" tmp; shift
  tmp="$(mktemp "$file.XXXXXX")" || return 1
  if jq "$@" "$file" >"$tmp"; then mv "$tmp" "$file"; else rm -f "$tmp"; return 1; fi
}
[ -s "$JOURNAL" ] || jq -n --arg i "$INSTANCE" --arg h "$(hostname)" \
  '{schema: "upready-store.release-journal/1", instance: $i, host: $h, records: []}' >"$JOURNAL"

SWITCH="unknown"; SWITCH_REASON="not read yet"; GITHUB_STATE="not reached yet"; DEV_HEAD=""; WAITING=""
write_state() {
  local tmp; tmp="$(mktemp "$STATE.XXXXXX")" || return 0
  jq -n --arg i "$INSTANCE" --arg h "$(hostname)" --arg t "$(now)" \
    --arg sw "$SWITCH" --arg swv "$SWITCH_VAR" --arg swr "$SWITCH_REASON" \
    --arg gh "$GITHUB_STATE" --arg head "$DEV_HEAD" --arg wait "$WAITING" --slurpfile j "$JOURNAL" '
    ($j[0].records) as $r |
    {schema: "upready-store.release-state/1", instance: $i, host: $h, updated: $t,
     switch: {value: $sw, variable: $swv, reason: $swr},
     github: $gh,
     dev_head: (if $head == "" then null else $head end),
     waiting: (if $wait == "" then null else $wait end),
     current: ([$r[] | select(.result == "running")] | last | if . then {id, sha, start} else null end),
     last: ([$r[] | select(.result != "running")] | last | if . then {id, sha, result, end} else null end)}' >"$tmp" \
    && mv "$tmp" "$STATE" || rm -f "$tmp"
}

# A record left «running» means the run that wrote it died: this run holds the lock, so no other one is
# releasing. It becomes «interrupted», and its status is published on this tick.
jwrite "$JOURNAL" --arg t "$(now)" '.records |= map(if .result == "running"
  then .result = "interrupted" | .end = $t | .published = false
     | .reason = "the agent stopped during the release (a reboot or a kill); the step it reached is in its log"
  else . end)'

# -------------------------------------------------------------------- GitHub
api() { # <METHOD> <path> [json body]: the body lands in $BODY, the HTTP code in $API_CODE; 0 on a 2xx or 304
  local args key="" tag=""
  args=(-sS -m 30 -o "$BODY" -D "$WORK/headers" -w '%{http_code}' -X "$1" -H @"$AUTH"
        -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28')
  [ -n "${3:-}" ] && args+=(-H 'Content-Type: application/json' --data "$3")
  # A GET asks with the ETag of its last answer. 304 means unchanged: the kept body is the answer, and
  # GitHub does not count the call against the limit. Every tick asks the same three things (the switch,
  # the commits and the runs of dev), so an hour with nothing new takes nothing from the limit.
  if [ "$1" = GET ]; then
    key="$ETAGS/$(printf '%s' "$2" | tr -c 'A-Za-z0-9._-' '_')"
    if [ -s "$key.etag" ] && [ -f "$key.body" ]; then tag="$(cat "$key.etag")"; args+=(-H "If-None-Match: $tag"); fi
  fi
  : >"$BODY"; : >"$WORK/headers"
  API_CODE="$(curl "${args[@]}" "$API$2" 2>/dev/null)" || API_CODE=000
  if [ "$API_CODE" = 401 ] && [ "$AUTH_KEPT" = 1 ]; then
    # The token of an earlier tick was refused (revoked, the App reinstalled): a new one, and this call once more.
    say "the kept installation token was refused (HTTP 401): signing in again"
    rm -f "$KEPT_AUTH" "$KEPT_UNTIL"; AUTH_KEPT=0
    github_sign_in || return 1
    api "$@"; return
  fi
  case "$API_CODE" in
    304) [ -n "$tag" ] || return 1; touch "$key.etag" "$key.body"; cp "$key.body" "$BODY" ;;
    2??)
      if [ -n "$key" ]; then
        tag="$(sed -n 's/^[Ee][Tt][Aa][Gg]:[[:space:]]*//p' "$WORK/headers" | tr -d '\r' | tail -1)"
        if [ -n "$tag" ] && cp "$BODY" "$key.body"; then printf '%s\n' "$tag" >"$key.etag"; else rm -f "$key.etag"; fi
      fi ;;
    *) return 1 ;;
  esac
}
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
app_jwt() {
  local t h p s
  t="$(date +%s)"
  h="$(printf '%s' '{"alg":"RS256","typ":"JWT"}' | b64url)"
  p="$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' "$((t - 60))" "$((t + 540))" "$GITHUB_APP_ID" | b64url)"
  s="$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -sign "$GITHUB_APP_KEY_FILE" | b64url)" || return 1
  [ -n "$s" ] || return 1
  printf '%s.%s.%s' "$h" "$p" "$s"
}
github_sign_in() {
  AUTH="$WORK/auth"; AUTH_KEPT=0
  ( umask 077; : >"$AUTH" )
  if [ -n "${GITHUB_TOKEN_FILE:-}" ]; then
    [ -r "$GITHUB_TOKEN_FILE" ] || { GITHUB_STATE="error: the token file $GITHUB_TOKEN_FILE is not readable"; return 1; }
    printf 'Authorization: Bearer %s\n' "$(tr -d '[:space:]' <"$GITHUB_TOKEN_FILE")" >"$AUTH"
    return 0
  fi
  if [ -z "${GITHUB_APP_ID:-}" ] || [ ! -r "${GITHUB_APP_KEY_FILE:-}" ]; then
    GITHUB_STATE="error: no credentials (GITHUB_APP_ID and a readable GITHUB_APP_KEY_FILE, or GITHUB_TOKEN_FILE)"
    return 1
  fi
  # The installation token of an earlier tick, while it has more than five minutes left: no call at all.
  local jwt inst token ends tmp
  ends="$(cat "$KEPT_UNTIL" 2>/dev/null)"
  if [ -s "$KEPT_AUTH" ] && [ "${ends:-0}" -gt "$(($(date +%s) + 300))" ] 2>/dev/null; then
    AUTH="$KEPT_AUTH"; AUTH_KEPT=1; return 0
  fi
  jwt="$(app_jwt)" || { GITHUB_STATE="error: could not sign the App token with $GITHUB_APP_KEY_FILE"; return 1; }
  printf 'Authorization: Bearer %s\n' "$jwt" >"$AUTH"
  inst="${GITHUB_APP_INSTALLATION_ID:-}"
  if [ -z "$inst" ]; then
    api GET "/repos/$REPO/installation" || { GITHUB_STATE="error: the App is not installed on $REPO (HTTP $API_CODE)"; return 1; }
    inst="$(jq -r '.id // empty' "$BODY")"
  fi
  api POST "/app/installations/$inst/access_tokens" '{}' || { GITHUB_STATE="error: no installation token (HTTP $API_CODE)"; return 1; }
  token="$(jq -r '.token // empty' "$BODY")"
  ends="$(jq -r '.expires_at // empty | fromdateiso8601' "$BODY" 2>/dev/null)"
  : >"$BODY"; : >"$AUTH"
  [ -n "$token" ] || { GITHUB_STATE="error: the installation token answer had no token"; return 1; }
  # Kept for the next ticks: mktemp makes the file 600, mv puts it in place whole.
  if tmp="$(mktemp "$KEPT_AUTH.XXXXXX")" && printf 'Authorization: Bearer %s\n' "$token" >"$tmp" && mv "$tmp" "$KEPT_AUTH"; then
    printf '%s\n' "${ends:-0}" >"$KEPT_UNTIL"; AUTH="$KEPT_AUTH"
  else
    rm -f "$tmp"; printf 'Authorization: Bearer %s\n' "$token" >"$AUTH"
  fi
}

publish() { # <sha> <pending|success|failure|error> <description>: the commit status release/<instance>
  local body
  body="$(jq -nc --arg s "$2" --arg c "$CONTEXT" --arg d "$3" '{state: $s, context: $c, description: ($d | .[0:140])}')"
  api POST "/repos/$REPO/statuses/$1" "$body"
}
status_of() { # <record json>: the status a finished record publishes
  jq -r 'if .result == "success" then "success" else "failure" end' <<<"$1"
}
description_of() { # <record json>
  jq -r 'if .result == "success" then "released \(.end)"
         elif .result == "interrupted" then "interrupted: \(.reason)"
         else "failed at step \(.step) (\(.step_name)): \(.reason)" end' <<<"$1"
}
republish() { # statuses a past tick could not publish
  local ids id rec
  ids="$(jq -r '.records[] | select(.published == false and .result != "running") | .id' "$JOURNAL")"
  for id in $ids; do
    rec="$(jq -c --arg id "$id" '.records[] | select(.id == $id)' "$JOURNAL")"
    if publish "$(jq -r .sha <<<"$rec")" "$(status_of "$rec")" "$(description_of "$rec")"; then
      jwrite "$JOURNAL" --arg id "$id" '.records |= map(if .id == $id then .published = true else . end)'
      say "published the status of $id"
    fi
  done
}

read_switch() {
  if api GET "/repos/$REPO/actions/variables/$SWITCH_VAR"; then
    local v; v="$(jq -r '.value // ""' "$BODY" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
    case "$v" in
      on|true|1|yes) SWITCH=on; SWITCH_REASON="$SWITCH_VAR = $v" ;;
      *) SWITCH=off; SWITCH_REASON="$SWITCH_VAR = ${v:-<empty>}" ;;
    esac
  elif [ "$API_CODE" = 404 ]; then
    SWITCH=off; SWITCH_REASON="the variable $SWITCH_VAR does not exist: off until Ivan sets it to on"
  else
    SWITCH=unknown; SWITCH_REASON="could not read $SWITCH_VAR (HTTP $API_CODE): treated as off"
  fi
}

# ---------------------------------------------------------------- the choice
CHECKS_RUN=""
checks_green() { # <sha>: 0 when the newest pr-checks run of the sha passed every required job
  local run status conclusion missing
  run="$(jq -c --arg s "$1" '[.workflow_runs[] | select(.head_sha == $s)] | sort_by(.created_at) | last // empty' "$WORK/runs.json")"
  [ -n "$run" ] || { WHY="no $WORKFLOW run yet"; return 1; }
  CHECKS_RUN="$(jq -r .id <<<"$run")"
  status="$(jq -r .status <<<"$run")"; conclusion="$(jq -r '.conclusion // ""' <<<"$run")"
  [ "$status" = completed ] || { WHY="checks $status (run $CHECKS_RUN)"; return 1; }
  [ "$conclusion" = success ] || { WHY="checks $conclusion (run $CHECKS_RUN)"; return 1; }
  api GET "/repos/$REPO/actions/runs/$CHECKS_RUN/jobs?per_page=100" || { WHY="could not read the jobs of run $CHECKS_RUN (HTTP $API_CODE)"; return 1; }
  missing="$(jq -r --arg req "$REQUIRED_JOBS" '
    [.jobs[] | {name, conclusion}] as $jobs |
    [$req | split("|")[] | select(. as $n | [$jobs[] | select(.name == $n and .conclusion == "success")] | length == 0)] | join(", ")' "$BODY")"
  [ -z "$missing" ] || { WHY="required checks not green in run $CHECKS_RUN: $missing"; return 1; }
}
intl_released() { # <sha>: 0 when the INTL agent published release/intl = success on it
  api GET "/repos/$REPO/commits/$1/status" || { WHY="could not read the statuses (HTTP $API_CODE)"; return 1; }
  local st; st="$(jq -r '[.statuses[] | select(.context == "release/intl")] | first | .state // "none"' "$BODY")"
  [ "$st" = success ] || { WHY="INTL has not released it (release/intl: $st)"; return 1; }
}

choose() { # sets CHOSEN, or WAITING when nothing is due
  CHOSEN=""; WAITING=""
  api GET "/repos/$REPO/commits?sha=$BRANCH&per_page=$DEPTH" || { GITHUB_STATE="error: commits of $BRANCH (HTTP $API_CODE)"; return 1; }
  jq -r '.[].sha' "$BODY" >"$WORK/shas"
  DEV_HEAD="$(head -1 "$WORK/shas")"
  api GET "/repos/$REPO/actions/workflows/$WORKFLOW/runs?branch=$BRANCH&per_page=50" || { GITHUB_STATE="error: runs of $WORKFLOW (HTTP $API_CODE)"; return 1; }
  cp "$BODY" "$WORK/runs.json"
  local last sha first_why=""
  last="$(jq -r '[.records[] | select(.kind == "release" or .kind == "adopted")] | last | .sha // ""' "$JOURNAL")"
  while read -r sha; do
    [ -n "$sha" ] || continue
    [ "$sha" = "$last" ] && break
    if jq -e --arg s "$sha" 'any(.records[]; .sha == $s)' "$JOURNAL" >/dev/null; then continue; fi
    WHY=""
    if [ "$INSTANCE" = ru ] && ! intl_released "$sha"; then :
    elif checks_green "$sha"; then CHOSEN="$sha"; return 0
    fi
    [ -n "$first_why" ] || first_why="$BRANCH ${sha:0:8}: $WHY"
  done <"$WORK/shas"
  if [ -n "$first_why" ]; then WAITING="$first_why"
  else WAITING="nothing new on $BRANCH since ${last:0:8}"; fi
  return 0
}

# ------------------------------------------------------------------ the release
STEP_NAMES=(prepare "release tree" build instance-check "pre-migration dump" up verify rollback)
reds() { grep -E "FAIL GET" "$1" 2>/dev/null | sed -E 's/.*FAIL GET ([^ ]+).*/\1/' | sort -u; }

prepare_tree() { # <sha> <stage dir>: only the paths of deploy/release-paths.txt reach the disk
  local sha="$1" stage="$2" mem prefix paths p members=()
  mem="$(umask 077; mktemp -d "$TMP_ROOT/upready-store-release.XXXXXX")" || { REASON="no folder in $TMP_ROOT"; return 1; }
  if ! curl -sS -L -m 900 -o "$mem/release.tgz" -H @"$AUTH" "$API/repos/$REPO/tarball/$sha" 2>"$mem/err"; then
    REASON="tarball download: $(tail -1 "$mem/err")"; rm -rf "$mem"; return 1
  fi
  tar -tzf "$mem/release.tgz" >"$mem/list" 2>/dev/null || { REASON="the tarball does not open"; rm -rf "$mem"; return 1; }
  prefix="$(grep -m1 / "$mem/list" | cut -d/ -f1)"
  paths="$(tar -xzOf "$mem/release.tgz" "$prefix/deploy/release-paths.txt" 2>/dev/null | sed -e 's/#.*//' -e 's/[[:space:]]*$//' -e '/^$/d')"
  [ -n "$paths" ] || { REASON="no deploy/release-paths.txt in ${sha:0:8}"; rm -rf "$mem"; return 1; }
  for p in $paths; do
    case "$p" in /*|*..*) REASON="deploy/release-paths.txt names a path outside the tree: $p"; rm -rf "$mem"; return 1 ;; esac
    grep -qxF -e "$prefix/$p" -e "$prefix/$p/" "$mem/list" || { REASON="${sha:0:8} has no $p (deploy/release-paths.txt)"; rm -rf "$mem"; return 1; }
    members+=("$prefix/$p")
  done
  rm -rf "$stage"; mkdir -p "$stage"
  tar -xzf "$mem/release.tgz" -C "$stage" --strip-components=1 "${members[@]}" 2>"$mem/err" \
    || { REASON="extract: $(tail -1 "$mem/err")"; rm -rf "$mem"; return 1; }
  rm -rf "$mem"
}

finish() { # <id> <sha> <result> <step|""> <reason> [new reds]
  local id="$1" sha="$2" result="$3" step="$4" reason="$5" new="${6:-}" name="" rec
  [ -n "$step" ] && name="${STEP_NAMES[$step]:-step $step}"
  jwrite "$JOURNAL" --arg id "$id" --arg t "$(now)" --arg r "$result" --arg st "$step" --arg n "$name" \
    --arg why "$reason" --arg new "$new" '.records |= map(if .id == $id then
      .end = $t | .result = $r | .reason = (if $why == "" then null else $why end)
      | .step = (if $st == "" then null else ($st | tonumber) end) | .step_name = (if $n == "" then null else $n end)
      | .new_reds = ($new | split(" ") | map(select(. != ""))) | .published = false
    else . end)'
  rec="$(jq -c --arg id "$id" '.records[] | select(.id == $id)' "$JOURNAL")"
  if publish "$sha" "$(status_of "$rec")" "$(description_of "$rec")"; then
    jwrite "$JOURNAL" --arg id "$id" '.records |= map(if .id == $id then .published = true else . end)'
  else
    say "could not publish $CONTEXT on ${sha:0:8} (HTTP $API_CODE): the next tick tries again"
  fi
  say "$id: $result${step:+ at step $step ($name)}${reason:+: $reason}"
}

release() { # <sha>
  local sha="$1" id dir stage code step new left u c i
  id="$INSTANCE-$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:8}"
  dir="$STATE_DIR/logs/$id"; stage="$STATE_DIR/stage/$sha"
  mkdir -p "$dir"
  jwrite "$JOURNAL" --arg id "$id" --arg s "$sha" --arg i "$INSTANCE" --arg t "$(now)" --arg log "$dir" \
    --arg run "$CHECKS_RUN" --arg sw "$SWITCH_REASON" \
    '.records += [{id: $id, sha: $s, instance: $i, kind: "release", start: $t, end: null, result: "running",
      step: null, step_name: null, reason: null, log: $log,
      checks_run: (if $run == "" then null else ($run | tonumber) end),
      after: (if $i == "ru" then "release/intl = success" else "required checks green" end),
      switch: $sw, new_reds: [], published: false}]'
  WAITING=""; write_state
  publish "$sha" pending "started $(now)" || say "could not publish pending on ${sha:0:8} (HTTP $API_CODE)"
  say "$id: releasing $sha (checks run $CHECKS_RUN), log $dir"

  REASON=""
  prepare_tree "$sha" "$stage" || { finish "$id" "$sha" failure 0 "$REASON"; return 0; }
  local deploy="$stage/deploy/scripts/deploy-instance.sh"
  [ -x "$deploy" ] || { finish "$id" "$sha" failure 0 "${sha:0:8} has no executable deploy/scripts/deploy-instance.sh"; rm -rf "$stage"; return 0; }

  DEPLOY_LOG_DIR="$dir" "$deploy" "$INSTANCE" "$sha" --on-host --env-file "$ENV_FILE" --verify-only >"$dir/baseline.out" 2>&1
  say "$id: baseline, $(reds "$dir/baseline.out" | grep -c .) red check(s) on the live stack before the release"
  DEPLOY_LOG_DIR="$dir" "$deploy" "$INSTANCE" "$sha" --on-host --env-file "$ENV_FILE" >"$dir/release.out" 2>&1
  code=$?
  rm -rf "$stage"
  step="$(sed -n 's/.*RESULT exit=[0-9]* step=\([0-9]*\).*/\1/p' "$dir/release.out" | tail -1)"
  if [ "$code" = 0 ]; then finish "$id" "$sha" success "" ""; return 0; fi
  if [ "$step" != 6 ] || ! grep -q "VERIFY FAILED" "$dir/release.out"; then
    REASON="$(grep -E 'FAILED' "$dir/release.out" | tail -1 | sed -E 's/^\[[^]]*\] \[[^]]*\] //' | cut -c1-300)"
    finish "$id" "$sha" failure "${step:-0}" "${REASON:-exit $code with no FAILED line, see $dir/release.out}"
    return 0
  fi
  # Step 6 is red. Red before the release too is a known red; a new red gets the grace to come back.
  new="$(comm -23 <(reds "$dir/release.out") <(reds "$dir/baseline.out") | tr '\n' ' ')"
  if [ -z "${new// /}" ]; then
    finish "$id" "$sha" success "" "only checks already red before the release: $(reds "$dir/release.out" | tr '\n' ' ')"
    return 0
  fi
  for i in $(seq 1 "$GRACE_TRIES"); do
    left=""
    for u in $new; do
      c="$(curl -sS -o /dev/null -m 15 -w '%{http_code}' "$u" 2>/dev/null)" || c=000
      [ "$c" = 200 ] || left="$left $u"
    done
    say "$id: grace $i/$GRACE_TRIES, still red:${left:- none}"
    [ -n "$left" ] || { finish "$id" "$sha" success "" "came back within the grace: $new"; return 0; }
    new="$left"
    [ "$i" = "$GRACE_TRIES" ] || sleep "$GRACE_SLEEP"
  done
  finish "$id" "$sha" failure 6 "red after the release and not before it:$new" "$new"
}

# ---------------------------------------------------------------------- tick
if ! github_sign_in; then say "$GITHUB_STATE"; write_state; exit 0; fi
GITHUB_STATE="ok"
republish
read_switch
if [ "$SWITCH" != on ]; then
  WAITING="the switch: $SWITCH_REASON"
  write_state; exit 0
fi
if ! choose; then say "$GITHUB_STATE"; write_state; exit 0; fi
if [ -z "$CHOSEN" ]; then write_state; exit 0; fi
release "$CHOSEN"
write_state
exit 0
