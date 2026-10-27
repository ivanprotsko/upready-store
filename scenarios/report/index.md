# Scenarios report: t-2026-10-28-26 (attempt 2)

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
| buyer-checkout-place-order | critical | **fail (product finding)** | live pass to «Заказ подтверждён» twice; replay diverges at s8 on 6 of 6 runs | after «Войти» at checkout the address form shows after 7 to 8 s, the step budget is 5 s: see `/Users/ivanprotsko/upready/worktrees/upready-store/feat/t28-26-sc-store/scenarios/report/buyer-checkout-place-order/report.md` and `report.png` |
| owner-sign-in | critical | recorded | replay passed (password field by `input[type=password]`, final: url `/` and «Опубликовано» in the overview card) | none |
| owner-add-product | critical | recorded | replay passed (url `/products`, «Пробная кружка») | none |
| owner-see-order | critical | recorded | replay passed twice; the first run diverged on a cold orders list (2.9 s) | none |
| buyer-phone-buy | normal | draft | none | none |
| buyer-switch-language | normal | draft | none | none |
| buyer-register-account | normal | draft | none | none |
| owner-phone-orders | normal | draft | none | none |

## Gate results

Run with `--direct` (contabo has no run queue, so no tickets). Two rounds per app.
buyer-checkout-place-order is a `fail` finding and is not in the storefront ids.

- `/Users/ivanprotsko/upready/memory/reports/t-2026-10-28-26-gate/storefront-1/gate.json`
- `/Users/ivanprotsko/upready/memory/reports/t-2026-10-28-26-gate/storefront-2/gate.json`
- `/Users/ivanprotsko/upready/memory/reports/t-2026-10-28-26-gate/panel-1/gate.json`
- `/Users/ivanprotsko/upready/memory/reports/t-2026-10-28-26-gate/panel-2/gate.json`

## Product observations

- Attempt 1 notes still hold: a guest sees no address form before signing in; delivery names «Pickup» and «Courier» and their hint text are English on the Russian storefront; the city field has no hints on the stand (external service unreachable).
- The session cookie is `Secure` in production, so a plain-http stand needs `COOKIE_SECURE=false`; without it the panel logs in (200) and the next request is 401.
- The cart panel «К оформлению» button shows a spinner until the cart queue settles, then the page goes to checkout: about 3 to 5 s on the stand.
- Machine load average was 45 to 80 on 16 cores during the repeats; step budgets are tight under that load.
