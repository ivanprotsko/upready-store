# W1 — every tenant's storefront carries its OWN name (defect A4)

**Worktree (yours alone):** `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-sitename`
(branch `feat/mt-sitename`, based on `21c6c93`). Work only there. Do not push. Do not deploy.
Do not touch any other worktree.

## The defect, measured on the live product

Five different shops are live on the shipshift.dev deployment right now. Every one of them answers
with the same browser-tab title:

```
$ for h in acme.shipshift.dev globex.shipshift.dev initech.shipshift.dev custombot.space setpomo.com; do
    curl -sS -L "https://$h/" | grep -o '<title>[^<]*</title>'; done
<title>Shipshift</title>   (x5)
```

`NEXT_PUBLIC_SITE_NAME` is a Docker build argument (`apps/storefront/Dockerfile:61,68`) baked into
one image that serves every tenant by Host. `SITE_NAME` is imported from `@lib/util/env` at 15 call
sites (`grep -rn 'SITE_NAME' apps/storefront/src`): page titles, `pageTitle()`, the checkout layout's
wordmark, OpenGraph `siteName`, JSON-LD `Organization`/`seller`, `llms.txt`, account metadata.

## What already exists (do not rebuild it)

`GET /storefront/by-host?host=<host>` returns `{ tenant: { id, handle, name }, publishable_key,
theme, settings, home }` — see `docs/multitenancy/storefront-by-host.md` §2. `src/middleware.ts`
already calls it (60 s in-process cache) and puts `x-tenant-key`, `x-tenant-handle`, `x-tenant-theme`,
`x-tenant-mode` on the request headers. `tenant.name` is already in that response and is already
correct per tenant ("Acme", "Globex", "Initech"). Nothing is missing on the backend.

## What to build

The resolved tenant's name must replace the build constant everywhere the site name is rendered,
with the build constant kept as the single-store fallback (a host with no tenant still has to work —
that fallback is the documented behaviour of the middleware's 404 branch).

1. Carry `tenant.name` the same way the key and the theme are carried: one more request header set
   by the middleware.
2. Give the server code one accessor (beside the existing `SITE_NAME`) that reads that header via
   `next/headers` and falls back to the build constant. Replace the 15 call sites with it.
3. **The trap, read `~/r/19g.md` before you write a line of this:** a `"use client"` directive
   colours the whole import graph below it. An accessor that reads `next/headers` must never be
   imported, directly or transitively, from a client module — `tsc`, `next lint`, the build and
   `curl` all stay green while the page dies in the browser. The checkout layout's wordmark is the
   one to look at hardest. A client component gets the name as a PROP from a server parent, or from
   a `<meta>` the server layout writes — never by importing the accessor.
4. Metadata functions (`generateMetadata`) are server-side and may read it directly.

## Acceptance — the live product, not your report (18f)

You cannot deploy, so your acceptance is a local stand plus a precise handover:

- Run the storefront locally against the live backend (`https://shipshift.dev`) with the host
  spoofed, so the resolver answers with a real tenant. `acme.localhost` and `globex.localhost`
  resolve to 127.0.0.1 without touching /etc/hosts (documented in §2 of the by-host spec).
- Show, as terminal output in your report, the `<title>` of the SAME page on two different tenant
  hosts, and that the two differ and match `tenant.name`.
- Show that a host with NO tenant still renders with the build constant.
- Enter the flow at its start: open the home page in a browser, not only curl. A 200 is a fact about
  a request, not about a page (18f). Say what you saw with your eyes, including the checkout page,
  where the wordmark lives in a client tree.
- `pnpm --filter storefront tsc --noEmit` (or the repo's equivalent — read `AGENTS.md`) rc=0, and
  the storefront's own test suite green. Copy the real output; do not predict it.

## Rules that bite here

- Fix the CLASS, not one call site (rule 20): all 15, plus anything that renders the name which
  `grep SITE_NAME` does not catch (the wordmark component, the manifest, `llms.txt`).
- A zero read is a developer error, not "empty" (20a): if the header is absent where a tenant was
  resolved, say so loudly rather than silently falling back.
- Commit in your worktree with `IVAN_OK=1 git commit`, Conventional Commits, task id
  `(t-2026-09-12-mt-storefront-by-host)`. Never push.

## Report back

A short report: what you changed, the measured before/after titles, what you saw in the browser, the
exact commands you ran with their real output, and anything you found that you did NOT fix.
