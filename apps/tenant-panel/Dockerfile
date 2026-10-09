# Tenant panel (Vite SPA) built from the monorepo root, served by nginx which
# also PROXIES /auth and /tenants to the backend.
#
#   docker build -f apps/tenant-panel/Dockerfile -t mt-panel:latest .
#
# Why a proxy and not a cross-origin call: vite.config.mts says it in full —
# Medusa applies CORS to /admin, /store and /auth only, so `/tenants/*` has no
# CORS middleware and a direct cross-origin panel cannot read it. The dev
# server proxies those two prefixes; this image reproduces that in production,
# so the browser talks to ONE origin and the session cookie stays first-party.
# That is why __BACKEND_URL__ stays empty here (lib/client/client.ts then falls
# back to window.location.origin), exactly as in dev.

FROM node:22-alpine AS workspace
RUN corepack enable && corepack prepare pnpm@10.11.1 --activate
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json
COPY apps/tenant-panel/package.json apps/tenant-panel/package.json
RUN pnpm install --frozen-lockfile

COPY apps/tenant-panel apps/tenant-panel
# The panel guide (t-2026-10-09-103). Its pages, its frames, the brands table
# with the logos and publish.mjs, which builds them with VitePress (a package
# of the panel, installed above) into the help served at /help/ and, on port
# 8081, at the root of the docs hosts (t-2026-10-09-104).
COPY docs/owner-guide docs/owner-guide

FROM workspace AS build
ARG VITE_MEDUSA_STOREFRONT_URL
ARG VITE_TENANT_CNAME_TARGET
ENV VITE_MEDUSA_STOREFRONT_URL=$VITE_MEDUSA_STOREFRONT_URL \
    VITE_TENANT_CNAME_TARGET=$VITE_TENANT_CNAME_TARGET \
    NODE_ENV=production
WORKDIR /repo/apps/tenant-panel
# `pnpm build` is `tsc --noEmit && vite build`; the typecheck needs the whole
# workspace's types, which the install above provides.
RUN npx vite build
# The help, after vite. publish.mjs builds it with the panel's vitepress and
# fails when a page shows a frame that is not in git.
RUN node /repo/docs/owner-guide/publish.mjs --out /repo/help-sites

FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/tenant-panel/dist /usr/share/nginx/html
# One build per brand and the nginx map of hosts to brands (nginx.conf).
COPY --from=build /repo/help-sites /usr/share/nginx/help
COPY apps/tenant-panel/nginx.conf /etc/nginx/templates/default.conf.template
# 8080 the panel, 8081 the docs hosts (nginx.conf).
EXPOSE 8080 8081
