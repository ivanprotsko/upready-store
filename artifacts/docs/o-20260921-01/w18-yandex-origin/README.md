# W18 — Yandex ID login lands on 0.0.0.0:8000 (t-2026-09-25-01)

Order o-20260921-01. Ivan, 2026-09-25 10:33 WITA: «когда я вхожу через Yandex ID, то после
подтверждения входа меня редиректит на https://0.0.0.0:8000/ru/account,если я потом снова
открываю сайт olavka.com то обнаруживаю, что я успешно авторизовался». Brief:
`/Users/ivanprotsko/upready/prompts/2026-09-25-w18-yandex-callback-origin.md`.

Branch `fix/yandex-callback-origin` from `dev` 85014a76, fix commit 1236ac65.

## What Changed

- `apps/storefront/src/app/api/yandex-callback/route.ts` — one `origin` per request,
  `requestOrigin(req.headers, req.nextUrl.protocol) || req.nextUrl.origin`; `fail()` (every error
  path) and the success redirect use it. `_medusa_jwt` is `Secure` when
  `requestScheme(...) === "https"`, not when the parsed URL is https.
- `apps/storefront/src/app/api/yandex-login/route.ts` — the same `origin` replaces the inline
  Host + `x-forwarded-proto` build of the callback URL and is now also the base of the two error
  redirects (`unconfigured`, `failed`). `_yandex_return` / `_yandex_nonce` `Secure` follows
  `requestScheme`.
- `apps/storefront/src/app/api/yandex-callback/route.test.ts` (6) and
  `apps/storefront/src/app/api/yandex-login/route.test.ts` (4) — new vitest specs; every request is
  `new NextRequest("http://0.0.0.0:<port>/api/…", { headers: { host, x-forwarded-proto, cookie } })`
  with the backend `fetch` stubbed.
- `docs/auth-yandex.md` — a fourth «easy to get wrong» paragraph: redirects are built on the
  buyer's address, never on `req.nextUrl.origin`, and why.
- `apps/storefront/src/lib/util/yandex-auth.ts` and `apps/storefront/src/lib/tenant/origin.ts` are
  untouched.

## Evidence

| File | What it holds |
|---|---|
| `red-run-unfixed.log` | the 10 new specs against the unfixed routes (route files == HEAD 85014a76): `Tests 8 failed \| 2 passed (10)`; line numbers point at the spec files before `prettier --write` |
| `curl-before.txt` | standalone production server of the UNFIXED build on :8273, `curl -sI` with `Host: olavka.com` + `x-forwarded-proto: https` → `location: https://0.0.0.0:8273/…` |
| `curl-after.txt` | the same server built WITH the fix → `location: https://olavka.com/…` |
| `w18-onto-a0e63d09.patch` | `git diff a0e63d09 1236ac65 -- <the 5 files>`, the storefront-only hotfix; `git apply --check` passes on a `git archive a0e63d09` copy |

The two specs that were green on the unfixed code are the «no Host → the request URL's origin»
fallback specs: they pin the old behaviour on purpose, so they cannot be red before the fix. A
mutation run proved they bite: with `|| req.nextUrl.origin` removed from both routes, both fail
with `TypeError: Invalid URL` (`Tests 2 failed | 8 passed (10)`); the fix was restored afterwards.

Build and server, both runs: node 22.22.3 (the image is `node:22-alpine`), in
`apps/storefront`: `NODE_ENV=production NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://127.0.0.1:9261 npx
next build` (exit 0 both times; `build-profile.mjs` not run, so the checked-in
`profile.generated.json` stays untouched), then in `.next/standalone`:
`NODE_ENV=production HOSTNAME=0.0.0.0 PORT=8273 MEDUSA_BACKEND_URL=http://127.0.0.1:9261 node
apps/storefront/server.js`, stopped after the curls (`lsof -iTCP:8273` empty). `.next/static` and
`public` were not copied: the route handlers under test serve no page. The callback without
`code`/`state` fails before any backend call, so the stand backend on :9261 received nothing from
the curls. The build's default locale is `en` (live bakes `ru`), hence `/en/account` without a
cookie and `/ru/account` with `Cookie: _medusa_locale=ru`.

Not checked here: a full sign-in with a real Yandex account (`docs/auth-yandex.md`, «Checking
it»); Ivan does that on live after a deploy.
