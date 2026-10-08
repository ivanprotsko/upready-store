# The school cabinet (apps/school, t-2026-10-08-37): React Router rendered on
# the server, built from the monorepo root like every other app here.
#
#   docker build -f apps/school/Dockerfile -t mt-school:latest .
#
# apps/school is a pnpm root of its own with its own lockfile (the root
# pnpm-workspace.yaml excludes it), so the image installs the school's
# dependencies and nothing of the backend, the storefront or the panel.
# Configuration arrives at run time (SCHOOL_* in deploy/compose.mt.yml); no
# key is baked into the image.

FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.11.1 --activate
WORKDIR /school
COPY apps/school/package.json apps/school/pnpm-lock.yaml apps/school/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/school ./
ENV NODE_ENV=production
RUN pnpm build

FROM node:22-alpine AS prod-deps
RUN corepack enable && corepack prepare pnpm@10.11.1 --activate
WORKDIR /school
COPY apps/school/package.json apps/school/pnpm-lock.yaml apps/school/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /school
COPY --from=prod-deps /school/node_modules ./node_modules
COPY apps/school/package.json ./package.json
COPY --from=build /school/build ./build
USER node
EXPOSE 3000
CMD ["node_modules/.bin/react-router-serve", "./build/server/index.js"]
