# Goal

The buyer chooses delivery between «Оксана Черкашина pickup» and «Оксана Черкашина courier · 10,00 ₽».

Measured live (QA q01, `https://cherkashino.shipshift.dev/ru/checkout`, 2026-09-15; screenshot
`{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/06-checkout-1280x900.png`, and the placed order #5 carries
`shipping_methods[0].name = "Оксана Черкашина courier", amount = 10`). Two things are wrong at once:

1. **The names are machine-made** — the shop's own name plus an English code word. Nothing tells the buyer
   whether «pickup» means a pick-up point, the seller's flat, or a parcel locker.
2. **The courier price is 10,00 ₽** — the provisioning default (`DEFAULT_COURIER_AMOUNT`), not a tariff. A
   buyer reads it as a promise; the owner cannot honour it.

The repository already contains the cure for half of it. `apps/backend/src/workflows/tenant/provision-tenant-warehouse/index.ts`
now names the two defaults through `defaultMethodNames(locale)`
(`apps/backend/src/shipping-tariffs/default-method-names.ts` — «Самовывоз» / «Курьером» for `ru`), and
`apps/backend/src/scripts/rename-default-shipping-methods.ts` exists precisely to rename the machine-made names
of tenants provisioned by the earlier cut:

```
npx medusa exec ./src/scripts/rename-default-shipping-methods.ts     # LOCALE=ru by default for a ru store
```

Оксана's tenant was created 2026-09-15 03:55 WITA, before that code was deployed (wave 2, sha `2508708`), and
the script has never been run on the host — the wave-2 report lists only `backfill-hero-copy` and
`backfill-option-translations` (`{{MISSION_DIR}}/artifacts/d02-deploy-mt-2/report.md`).

## What to do

1. Run the rename for the live tenants (through `docker exec mt-backend`), idempotently, and prove the result
   from the shop's own API, not from the script's log.
2. Make it part of the deploy recipe so the next wave does not need a human to remember it — the same place
   `backfill-hero-copy.js` is invoked.
3. Give the two defaults a description the buyer can act on («Самовывоз — …», «Курьером по России — …») and
   decide what to do about the 10 ₽: either a sane default the owner must confirm, or the method hidden until a
   tariff exists. State the choice and its reason; the real tariffs are Оксана's data (task t04 built the zone
   and tariff screens — check what is already there for this tenant before adding anything).

Do not touch other tenants' renamed options: the script's `isMachineMadeDefaultName` guard is what protects
them, keep it.

## Acceptance (measure — rule 18f)

1. `GET /store/shipping-options?cart_id=<cart>` for a cart in Оксана's shop returns Russian names, no shop name
   inside them and no English code words — paste the JSON;
2. the checkout screen shows those names with a price and a one-line explanation — screenshots 1280×900 and
   390×844 of `https://cherkashino.shipshift.dev/ru/checkout`;
3. a second run of the rename changes nothing (paste the counter);
4. a neighbouring tenant (`zolotaya-nit-1057`) still answers 200 and its options are untouched — paste both.

## Two kinds of change in one task

The repository change (deploy recipe, descriptions, anything in `apps/`) goes through your task branch and a PR
like any build task. The rename of the live tenant's options is a DATA operation on the host: run it through
`docker exec mt-backend …`, never as part of a deploy, and write into your report the command, its output and
the before/after names read back from the store API. Do not rebuild or restart containers (rule 21c).
