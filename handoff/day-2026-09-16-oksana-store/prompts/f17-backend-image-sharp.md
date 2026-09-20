# Goal

The production image of the Medusa backend (`apps/backend/Dockerfile`, deployed as `mt-backend` on the live host by `deploy/compose.mt.yml`) must start with every runtime dependency present. Today it does not: the image built from `dev` at ~11:20 WITA dies on boot with

```
Error starting server: An error occurred while registering API Routes. Error: Cannot find module 'sharp'
Require stack: /app/src/api/tenants/branding/upload/route.js
```

(measured on root@84.46.251.149: `docker logs mt-backend`, RestartCount=7; the broken image is kept as `mt-backend:d03-new-broken-sharp`, the platform runs on the older `mt-backend:wave2-2508708`). `sharp` was added to `apps/backend/package.json` dependencies by t16-owner-branding (line 74, `"sharp": "^0.35.4"`), so the dependency is declared — the loss happens in the image build.

# Where to look (facts, not a diagnosis)

- `apps/backend/Dockerfile:54` — build stage `pnpm install --frozen-lockfile`.
- `apps/backend/Dockerfile:75` — runtime stage `npm install --omit=dev --no-audit --no-fund` inside the `.medusa/server` output; the comment at line 23 explains why the lockfile is copied into `.medusa/server`. Check what `medusa build` writes into `.medusa/server/package.json` (is `sharp` there?), and whether `sharp`'s platform binaries (`@img/sharp-linux-x64`, `@img/sharp-libvips-linux-x64`) survive `--omit=dev` / an `--omit=optional`, given the host is linux/amd64 and the image may be built on a different platform.
- Reproduce locally without the host: `docker build -f apps/backend/Dockerfile -t mt-backend:f17 .` (same context and args as `deploy/compose.mt.yml` uses — read the compose file for `build:`), then `docker run --rm mt-backend:f17 node -e "require('sharp'); console.log('sharp ok')"` and `docker run --rm mt-backend:f17 ls node_modules/@img`. The measurement BEFORE the fix must show the failure, AFTER it the success — both go into the PR body verbatim.

# Acceptance

- `docker run --rm <new image> node -e "require('sharp')"` prints ok; the container starts and answers `GET /health` 200 in a local `docker run` with the same env shape as `deploy/compose.mt.yml`.
- A guard against the class: a build-time check in the Dockerfile (a `RUN node -e "require('sharp')"` after the runtime install, or a smoke step that requires every route module) so a missing runtime dependency fails the BUILD, not the live host.
- No change to `package.json` versions unless the measurement proves the version is the cause.

# What NOT to do

- Do not touch the live host and do not deploy — d03-deploy-mt-3 will redeploy after this PR is merged.
- Do not remove or rewrite the branding upload route to avoid `sharp`; the feature stays.
