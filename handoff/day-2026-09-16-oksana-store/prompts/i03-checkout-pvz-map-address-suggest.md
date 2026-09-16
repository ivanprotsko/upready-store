# {{TASK_ID}} — Checkout: pickup-point map and fast address suggestions (mechanics of chrxnasdmds, components and styles of THIS storefront)

Worktree `{{WORKTREE}}`, branch `{{BRANCH}}` cut from `{{BASE}}`. Storefront task, depends on `i02` (pickup points endpoint). Read `handoff/day-2026-09-16-oksana-store/prompts/_ivan-0831.md` first (order 3.2 verbatim, credential NAMES, stand recipe).

## Reference and facts
- chrxnasdmds storefront `apps/storefront/src/modules/checkout/components/{pickup-map-yandex,pickup-map,unified-point-picker,apiship-point-picker,address-input,address-select,shipping-address}` — Yandex Maps JS API 2.1 loaded with the key named `NEXT_PUBLIC_YANDEX_MAPS_KEY` (storefront `.env.local`) / `IVANPROTSKO_YANDEX_MAP_KEY_ONE` (keys canon).
- Address suggestions: Ivan gave keys to a suggestions API. Find WHICH service in chrxnasdmds (`address-input`, `address-select`, backend routes, env NAMES in `apps/backend/.env`, `apps/storefront/.env.local`) and in `/Users/ivanprotsko/upready/.env.keys` (names only). If no key for a suggestions service is found, write `key missing: <what you looked for>` in the report and implement suggestions through the Yandex Maps API's own suggest (same key) — never guess a provider.
- Ours: `apps/storefront/src/modules/checkout/components/{checkout-address-sheet,checkout-pickup-point-sheet,checkout-pickup-summary,checkout-shipping-section}`, design system `@medusajs/ui` + tailwind (same rule as `b17`: mechanics from the reference, components and styles of this storefront).

## Build
- Address step: typing shows suggestions (debounced, keyboard navigable, ≥ 3 chars), choosing one fills city/street/house/postcode/coordinates; manual entry still works.
- Pickup step: map with the tenant's pickup points from `i02`'s endpoint for the chosen city, clustering, point card (address, hours, price/term), select → shipping method set with its price; list view as the mobile fallback; 390 px works without horizontal scroll.
- Keys only via env NAMES; the map script loads once; `prefers-reduced-motion` honoured; Playwright e2e with a mocked suggestions/points response; lint/typecheck green.

## Acceptance
On the stand: screenshots of suggestions while typing and of the map with points for a large city (desktop 1280×900, mobile 390×844); selecting a point changes the shipping method and total; e2e green; `report.md` names the suggestions service and the env var NAMES, `## Экономия`; `report.json` with `secretRef`.
