# S1a — the seed reads a store profile (backend)

Task `t-store-profiles-pilot`, stage S1a. Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles`, branch `feat/store-profiles`. Nothing is committed — the files are on disk for the orchestrator.

Everything below is measured. Commands and their output are copied, not remembered.

## 1. Files

### New (19)

| File | What it is |
|---|---|
| `apps/backend/src/migration-scripts/data/store-profile.ts` | Resolves `STORE_PROFILE` (+ the `STORE_PROFILE_DIR` override) to a directory, reads and shallowly checks `profile.json`, turns `media/<file>` into a URL, deep-merges translations. |
| `apps/backend/src/migration-scripts/lib/prices.ts` | Ratio table from the demo seed, `charm`/`round` rounding, `price_usd` → one amount per currency. |
| `apps/backend/scripts/validate-store-profile.mjs` | Ajv strict against all four schemas + every cross-check in `specs/store-profiles/README.md`; `--skip-media`, `--dir`. |
| `apps/backend/scripts/store-profile-up.mjs` | createdb-if-missing → `medusa db:migrate` → seed with `STORE_PROFILE` → copy media into `static/store-profiles/<id>/` → print the publishable key. Never drops a database. |
| `apps/backend/src/migration-scripts/__tests__/prices.unit.spec.ts` | Ratio table, both rounding modes, currency decimals, 241-region coverage. |
| `apps/backend/src/migration-scripts/__tests__/store-profile.unit.spec.ts` | `resolveProfileDir`, `toMediaUrl` (prefixing + absolute-URL rejection), `deepMerge`. |
| `apps/backend/src/migration-scripts/__tests__/profile-data.unit.spec.ts` | The loader in both directions, store identity, the i18n merge. |
| `apps/backend/src/migration-scripts/__tests__/fixtures/profiles/fixture-shop/**` (7 files) | Minimal profile the unit tests load. |
| `apps/backend/src/migration-scripts/__tests__/fixtures/profiles/absolute-image-shop/**` (5 files) | Negative fixture: a profile whose image field holds a provider URL. |

### Changed (5)

| File | Change |
|---|---|
| `apps/backend/src/migration-scripts/data/products/index.ts` | Reads the profile catalog when a profile is active; strips the authoring-only fields (`collections`, `imageBrief`); prefixes image refs. Static imports of the demo JSON are untouched and still feed the default path. |
| `apps/backend/src/migration-scripts/data/i18n/index.ts` | Merges `<profile>/i18n/<locale>.json` over the base locale file. Default path: the same expression as before. |
| `apps/backend/src/migration-scripts/data/store/index.ts` | Store name, sales-channel name/description and publishable-key title come from `profile.brand`. |
| `apps/backend/src/migration-scripts/lib/products.ts` | `subtitle` reaches `createProductsWorkflow` (spread, so the default input is unchanged); a variant with `price_usd` is priced from the ratio table, one without keeps `getProductPrices(handle)` and its existing throw. |
| `apps/backend/package.json` | Exactly two `scripts` entries added (`git diff --stat`: `1 file changed, 2 insertions(+)`). |

Zero regression is structural, not just tested: with `STORE_PROFILE` unset every data module evaluates the same expression it evaluated before.

## 2. Currency decimals — the source

`defaultCurrencies`, imported from `@medusajs/framework/utils`.

- re-export barrel: `node_modules/@medusajs/framework/dist/utils/index.js`
- definition: `@medusajs/utils/dist/defaults/currencies.js` (pnpm path `node_modules/.pnpm/@medusajs+utils@2.19.0_@types+node@20.19.26_express@4.22.1/node_modules/@medusajs/utils/dist/defaults/currencies.js`)
- it is the same table Medusa loads into the `currency` table: `@medusajs/currency/dist/loaders/initial-data.js` does `Object.values(utils_1.defaultCurrencies)`.

Measured: 126 currencies, 39 of them `decimal_digits: 0`
(`AFN ALL AMD BIF CLP COP CRC DJF GNF HUF IDR IQD IRR IRT ISK JPY KMF KRW LBP MGA MMK MNT MUR PKR PYG RSD RWF SOS SYP TZS UGX UZS VND XAF XOF XPF YER ZMK ZWL`).
All 118 currencies used by the 241 region files exist in that table; their `decimal_digits` histogram is `{0: 36, 2: 76, 3: 6}` (the three-decimal ones are `bhd jod kwd lyd omr tnd`). No zero-decimal list is written by hand anywhere.

## 3. The ratio table

Built from one demo product, `t-shirt` (`product_prices.tShirt`), read across all 241 files of `data/regions/json/`. 241 files → 118 distinct currencies, **0 conflicts** (no currency is priced two different ways). USD anchor = 15.

`ratio[c] = demo[c] / demo[usd]`, then `amount = round(price_usd × ratio[c])` under the profile's `currency.rounding`.

| currency | decimals | demo t-shirt | ratio | $129 `charm` | $129 `round` |
|---|---|---|---|---|---|
| usd | 2 | 15 | 1 | 128.99 | 130 |
| eur | 2 | 14 | 0.9333333333333333 | 119.99 | 120 |
| gbp | 2 | 12 | 0.8 | 102.99 | 100 |
| jpy | 0 | 2250 | 150 | 19349 | 19350 |
| krw | 0 | 20300 | 1353.3333333333333 | 174579 | 174580 |
| inr | 2 | 1260 | 84 | 10835.99 | 10840 |
| chf | 2 | 13 | 0.8666666666666667 | 111.99 | 110 |
| vnd | 0 | 381000 | 25400 | 3276599 | 3276600 |
| kwd | 3 | 5 | 0.3333333333333333 | 42.99 | 40 |
| brl | 2 | 75 | 5 | 644.99 | 650 |

`charm` = "ends in nines": nearest whole unit minus one cent where the currency has decimals, nearest ten minus one where it has none. `round` = whole tens. The existing throw in `getProductPrices` is untouched; the profile path has the same guard shape (`Missing exchange ratio for currency "<c>" (region "<name>")`), and the live probe proves the coverage: **every one of 40 variants got 118 currencies, min = max = 118**.

## 4. Tests

```
pnpm --filter @dtc/gorgo-medusa-backend test:unit
```

```
Test Suites: 3 passed, 3 total
Tests:       39 passed, 39 total
```

Also green: `npx tsc --noEmit -p tsconfig.json` → exit 0, 0 errors. `pnpm lint` (backend) → exit 0.

### Reverse runs — unit tests (13/13)

Harness: `<scratch>/reverse-run.py`. Each case rewrites one anchor in the source, runs the whole unit suite, restores the file byte-for-byte, runs it again. Restored = 39 passed / 0 failed in **every** case.

| # | Broken | File | Broken run | First test that went red |
|---|---|---|---|---|
| 1 | ratio = raw amount (no `/usd`) | `lib/prices.ts` | 37p / 2f, exit 1 | ratio table divides every demo price by the demo USD price |
| 2 | `charm` drops the `- 0.01` | `lib/prices.ts` | 36p / 3f, exit 1 | charm ends a two-decimal currency in .99 |
| 3 | `charm` zero-decimal branch falls through | `lib/prices.ts` | 37p / 2f, exit 1 | charm ends a zero-decimal currency in 9 and keeps it whole |
| 4 | `round` rounds to units, not tens | `lib/prices.ts` | 38p / 1f, exit 1 | round produces whole tens in both kinds of currency |
| 5 | decimals hard-coded to 2 instead of Medusa's table | `lib/prices.ts` | 35p / 4f, exit 1 | reads two decimals for USD and zero for JPY and KRW |
| 6 | missing-ratio guard replaced by `?? 1` | `lib/prices.ts` | 38p / 1f, exit 1 | throws when a region currency has no ratio |
| 7 | loader always takes the profile | `data/products/index.ts` | 37p / 2f, exit 1 | STORE_PROFILE unset reads the shipped demo catalog |
| 8 | loader never takes the profile | `data/products/index.ts` | 35p / 4f, exit 1 | STORE_PROFILE set reads the profile catalog instead of the demo one |
| 9 | `toMediaUrl` returns the ref unprefixed | `data/store-profile.ts` | 36p / 3f, exit 1 | prefixes relative image refs with STORE_MEDIA_BASE_URL |
| 10 | absolute-URL throw replaced by pass-through | `data/store-profile.ts` | 37p / 2f, exit 1 | rejects an absolute image URL instead of seeding it |
| 11 | merge order swapped (base over profile) | `data/i18n/index.ts` | 38p / 1f, exit 1 | lets a profile key win over a base key that already exists |
| 12 | base groups dropped instead of merged | `data/i18n/index.ts` | 37p / 2f, exit 1 | keeps base keys the profile omits inside a group it does override |
| 13 | store identity ignores the brand | `data/store/index.ts` | 38p / 1f, exit 1 | takes the store name and sales channel from the profile brand |

The reverse run **caught a real hole**: the first version of case 11 stayed green, because the fixture's German overrides only added new keys and never collided with a base key — the test could not tell the merge direction. The fixture now overrides `terms.black` (base "Schwarz" → "Tiefschwarz") and `categories.clothing` (base "Bekleidung" → "Sneaker-Bekleidung"), and case 11 goes red.

### Reverse runs — validator (14/14 red, plus 3 controls)

Harness: `<scratch>/validator-reverse.mjs`. Each case copies a schema-valid throwaway profile, breaks the **data** one way, and runs `scripts/validate-store-profile.mjs`. All 14 exited 1.

| Broken | Check that fired |
|---|---|
| product filed under a parent category | `category-is-leaf` |
| product uses an option that does not exist | `option-title-exists` |
| variant sets `Size="99"` | `variant-option-value-exists` |
| product references an unrendered file | `image-in-manifest` |
| manifest status flipped to `rejected` | `image-accepted` |
| one byte appended to a webp | `manifest-sha256` (recomputed hash printed against the recorded one) |
| a webp deleted | `manifest-file-on-disk` |
| `catalog.counts.variants` set to 39 | `catalog-counts` (`= 39, recount = 40`) |
| provider URL in `images[0]` | `schema:catalog-products` **and** `no-http-in-image-fields` (both fire) |
| description shortened to 9 chars | `schema:catalog-products.schema.json` |
| `theme.radius: "enormous"` | `schema:store-profile.schema.json` |
| `theme.json dictionary` changed | `schema:theme-preset.schema.json` |
| manifest `width: 100` | `schema:media-manifest.schema.json` |
| collection lists a missing product | `collection-product-exists` |

Controls: unbroken profile → exit 0; `media/` removed **without** `--skip-media` → exit 1; `media/` removed **with** `--skip-media` → exit 0.

Ajv runs with `strict: true, allErrors: true`. All four shipped schemas compile under strict mode with no complaint. One option is not the default: `multipleOfPrecision: 2`, because `catalog-products.schema.json` prices with `multipleOf: 0.01` and in binary floating point `129.99 / 0.01 = 12998.999999999998` — without the tolerance every legitimate `.99` price would be rejected. This is commented in the script.

## 5. Live proof

### Probe A — the default path is unchanged (`upready_store_s1a_probe`)

Created with `createdb`, `DATABASE_URL` overridden per command (`.env` never edited), `STORE_PROFILE` passed empty.

| | baseline `upready_store_sneakers` (recounted read-only) | probe `upready_store_s1a_probe` |
|---|---|---|
| public tables | 147 | **147** |
| products | 11 | **11** |
| product variants | 36 | **36** |
| images | 30 | **30** |
| product categories | 12 | **12** |
| regions | 241 | **241** |
| sales channels | 1 | **1** |
| api keys | 1 | **1** |

Store name `My Store`, sales channel `Default Sales Channel`, first image URL `https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png`, `store_locale` = 36. Also seeded: 4730 prices, 37296 translations.

### Probe B — a real profile seeded end to end (`upready_store_probe_shop`)

`data/profiles/sneakers/` is being written by the other agents right now, so instead a **schema-valid throwaway profile** was generated outside `data/profiles/` (`<scratch>/profiles/probe-shop`, generator `<scratch>/make-fixture-profile.mjs`) with real WebP bytes produced locally by `sharp` — no paid provider was called, `costUsd: 0` in its manifest.

```
STORE_MEDIA_BASE_URL=http://localhost:9023/static/store-profiles/probe-shop \
  node scripts/store-profile-up.mjs probe-shop --dir <scratch>/profiles/probe-shop
```

exit 0. Output: `database upready_store_probe_shop: created`, `media: copied 14 file(s)`, `seeded: 10 products, 40 variants, 4 categories, 241 regions`, `publishable key: pk_cce7c90d…fab2f43`. A second run printed `already exists`, the same counts and the same key, exit 0 — re-running is safe.

Verified in that database:

- store `Probe Athletics`, sales channel `Probe Athletics Sales Channel` — from `brand`
- `subtitle` = `Fixture subtitle for Probe Canvas Low` on the product row
- `metadata->>'specs'` = `{"Drop": "8 mm", "Weight": "200 g (size 42)", "Sole material": "Rubber", "Upper material": "Engineered mesh"}`
- image URL = `http://localhost:9023/static/store-profiles/probe-shop/probe-runner-hero.webp` — the relative ref prefixed
- prices per variant: `min 118, max 118, over 40 variants`
- `PRB-0001-40` at `price_usd: 129` → `usd=128.99 eur=119.99 gbp=102.99 kwd=42.99 jpy=19349 krw=174579`
- translations: `runners` → `Laufschuhe` (profile key), option `Size` → `Schuhgröße` (profile key beating base "Größe"), 3 German `refund_reason` translations (base group the profile never wrote), 1012 French translation rows (a locale the profile never touched), `store_locale` = 36

**API check.** A scratch Medusa server was started on port **9099** against that database (9022, 9023, 8027, 8002 untouched) and stopped afterwards:

```
GET /store/products?handle=probe-runner&fields=handle,subtitle,title,*images,+metadata
→ {"handle":"probe-runner",
   "subtitle":"Fixture subtitle for Probe Runner",
   "specs":{"Drop":"8 mm","Weight":"200 g (size 42)","Sole material":"Rubber","Upper material":"Engineered mesh"},
   "firstImage":"http://localhost:9023/static/store-profiles/probe-shop/probe-runner-hero.webp"}

GET /static/store-profiles/probe-shop/probe-runner-hero.webp → 200 image/webp 1944 bytes
```

`subtitle` and `metadata.specs` survive to the store API, and the copied media is served from `static/`.

### Package scripts

```
pnpm store-profile:validate probe-shop --dir <scratch>/profiles/probe-shop      → exit 0
pnpm store-profile:validate probe-shop --dir <no media dir> --skip-media        → exit 0
```

Both print the recounted numbers: `products 10 / variants 40 / image refs 10 (unique files: 10)` against `declared products 10, variants 40, images 10`, and `media: 14 manifest entries (14 accepted, 0 flagged, 0 rejected), 14 files hashed`.

## 6. What I could NOT verify

1. **The real `sneakers` profile.** At the time of writing it holds `catalog/`, `i18n/` and `design/` but no `profile.json` and no `theme.json`; `node scripts/validate-store-profile.mjs sneakers --skip-media` exits 2 with `Store profile "sneakers" is missing profile.json`. A read-only Ajv check of the part that does exist passes: `catalog/products.json` — **14 products, 225 variants, 14 image refs, valid against `catalog-products.schema.json`**. The profile has never been seeded by me and `store-profile-up.mjs` has never been pointed at `sneakers` (that database is the live stand).
2. **`medusa build`.** Forbidden for this stage, so the build output was not exercised. By construction `scripts/copy-migration-data.js` copies every `.json` under `src/migration-scripts/data/`, which now includes `data/profiles/<id>/**.json`; it copies **no** image bytes, which is correct — in a built deployment the media comes from `static/store-profiles/<id>/`, which `store-profile-up.mjs` fills. Untested.
3. **The storefront.** `NEXT_PUBLIC_STORE_PROFILE`, theme wiring and the home blocks are another agent's zone; nothing on that side was run.
4. **A profile-only locale.** `mergeLocales` unions base and profile locale codes and throws a named error if a profile-only locale file has no `name`. The fixture never exercises that branch on a locale outside the base 36 — only the union of the base 36 with profile overrides was tested.
5. **`charm` on a one-decimal currency.** No currency in Medusa's table has `decimal_digits: 1`, so the branch is generic (`digits >= 1` keeps the `.99` ending) but untested against real data.

## 7. Leftovers for the operator

- `apps/backend/static/store-profiles/probe-shop/` — 14 fixture WebP files from probe B. Gitignored (`apps/backend/static/` in `.gitignore:65`), so it cannot reach a commit. Removing it needs the deletion guard's approval (`rm -rf` of a non-cache path), which is Ivan's call, not mine.
- Two scratch databases left in place, as the brief allows: `upready_store_s1a_probe` (default-path probe) and `upready_store_probe_shop` (fixture-profile probe). Neither `upready_store` nor `upready_store_sneakers` was written to.
- One honest note on process hygiene: stopping the scratch server used `pkill -f "medusa develop"`, which is not scoped to my own process. It killed my `npx` wrapper only; the pilot stand on 9023 (pid 4611, parent 69624 `cli.js develop`) survived — verified afterwards with `lsof -nP -iTCP -sTCP:LISTEN` and `curl http://localhost:9023/health` → **200**. Port 9022 (Ivan's stand) also still listening. `lsof -ti :PORT` returns nothing on this machine, so a first reading that looked like "both ports dead" was a bad measurement, not a dead service.

## 8. Contract notes for the other stages

- **Env.** `STORE_PROFILE=<id>` picks `data/profiles/<id>/`. `STORE_PROFILE_DIR=<abs path>` overrides the directory (fixtures, dry runs); the id must still equal `profile.json`'s `id`. `STORE_MEDIA_BASE_URL` is the directory the profile media is served from, **without** a trailing `media/` — the seed drops the `media/` segment and appends the file name, matching `store-profile-up.mjs`, which copies into `static/store-profiles/<id>/`.
- **Read once.** The data modules read the environment at import time, which is why the tests use `jest.isolateModules`.
- **Profile i18n shape.** `<profile>/i18n/<locale>.json` is the base locale file's shape, partial: `{ "name"?: string, "translations": { ...groups } }`. A file that puts the groups at the top level without the `translations` wrapper is accepted as the same thing; anything else throws by name.
- **A profile product carries** `collections` and `imageBrief` for the authors — the seed strips both. Collection membership is seeded from `catalog/collections.json`; an asymmetry between the two is a **warning**, a dangling handle is a **failure**.
