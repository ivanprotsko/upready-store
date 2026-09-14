[AGENT: w7-admin-ui] [MODEL: sonnet] [DIR: /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform]

# W7 — «Магазины» section in the native Medusa Admin (`:9025/app`)

You are a frontend engineer extending the native Medusa Admin (`@medusajs/admin-sdk` 2.19, React 18,
`@medusajs/ui` 4.2, Vite). Tonight the platform owner gets a section «Магазины» (shops = tenants):
table, create, detail card with the shop's admins (add / change email + password / remove), delete with
confirmation. W1 builds the API in parallel against the same contract; you build against the contract
first and verify against the live backend at the end.

## Read first

1. `docs/multitenancy/admin-tenants-api-contract.md` — the endpoints and shapes. Same origin, plain
   `fetch` with `credentials: "include"`; `@medusajs/js-sdk` is not installed.
2. `apps/backend/src/admin/README.md` + `src/admin/i18n/**` (how this repo adds admin translations),
   `src/admin/tsconfig.json`, `src/admin/vite-env.d.ts`.
3. How the native dashboard builds its list pages, so yours looks identical: read in
   `apps/backend/node_modules/@medusajs/dashboard/dist/` (search for `useDataTable`, `DataTable`,
   `Container`, `Heading`, `FocusModal`, `Drawer`, `Prompt`, `toast`, `StatusBadge`, `Table`) and the
   `@medusajs/ui` exports (`apps/backend/node_modules/@medusajs/ui/dist/index.d.ts`). Copy the composition
   of an existing simple list page (e.g. sales channels or api keys) — same paddings, header row with the
   create button, same empty state — rather than inventing a layout.
4. `@medusajs/admin-sdk`: `defineRouteConfig({ label, icon })` for the sidebar entry; nested routes under
   `src/admin/routes/tenants/[id]/page.tsx`; icons from `@medusajs/icons` (check it is resolvable:
   `node -e "require.resolve('@medusajs/icons')"` in `apps/backend`; if not, use an icon exported through
   `@medusajs/ui`).

## Deliverables (your owned paths)

- `apps/backend/src/admin/routes/tenants/page.tsx` — sidebar «Магазины» (label through the admin i18n
  mechanism if this repo's `src/admin/i18n` supports route labels; otherwise the string, and say so):
  table with columns handle, name, sales channel status, products, orders, admins, created; search box
  (`q`), pagination (`limit/offset`), a filter «show archived» (`archived=include`); row click → detail;
  header button «Создать магазин» → FocusModal form (name, handle with the rule «lowercase letters, digits,
  single hyphens, 3–63», first admin: email, password, first/last name) → `POST /admin/tenants` → toast +
  navigate to the detail.
- `apps/backend/src/admin/routes/tenants/[id]/page.tsx` — card: general section (handle, name, created,
  status «active/archived», sales channel with its disabled flag, publishable key token with a copy
  button, counts), edit name (Drawer → `POST /admin/tenants/:id`), «Администраторы» section listing
  admins with actions: add (Drawer: email, password, names → `POST …/admins`), change email + password
  (Drawer, both optional, → `POST …/admins/:adminId`), remove (Prompt → `DELETE …/admins/:adminId`, the
  last one is refused by the API → show the error toast), and «Удалить магазин» (Prompt with the handle
  typed back or a clear warning; → `DELETE /admin/tenants/:id`; then the card shows «archived» and the
  actions for admins are disabled). Export button → `POST /admin/tenants/:id/export` (owner W3; open the
  response as a download via blob URL; if the route is not there yet, wire the button and note it).
- `apps/backend/src/admin/lib/tenants-api.ts` — typed fetch helpers for every endpoint of the contract,
  one function each, errors surfaced as `Error(message)` from Medusa's `{ message }`.
- `apps/backend/src/admin/i18n/**` — the Russian labels, following the existing mechanism.
- `artifacts/docs/platform-shots/` — screenshots (PNG, 1440×900): `01-list.png`, `02-create.png`,
  `03-detail.png`, `04-admin-edit.png`, `05-delete-prompt.png`, `06-archived.png`, plus
  `README.md` listing each shot with one line on what it proves and the exact URL. Take them against the
  live backend `http://localhost:9025/app` (login `admin@upready.dev` / `supersecret`) with Playwright:
  it is installed at `/Users/ivanprotsko/upready/node_modules/playwright` — write
  `artifacts/docs/platform-shots/shoot.mjs` that does
  `const pw = await import("/Users/ivanprotsko/upready/node_modules/playwright/index.mjs"); const { chromium } = pw; if (!chromium) throw new Error("chromium export missing");`
  (a namespace import must be asserted before use), logs in through the UI, walks the flow, and saves
  the files. If the API (W1) is not live yet when you get there, shoot what renders (list with the API
  error state is NOT acceptable as final) and report `SHOTS: pending-api` so the orchestrator re-runs
  the script later; keep the script re-runnable.

## Verification (report real output)

```bash
cd /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/apps/backend
npx tsc --noEmit -p src/admin/tsconfig.json   # if that tsconfig is a project; otherwise npx tsc --noEmit
npx medusa lint
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:9025/app/tenants   # the admin shell answers 200 once the dev server picked the route up
```

The orchestrator's `medusa develop` on `:9025` serves the admin with HMR from this worktree; W1/W2/W3
edit backend files at the same time, so a temporary boot failure on their lint error is not yours — check
`/private/tmp/claude-502/-Users-ivanprotsko-upready-projects-upready-store/4ea77005-26b0-4d27-9b74-ddce4b3422a4/scratchpad/backend-9025.log`
(tail) when the admin does not answer. Ports 9023 / 9024 / 5180 belong to other sessions — never touch.

## Rules

- No git commit/push/add. Do not touch `src/api/**`, `src/workflows/**`, `src/modules/**`.
- User-facing strings: Russian in the UI («Магазины», «Создать магазин», «Администраторы», «Сменить email и
  пароль», «Удалить магазин», «Архивирован»); labels in plain language; a raw enum never reaches the screen
  without a label map.
- Do not ask; decide, record in `.ai/progress-w7.md`, continue.
- Progress: `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/progress-w7.md` +
  `node ~/upready/.ai/scripts/orchestrator.mjs emit --task plat-w7-admin-ui --kind progress|done|blocked --summary "…" --files "…"`.

## Return value (final message, under 25 lines)

```
STATUS: done | partial | blocked
FILES: <paths>
TSC: rc=<n>   LINT: rc=<n>   ADMIN_ROUTE: http=<code>
SHOTS: <n> files in artifacts/docs/platform-shots | pending-api
DECISIONS: <one line each>
OPEN: <what is not done and why>
```
