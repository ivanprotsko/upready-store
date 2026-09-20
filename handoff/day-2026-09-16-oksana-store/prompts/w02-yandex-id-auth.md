# Sign in with Yandex ID — OAuth 2.0 provider for storefront customers (pilot on tenant `cherkashino`)

## Why
Ivan (2026-09-16 02:46 WITA): keys for Yandex ID arrived, «можно будет сделать авторизацию». InSales Combo, the
competitor bar of this mission, offers social login for buyers. Target: a buyer of Oksana's store logs in with a
Yandex account; the same provider is reusable for the owner panel later (not in this task).

## The credentials (never copy their values anywhere)
- File `/Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino` (MAIN checkout root, outside git; not in
  your worktree). Variables for you: `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`. Load them only into the process
  environment of a local run (`set -a; source …/.env.cherkashino; set +a`). They never enter git, logs, the PR body,
  `report.json`, screenshots. Before push: `git grep -n -e "$YANDEX_CLIENT_ID" -- .` (with the variable expanded in
  YOUR shell, not typed) must print nothing.
- The file also holds a personal Yandex account under the comment `# WEB` (`YANDEX_ID_LOGIN`, `YANDEX_ID_PASSWORD`).
  It exists ONLY for the end-to-end check of the login flow in a browser. Read it at runtime through `process.env`
  in the Playwright script, never print or store it, at most two sign-in attempts; if Yandex asks for a captcha,
  SMS, or a second factor — stop and write that down. Never brute-force, never automate anything else on that account.
- Staff measurement (03:06 WITA): `GET https://oauth.yandex.ru/authorize?response_type=code&client_id=<id>` answers
  302 to passport — the client id is accepted. **Unknown: which Redirect URIs and scopes are registered in the
  application** (Yandex: Platforms → Web services → Redirect URI). The question is with Ivan; see «If blocked».

## Documentation (read it, do not work from memory)
- https://yandex.ru/dev/id/doc/ru/codes/code-url — Authorization Code flow: authorize URL, `state`, optional PKCE,
  the code lives 10 minutes, token exchange `POST https://oauth.yandex.ru/token`
  (`grant_type=authorization_code`, `code`, `client_id`, `client_secret`) → `access_token`, `refresh_token`, `expires_in`, `scope`.
- https://yandex.ru/dev/id/doc/ru/user-information — the user-info endpoint and the scopes that unlock `id`, `login`,
  `default_email`, `real_name` / `display_name`, avatar. Request only the scopes needed (email + basic info); if the
  application has fewer scopes registered, the info call tells you — record what came back.

## Deliverables (one PR, branch `{{BRANCH}}`)

### 1. Auth module provider `yandex` in the backend
Medusa v2 auth provider (the `@medusajs/auth-google` package in `node_modules` is the reference implementation of the
same OAuth shape — read it, do not copy it blindly): `apps/backend/src/modules/auth-yandex/` with
`AbstractAuthModuleProvider`: `authenticate()` returns the Yandex authorize location (client_id, redirect_uri, state,
scope, response_type=code); `validateCallback()` verifies `state`, exchanges the code, fetches user info, and returns
the identity (`entity_id` = Yandex user id, `user_metadata` = email, name, avatar). Register it in
`apps/backend/medusa-config.ts` next to `emailpass` in the auth module providers (options from
`YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `YANDEX_CALLBACK_URL`; fail loudly at boot when they are empty).
Multi-tenancy: the resulting customer must be scoped to the tenant exactly as an `emailpass` registration is (read
`apps/storefront/src/lib/data/customer.ts` and the store-API isolation from b07 — `src/store-order-access`,
`integration-tests/http/tenants.spec.ts`); an existing customer of the SAME tenant with the same email is linked, not duplicated.
`state` carries `{ tenant, locale, return_to }` signed (HMAC with the cookie/JWT secret already used by the backend)
so the callback can return the buyer to the right store host and page.

### 2. Storefront
- «Войти через Яндекс» button on the login form `apps/storefront/src/modules/account/components/login/index.tsx`
  (Geist canon: `~/upready/packages/geist-kit/AGENTS.md`), also on the checkout sign-in prompt if that is one component.
- Callback page `apps/storefront/src/app/[locale]/(main)/account/yandex/callback/page.tsx` (or a route handler):
  passes the query to `sdk.auth.callback("customer", "yandex", query)` (see how `customer.ts` sets the session after
  `sdk.auth.login`), then redirects to `/account` (or `return_to`). Errors (state mismatch, denied consent, missing
  email) render a plain-language message on the login page, not a stack trace.
- Redirect URIs the application must know — write them into the PR body and `blocked` file exactly:
  local stand `http://localhost:<storefront port from AGENTS.md>/ru/account/yandex/callback`,
  live `https://cherkashino.shipshift.dev/ru/account/yandex/callback` (one per storefront host; the platform will
  need one per tenant host, or a single backend-owned callback that forwards by `state` — note the trade-off in the report, implement the storefront callback now).

### 3. Tests
- Unit (`apps/backend/src/modules/auth-yandex/__tests__/`): authorize URL contains the five parameters and a signed
  state; `validateCallback` with a mocked token + user-info exchange creates the identity; a tampered `state` is
  rejected; a user without email is handled (error or a guest-like identity — decide, document); the secret never
  appears in thrown messages or logs.
- HTTP integration (`integration-tests/http/auth-yandex.spec.ts`): `POST /auth/customer/yandex` returns a `location`
  on `oauth.yandex.ru` with the `client_id`; the callback with a bad `state` returns 401.
- Stand test (`apps/storefront/tests/stands/`, existing pattern `account.pw.ts`): the button exists and the click
  lands on `oauth.yandex.ru/authorize` (screenshot).

## Measurement (rule 18f) — commands and outputs in the PR body
1. `pnpm test:unit` and `pnpm test:integration:http` file-level `fail 0` lines.
2. Local stand: `curl -sI -X POST http://127.0.0.1:<backend>/auth/customer/yandex …` → `location:` with the parameters
   (client id redacted); browser screenshot of the login page with the button and of the Yandex consent screen.
3. If the Redirect URI is registered: the full loop — sign in with the `# WEB` account, land on `/account` with the
   name from Yandex; `select … from provider_identity where provider = 'yandex'` and the customer row (redact the email
   to `x***@…`), screenshot of `/account`.
4. `git grep` proof that no secret entered the tree; `git status` shows no `.env*`.
Report `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/report.md` + UI `report.json` per the preamble.

## If blocked (Redirect URI / scopes not registered)
Do everything above that does not need the registration (provider, storefront, unit + HTTP tests, the measured 302),
open the PR for that part, and write `{{MISSION_DIR}}/logs/blocked-{{TASK_ID}}.md` with the EXACT Redirect URIs and
scopes Ivan must add in the Yandex application. The staff will send the confirmation as a follow-up message into
this terminal; then finish measurement 3 on the same branch and comment on the PR.
