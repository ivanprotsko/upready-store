#!/bin/sh
# Runs inside the backend runtime image, cwd /app (= the built .medusa/server
# output copied verbatim in the Dockerfile's runtime stage).
#
# 1. migrate — always safe to re-run, Medusa's own migration runner tracks
#    what already applied (README.md "Run migrations and sync links").
# 2. seed — the seed script itself is the guard, not this script: AGENTS.md
#    "The seed is all or nothing. initial_data_seed returns early when the
#    sales channel named in data/store/json/store.json already exists" — so
#    calling it on every boot is a no-op on a stand that already has data,
#    and is what actually creates the store, regions, catalog and the
#    publishable key on stand one's first boot. STORE_PROFILE selects which
#    profile's catalog/theme it seeds (apps/backend/src/migration-scripts/
#    initial-data-seed.ts reads it; store-profile-up.mjs is the local-dev
#    equivalent of steps 1-3 here).
#    Runs the COMPILED .js, not the .ts the package.json "seed" script names
#    — see the Dockerfile's build-stage comment for why: no ts-node ships in
#    this image.
# 3. storefront settings — src/scripts/seed-storefront-settings.ts writes this
#    profile's default block composition into store.metadata.storefrontSettings
#    when nothing is saved there yet (its own guard, line 128: an operator's
#    saved document is never overwritten). It needs the Store row, so it runs
#    AFTER step 2, never before. Compiled to .js by `medusa build` like every
#    other file under src/, same reason as step 2.
# 4. demo accounts — src/scripts/ensure-accounts.ts converges BOTH logins onto
#    the env values on every boot: the Medusa Admin user
#    (MEDUSA_ADMIN_EMAIL/MEDUSA_ADMIN_PASSWORD) and the demo storefront customer
#    (DEMO_CUSTOMER_EMAIL/DEMO_CUSTOMER_PASSWORD) — created when missing, password
#    updated when it differs, left alone when it already matches, one plain log
#    line each. It REPLACES the `medusa user -e … -p …` call this script ran until
#    2026-09-10 (it stood right here, and its failure was tolerated with a comment
#    explaining that the CLI has no "create if missing" mode:
#    node_modules/@medusajs/medusa/dist/commands/user.js:57-77 raises on the
#    duplicate email and exits non-zero on every boot after the first). Tolerating
#    that exit also silently tolerated the case that actually bit stand one — a
#    password CHANGED in the env file never reaching the database, so the stand
#    kept answering to the password it had been created with. This step is
#    therefore NOT allowed to fail: `set -e` is left in force for it. It prints no
#    password, so no log filtering is needed. Compiled to .js by `medusa build`,
#    like steps 2 and 3.
# 5. delivery-method names — src/scripts/rename-default-shipping-methods.ts
#    converges the shops provisioned by an older image: the first cut of
#    provisionTenantWarehouseWorkflow named their two options «<Shop> pickup»
#    and «<Shop> courier», and that is what the buyer read at checkout
#    (measured on cherkashino.shipshift.dev 2026-09-15). It renames only names
#    that still match that machine pattern, so an option the owner renamed or
#    edited herself is never touched, and a second run changes nothing. It is
#    the one step here that is COSMETIC, so unlike step 4 it is not allowed to
#    keep the backend down: `set -e` is lifted for it and a failure is logged.
# 6. exec the real command (CMD from the Dockerfile, normally `medusa start`)
#    so it becomes PID 1 and receives signals directly — no shell left
#    holding the process, matching Docker's own stop/restart expectations.
set -eu

echo "[entrypoint] running database migrations"
node_modules/.bin/medusa db:migrate

echo "[entrypoint] running the seed (no-op if this stand's store already exists)"
node_modules/.bin/medusa exec ./src/migration-scripts/initial-data-seed.js

echo "[entrypoint] seeding the default block composition (no-op if one is saved)"
node_modules/.bin/medusa exec ./src/scripts/seed-storefront-settings.js

echo "[entrypoint] converging the admin and demo-customer accounts onto the env values"
node_modules/.bin/medusa exec ./src/scripts/ensure-accounts.js

echo "[entrypoint] renaming the machine-made delivery methods of shops provisioned by an older image"
set +e
node_modules/.bin/medusa exec ./src/scripts/rename-default-shipping-methods.js
rename_status=$?
set -e
if [ "$rename_status" -ne 0 ]; then
  echo "[entrypoint] WARNING: rename-default-shipping-methods exited $rename_status; delivery method names were left as they are"
fi

echo "[entrypoint] starting: $*"
exec "$@"
