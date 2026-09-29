#!/bin/sh
# Runs inside the backend runtime image, cwd /app (= the built .medusa/server
# output copied verbatim in the Dockerfile's runtime stage).
#
# 0. warn, loudly, when SMTP_HOST is empty in production. The backend boots and
#    serves exactly the same without it, because medusa-config.ts registers the
#    SMTP provider only when SMTP_HOST is set, so the one symptom is that no
#    e-mail ever leaves: no order confirmation, no password reset, no owner
#    notice. The live host ran like that from 2026-09-24 at the latest to
#    2026-09-30, and nothing in its log said so (audit 46df A-03).
#    The block is printed first and again right before the server starts, so it
#    is in view whether you read the boot log from the top or `docker logs
#    --tail` from the bottom. A warning, not a refusal: a stand with no mailbox
#    is a legitimate deployment.
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
# 6. migrated-catalogue redirects — src/scripts/backfill-tenant-redirects.ts
#    writes the 301 rows a migrated shop's own metadata implies
#    (`migrated_from` + `source_url` on every imported product and category),
#    so the old addresses of an imported catalogue answer 301 after an
#    ORDINARY deploy. Until b02 this was a one-off script run by hand against
#    a registry JSON living in one task's worktree, which is why the rows
#    existed on the acceptance stand and `tenant_redirect` was empty on the
#    whole live platform (`artifacts/q03-gap-recheck/gap-recheck.md` §4).
#    Idempotent twice over: an existing `from_path` is skipped, and the tenant
#    is stamped after a successful run so a redirect the OWNER deleted in the
#    panel is not resurrected by the next boot. Cosmetic like step 5, so
#    `set -e` is lifted and a failure is logged rather than kept the backend
#    down.
# 7. link `pp_robokassa_robokassa` to every RUB region. A payment provider is
#    offered PER REGION (`region.payment_providers`), so without this row the
#    store lists no Robokassa for anybody, however many shops saved their
#    account in the panel — the per-shop check in
#    `src/api/store/payment-providers/route.ts` only ever narrows that list.
#    Idempotent (a region that already offers it is skipped) and cosmetic in the
#    same sense as steps 5 and 6: a failure is logged, the backend still boots.
# 8. orphan orders — src/scripts/link-orphan-orders.ts links every placed order
#    in a shop's sales channel that has no tenant-order link. The `order.placed`
#    subscriber writes that link once, with no retry, and the panel lists orders
#    only through it (review-2026-09-21 T-1), so an order whose event was lost
#    in a restart stayed invisible to its owner for good. Idempotent (a linked
#    order is skipped, the link is upserted) and the same code the
#    `link-orphan-orders` job runs every ten minutes. Not allowed to keep the
#    backend down, like steps 5 to 7: `set -e` is lifted and a failure is logged.
# 9. exec the real command (CMD from the Dockerfile, normally `medusa start`)
#    so it becomes PID 1 and receives signals directly — no shell left
#    holding the process, matching Docker's own stop/restart expectations.
set -eu

warn_if_no_smtp() {
  if [ "${NODE_ENV:-}" = "production" ] && [ -z "${SMTP_HOST:-}" ]; then
    echo "[entrypoint] ######################################################################"
    echo "[entrypoint] WARNING: SMTP_HOST is empty in production. This backend sends NO e-mail:"
    echo "[entrypoint]   no order confirmation, no password reset, no owner notification."
    echo "[entrypoint]   Set SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM in the backend env"
    echo "[entrypoint]   (deploy/mt/shipshift.env.example lists them) and restart the backend."
    echo "[entrypoint] ######################################################################"
  fi
}

warn_if_no_smtp

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

echo "[entrypoint] writing the redirects a migrated catalogue implies (no-op when nothing was imported)"
set +e
node_modules/.bin/medusa exec ./src/scripts/backfill-tenant-redirects.js
redirects_status=$?
set -e
if [ "$redirects_status" -ne 0 ]; then
  echo "[entrypoint] WARNING: backfill-tenant-redirects exited $redirects_status; the old addresses of an imported catalogue may still answer 404"
fi

echo "[entrypoint] offering Robokassa in every RUB region (no-op when already linked)"
set +e
node_modules/.bin/medusa exec ./src/scripts/link-robokassa-regions.js
robokassa_status=$?
set -e
if [ "$robokassa_status" -ne 0 ]; then
  echo "[entrypoint] WARNING: link-robokassa-regions exited $robokassa_status; the checkout will not offer Robokassa to any shop"
fi

echo "[entrypoint] linking placed orders that never reached their shop (no-op when every order is linked)"
set +e
node_modules/.bin/medusa exec ./src/scripts/link-orphan-orders.js
orphans_status=$?
set -e
if [ "$orphans_status" -ne 0 ]; then
  echo "[entrypoint] WARNING: link-orphan-orders exited $orphans_status; some orders may still be missing from their owner's panel"
fi

warn_if_no_smtp

echo "[entrypoint] starting: $*"
exec "$@"
