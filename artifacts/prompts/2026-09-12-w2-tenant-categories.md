# W2 — each shop shows only its OWN categories

**Worktree (yours alone):** `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-categories`
(branch `feat/mt-categories`, based on `21c6c93`). Work only there. Do not push. Do not deploy.
Do not touch any other worktree.

## The defect, measured on the live product

Three tenants are live on the shipshift.dev deployment, each with its own catalog in its own sales
channel (Acme/sneakers 14 products, Globex/home-goods 12, Initech/electronics 14 — measured in the
database, the three sets are disjoint). Products are isolated. **Categories are not:**

```
$ curl -sS -L https://acme.shipshift.dev/en   | grep -oE 'categories/[a-z0-9-]+' | sort -u
$ curl -sS -L https://globex.shipshift.dev/en | grep -oE 'categories/[a-z0-9-]+' | sort -u
   # identical on both, and spanning all three profiles:
   categories/accessories  categories/audio  categories/footwear
   categories/power-and-parts  categories/the-house  categories/the-kitchen
```

The sneakers shop offers "The kitchen"; the home-goods shop offers "Footwear" and "Audio". 20
categories exist in the database and every shop lists all 20.

## Why, and what already exists (do not rebuild it)

- Categories are global in Medusa: no sales channel, no owner column.
- Wave 2 already built the ownership record: `apps/backend/src/links/tenant-product-category.ts`,
  and `GET /tenants/product-categories` (`apps/backend/src/api/tenants/product-categories/route.ts`)
  already lists, creates and scopes through it — read its header comment, it is thorough.
- A store-side route already exists too: `apps/backend/src/api/store/tenant/product-categories/`.
- The storefront does NOT use it: `apps/storefront/src/lib/data/categories.ts` calls the global
  `/store/product-categories` (lines 14 and 115).

So two halves are missing, and both are yours:

1. **Nothing links the seeded categories to a tenant.** `apps/backend/src/scripts/seed-mt-demo.ts`
   binds each profile's PRODUCTS to its tenant's sales channel (and dismisses foreign links) but
   says nothing about categories. Bind each profile's categories — the handles are in
   `apps/backend/src/migration-scripts/data/profiles/<profile>/catalog/categories.json`, parents and
   children — to the tenant that owns that catalog, through the existing link. Idempotent, like the
   rest of that script.
2. **The storefront asks the wrong route.** Point its category reads at the tenant-scoped store
   route, keeping the single-store fallback working for a host with no tenant.

Verify the panel's Categories screen shows only its own after the binding — the backend route
already scopes, so this should need no panel change; say so if it does.

## The isolation hole — do not widen it

`t-2026-09-11-01` is OPEN: `/tenants/*` trusts reference ids from the request body. Any route you
add or change that takes an id MUST check that the id belongs to the caller's tenant, and your
acceptance must state that you tried to break it with a live call that has to fail (rule 18f).
`assertOwnedCategory` in `apps/backend/src/api/tenants/tenant-scope.ts` is the existing helper.

## Acceptance — the live product, not your report (18f)

- A local stand against the live backend, with the host spoofed (`acme.localhost`,
  `globex.localhost` — §2 of `docs/multitenancy/storefront-by-host.md`).
- The measurement above, re-run, showing the two shops now listing DIFFERENT category sets, each
  matching its own profile's `categories.json`.
- A host with no tenant still lists categories the old way.
- One adversarial call: ask tenant A's panel session for tenant B's category by id and show the
  refusal.
- Typecheck and the repo's own tests green — read `AGENTS.md` for the commands. Copy the real
  output; do not predict it.

## Coordination — a file you SHARE with W3

W3 is working on category and hero IMAGES, in its own worktree off the same commit, and will also touch
`apps/storefront/src/lib/data/categories.ts` (it needs `metadata` in the requested `fields`).
The two branches are merged by the orchestrator, so the only cost of an overlap is a conflict he
has to resolve blind. You own WHICH ROUTE is called; W3 owns WHICH FIELDS are requested. Keep your
change to the route and leave the `fields` strings alone; if you must touch them, say so in your
report in one line.

## Rules

- Fix the class, not the call site (20). A zero read is a developer error, not "empty" (20a): a
  tenant that resolves but owns no category must be a loud error, not a silently empty shop.
- Commit in your worktree with `IVAN_OK=1 git commit`, Conventional Commits, task id
  `(t-2026-09-12-mt-storefront-by-host)`. Never push.

## Report back

What you changed, the before/after category sets per host as real terminal output, what the
adversarial call returned, what you saw in a browser, and anything you found and did not fix.
