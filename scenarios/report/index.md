# Scenarios report: t-2026-10-28-26 (attempt 3)

Stand (contabo, no run queue), production builds, no dev servers, no live database, no keys:

- Postgres 54777, database `/sc_store_test` (name starts with `sc_store_`), local only.
- Backend 9371: `medusa build`, then `NODE_ENV=production PORT=9371 medusa start` from `/Users/ivanprotsko/upready/worktrees/upready-store/feat/t28-26-sc-store/apps/backend/.medusa/server`. `COOKIE_SECURE=false` in its `.env` (the stand is plain http; in production the session cookie is `Secure`), `LOCAL_FILE_BACKEND_URL=http://localhost:9371/static` (product photos).
- Storefront 8010: `next build` standalone, then `PORT=8010 HOSTNAME=0.0.0.0 NODE_ENV=production MEDUSA_BACKEND_URL=http://localhost:9371 NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9371 node server.js` from `/Users/ivanprotsko/upready/worktrees/upready-store/feat/t28-26-sc-store/apps/storefront/.next/standalone/apps/storefront`. The shop is found by host: `http://scgate.localhost:8010`.
- Panel 5180: `vite build`, then `vite preview --port 5180` (proxy for /auth and /tenants to 9371).
- `SC_TEST_PASSWORD` is random per session, kept in an env file outside the repo, never printed or committed.

Replay command: `node <tools>/ui-walk.mjs replay --scenario scenarios/<id>.json --fixtures scenarios/fixtures.mjs --base <url> --out <dir>`.
Tools: `/Users/ivanprotsko/upready/worktrees/devops/feat/t-2026-10-28-06-illustration-gate/staff/tools`.

| Scenario | Weight | Status | Repeats | Findings |
|---|---|---|---|---|
| buyer-browse-catalog | critical | recorded | replay passed (title and price «1 500,00 ₽» on /ru/store) | none |
| buyer-open-product | critical | recorded | replay passed (photo `product-gallery-hero-image`, price, «В корзину») | none |
| buyer-add-to-cart | critical | recorded | replay passed (cart panel holds «Тестовая футболка», subtotal «1 500,00 ₽») | none |
| buyer-checkout-place-order | critical | recorded (attempt 3) | re-recorded on the production stand; the sign-in submit now has `after` «Адрес *», the order submit is one click with `after` the confirmed url | the attempt-2 fail report `/Users/ivanprotsko/upready/worktrees/upready-store/feat/t28-26-sc-store/scenarios/report/buyer-checkout-place-order/report.md` is superseded, kept; the 7 to 8 s address form is a product observation below |
| owner-sign-in | critical | recorded | replay passed (password field by `input[type=password]`, final: url `/` and «Опубликовано» in the overview card) | none |
| owner-add-product | critical | recorded | replay passed (url `/products`, «Пробная кружка») | none |
| owner-see-order | critical | recorded | replay passed twice; the first run diverged on a cold orders list (2.9 s) | none |
| buyer-phone-buy | normal | draft | none | none |
| buyer-switch-language | normal | draft | none | none |
| buyer-register-account | normal | draft | none | none |
| owner-phone-orders | normal | draft | none | none |

## Gate results

Attempt 3, run with `--direct` (contabo has no run queue, so no tickets). Two rounds per app. The storefront ids hold buyer-checkout-place-order again.

- `/Users/ivanprotsko/upready/memory/reports/t-2026-10-28-26-gate/r3/storefront-1/gate.json`
- `/Users/ivanprotsko/upready/memory/reports/t-2026-10-28-26-gate/r3/storefront-2/gate.json`
- `/Users/ivanprotsko/upready/memory/reports/t-2026-10-28-26-gate/r3/panel-1/gate.json`
- `/Users/ivanprotsko/upready/memory/reports/t-2026-10-28-26-gate/r3/panel-2/gate.json`

## Product observations

- Attempt 1 notes still hold: a guest sees no address form before signing in; delivery names «Pickup» and «Courier» and their hint text are English on the Russian storefront; the city field has no hints on the stand (external service unreachable).
- The session cookie is `Secure` in production, so a plain-http stand needs `COOKIE_SECURE=false`; without it the panel logs in (200) and the next request is 401.
- The cart panel «К оформлению» button shows a spinner until the cart queue settles, then the page goes to checkout: about 3 to 5 s on the stand.
- Machine load average was 45 to 80 on 16 cores during the repeats; step budgets are tight under that load.
- After «Войти» at checkout the address form appears 7 to 8 s later, and under machine load the recorder's 5 s `after` can miss it. Line diagnosis: the cart transfer to the customer takes about 1.7 s, the shipping options are requested twice, and a telegram-bot call sits on the path. This is worth its own task and is not a blocker: the replay waits for it through `after` plus one retry, about 14 s.
- The standalone storefront caches «shop not found» for a host that was asked before the shop existed; a stand that starts before the fixtures' reset needs a storefront restart.
