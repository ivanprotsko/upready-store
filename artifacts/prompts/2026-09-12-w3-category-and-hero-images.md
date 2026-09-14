# W3 — images for categories and for the hero

**Worktree (yours alone):** `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-cat-images`
(branch `feat/mt-cat-images`, based on `21c6c93`). Work only there. Do not push. Do not deploy.
Do not touch any other worktree.

## The mechanism is already decided — build this one, do not re-open it

A product category has NO image field in core Medusa. The orchestrator's decision, made before this
brief and binding on you:

**A category's image is `product_category.metadata.image_url` (plus `metadata.image_alt`).**

Why this and not a tenant-side model:
- `metadata` is a jsonb column that already exists on the entity, so there is no migration, no new
  module and no join.
- It reaches a storefront through the field selection the category routes already accept
  (`fields=...,metadata`), so no new route is needed on the read path.
- Ownership is NOT this field's job: the `tenant-product-category` link is already the ownership
  record (`apps/backend/src/links/tenant-product-category.ts`), and a per-tenant image model would
  duplicate it.
- Measured: the three live profiles' category handles are disjoint (20 categories, no handle shared
  between profiles), so one image per category row is not a cross-tenant collision today. If you
  find a shared handle, stop and report it — that would break the decision and it is the
  orchestrator's to re-take, not yours.

Write the decision and its reasons into the code as a comment where the field is read and written,
so the next reader does not have to find this brief.

## Where the images already are

`/opt/upready-store/media/<profile>/` on the host, served by the backend at
`/static/store-profiles/<profile>/` — e.g.
`https://shipshift.dev/static/store-profiles/home-goods/…`. Measured file counts: electronics 23,
home-goods 18, sneakers 20. The three live profiles are sneakers (Acme), home-goods (Globex),
electronics (Initech).

`POST /tenants/uploads` already exists for files a shop owner adds
(`apps/backend/src/api/tenants/uploads/`).

## What to build

1. **Category image, write path.** The tenant panel's category screens can set and clear the image
   (a URL from the profile media, or a file through `POST /tenants/uploads`). Go through
   `/tenants/product-categories`, which already scopes by ownership.
2. **Category image, read path.** The storefront renders it wherever a category is shown as a tile.
   A category with no image must render the deliberate no-image state that already exists in the
   design, not a broken `<img>` and not a silent blank.
3. **Hero image.** It is `content.hero.image_url` in the tenant home document, written by
   `PUT /tenants/home` — the document shape is `docs/multitenancy/` (the tenant bundle / home
   config; find it, do not guess). Make the panel able to set it and the storefront render it.
4. **Seed the three live tenants** so Ivan sees real pictures, not an empty mechanism: give each
   profile's categories their images from that profile's media, and each tenant a hero. Put it in
   `apps/backend/src/scripts/seed-mt-demo.ts` beside the rest, idempotent like the rest of it.
   Check what each profile's media directory actually contains before you map anything — do not
   invent filenames (rule 17a).

## The isolation hole — do not widen it

`t-2026-09-11-01` is OPEN: `/tenants/*` trusts reference ids from the request body. Any route you
add or change that takes an id MUST check the id belongs to the caller's tenant, and your acceptance
must include a live call that has to FAIL and does (rule 18f). `assertOwnedCategory` in
`apps/backend/src/api/tenants/tenant-scope.ts` is the existing helper.

## Acceptance — the live product, not your report (18f)

- A local stand against the live backend, host spoofed (`acme.localhost`, `globex.localhost` —
  `docs/multitenancy/storefront-by-host.md` §2).
- Enter the flow at its start: log into the panel, set a category image and a hero through the UI
  with your own hands, then open the shop and SEE it. Not a database row, not a 200.
- A category with no image, shown, so the empty state is proved rather than assumed.
- One adversarial call: set an image on another tenant's category by id and show the refusal.
- At least one human-eyes criterion in your report (rule 27d): say what the tiles and the hero
  actually look like, at desktop and at 390px. "A screenshot is attached" is a fact about a file,
  not a verdict on the look.
- Typecheck and the repo's tests green — `AGENTS.md` has the commands. Copy the real output.

## Coordination — a file you SHARE with W2

W2 is pointing the storefront's category reads at the tenant-scoped route, in its own worktree off
the same commit, and touches `apps/storefront/src/lib/data/categories.ts` too. The two branches are
merged by the orchestrator, so the only cost of an overlap is a conflict he has to resolve blind.
**You own WHICH FIELDS are requested** (you need `metadata` in the `fields` strings); W2 owns which
route is called. Leave the route alone; if you must change it, say so in your report in one line.

## Rules

- Fix the class, not the call site (20). A zero read is a developer error, not "empty" (20a): if a
  profile's media directory yields no file where the seed expects one, fail with the absolute path
  you checked — do not write an empty image_url.
- UI work starts from the design canon: read `~/upready/packages/geist-kit/AGENTS.md` first (27).
- Commit in your worktree with `IVAN_OK=1 git commit`, Conventional Commits, task id
  `(t-2026-09-12-mt-storefront-by-host)`. Never push.

## Report back

What you changed, what you set through the UI and what you then saw, the adversarial call's result,
the human-eyes verdict, real command output, and anything you found and did not fix.
