FROM node:20-alpine AS build
WORKDIR /repo
RUN pnpm install --frozen-lockfile

FROM node:20-alpine
WORKDIR /app
COPY --from=build /repo/apps/backend/.medusa/server/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
