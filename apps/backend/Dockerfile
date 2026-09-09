# Medusa backend, built from the monorepo root.
#
#   docker build -f apps/backend/Dockerfile -t <stand>-backend:<tag> .
#
# Build context MUST be the repository root: this is a pnpm workspace, so the
# lockfile only resolves with every workspace member's package.json present
# (pnpm-workspace.yaml lists apps/backend and apps/storefront), and
# `medusa build` needs the sibling apps/backend/src tree. Read AGENTS.md
# "Package Manager" before changing the pnpm version pinned below — it must
# match root package.json's packageManager field.
#
# Stage 1 compiles the backend with the full workspace (dev deps included,
# for typescript/ts-node and the eslint that `medusa build` runs as a report-
# only step). Stage 2 runs only the compiled output.
#
# What `medusa build` actually produces (read, not assumed — see
# node_modules/@medusajs/framework/dist/build-tools/compiler.js in this repo
# at build time):
#   - apps/backend/.medusa/server/  — compiled JS (src/**/*.ts -> **/*.js),
#     a COPY of apps/backend/package.json, and an attempted copy of
#     yarn.lock/pnpm.lock/package-lock.json. This repo's real lockfile is
#     named pnpm-lock.yaml, which matches none of those three names, so no
#     lockfile survives into .medusa/server. `npm install` there is
#     therefore unpinned by design, not an oversight; a frozen install is not
#     possible at this step.
#   - apps/backend/.medusa/server/src/migration-scripts/data does NOT exist
#     yet at that point — apps/backend/scripts/copy-migration-data.js copies
#     it in as a second step (this repo's package.json "build" script runs
#     both: "medusa build && node scripts/copy-migration-data.js"), and it
#     copies only directories and *.json files (AGENTS.md "Only JSON reaches
#     the build").
#   - No "static" directory is produced or copied. Medusa's local file
#     provider (the default when S3_BUCKET is unset, medusa-config.ts:12)
#     serves whatever "static" directory sits next to the running process's
#     cwd at /static/*. The runtime stage below creates an empty one so a
#     volume can be mounted over it; sync-media.sh fills it from the host.
#
# apps/backend/package.json's "seed" script names
# ./src/migration-scripts/initial-data-seed.ts — that path is copied
# verbatim into .medusa/server/package.json, but the compiled file at
# runtime is initial-data-seed.js. `npm run seed` in the runtime image would
# therefore try to run a .ts file with no ts-node installed (it is a
# devDependency, omitted in stage 2). docker-entrypoint.sh calls
# `medusa exec ./src/migration-scripts/initial-data-seed.js` directly
# instead of `npm run seed`, for exactly this reason.

FROM node:22-alpine AS workspace
RUN corepack enable && corepack prepare pnpm@10.11.1 --activate
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json
RUN pnpm install --frozen-lockfile

COPY apps/backend apps/backend

FROM workspace AS build
WORKDIR /repo/apps/backend
# --lint false: medusa build reports lint findings and continues either way
# (AGENTS.md "medusa build runs it as well, but only reports and carries
# on"), so this changes nothing about whether the build fails, only removes
# a redundant second lint pass already covered by CI/AGENTS.md's own gate.
RUN npx medusa build --lint false && node scripts/copy-migration-data.js

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /repo/apps/backend/.medusa/server/package.json ./package.json
# See the note above: no lockfile survives the build step, so this install
# is unpinned by design. --omit=dev drops typescript/ts-node/jest/eslint and
# every other devDependency; only what medusa start/db:migrate/exec need at
# runtime is installed.
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /repo/apps/backend/.medusa/server ./
COPY apps/backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/static/store-profiles

EXPOSE 9000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["medusa", "start"]
