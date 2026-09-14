# Goal

Move the storefront's language and currency defaults from the build into the shop. Today
`STOREFRONT_DEFAULT_LOCALE`, `LOCALE_PIN` and `LOCALE_COUNTRY_MAP` are environment variables of one image that
serves every tenant, so every shop gets the same default language and all 36 languages in its switcher. The
client's shop needs Russian first with the rouble, and English as the only second language
(`{{MISSION_DIR}}/research/telegram-digest.md` §3, «Языки»: Russian and English at launch, the rest later from
the admin panel).

## Where we stand today

- `{{MISSION_DIR}}/research/upready-store-capabilities.md` §3 row «Локали и валюта»: 36 locales in
  `apps/storefront/src/i18n/config.ts`, `preferredLocales=["ru"]`, currency through the region and
  `LOCALE_COUNTRY_MAP=ru:ru,en:us`. Known defects recorded there: seeded shops `acme`/`globex`/`initech` have no
  language or currency controls (`t-2026-09-12-seeded-hosts-no-locale-controls`).
- The acceptor of the 2026-09-12 migration proposed moving these into the tenant document served by
  `/storefront/by-host`; that is the shape to build (migration report, «Предложения задач», row «Локаль/валюта
  тенанта»).
- `AGENTS.md` «Localization» explains the middleware: `localePrefix` is `never`, the redirect is done by hand in
  `apps/storefront/src/middleware.ts` from the `_medusa_locale_choice` cookie, then `matchBrowserLocale`, then
  `defaultLocale`. `_medusa_locale` records what was last served and must never decide the redirect.

## Step plan

1. Add to the tenant document (`apps/backend/src/modules/tenant`, exposed through `GET /storefront/by-host` and
   through `/tenants/*` for the owner): `default_locale`, `enabled_locales` (a subset of the 36, never empty and
   always containing the default), and the currency that the shop shows. Keep the env variables as the fallback
   for a request that resolves no tenant, so single-store installs keep working.
2. Middleware: when the host resolves a tenant, its `default_locale` wins over `defaultLocale`, and a visitor
   whose browser asks for a language the shop has not enabled gets the shop's default rather than a language
   with no content. The cookie a visitor set by hand still wins over both.
3. Language switcher shows only `enabled_locales`. The `x-medusa-locale` header that
   `apps/storefront/src/lib/config.ts` attaches keeps working for catalog translations.
4. Currency: the price a visitor sees follows the tenant's currency through its region, and the same cart keeps
   that currency through checkout. Do not invent conversion: use the prices that exist on the variant, and when
   the requested currency has no price, say which currency is being shown rather than rendering a zero.
5. Panel: `apps/tenant-panel/src/routes/settings` gets «Язык и валюта» — a default-language select, a multi-select
   of enabled languages, and the currency. Follow rule 19h for the async load: render the real control disabled
   while the value is loading, keep a `touchedRef` so a late response never overwrites what the owner picked.
6. Backfill: existing tenants get `default_locale: "ru"` and `enabled_locales: ["ru","en"]` unless their data
   says otherwise, in a script under `apps/backend/src/scripts/`, idempotent, with a `--dry-run`.

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build && pnpm test
```

## Acceptance (measured, quoted in the PR body)

- Two tenants on the local stand with different defaults: one opens at `/ru` with prices in ₽, the other at
  `/en` with its own currency, from the same running storefront process. Quote both `curl -I` redirects and
  screenshot both home pages.
- The switcher on the first shop lists exactly its enabled languages. Screenshot.
- A request with `Accept-Language: de` to the Russian shop lands on `/ru`, not on `/de`. Quote it.
- `apps/storefront/src/i18n/config.test.ts` and the storefront unit suite pass; quote the result line.
- The backfill script run twice changes nothing the second time. Quote both runs.

## What NOT to do

- Do not reduce the 36 locale catalogs, and do not touch `messages/` (`AGENTS.md`: a missing key fails at
  runtime and there is no parity gate).
- Do not convert prices between currencies with a rate you invented.
- Do not make `_medusa_locale` decide the redirect.
- Do not deploy, and do not run the backfill against the live database — that belongs to the deploy task.
