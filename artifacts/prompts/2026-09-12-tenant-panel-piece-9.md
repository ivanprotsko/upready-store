# Piece 9: one storefront process for every tenant, resolved by Host

Piece id `mt2-piece-9`. Task `t-2026-09-12-mt-storefront-by-host`. Worktree
`/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-2-by-host` (branch
`feat/mt-panel-2-by-host`). Ports: backend 9035, panel 5189, seam PORT 9048, storefront 8013. Read
`artifacts/prompts/2026-09-12-tenant-panel-common.md`, then `docs/multitenancy/storefront-by-host.md`
(the design; follow it, deviations go in the report with the measurement that forced them), then the
contract section "Piece 9". Model `tenant_domain` exists.

Build, checking `tsc` after each step:
1. Backend: `GET /storefront/by-host` (file `api/storefront/by-host/route.ts`; NO auth, NO publishable
   key — prove with a seam test that a call without any header answers 200; port stripped; algorithm
   §2 of the design), `GET/POST/DELETE /tenants/domains(/:id)` with the 409 rule, env
   `TENANT_BASE_DOMAINS` (default `upready.dev,localhost`) read in one helper
   `api/storefront/by-host/hosts.ts` shared by both. Matchers under `// ---- piece 9` (the by-host
   route needs no middleware entry unless you validate the query with zod).
2. Panel: own screen `routes/settings/domains` (technical hosts read-only, custom hosts list with add/
   remove, the one-line DNS hint "CNAME → stores.upready.dev"), linked from the overview page
   (`routes/home`) with a "Domains" link; wire `/settings/domains` at the piece-9 anchor; hooks
   `domains.tsx`.
3. Storefront (design §2 "Витрина", items 1–5): middleware resolution + request headers + 60 s cache;
   `lib/config.ts` key from `headers()` with env fallback; cache tags suffixed by handle and
   `/api/revalidate` accepting `handle`; `app/layout.tsx` theme/mode from headers; `(main)/page.tsx`
   uses the tenant home document from piece 8 if it is in your tree (check `lib/data/tenant-home.ts`;
   if absent, read `GET /store/tenant/home` yourself through a minimal loader and note it). Start ONE
   storefront WITHOUT a publishable key:
   `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9035 NEXT_DIST_DIR=.next-p9 corepack pnpm exec next dev --turbopack -p 8013 > /tmp/p9-storefront.log 2>&1 &`.
   Seed the two themes through `PUT /tenants/home` (acme → `{theme:{preset:"sneakers"}, settings:{defaultMode:"dark", header:"h5", hero:"k", tiles:"off", listing:"p2", footer:"f3"}, content:{…}}`,
   globex → `home-goods` light `h2/h/on/p4/f4`); if piece 8's PUT route is not in your tree, write the
   rows directly through a one-off `medusa exec` script under `apps/backend/src/scripts/` and say so.
4. Seam tests (`tenants-domains.spec.ts`): resolver 200 without headers for `<handle>.localhost` and
   for a custom host after POST; unknown host 404; B posting A's host → 409; B posting
   `<A handle>.upready.dev` → 409; B's list does not show A's domains.
5. e2e (`apps/storefront/e2e/by-host.e2e.mjs`, Playwright): `http://acme.localhost:8013/en/store` →
   9 product cards and `<html data-theme="sneakers" data-mode="dark">`; `http://globex.localhost:8013/en/store`
   → 3 cards and `home-goods`/`light`; no card title overlaps between the two; `http://localhost:8013`
   with `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` unset → the single-store fallback page (report what it
   shows); register a new tenant through `POST /tenants` and open `http://<handle>.localhost:8013/en/store`
   without restarting → 200 with an empty catalog. Screenshots `storefront-acme.png`,
   `storefront-globex.png` (1440×900) into `artifacts/docs/tenant-panel-shots/`.
6. `tsc` + `next lint` in `apps/storefront`, panel and backend checks per the common prompt.
