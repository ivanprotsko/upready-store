# {{TASK_ID}} — ApiShip + CDEK delivery for the cherkashino tenant: calculated rates and pickup points at checkout (gorgojs integration or a ported provider — measured)

Worktree `{{WORKTREE}}`, branch `{{BRANCH}}` cut from `{{BASE}}`. Product code task (backend + panel + storefront). Read `handoff/day-2026-09-16-oksana-store/prompts/_ivan-0831.md` first (order verbatim, credential NAMES, stand recipe).

## What exists (measure before deciding)
- upready-store: manual tariffs `apps/backend/src/shipping-tariffs/` (carriers, RU zone presets, weight), module `tariff-fulfillment`, `apps/backend/src/api/store/pickup-points/route.ts`, storefront checkout `checkout-shipping-section`, `checkout-pickup-point-sheet`, `checkout-pickup-summary`, `checkout-address-sheet`; test `integration-tests/http/tenants-shipping-methods.spec.ts`. No ApiShip/CDEK code.
- chrxnasdmds (reference for mechanics): `apps/backend/src/modules/apiship/` (README: calculate, 4 carrier/type options, points, createFulfillment, cancel, tracking, `/hooks/apiship` status webhooks), `apps/backend/src/lib/shipping/apiship-client.ts`, `cdek-client.ts`; storefront `modules/checkout/components/{apiship-point-picker,unified-point-picker,pickup-map,pickup-map-yandex}`; env names `APISHIP_TOKEN`, `APISHIP_IS_TEST`, `APISHIP_MOCK`, `APISHIP_SENDER_*`, `CDEK_API_ACCOUNT`, `CDEK_API_PASSWORD`, `CDEK_API_BASE`; keys canon names `APISHIP_PROD_TOKEN`, `CDEK_*`, `CHEROXANA_CDEK_*` (Oksana's own CDEK test and prod accounts).
- gorgojs: https://gorgojs.com/ru/medusa-integration-module, catalog https://gorgojs.com/medusa/plugins?integrationModule=true (fetch once, save text under `artifacts/docs/{{TASK_ID}}/docs/`), npm for package/licence.

## Stage 0 — measurement (deadline 45 minutes)
Table in `artifacts/docs/{{TASK_ID}}/decision.md`: gorgojs ApiShip provider (exists, licence, per-tenant credentials, calculate, points, create/cancel shipment, tracking, webhooks) vs porting chrxnasdmds's provider onto Medusa v2 fulfillment in THIS repo; and whether ApiShip covers CDEK rates + points for the tenant's account or a direct CDEK client is needed (test both with the TEST credentials: one calculate call each, save the responses with secrets stripped). Decide by the table, not by preference; Ivan accepts either road.

## Build
- Fulfillment provider registered in `medusa-config.ts`; per-tenant credentials and sender address in the panel (Settings → Delivery), encrypted, test/prod switch.
- Checkout of the cherkashino tenant: courier and pickup options with CALCULATED price and term for a real address (test mode); pickup points endpoint (`/store/pickup-points` or the provider's) returning CDEK/ApiShip points for a city with coordinates — the sibling task `i03` draws them on a map; status webhooks; shipment creation on fulfillment; tracking number on the order.
- Integration tests with recorded responses (no live calls in CI), Playwright e2e on the stand, lint/typecheck green. Do not copy chrxnasdmds's architecture blindly: read its handoff notes on what was redone there.

## Acceptance
On the stand: checkout shows calculated CDEK rates (courier + pickup) for a real address of the tenant (screenshots desktop/mobile, response ids); pickup points endpoint returns ≥ 20 points for a large city with lat/lng; panel settings form works; secrets absent from git (`git grep -n -E "APISHIP_TOKEN=|CDEK_API_PASSWORD=" -- .` empty); `report.md` with host env var NAMES for the deploy and `## Экономия`; `report.json` with `secretRef`.
