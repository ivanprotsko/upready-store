# W — every tenant looks like its own shop (the three W1/W2/W3 tasks, one worker)

Ivan collapsed the three-worker fan-out into ONE worker: three fresh agents would each pay ~45k
tokens just to boot, and a three-way blind merge is a cost with no upside when the three tasks touch
the same two files. You get all three, in order, in one worktree. Nobody merges behind you.

**Worktree (yours alone):** `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-tenant-identity`
(branch `feat/mt-tenant-identity`, based on `09d5408` — the current tip of `feat/mt-deploy`, which
already carries the studio-panel rename and the restored generated storefront files).
Work only there. Never `cd` into another worktree. Do not push. Do not deploy.

## Your three briefs, already written — read them in this order

They are tracked files inside YOUR worktree; read each one completely before starting that task:

1. `artifacts/prompts/2026-09-12-w1-tenant-site-name.md` — the storefront carries the tenant's own
   name (defect A4; 15 `SITE_NAME` call sites; the `"use client"` trap).
2. `artifacts/prompts/2026-09-12-w2-tenant-categories.md` — each shop lists only its own categories
   (bind seeded categories to the tenant, point the storefront at the tenant-scoped route).
3. `artifacts/prompts/2026-09-12-w3-category-and-hero-images.md` — category and hero images
   (`product_category.metadata.image_url` — the mechanism is already decided, do not re-open it).

Context for all three: `artifacts/docs/2026-09-12-mt-deploy-wave-state.md` §6 holds the measurements
these defects were confirmed with, on the live deployment.

## What changes now that you own all three

- **The coordination sections are void.** W2's "a file you SHARE with W3" and any other
  "another worker owns this" line: you own both halves. Make `categories.ts` right in one pass —
  the route it calls (W2) and the `fields` it requests (W3).
- **Order.** W1 → W2 → W3. W1 is independent; W2 must land before W3 because W3 extends the same
  data path. Commit after EACH task, separately, so a bad one can be dropped without the others.
- **Third demo domain.** Ivan's answer today: the third shop is shown on **setpomo.com**;
  `shiftship.dev` (the bare host) belongs to upready studio and is being returned to it. The five
  live hosts are `acme.shipshift.dev`, `globex.shipshift.dev`, `initech.shipshift.dev`,
  `custombot.space`, `setpomo.com`. Never touch anything named `shiftship.dev` at the root.

## Acceptance — the live product, not your report (rule 18f)

Each brief carries its own acceptance; they all hold. The non-negotiable parts:

- A local stand against the LIVE backend (`https://shipshift.dev`) with the host spoofed
  (`acme.localhost`, `globex.localhost` — §2 of `docs/multitenancy/storefront-by-host.md`).
- Enter each flow at its start in a BROWSER, not only curl: a 200 is a fact about a request, not
  about a page, and a page frozen on its spinner is valid HTML. Say what you saw with your eyes,
  including the checkout page, where the wordmark lives in a client tree.
- The adversarial call from W2: ask tenant A's session for tenant B's category by id and show the
  refusal. The isolation hole `t-2026-09-11-01` is OPEN — do not widen it; any route you touch that
  takes an id checks that the id belongs to the caller's tenant (`assertOwnedCategory` exists).
- Typecheck and the repo's own suites green — read `AGENTS.md` for the commands. Copy the REAL
  output into your report; never predict it.

## Rules that bite here

- `~/r/19g.md` before you write a line of W1: a `"use client"` directive colours the whole import
  graph below it. An accessor that reads `next/headers` must never be imported, directly or
  transitively, from a client module — `tsc`, `next lint`, the build and `curl` all stay green while
  the page dies in the browser. A client component takes the name as a PROP from a server parent.
- Fix the CLASS, not one call site (rule 20). All 15 `SITE_NAME` sites plus whatever renders the
  name that `grep SITE_NAME` does not catch (wordmark, manifest, `llms.txt`).
- A zero read is a developer error, not "empty" (rule 20a): a tenant that resolves but owns no
  category must be a loud error with the path you checked, not a silently empty shop.
- Commits: `IVAN_OK=1 git commit …`, Conventional Commits, task id
  `(t-2026-09-12-mt-storefront-by-host)`, explicit literal pathspecs (`git add -- <paths>` first).
  Never push, never rewrite history, never `git -C`.
- Anything you cannot finish or cannot verify: say so plainly in the report. A hole named is worth
  more than a green sentence.

## Report back

One report, ≤400 lines: what you changed per task, the measured before/after (titles per host,
category sets per host, images rendering), what the adversarial call returned, what you saw in the
browser, the exact commands with their real output, the commit hashes (copied from
`git log --oneline`), and everything you found and did NOT fix.
