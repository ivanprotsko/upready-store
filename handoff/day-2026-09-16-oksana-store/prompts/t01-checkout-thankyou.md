# Goal

A customer who pays must land on a working confirmation page. Today the first render of the
"Спасибо" page right after checkout throws **`Application error: a client-side exception has occurred`,
digest `2524605575`**, whose underlying message is `Publishable API key required`. The buyer sees a crash
at the exact moment money leaves their card. Fix it so the page renders the order, on the first render,
on a tenant storefront resolved by `Host`.

This is gap #2 of `{{MISSION_DIR}}/research/upready-store-capabilities.md` §6 and it blocks the whole
mission: nothing else matters if the paying customer sees a stack trace.

## Context pointers (read before touching code)

- `{{MISSION_DIR}}/research/upready-store-capabilities.md` — §3 row «Касса и оплата» records the defect,
  and §1 records how the storefront learns which shop it serves.
- Reproduction script already written: `{{MAIN_CHECKOUT}}/handoff/night-2026-09-14-tribute/scripts/a37-order-final.mjs`
  (a customer path up to a placed order on a tenant storefront). Read it first — it tells you the exact
  sequence and which host it drives.
- Suspects named by the night acceptance: `apps/storefront/src/lib/data/cart.ts` — `placeOrder()` and the
  `redirect()` it performs; the confirmation route under `apps/storefront/src/app/[locale]/(main)/order/`;
  the publishable-key plumbing in `apps/storefront/src/lib/config.ts`.
- `docs/multitenancy/storefront-by-host.md` and `apps/storefront/src/middleware.ts` — the middleware puts
  `x-tenant-key` (the tenant's publishable key), `x-tenant-handle`, `x-tenant-theme`, `x-tenant-origin` on the
  request after `GET /storefront/by-host?host=`. `AGENTS.md` «Things That Break Silently» says
  `config.matcher` in the middleware EXCLUDES `/api`, so a route handler under `src/app/api` gets none of
  that. A `redirect()` out of a server action lands on a fresh request, and whatever reads the SDK on that
  request needs the key from the header, not from a build-time env var.
- `AGENTS.md` «Cookie `sameSite` on the payment return» — `_medusa_jwt` and `_medusa_cart_id` are `lax` on
  purpose. Do not tighten them.

## Step plan

1. Reproduce before you change anything. Bring up the local multi-tenant stand (recipe in
   `{{MISSION_DIR}}/research/upready-store-capabilities.md` §5 «Порты локально»): backend on `:9031`
   (`npx medusa develop`, DB `upready_store_abstract` on `127.0.0.1:5433`), storefront on `:8041` with
   `DEMO_HOSTS=localhost`; a shop opens as `http://<handle>.localhost:8041/ru`. Use `npx next dev`, not
   `pnpm storefront:dev` (turbopack defect `t-2026-09-12-turbopack-use-server-type-export`).
   Place an order through the UI or with the repro script and capture the failing render: the browser
   console message, the server log line, and the URL you were on. Paste all three into the PR body.
2. Find the real cause in code, not by guessing (rule 18h). Trace which call raises
   `Publishable API key required` on the confirmation render: whose SDK instance, on which request, with
   which headers. Write the two-line diagnosis in the PR body: the file and the line, and why the key is
   absent exactly there and not on the pages that work.
3. Fix it at the class, not at the one call site (rule 20). If the cause is «a request outside the
   middleware matcher has no tenant key», then every route in that position is broken, not only this one —
   list the siblings you checked and say which ones you fixed.
4. Re-measure the same way: order placed, confirmation page renders the order number, the line items and
   the total, HTTP 200, clean console. Then reload the page and navigate to it a second time from the
   account order list — both must work.
5. Add a regression check that would have caught this. The cheapest honest one is an e2e step in the style
   of `apps/storefront/e2e/by-host.e2e.mjs`; a unit test on the header-to-key resolution is acceptable if
   the e2e harness cannot reach the confirmation page. Put it in the same commit as the fix.

## Commands

```
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
cd apps/storefront && pnpm test
node handoff/night-2026-09-14-tribute/scripts/a37-order-final.mjs      # from the repo root of your worktree
```

## Acceptance (measured, quoted in the PR body)

- The confirmation page after a real checkout on `http://<handle>.localhost:8041` returns 200 and shows the
  order number. Screenshot at 1280x900 and at 390x844 into `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/`.
- Browser console on that page is free of `digest 2524605575` and of `Publishable API key required`.
- The repro script runs to its own last line without the error it used to print.
- `npx next build` is clean; the new regression check passes and its output line is quoted.

## What NOT to do

- Do not "fix" it by catching the exception and rendering a friendly message: the order data must appear.
- Do not set `sameSite: strict` on `_medusa_jwt` or `_medusa_cart_id`, and do not add
  `typescript.ignoreBuildErrors` or `eslint.ignoreDuringBuilds` to `next.config.js`.
- Do not hardcode a publishable key anywhere, and do not fall back to a single-store env var on a
  multi-tenant request: that would serve one shop's key to another shop.
- Do not deploy. Deployment is task `d01-deploy-mt-1`.
- Do not touch the payment provider registration — that is `t03-tenant-secrets-robokassa`.
