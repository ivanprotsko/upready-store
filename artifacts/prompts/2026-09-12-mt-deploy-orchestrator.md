# Orchestrator brief — finish the shipshift.dev multi-tenant test deployment

You are the ORCHESTRATOR of this wave. Ivan ordered orchestration explicitly (chat, 2026-09-11
evening), so you may fan work out to workers. A separate session is the ACCEPTOR and will check your
result against the live product — not against your report (rule 18f). Write in English to workers.

**Worktree:** `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-deploy`
(branch `feat/mt-deploy`, commits `fbdbdcf` merge + `aeff2fe` deploy assets; nothing is pushed).
**Read first, in this order:**
1. `~/upready/memory/upready-store-mt-deploy-shipshift-2026-09-11.md` — the topology, the DNS, the
   ingress decision and why it is not Caddy.
2. `artifacts/docs/2026-09-12-mt-deploy-acceptor-state.md` — exactly where the deployment stood when
   this brief was written, what is measured and what is not.
3. `docs/multitenancy/storefront-by-host.md` §2 — how a host becomes a tenant.
4. `deploy/compose.mt.yml` and `deploy/scripts/tenant-ingress-sync.sh` header comments.

## The three tasks Ivan named

### 1. The deployment is live on shipshift.dev
The stack is already built and starting on the host (`/opt/upready-store/mt`,
`docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env`). Finish it:

- `https://shipshift.dev/app` — the native Admin logs in (`admin@upready.dev` / `supersecret`).
- `https://panel.shipshift.dev` — the tenant panel logs in (`admin@acme.test` / `supersecret`).
- Seed the three profile catalogs, one run each, then the demo:
  ```
  docker exec -e STORE_PROFILE=home-goods -e STORE_MEDIA_BASE_URL=https://shipshift.dev/static/store-profiles/home-goods \
    mt-backend node_modules/.bin/medusa exec ./src/migration-scripts/initial-data-seed.js
  # same for electronics; sneakers is seeded by the entrypoint on first boot
  docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/seed-mt-demo.js
  ```
  `initial-data-seed.ts`'s own header documents that a second run with another `STORE_PROFILE` adds
  a profile rather than a second store. Verify that claim on the live database instead of trusting
  it: count sales channels and products per channel before and after.
- Every Let's Encrypt certificate issued (`curl -sSI https://<host>/` with no `-k`).

### 2. Tenant domains
Ivan's latest list names **custombot.space** and **shiftship.dev**. The DNS and
`seed-mt-demo.ts` currently also wire **setpomo.com** to Globex, from his earlier message the same
evening. Nothing is lost either way — ASK him which it is before removing anything; leaving the
third attached is the cheaper mistake.

The acceptance is not "the row is in the database". It is:
- the domain opens the right shop over https, and
- a domain ADDED IN THE PANEL goes live with a certificate WITHOUT a redeploy — that is what
  `mt-ingress-sync` exists for, and it is the thing Ivan asked to see. Measure it: add a throwaway
  host in the panel, watch `/data/coolify/proxy/dynamic/mt-tenants.yml` gain it, then `curl` it.
  Record how long it took from click to working certificate.

### 3. Each tenant looks like its own shop
- **A different name in the storefront.** This is NOT configuration today: `NEXT_PUBLIC_SITE_NAME`
  is a build argument baked into one image, which is exactly defect A4 (every tenant's browser tab
  says `Store | Kerbstone`). `GET /storefront/by-host` already returns `tenant.name`; the title and
  every other place that renders the site name must read the resolved tenant instead of the build
  constant. Treat it as the code task it is, not as an env change.
- **Different product categories, matching each shop's goods.** Categories in Medusa are global —
  wave 2 piece 5 added the `tenant-product-category` link, and each profile's
  `data/profiles/<id>/catalog/categories.json` already carries its own. Bind each profile's
  categories to the tenant that owns that catalog, and make sure the panel's Categories screen shows
  only its own.
- **Images for categories and for the hero.** The profile media is already on the host at
  `/opt/upready-store/media/<profile>` and the backend serves it at
  `/static/store-profiles/<profile>/`. A category has no image field in core Medusa — decide and say
  how you store it (metadata vs a tenant-side model) before building. Hero image is
  `content.hero.image_url` in the tenant home document (`PUT /tenants/home`). `POST /tenants/uploads`
  exists for files the owner adds.

## Rules that bite in this area
- Acceptance = the live product on the real domain, entered at the start of the flow (18f). A 200
  from curl is a fact about a request, not about the page.
- Fix the class, not the call site (20). A zero read is not "empty" — make it a loud error.
- Every worker gets a worktree of its own (21e); no pushes, no deploys beyond this one without
  Ivan's word (21b/21c).
- The isolation hole `t-2026-09-11-01` is OPEN: `/tenants/*` trusts reference ids from the body
  (`location_id` and its whole class). Do not let this wave widen it — any new `/tenants/*` route
  that takes an id must check ownership, and say so in its acceptance.

### 4. The links Ivan asked to be handed (added by Ivan at handover)
He wants to OPEN things, not read that they exist. Produce ONE page of live links, and make every
link work before you hand it over:

- **The payment simulation that lands on onboarding.** The stands carry a demo card form that
  declines on `0000` before `placeOrder` (`~/upready/memory/stands-deploy-decisions-2026-09-09.md`)
  and `docs/multitenancy/onboarding-spec.md` is wave B's onboarding design. Find what actually
  exists on this deployment, wire the path pay → onboarding, and give the URL a person can click
  from a cold start. If the two halves are not connected today, say so in one sentence and build the
  missing half — do not hand over a link that only works if you already know the trick.
- **The onboarding scenario for adding a NEW prototype** (a new tenant shop end to end: sign up,
  get the technical subdomain, attach a domain, see the shop). Same standard: a URL, entered at the
  start of the flow, no hidden steps.
- **The specs and documents written overnight.** `docs/multitenancy/*.md` (hosting, onboarding,
  backup, detach, admin-tenants contract, tenant bundle format, storefront-by-host) and the three
  night reports. Ivan reads on the web, not in a terminal: publish them where he can open them, with
  the diagrams rendered, and give bare `file://` paths beside each for the local copies (rule 17c).
