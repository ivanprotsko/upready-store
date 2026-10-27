# Scenarios report: t-2026-10-28-26

Tools: /Users/ivanprotsko/upready/worktrees/devops/feat/t-2026-10-28-06-illustration-gate/staff/tools (read only, replaces the path from the brief).
Stand (contabo, no run queue): Medusa backend 9371, storefront dev 8010 (scgate.localhost), tenant panel 5180, Postgres 54777 `sc_store_test`. The machine load average was 50 to 85 during the repeats.
Replay command: `nice -n 10 node <tools>/ui-walk.mjs replay --scenario scenarios/<id>.json --fixtures scenarios/fixtures.mjs --base <url> --out <dir>`.
Run dirs are under /tmp/claude-1001/sc/ (contabo has no ticket ids).

| Scenario | Weight | Status | Repeats | Findings |
|---|---|---|---|---|
| buyer-open-product | critical | recorded | 2 of 2 passed (replay-open-f1, f2) | none |
| buyer-add-to-cart | critical | recorded | 2 of 2 passed (replay-cart-f1, f2) | cart badge «Корзина (N)» sometimes stays 0 while the open cart panel holds the item |
| owner-sign-in | critical | recorded (actor guest) | 2 of 2 passed (replay-signin-f1, f2) | none |
| owner-see-order | critical | recorded | 2 of 2 passed (replay-order-3, 4); each run signs up its own shop so the order list holds one order | none |
| buyer-browse-catalog | critical | unstable | 3 passed before the fixtures were wired in (replay-browse-2..4); 6 of 6 failed after, final «Тестовая футболка» not on /ru/store within 5 s (replay-browse-g1..m2) | environment: the per-step budget of 5 s does not hold under load 70; console error «Новинки» on the catalog |
| buyer-checkout-place-order | critical | unstable | 0 of 4: diverged on s3, /ru/checkout does not open within 5 s after «К оформлению» (replay-checkout-1, 2, k1, k2). The first pass reached /ru/order/<id>/confirmed | environment, see below |
| owner-add-product | critical | unstable | 4 of 7 passed, passes and failures alternate (replay-addprod-10, 12, 13, 14 passed; 9, 11, 15 diverged: the create form was still blank after 5 s) | environment: the panel create form renders in 2 to 5 s in dev |
| buyer-phone-buy | normal | draft | none | none |
| buyer-switch-language | normal | draft | none | none |
| buyer-register-account | normal | draft | none | none |
| owner-phone-orders | normal | draft | none | none |

## Product observations

- A guest cannot see the address form at checkout: sign-in is required first.
- The delivery names «Pickup» and «Courier» and the text «Collect the order from the seller…» are in English on the Russian storefront.
- The city field is a hint field with no hints on the stand (external service unreachable); free text is accepted.
- The dev storefront shows an «Issues» badge.

## Environment notes

- A step's `after` and `before` checks have a fixed budget of 5 s. Cold dev compilation (up to 20 s for /api/cart), the first cart insert (about 20 s) and saving the address (about 45 s) do not fit. A recording of such a step is kept without `--expect`.
- `start.fixtures` in each scenario file lists `reset`, `seed` (and `login` for owner scenarios); without it a replay does not run the fixtures.
- owner-add-product starts on `/products/create`; starting on `/products` and clicking «Добавить товар» did not finish inside the budget.

## Time

Actual: about 3 hours, against the estimate of 55 minutes to 1.9 hours. Most of the extra time went to the slow stand.
