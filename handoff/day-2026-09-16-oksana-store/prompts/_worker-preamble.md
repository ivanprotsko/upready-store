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
