# Tenant panel, wave 2: rules shared by every worker piece

Tasks `t-2026-09-11-mt-panel-wave-2` (pieces 1–8) and `t-2026-09-12-mt-storefront-by-host` (piece 9)
in repository upready-store. You work inside ONE git worktree named in your piece prompt and nowhere
else. Read `AGENTS.md` at the worktree root first, then `docs/tenant-panel/api-contract.md` in full
(the wave-2 section at the end is your contract), then `apps/tenant-panel/README.md` (Deviations).

Discipline:
- Never run `git commit`, `git push`, `git merge`, `git rebase`, `git checkout` or `git stash`. The
  orchestrator commits your work from your worktree. Leave files on disk.
- Never touch other worktrees, `~/upready/projects/*`, the processes on ports 9023, 9026, 5180, 5181,
  8000–8002, 8010, or any process you did not start. Processes you start run on the ports your piece
  prompt assigns, log to a file under `/tmp` (`> /tmp/<name>.log 2>&1`), and are killed by you before
  you finish. Long commands (installs, test suites) go to a log file first; read the file after.
- Never write to `pnpm-lock.yaml` or add dependencies. Everything is installed (`node_modules` exists
  in your worktree). A truly missing dependency = stop and report blocked.
- Copy Admin files verbatim from `<worktree>/apps/backend/node_modules/@medusajs/dashboard/src`
  (2.19.0), keeping the relative path under `apps/tenant-panel/src`. Change a copied file only where
  your piece allows it and mark every changed spot with `// tenant-panel: <what and why>`. Screens
  must compare with the Admin by screenshot and by diff; that is Ivan's acceptance criterion.
- Backend routes in `apps/backend/src/api/tenants/**` (and `api/store/tenant/**`, `api/storefront/**`
  where your piece says so) reuse the Admin's own validators and query-configs
  (`@medusajs/medusa/api/admin/<resource>/validators|query-config`) through
  `validateAndTransformQuery`/`validateAndTransformBody` in `src/api/middlewares.ts`, under YOUR
  piece's `// ---- piece N` anchor. Never set `allowed` with `*` names in a query-config. Scope by
  module links (`api/tenants/tenant-scope.ts`), foreign id = 404, and every write verb checks
  ownership before the workflow. Read the existing `tenants/products/[id]/route.ts` and
  `tenants/orders/route.ts` as the pattern before writing a route.
- Stay in scope. A file a screen needs → copy it verbatim. An endpoint the contract lacks → add it in
  the contract's style and list it in your report as "contract gap". No new product features.
- Do not bluff. Every claim in the report is backed by a command you ran and its output, return codes
  in brackets (`tsc rc=[0]`). A check you did not run is listed as not run. Never `$PIPESTATUS`
  (zsh): write `cmd > /tmp/x.log 2>&1; echo rc=[$?]`.
- Progress on disk (protocol 22i): after every milestone append `HH:MM — milestone` to
  `<worktree>/.ai/progress.md` and run
  `node ~/upready/.ai/scripts/orchestrator.mjs emit --task <piece-id> --kind progress --summary "<milestone>" --worker <piece-id>`;
  on completion `--kind done`, on a hard block `--kind blocked`. The orchestrator cannot answer while
  you run: decide, document, continue.
- Final message = the report (plain English): what was built (files), deviations from upstream
  (file: reason), every verification command with rc and essential output lines, what was not done
  and why, contract gaps. No narrative about your process.

Verification every piece runs before reporting:
1. `cd apps/tenant-panel && corepack pnpm exec tsc --noEmit` and `corepack pnpm exec eslint src` — rc 0
   (warnings inside copied Admin files are allowed, errors are not).
2. `cd apps/backend && corepack pnpm exec tsc --noEmit` and `corepack pnpm exec medusa lint` — rc 0.
3. Seam tests: extend `apps/backend/integration-tests/http/tenants.spec.ts` (or add a sibling
   `tenants-<piece>.spec.ts` reusing its helpers) with the happy path in Admin shape AND the isolation
   path (tenant B gets `count: 0` / 404 on tenant A's rows, and cannot write them). Run ONLY with
   `cd apps/backend && DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=<your seam port> TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules corepack pnpm exec jest --runInBand --forceExit integration-tests/http/<file> > /tmp/<piece>-seam.log 2>&1; echo rc=[$?]`
   (with `DB_HOST=127.0.0.1` or without `DB_USERNAME` the runner cannot connect and every test is red
   — that is the probe, not the code).
4. Live: start YOUR backend from your worktree (`cd apps/backend && PORT=<your backend port> corepack pnpm exec medusa develop > /tmp/<piece>-backend.log 2>&1 &`
   — `.env` is already copied there with the stand DB) and YOUR panel
   (`cd apps/tenant-panel && corepack pnpm exec vite --port <your panel port> --strictPort > /tmp/<piece>-panel.log 2>&1 &`;
   its `.env` points at your backend). Walk your screens in a browser through Playwright
   (`node_modules/.pnpm/playwright@1.63.0/node_modules/playwright` in the worktree root, chromium is
   installed) as `admin@acme.test` / `supersecret`, then as `admin@globex.test` to prove isolation.
   Extend `apps/tenant-panel/e2e/tenant-panel.e2e.mjs` with your screens (env `PANEL_URL`, `BACKEND_URL`);
   run it against your ports; rc 0.
5. Screenshots: extend `scripts/tenant-panel-shots.mjs` with your routes and produce the pair
   `admin-<screen>.png` / `panel-<screen>.png` (1440×900, after skeletons vanish) into
   `artifacts/docs/tenant-panel-shots/` of your worktree (gitignored); Admin side =
   `ADMIN_URL=http://localhost:<your backend port>/app` with `admin@upready.dev` / `supersecret`,
   panel side = your panel port. List the produced files in the report.
6. Kill your backend and panel processes.

Stand facts:
- Postgres `postgres://ivanprotsko@127.0.0.1:5433/upready_store_mt` (shared by every backend; the
  wave-2 migration is already applied). Tenant admins (`POST /auth/tenant/emailpass`):
  `admin@acme.test`, `admin@globex.test`, `admin@initech.test`, password `supersecret`. Acme owns
  9 products and 6+ orders, Globex 3 products, Initech 1. Native Admin login `admin@upready.dev` /
  `supersecret`. Storefronts of the OLD stand: Acme :8000, Globex :8001, Initech :8002 (read-only for
  you; `POST /api/revalidate` with `{"type":"product.created"}` clears their catalog cache).
- The dashboard mounts create screens twice (RouteFocusModal + nested dialog): in Playwright fill every
  `[role="dialog"]` instance and click buttons by coordinates (`page.mouse.click`). Comboboxes are
  ariakit `input[role="combobox"]` without placeholders.
- Worker port table (backend / panel / seam PORT / storefront): piece 4 → 9027 / 5182 / 9041 / –;
  piece 1 → 9028 / 5183 / 9042 / –; pieces 2+3 → 9029 / 5184 / 9043 / –; piece 5 → 9030 / 5185 / 9044 / –;
  piece 6 → 9032 / 5186 / 9045 / –; piece 7 → 9033 / 5187 / 9046 / 8011; piece 8 → 9034 / 5188 / 9047 / 8012;
  piece 9 → 9035 / 5189 / 9048 / 8013.
