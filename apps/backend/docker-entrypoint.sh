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
# 3. exec the real command (CMD from the Dockerfile, normally `medusa start`)
#    so it becomes PID 1 and receives signals directly — no shell left
#    holding the process, matching Docker's own stop/restart expectations.
set -eu

echo "[entrypoint] running database migrations"
node_modules/.bin/medusa db:migrate

echo "[entrypoint] running the seed (no-op if this stand's store already exists)"
node_modules/.bin/medusa exec ./src/migration-scripts/initial-data-seed.js

echo "[entrypoint] starting: $*"
exec "$@"
