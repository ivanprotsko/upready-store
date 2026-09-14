# Night wave, tenant panel: rules shared by every worker piece

Task `t-2026-09-11-mt-tenant-panel` in repository upready-store. You work inside ONE git worktree
named in your piece prompt and nowhere else. Read `AGENTS.md` at the worktree root first.

Discipline:
- Never run `git commit`, `git push`, `git merge`, `git rebase`, `git checkout` or `git stash`. The
  orchestrator commits your work from your worktree. Leave files on disk.
- Never touch other worktrees, `~/upready/projects/*`, the running backend on port 9023, the
  storefronts on 8000-8002, or any process you did not start. Processes you start (a dev server, a
  test backend) run on the port your prompt assigns, log to a file under `/tmp`, and are killed by
  you before you finish.
- Never write to `pnpm-lock.yaml` or add dependencies. Everything you need is installed. If a
  dependency is truly missing, stop and report it as blocked.
- Copy Admin files verbatim. The source of truth is `<worktree>/apps/backend/node_modules/@medusajs/dashboard/src`
  (version 2.19.0). A copied file keeps its relative path under `apps/tenant-panel/src`, so relative
  imports keep working. Change a copied file only where the piece prompt allows it, and write a
  one-line comment `// tenant-panel: <what changed and why>` at every changed spot, so the diff
  against upstream stays reviewable.
- Stay in scope. If a screen needs a file or an endpoint the prompt does not mention, add the file
  (copied verbatim) or report the endpoint gap. Do not build new product features.
- Do not bluff. Every claim in your final report is backed by a command you ran and its output
  (return codes in brackets, e.g. `tsc rc=[0]`). A check you did not run is listed as not run.
- Progress on disk (protocol 22i): after every milestone append one line to
  `<worktree>/.ai/progress.md` (`HH:MM — milestone`) and run
  `node ~/upready/.ai/scripts/orchestrator.mjs emit --task <piece-id> --kind progress --summary "<milestone>" --worker <piece-id>`.
  On completion emit `--kind done`, on a hard block `--kind blocked`. The orchestrator reads only the
  disk and your final message; it cannot answer questions while you run, so decide and document.
- Final message = the report (plain text, English): what was done, deviations from upstream files
  (file: reason), every verification command with its return code and the essential output lines,
  what was not done and why. No prose about your process.

Stand facts:
- Backend `http://localhost:9023` (`medusa develop` from the feat/mt-vendors worktree, Postgres
  `postgres://ivanprotsko@127.0.0.1:5433/upready_store_mt`). Native Admin `http://localhost:9023/app`
  with `admin@upready.dev` / `supersecret`.
- Tenant admins (`POST /auth/tenant/emailpass`): `admin@acme.test`, `admin@globex.test`,
  `admin@initech.test`, password `supersecret`. Acme owns 4 products, Globex 2, Initech 1.
- Storefronts: Acme `http://localhost:8000`, Globex `http://localhost:8001`, Initech `http://localhost:8002`.
- Contract for `/tenants/*`: `<worktree>/docs/tenant-panel/api-contract.md`. Read it before coding.
