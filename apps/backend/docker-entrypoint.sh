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
# 4. admin user — `medusa user -e … -p …` (README.md:158). The command has no
#    "create if missing" mode: on a second boot the create-users workflow
#    raises on the duplicate email and the CLI exits non-zero
#    (node_modules/@medusajs/medusa/dist/commands/user.js:57-77 — the workflow
#    run, then `process.exit(1)` when auth registration reports an error), so
#    idempotency is this script's job: a non-zero exit here is logged and
#    ignored, and only THIS step is allowed to fail that way. The log tail is
#    filtered so the password can never reach the container log.
# 5. exec the real command (CMD from the Dockerfile, normally `medusa start`)
#    so it becomes PID 1 and receives signals directly — no shell left
#    holding the process, matching Docker's own stop/restart expectations.
set -eu

echo "[entrypoint] running database migrations"
node_modules/.bin/medusa db:migrate

echo "[entrypoint] running the seed (no-op if this stand's store already exists)"
node_modules/.bin/medusa exec ./src/migration-scripts/initial-data-seed.js

echo "[entrypoint] seeding the default block composition (no-op if one is saved)"
node_modules/.bin/medusa exec ./src/scripts/seed-storefront-settings.js

if [ -n "${MEDUSA_ADMIN_EMAIL:-}" ] && [ -n "${MEDUSA_ADMIN_PASSWORD:-}" ]; then
  echo "[entrypoint] ensuring the admin user exists: ${MEDUSA_ADMIN_EMAIL}"
  if node_modules/.bin/medusa user -e "$MEDUSA_ADMIN_EMAIL" -p "$MEDUSA_ADMIN_PASSWORD" \
      > /tmp/medusa-user.log 2>&1; then
    echo "[entrypoint] admin user created"
  else
    echo "[entrypoint] 'medusa user' exited non-zero — treated as 'already exists', boot continues."
    echo "[entrypoint] last lines of its output (any line carrying the password is dropped):"
    tail -n 5 /tmp/medusa-user.log | grep -Fv "$MEDUSA_ADMIN_PASSWORD" || true
  fi
else
  echo "[entrypoint] MEDUSA_ADMIN_EMAIL/MEDUSA_ADMIN_PASSWORD unset — no admin user is created"
fi

echo "[entrypoint] starting: $*"
exec "$@"
