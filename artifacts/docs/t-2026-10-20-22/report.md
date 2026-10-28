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

## Return 1 fix (28.10)

The switcher now leaves for cherkashino.ru only when the visitor picks the redirect row. A language-only change stays on this shop, no change closes the dialog, and a served country keeps the `updateRegion` path.

**Change** (all in `/Users/ivanprotsko/upready/worktrees/upready-store/feat/t22-region-popup/apps/storefront/src/modules/layout/components/region-select/`):
- `options.ts`: new pure `applyActionOf` (redirect, region, language or close), `AWAY_PREFIX`, `awayValueOf`, `awayCountryOf`.
- `index.tsx`: `handleApply` runs on that decision. The own row of a redirect country (`ru` on .com/ru) stays listed and is checked on open.
- `country-list.tsx` (new): the country radio list. A redirect row has value `away:<cc>` and id `region-away-<cc>`; the own row keeps `<cc>` and `region-country-<cc>`.
- `option-row.tsx` (new): the row component moved out of `index.tsx`, unchanged.

**Decision:** the prefix is `away:`, as the brief suggested. Not a fork, so no decide record. /en looks as before, because there `ru` is not the visitor's country and its own row stays hidden behind the redirect row.

**Tests:** region-select and tenant suites, 19 files, 155 tests passed before the merge. After merging origin/dev: storefront `src/lib/tenant`, `src/modules/layout`, `src/middleware`: 35 files, 311 tests passed. New: five apply cases in `options.test.ts` and one render test in `index.test.tsx` (own row checked beside the redirect row). `npx tsc --noEmit` clean, `npm run lint` 0 errors, `npx next build` OK (before the merge).

**Stand** (`next dev` on port 8123 plus the mock backend, `STAND_BASE=http://localhost:8123 node check.mjs <screenshots>`): 38 PASS, 0 FAIL. The 30 old cases pass. New /ru cases:
- PASS /ru: own row listed and checked on open
- PASS /ru: redirect row listed, not checked
- PASS /ru: English + Apply stays on the stand at /en
- PASS /ru: Apply with no change stays on /ru
- PASS /ru: Apply with no change closes the dialog
- PASS /ru: Kazakhstan in the popup, then English in the switcher, stays on this shop
- PASS /ru: the redirect row goes to https://cherkashino.ru/

The /en case selector moved to `#region-away-ru`. Desktop shots are now 1440 wide. The no-redirect stand (`check-off.mjs`) was not rerun; the popup and tenant setting are untouched.

**Screenshot:** [switcher-ru-desktop-light.png](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t22-region-popup/artifacts/docs/t-2026-10-20-22/screenshots/switcher-ru-desktop-light.png), plus a dark one beside it. Both show two «Россия» rows, the own one checked.

**Merge:** #481 was not mergeable, so origin/dev went in (no rebase). Five additive conflicts, both sides kept: by-host `route.ts`, `headers.ts`, `headers.test.ts`, `resolve.ts`, `middleware.ts` (the `x-tenant-stage` header beside `x-tenant-region-redirects`). These are outside region-select/ and are named here for that reason.

**Heads:** fix commit bc00ce2c, merge head c22994d6; the report commit follows it.
