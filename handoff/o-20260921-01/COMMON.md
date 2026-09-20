# Order o-20260921-01 — rules common to every worker

Written by the project lead 2026-09-21 02:40 WITA. Binding together with your task brief, `AGENTS.md` in your worktree and `/Users/ivanprotsko/r/s8.md`.

## Ivan's words (verbatim, the only source of scope)

> 1. upready-store - пусть запустить задачи, которые нужно было выполнить, проведут ревью архитектуры, сделают рефакторинг если нужно, с UI там все очень плохо, настолько плохо что у меня руки не доходят до туда, потому что там на неделю моего времени присутствия и контроля, поэтому нужно предпринять всё что можно, чтобы исправить неудобства интерфейса. Там нужна заряженая модель Fable, по крайней мере на интерфейсы, чтобы она думала, проектировала и принимала работу.

> 4. качественный сайт cherkashino созданный на upready-store для реального клиента, с классным визуалом, аккуратно оформленными картинками, а не обрезаными как попало

> ВАЖНО все это нужно сделать круто и качествено готовое к продакшену

> внедряя новый стандарт — в управлении одна умная сессия, а под нем миньоны, но не много, лучше 2-4 но сильно груженных и надолго, часов на 8-12 минумиум. Автокомпакт и все такое → пожалуйста. ТАКЖЕ ИСПОЛЬЗУЙТЕ gemini pro через antigravity CLY "agy"

Ivan is asleep for about 8 hours. Nobody answers questions. Never wait for an answer: decide, write the decision and its reason into your report, move on. You are expected to work for many hours; `/compact` near 160k tokens and continue, never `/clear`.

## How you work

- Work ONLY in your workspace directory on your task branch. The main checkout `/Users/ivanprotsko/upready/projects/upready-store` is read-only for you. The old checkout `/Users/ivanprotsko/upready/projects/cherkashino-store` and the mission folder `/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store` are read-only context.
- No subagents (Agent tool), no Workflow. Use scripts for bulk work.
- Commit after every logical block: `IVAN_OK=1 git add -- <literal paths> && IVAN_OK=1 git commit -q -m "<type>(<scope>): <lowercase subject> (<task-id>)" -- <the same paths>`. The file-writing call is a separate earlier call. One concern per commit, so the lead can review commit by commit. Project commit rules in `AGENTS.md` apply.
- Never `git add HANDOFF.json` on a task branch. Your status lives in the PR.
- Merging the base into your branch is allowed and expected before the PR: `git fetch origin dev && git merge origin/dev`. Merging another task branch is forbidden. Two other workers of this order run in parallel and their PRs will land in `dev` during your run, so merge `origin/dev` at least every three hours and before every push.
- PR early, push often: after your first milestone run `git push -u origin <branch>` and `gh pr create --base dev --draft …` (no `--repo`, no `--head`). Keep pushing to the same PR. When everything is done and verified, `gh pr ready <N>` and print the final envelope. The lead reviews the draft while you work and may send findings into your terminal as one line; handle them at your next natural stopping point.
- Before the PR is marked ready run `bash /Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/pre-pr.sh dev` and paste its `PRE-PR …` block into the PR body. If the script itself is broken, say so with its output and do the same steps by hand.

## Machine and stands

- This Mac has 16 GB of RAM and is shared with other workers tonight. Start only the servers you are measuring with, and stop them as soon as the measurement is done. Before your final message every process you started is stopped: `/usr/sbin/lsof -nP -iTCP -sTCP:LISTEN`, kill by PID, re-measure.
- Docker, colima, lima and any VM are forbidden on this machine (Ivan's order 2026-09-15). Postgres for stands is native on `127.0.0.1:5433`. Create your own database with a name that carries your task id, and drop it before your final message unless the lead needs it for acceptance (then name it in the PR).
- Never start a server on a port that is already listening. Pick free ports and name them in the PR.
- Read `AGENTS.md` for commands, the integration-test traps (`DB_HOST=localhost`, free `PORT`) and the things that break silently.
- A local copy of the client's store: the migration tooling is in `apps/backend/scripts/cherkashina-migration/` and the scripts `apps/backend/src/scripts/seed-cherkashino-pages.ts`, `prefill-cherkashino-requisites.ts`, `import-cherkashina-reviews.ts`, `seed-tenant-home.ts`, `seed-tenants.ts`; the multi-tenant local scenario is `apps/backend/scripts/mt-live-scenario.mjs`; the mission research is in `…/handoff/day-2026-09-16-oksana-store/research/upready-store-capabilities.md`. Public product data and images of the live store may be READ over HTTPS from `https://cherkashino.shipshift.dev` (store API with the publishable key the page itself uses) to build a faithful local dataset.
- The live host, its database, its containers, DNS and the live tenant are OFF LIMITS: no ssh, no writes, no deploy. Live is read-only reference. Do not open `dev.wildberries.ru` or `docs.ozon.ru` from this machine.
- Secrets never enter git, reports or screenshots.

## Reality (rule 18f)

Every acceptance line is MEASURED on a running instance and the PR body quotes commands and outputs. A screenshot you have not looked at is not evidence: open it with the Read tool and judge it by eye. A mode you name (light, dark, 390 px) must be a mode you measured. Enter flows where a human enters them, not by a deep link. Expected values are read from the screen or the data, never derived from the same source file that defines the behaviour. Screenshots go to `artifacts/docs/<task-id>/` in your worktree (binaries stay out of git; list absolute paths in the PR).

## Gemini Pro as an independent critic

Interface units use `agy` (Antigravity CLI, Gemini Pro) as a second pair of eyes, never as the author of product code. Run it synchronously from your worktree, for example `agy -p "<prompt in Russian or English naming the absolute paths of the PNG files to review and the criteria>"`, check `agy --help` first for the model flag and pick a Gemini Pro high model. Ask for a ranked list of concrete visual and usability defects per screenshot. Save the raw answer to `artifacts/docs/<task-id>/gemini-critique-<n>.md`, then write your verdict per finding (valid and fixed, valid and deferred with reason, invalid with reason). If `agy` fails twice, record the output and continue without it.

## Quality bar

Production ready means: designed states for empty, loading, error and long content; keyboard and screen-reader basics (landmarks, labels, focus visible, contrast AA); no layout shift; no hardcoded user-facing strings; 36 storefront locales with real translations when you add a key; light and dark; 1440, 1280, 768 and 390 px. Design tokens come from the existing theme system (`/Users/ivanprotsko/upready/packages/geist-kit/AGENTS.md` is the canon for tokens and spacing, read-only). Nothing is specific to one tenant in code: the client's look comes from tenant data and theme presets.

## Final message

End with exactly one envelope:

`SUPERSET_WORKER_DONE / task: <task-id> / summary: <one line> / files: <paths> / checks: <commands and outcomes> / handoff: <PR url>`

or

`SUPERSET_WORKER_BLOCKED / task: <task-id> / reason: <specific blocker> / needs: <decision, access or dependency>`

After the envelope stay available for review findings on the same branch and PR.
