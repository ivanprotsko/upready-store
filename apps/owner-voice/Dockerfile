# The owner voice chat stand (t-2026-10-20-24).
#
# No build step: the app has zero runtime dependencies and Node 22.18+ runs
# TypeScript directly (type stripping), the same as apps/bot. The fixtures go
# into the image, so a stand with no keys still answers.
FROM node:22-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src
COPY fixtures ./fixtures
COPY scripts ./scripts

ENV NODE_ENV=production
ENV PORT=5470
EXPOSE 5470

USER node

CMD ["node", "src/server.ts"]
