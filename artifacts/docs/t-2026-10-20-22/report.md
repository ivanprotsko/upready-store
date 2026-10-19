# t-2026-10-20-22 — cherkashino.com: region popup, «Россия» sends the visitor to cherkashino.ru

Line opus-t22-boat, branch `feat/t22-region-popup` (base dev 533c4f0b), 19.10.2026 UTC.

## Result

A first-time visitor of a shop with the new setting sees «Откуда вы делаете заказ?» / «Where are you shopping from?».
«Россия» opens [Черкашино](https://cherkashino.ru/).
Any other answer stays on the shop and is remembered for a year.
A shop without the setting shows nothing new.

## What Changed

| Part | File |
|---|---|
| Setting reader, `region_redirects` in `/storefront/by-host` | [region-redirects.ts](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t22-region-popup/apps/backend/src/api/storefront/by-host/region-redirects.ts), route.ts |
| Script that fills the setting (dry run by default) | [set-tenant-region-redirect.ts](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t22-region-popup/apps/backend/src/scripts/set-tenant-region-redirect.ts) |
| Decision: who is asked, which rows, the cookie | [region-redirects.ts](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t22-region-popup/apps/storefront/src/lib/tenant/region-redirects.ts) |
| Header `x-tenant-region-redirects` | apps/storefront/src/middleware.ts, src/lib/tenant/resolve.ts, src/lib/tenant/headers.ts |
| The popup (client) and its host (server) | [region-popup/](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t22-region-popup/apps/storefront/src/modules/layout/components/region-popup/) |
| The header switcher lists «Россия → cherkashino.ru» | apps/storefront/src/modules/layout/components/region-select/index.tsx |
| 4 strings × 36 catalogs, real translations | apps/storefront/messages/*.json (`RegionPopup`) |

## How It Behaves

- The setting lives per shop in `tenant.metadata.region_redirects`, `{ "ru": "https://cherkashino.ru" }`. Nothing is hard-coded.
- Rows: «Россия» (with «Откроется cherkashino.ru»), «Казахстан» always, the shop's other countries when there are at most 6, «Другая страна».
- «Россия» → [Черкашино](https://cherkashino.ru/), the RU home. Not remembered, so a return to .com asks again.
- Kazakhstan, another country, «Другая страна» → stay, cookie `_region_choice` for 365 days. A country the shop's regions price in also switches the prices (`updateRegion`). Kazakhstan is not among live cherkashino-com's regions today, so it only remembers.
- Esc, the cross and a click outside close it for this browser session only.
- Robots and link previews (Googlebot, YandexBot, TelegramBot, WhatsApp, vkShare, Slack, Discord…) and an empty User-Agent never see it. No IP-based redirect.
- The answer can be changed later in the header switcher, which lists «Россия · cherkashino.ru» first and sends a pick there.
- Accessible: `role="dialog"`, `aria-modal`, title and description wired by Headless UI, focus moves in and is trapped, Esc closes. Bottom sheet on a phone, centred card on desktop, both colour schemes through the `ui-*` tokens.

## Decisions (decide.mjs, all recorded)

1. Redirect target: the RU home always. The .ru shop has its own catalogue, and the .com storefront cannot know cheaply that a handle exists there.
2. Setting: `tenant.metadata.region_redirects` + a dry-run/apply script, the same pattern as `set-tenant-usd-default`. No migration, no entrypoint hook, no panel field.
3. Rows: shop countries up to 6, else none; «Другая страна» always.
4. Kazakhstan always listed (supersedes «only if served»): live cherkashino-com prices in ru→RU and en→US only.
5. «Россия» is not remembered.

## How the Setting Gets Onto cherkashino.com (the lead's step after Ivan's «да»)

Nothing was written to any live database. After the release reaches vps16:

```bash
# 1. plan, writes nothing
docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/set-tenant-region-redirect.js tenant=cherkashino-com country=ru url=https://cherkashino.ru
# 2. write
docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/set-tenant-region-redirect.js tenant=cherkashino-com country=ru url=https://cherkashino.ru apply
```

The storefront picks it up within 60 seconds (the by-host cache), with no restart.
A second run says that «ru» already goes to the same address and writes nothing.

## Checks

| Check | Result |
|---|---|
| Storefront `npx tsc --noEmit` | clean |
| Storefront `npm run lint` (next lint + allowlist + var-opacity) | clean, 0 errors |
| Storefront `npm test` (vitest, includes the 36-catalog parity gate) | 190 files, 2321 tests passed |
| New unit tests `src/lib/tenant/region-redirects.test.ts` | setting present/absent, cookie set, bots, rows, cookie line |
| Backend `region-redirects.unit.spec.ts` + by-host suites + fixtures guard | 27 passed |
| Backend `npx tsc --noEmit`, `npx medusa lint` | clean, 0 errors (3 new «use MedusaError» warnings in the script, same as its sibling scripts) |
| `pnpm check:backend-build` | backend and admin build OK |
| Browser on a local stand (next dev + a mock backend shaped like cherkashino-com) | 30 of 30 PASS |

The browser checks covered six popup renders (ru/en, mobile/desktop, light/dark), dialog role, name, description, focus, Esc with a session cookie, the row order, Kazakhstan for 365 days, United States switching the prices, «Другая страна», «Россия» landing on the RU home with nothing remembered, three bots, the header switcher row and its redirect, and a shop without the setting (no popup, no extra row).
The stand and the scripts are in [stand/](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t22-region-popup/artifacts/docs/t-2026-10-20-22/stand/).

## Screenshots

[screenshots/](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t22-region-popup/artifacts/docs/t-2026-10-20-22/screenshots/)

- popup-ru-desktop-light.png, popup-en-desktop-light.png
- popup-ru-mobile-light.png, popup-en-mobile-light.png
- popup-ru-desktop-dark.png, popup-en-desktop-dark.png, popup-ru-mobile-dark.png, popup-en-mobile-dark.png
- switcher-en-desktop-light.png (the header switcher with «Russia · cherkashino.ru»; the red «Issues» badge there is Next's dev overlay, from the mock backend's missing routes)

## Deviations and Notes

- `ui-task.mjs` and `run-queue.mjs` do not exist on the boat ([tools/](/Users/ivanprotsko/upready/projects/devops/staff/tools/) holds only decide, line-next, worker-signal and gh-poll). So the UI-pack stages were not printed, and builds and tests ran directly with `nice -n 10`.
- The repository has no `main` branch on origin. The PR goes to `dev`, as the brief's Context says.
- The stand used a mock backend, not a seeded Medusa. Prices and catalogue are empty there. The popup, the cookies, the region switch and the redirect are the real storefront code.
- `(main)/layout.tsx` re-indents the existing tree under the new provider. `git diff -w` shows the real change.
- On live cherkashino-com a visitor on `/ru` is priced in the Russian region (LOCALE_COUNTRY_MAP `ru:ru`). The popup does not change that. Picking a served country in the popup or the switcher does.

## Time

Estimate 35–75 min. Actual about 55 min.
