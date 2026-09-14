# W (continuation) — finish W2 and W3 of the tenant-identity wave

You are continuing a run that was killed mid-task, not starting one. Nothing here is a rewrite.

**Worktree (yours alone):** `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-tenant-identity`
(branch `feat/mt-tenant-identity`). Work only there. Never `cd` into another worktree, never push,
never deploy, never `git -C`.

## What already happened — verify it yourself, do not take my word

1. **W1 is DONE and committed:** `1d18fae` "every tenant's storefront carries its own name".
   Read `git show --stat 1d18fae` before you touch anything the site name goes through.
2. **W2 is HALF-WRITTEN AND UNCOMMITTED in your working tree.** `git status` shows:
   - `apps/backend/src/scripts/seed-mt-demo.ts` (+241 lines)
   - `apps/storefront/src/lib/data/categories.ts` (+115)
   - `apps/tenant-panel/src/routes/categories/category-edit/components/edit-category-form/edit-category-form.tsx` (+115)
   - untracked `apps/storefront/src/modules/categories/components/category-child-tiles/index.tsx`
   - untracked `apps/backend/.env.test` (a local test env — decide whether it belongs in the repo;
     if it holds nothing secret and a suite needs it, commit it; otherwise leave it untracked and
     SAY so in your report)

   **Start by reading `git diff` in full.** It is a predecessor's work on the same brief you are
   given below. Judge it against the brief, finish it, fix what is wrong — but do not throw away
   work that is right just because you did not write it.

## Your two tasks, in this order

Read each brief completely before starting that task. They are tracked files in YOUR worktree:

1. `artifacts/prompts/2026-09-12-w2-tenant-categories.md` — each shop lists only its own categories.
2. `artifacts/prompts/2026-09-12-w3-category-and-hero-images.md` — category and hero images
   (`product_category.metadata.image_url`; the mechanism is decided, do not re-open it).

The coordination sections in those briefs ("a file you SHARE with W3", "another worker owns this")
are VOID — you own both halves. Make `categories.ts` right in one pass: the route it calls (W2) and
the `fields` it requests (W3).

Context with the measurements these defects were confirmed on:
`artifacts/docs/2026-09-12-mt-deploy-wave-state.md` §6. How a host becomes a tenant:
`docs/multitenancy/storefront-by-host.md` §2.

**Commit after EACH task, separately**, so a bad one can be dropped without the other. If the
uncommitted W2 work is already finished when you have read and checked it, commit it as W2 and move
to W3 — a commit is how the next session sees it exists.

## The live hosts (five, and none of them is `shiftship.dev`)

`acme.shipshift.dev`, `globex.shipshift.dev`, `initech.shipshift.dev`, `custombot.space`,
`setpomo.com`. `shiftship.dev` is being taken over TONIGHT by the orchestrator for a paywall demo —
it is not a tenant shop and nothing you do concerns it.

## Acceptance — the live product, not your report (rule 18f)

- A local stand against the LIVE backend (`https://shipshift.dev`) with the host spoofed
  (`acme.localhost`, `globex.localhost` — `docs/multitenancy/storefront-by-host.md` §2).
- Enter each flow at its start **in a browser**, not only curl: a 200 is a fact about a request, not
  about a page, and a page frozen on its spinner is valid HTML. Say what you SAW.
- The adversarial call from W2: ask tenant A's session for tenant B's category by id and show the
  refusal. Isolation hole `t-2026-09-11-01` is OPEN — do not widen it; any route you touch that
  takes an id checks the id belongs to the caller's tenant (`assertOwnedCategory` exists).
- Typecheck and the repo's own suites green — commands are in `AGENTS.md`. Copy the REAL output into
  your report; never predict it.

## Rules that bite here

- `~/r/19g.md`: a `"use client"` directive colours the whole import graph below it. An accessor that
  reads `next/headers` must never be imported, directly or transitively, from a client module —
  `tsc`, `next lint`, the build and `curl` all stay green while the page dies in the browser.
- Fix the CLASS, not one call site (rule 20).
- A zero read is a developer error, not "empty" (rule 20a): a tenant that resolves but owns no
  category must be a loud error carrying the path you checked, not a silently empty shop.
- Commits: `IVAN_OK=1 git commit …`, Conventional Commits, task id
  `(t-2026-09-12-mt-storefront-by-host)`, explicit literal pathspecs — `git add -- <paths>` FIRST,
  then commit. Never rewrite history.
- Anything you cannot finish or cannot verify: say so plainly. A hole named is worth more than a
  green sentence.

## Report back

One report, ≤300 lines: what the predecessor's diff contained and what you judged it to be, what you
changed per task, the measured before/after (category sets per host, images rendering), what the
adversarial call returned, what you saw in the BROWSER, the exact commands with their real output,
the commit hashes copied from `git log --oneline`, and everything you found and did NOT fix.
