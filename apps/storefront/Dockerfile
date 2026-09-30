# Next.js storefront, built from the monorepo root.
#
#   docker build -f apps/storefront/Dockerfile \
#     --build-arg NEXT_PUBLIC_STORE_PROFILE=sneakers \
#     --build-arg NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api-kerbstone.upready.dev \
#     --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_... \
#     --build-arg NEXT_PUBLIC_BASE_URL=https://kerbstone.upready.dev \
#     --build-arg STORE_MEDIA_BASE_URL=https://api-kerbstone.upready.dev/static/store-profiles/sneakers \
#     -t kerbstone-storefront:<tag> .
#
# Build context MUST be the repository root, for two reasons, both read from
# source in this repo, not assumed:
#   1. pnpm workspace: the lockfile only resolves with every member's
#      package.json present (same as the backend Dockerfile).
#   2. apps/storefront/scripts/build-profile.mjs, wired as the "prebuild"
#      script (package.json), reads
#      ../backend/src/migration-scripts/data/profiles/<id>/profile.json by a
#      path relative to the storefront root (STORE_PROFILES_DIR default,
#      build-profile.mjs:22-30) — so apps/backend/src/migration-scripts/data
#      must exist in the build context even though this image never runs the
#      backend. The profile is baked into
#      src/lib/profile/profile.generated.json at build time; there is no way
#      to change NEXT_PUBLIC_STORE_PROFILE after the image is built, which
#      is why it is a --build-arg, not a runtime env var.
#
# The publishable key (NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY) is minted by the
# backend's seed on its first boot (docker-entrypoint.sh) and does not exist
# before then — deploy/README.md orders the backend up and seeded before
# this image is built, for real, not as a style preference.
#
# next.config.js sets output: "standalone" and
# outputFileTracingRoot: path.join(__dirname, "../../") (repo root), which
# nests the standalone server under
# apps/storefront/.next/standalone/apps/storefront/server.js with
# node_modules hoisted to .../standalone/node_modules — confirmed by an
# actual local `docker build` in this same session (deploy/README.md
# "Local Smoke Test" carries the command and its output), not assumed from
# Next.js docs alone.

FROM node:22-alpine AS workspace
RUN corepack enable && corepack prepare pnpm@10.11.1 --activate
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json
RUN pnpm install --frozen-lockfile

COPY apps/backend/src/migration-scripts/data apps/backend/src/migration-scripts/data
COPY apps/storefront apps/storefront
# scripts/build-themes.mjs (called by build-profile.mjs) reads the theme
# specs from the repo root; without them the profile build below fails.
COPY specs/design-system specs/design-system

FROM workspace AS build
ARG NEXT_PUBLIC_STORE_PROFILE
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_DEFAULT_REGION=us
# The locale a visitor gets when the URL carries none. NEXT_PUBLIC_ because
# next-intl's routing and the x-default hreflang read it in the browser too, so
# it has to be baked at build time; LOCALE_PIN and LOCALE_COUNTRY_MAP are read by
# the middleware at runtime and stay out of the image.
ARG NEXT_PUBLIC_DEFAULT_LOCALE=en
# No default on purpose. Left empty, the wordmark is the profile's brand.name
# (src/lib/util/env.ts). build-profile.mjs checks the name against the profile's
# design/style-board.md and fails the build on a mismatch. STORE_SITE_NAME_GATE=off
# skips that check for an image whose name is meant to differ from its fallback
# profile (deploy/compose.mt.yml). The old default "Gorgo Medusa Store" put the
# starter's name on every profile built without this argument.
ARG NEXT_PUBLIC_SITE_NAME
ARG STORE_SITE_NAME_GATE
ARG STORE_MEDIA_BASE_URL
# The zone a new shop's technical subdomain lands in, e.g. `shipshift.dev`. It is
# NEXT_PUBLIC_ because the onboarding wizard is a client component and prints it
# beside the handle field, so it has to be baked at build time; the server half
# reads the plain DEMO_TENANT_BASE_DOMAIN at runtime instead.
ARG NEXT_PUBLIC_DEMO_TENANT_BASE_DOMAIN
# Yandex Maps JS API 2.1 key for the checkout pickup-point map
# (i03-checkout-pvz-map-address-suggest). The map lives in a "use client"
# component and reads process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY, which Next
# inlines at BUILD time — a runtime env var never reaches the browser bundle,
# and with an empty key the component renders its «карта не загрузилась»
# state instead of the points (checkout-pickup-map/index.tsx:160).
ARG NEXT_PUBLIC_YANDEX_MAPS_KEY
# «Войти с Яндекс ID» for buyers (y01, docs/auth-yandex.md). Same rule as the
# maps key: yandex-login/index.tsx is a "use client" component and Next inlines
# NEXT_PUBLIC_YANDEX_LOGIN_ENABLED at build time, so it has to be an ARG here.
ARG NEXT_PUBLIC_YANDEX_LOGIN_ENABLED=false
ENV NEXT_PUBLIC_STORE_PROFILE=$NEXT_PUBLIC_STORE_PROFILE \
    NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_PUBLIC_DEFAULT_REGION=$NEXT_PUBLIC_DEFAULT_REGION \
    NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE \
    NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME \
    STORE_MEDIA_BASE_URL=$STORE_MEDIA_BASE_URL \
    STORE_SITE_NAME_GATE=$STORE_SITE_NAME_GATE \
    NEXT_PUBLIC_DEMO_TENANT_BASE_DOMAIN=$NEXT_PUBLIC_DEMO_TENANT_BASE_DOMAIN \
    NEXT_PUBLIC_YANDEX_MAPS_KEY=$NEXT_PUBLIC_YANDEX_MAPS_KEY \
    NEXT_PUBLIC_YANDEX_LOGIN_ENABLED=$NEXT_PUBLIC_YANDEX_LOGIN_ENABLED \
    NODE_ENV=production \
    REGION_PIN=true
WORKDIR /repo/apps/storefront
# build-profile.mjs is wired as the "prebuild" npm script, which a bare
# `npx next build` never runs: stand one shipped the checked-in
# profile.generated.json (localhost:9023 media URLs) and its hero rendered as
# a broken image (measured 2026-09-10 on kerbstone.upready.dev/en). Run it
# explicitly so STORE_MEDIA_BASE_URL and the profile reach the bundle.
RUN node scripts/build-profile.mjs && npx next build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=8000
WORKDIR /app
COPY --from=build /repo/apps/storefront/.next/standalone ./
COPY --from=build /repo/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=build /repo/apps/storefront/public ./apps/storefront/public

EXPOSE 8000
CMD ["node", "apps/storefront/server.js"]
