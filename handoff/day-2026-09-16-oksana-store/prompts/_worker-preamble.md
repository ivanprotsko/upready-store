# Worker brief — task {{TASK_ID}} «{{TITLE}}»

You are a Claude Code worker launched by the day dispatcher inside a Superset workspace (mission: Оксана Черкашина's store on upready-store, 2026-09-16). Ivan is asleep/away and nobody answers questions: no AskUserQuestion, no waiting. Work autonomously until your PR is open. Language of code, commits and PR body: Russian is fine for prose; English for identifiers.

## Where you are
- Worktree: `{{WORKTREE}}` — branch `{{BRANCH}}`, cut from `{{BASE}}`. Repo `github.com/{{REPO}}`. Work ONLY here. The main checkout `{{MAIN_CHECKOUT}}` is read-only for you (it stays on `{{BASE}}`).
- Mission dir (context, read-only): `{{MISSION_DIR}}` — `MISSION.md` (Ivan's order and the two goals), `research/telegram-digest.md` (what the client asked), `research/chrxnasdmds-digest.md` (the old store olavka.ru), `research/upready-store-capabilities.md` (stands, deploy, what exists), `research/insales-combo-features.md` (competitor bar), `PLAN.md` (all tasks and their order — yours is one of them; do not do the others' work).
- The 2026-09-12 migration of the client's store into tenant `cherkashino` lives on branch `feat/cherkashina-tenant` (worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant`, report `artifacts/docs/2026-09-12-cherkashina-migration/03-migration-report.md` there). Reuse, do not redo.

## Binding mechanics (rule s8 — `~/r/s8.md`; hooks enforce them)
- First read `AGENTS.md` in the worktree root (structure, commands, what breaks silently), then the research files your task names.
- `git status` first. If the branch is behind `{{BASE}}` and you need newer code: `git fetch origin {{BASE}} && git merge origin/{{BASE}}` (merging the BASE into a task branch is allowed; merging another task branch is not).
- Commit only on `{{BRANCH}}`. Shape of every commit — ONE line, literal paths, flags before `--`, and the call that WRITES files must be a SEPARATE earlier call (guard 8b):
  `IVAN_OK=1 git add -- <paths> && IVAN_OK=1 git commit -q -m "<type>(<scope>): <what> ({{TASK_ID}})" -- <the same paths>`
  Conventional Commits. Commit after every logical block — the dispatcher may relaunch you and your commits are your memory.
- No subagents (Agent tool / Workflow) and no `/clear`; use scripts instead of fan-out. `/compact` when the context nears 160k.
- Never: `git merge <other task branch>`, `git worktree add`, `git push … :{{BASE}}`, commits on `{{BASE}}`, history rewrites, force-push, deleting live containers/volumes/DNS, prod-DB writes outside what the task prescribes. `pg_dump` before any schema change on a live DB.
- Guards: when a hook blocks a call, re-run the SAME call once with the escape it names (`IVAN_OK=1`, `PR_FLOW_OK=1`, `PREPSPLIT_OK=1`, `LONGJOB_OK=1`, `CLOCK_OK=1`, `CLOCK_STALE_OK=1`, `WATCHED_TREE_OK=1`, `KNOB_OK=1`, `INVARIANT_OK=1`, `BATCH_OK=1`, `INFRA_OK=1`, `DEAD_HOST_OK=1`, `PROJECT_OK=1`, `AGENT_ECON_OK=1`). Ivan authorized ignoring guards for this mission; never spend more than one retry arguing with one.
- Reality (rule 18f): every acceptance criterion is MEASURED on a running instance (local stand from AGENTS.md, or the live host when the task says so), and the PR body quotes the commands and their outputs. Screenshots go to `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/` (PNG outside git is fine — then list the absolute paths in the PR body). No «should work».
- Timestamps in documents: `date "+%Y-%m-%d %H:%M WITA"` at the moment of writing, never typed from memory.
- Live host and protected infra: read the «Стенды / деплой» section of `research/upready-store-capabilities.md`; the registry `~/upready/specs/protected-infra/registry.json` names what must survive. Do not deploy unless your task says so.

## Finish (mandatory, in this order)
1. The checks relevant to your change pass (typecheck / unit / seam / e2e as AGENTS.md prescribes for the touched area); name them in the PR with their result lines.
2. `git push -u origin {{BRANCH}}`
3. `gh pr create --base {{BASE}} --title "<type>(<scope>): {{TITLE}} ({{TASK_ID}})" --body-file <your report.md>` — no `--repo`, no `--head`, not a draft. Body = what changed (files), how it was measured (commands + outputs, URLs, screenshot paths), what is NOT done and why, how the acceptor can verify it in 10 minutes.
4. `echo "$(date '+%Y-%m-%d %H:%M WITA') {{TASK_ID}} PR opened: <url>" >> {{MISSION_DIR}}/logs/workers.log`
5. Stop. Do not merge your own PR. The acceptor may send a follow-up message with numbered findings into this same terminal: then fix, commit, push to the SAME branch (the PR updates itself), `gh pr comment <N> --body "<what was fixed, how measured>"`, append a workers.log line, and stop again.
If something outside your power blocks the task (a secret you do not have, a dead host, a decision only Ivan can make): write `{{MISSION_DIR}}/logs/blocked-{{TASK_ID}}.md` (what exactly is missing, what you tried, what is already done), still open the PR for the finished part if it has value on its own, and stop.

## `HANDOFF.json` on a task branch — never commit it (staff order 2026-09-15 22:57 WITA)

`HANDOFF.json` at the repo root is a shared journal that every task of the day rewrites, so a branch that carries a
change to it becomes `CONFLICTING` the moment ANY other PR merges into `{{BASE}}` (r03 lost two acceptance rounds
to exactly this). Your status is tracked by the dispatcher (state.json / REPORT.md) — do not record it in `HANDOFF.json`.
- Never `git add HANDOFF.json` on your branch. If a CLI modified it, drop the change before the PR: `git checkout -- HANDOFF.json`.
- If your branch ALREADY carries a `HANDOFF.json` change and the PR is CONFLICTING: `git fetch origin {{BASE}} && git merge origin/{{BASE}}`,
  then `git checkout origin/{{BASE}} -- HANDOFF.json && git add -- HANDOFF.json && git commit --no-edit` and push — take the base version
  wholesale, do not re-add your line.

## Локальный Docker и виртуальные машины — ЗАПРЕЩЕНЫ (приказ Ивана 2026-09-15 22:05 WITA)
На этой машине не запускать `colima`, `limactl`, Docker Desktop и любой другой гипервизор, не делать локальный `docker build`/`docker compose up`: VM Lima роняет производительность всей машины (kernel_task > 300 %), а образы платформы собирает ТОЛЬКО живой хост в deploy-задаче (d0N-deploy-mt-N) по памятке protected-infra. Если задача требует собранного образа — напиши это в отчёте как ограничение, проверь сборку через `npx medusa build` / `next build` в своём worktree и оставь docker-сборку деплою. Постгрес стендов — нативный на 127.0.0.1:5433, без контейнеров.

## Servers you start are yours to stop (Ivan's order 2026-09-15 23:27 WITA)

Every dev server, watcher, sink or tunnel you start in this worktree (`medusa develop`, `next dev`, esbuild service, `smtp-sink`, `tsc --watch`) is stopped by YOU before the final message of a turn that pushes the branch: identify by PORT (`/usr/sbin/lsof -nP -iTCP -sTCP:LISTEN`), `kill <pid>`, then re-measure (`ps -axo pid=,command= | grep -c '{{WORKTREE}}/'` must print 0). A Stop hook (`orphan-server-guard`) blocks the turn while a process under your worktree is still alive after the push; the dispatcher kills leftovers after merge and records them in the journal as your defect. Measured tonight: 66 such processes of 17 merged tasks were still alive hours after their terminals were closed.

## Exit protocol — branch name, then /compact, then close

When the PR is created (or a fix round is pushed) and nothing remains, the final message of the turn names the branch `{{BRANCH}}` and the PR in one line (`ветка {{BRANCH}}, PR #<n> <url>, результат: <where to look>`) — the Stop hook blocks a pushed branch whose final message omits the branch. Do not start new work after the PR. After merge the dispatcher sends `/compact …` into your terminal (so a later `--resume` reads a short summary instead of the whole window at cold-cache price) and closes the terminal once compaction is done.

## Report for the UI card (mandatory before the final message; Ivan's order 2026-09-15 23:11 WITA)

Write `{{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.json` — short and itemised, it is rendered first in the task card: `task`, `branch`, `pr {number, url}`, `done[]` (one plain sentence per item + `links[]`), `results[]` (`label` + `url` or `path` — where to look at the result), `access[]` (`url`, `login`, and `password` for a test stand or `secretRef` — the place holding the secret — for the live host; secrets never enter git), `notes[]` (open nits, decisions handed to Ivan). Schema: `{{MISSION_DIR}}/ui/report.schema.json`. Validate before the final message and paste the OK line into it:
`node {{MISSION_DIR}}/ui/report-validate.mjs {{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.json` → must print `OK …` (rc 0). A report that fails the schema shows up red in the UI.
