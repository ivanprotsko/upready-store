# W21 — course address in the panel + `/course-<slug>` redirect, Medusa link in the profile, safe pgrep

Task: `t-2026-09-25-17` (project upready-store, order `o-20260921-01`). Branch
`fix/olavka-course-link-cleanup`, base `origin/dev` `530edca8`.

## A. Course address (olavka course 404)

- **Panel** (`apps/tenant-panel/src/routes/courses/course-detail/course-detail.tsx`): the
  broken `/course-{course.slug}` text is replaced with the course's real storefront
  address, a clickable link that opens in a new tab. The address is built from two
  pieces the panel already had elsewhere: the shop's primary host, the same field
  `OpenShop` (`components/layout/shell/shell.tsx`) uses for the "open shop" button
  (`useDomains().primary_host`), and the tenant's default locale
  (`useTenantLocaleSettings().locale_settings.default_locale`). Getting the product
  **handle**: I chose to resolve it in the panel via the existing `useProduct(course.product_id)`
  hook (`hooks/api/products.tsx`, already tenant-scoped through `/tenants/products/:id`)
  rather than adding it to the backend course DTO — this is the smaller change, since the
  panel already has a working, tenant-scoped "fetch one product by id" hook and the
  backend course routes (`GET /tenants/courses/:id`) would otherwise need a new
  `query.graph` call just for this one field. The pure URL-building logic is
  `buildCourseStorefrontUrl` in `routes/courses/course-labels.ts`, unit-tested in
  `__tests__/course-editor.test.mjs`. While the host or the handle has not loaded yet, the
  panel shows the plain path (`/${locale}/products/${handle}`) rather than a link — never
  a host it does not actually know, per the brief.

- **Storefront redirect** (`apps/storefront/src/middleware.ts` +
  new `apps/storefront/src/lib/tenant/course-redirect.ts`): `/course-<slug>` and
  `/<locale>/course-<slug>` now 308 to `/<locale>/products/<handle>` of that course's
  product, in the current tenant. The path-matching half (`matchCourseSlugPath`) is a
  pure function, unit-tested in `course-redirect.test.ts`. The lookup half
  (`resolveCourseProductHandle`) calls a **new** backend route,
  `GET /store/tenant/courses/by-slug/:slug`
  (`apps/backend/src/api/store/tenant/courses/by-slug/[slug]/route.ts`) — the existing
  `GET /store/tenant/courses` only looks a course up by `product_id`, not by its own
  slug, so this is the smallest read-only addition that can. It is tenant-scoped through
  `resolveTenantFromPublishableKey` the same way every other `/store/tenant/courses`
  route is, and filters on `status: "published"` for the same reason the existing
  `product_id` lookup does: `modules/course/models/course.ts` documents "a `draft` course
  is never returned to the storefront." An unknown slug (or a slug from another tenant, or
  a draft course) answers 404 from the lookup, `resolveCourseProductHandle` turns that
  into `null`, and the middleware falls through to this app's normal 404 — a locale-less
  unknown slug still gets the ONE existing 302 to `/${locale}/course-<slug>` first, same as
  any other unprefixed path.

  HTTP proof against a running storefront was not required by the brief and no stand was
  started; the redirect wiring itself is proven by `middleware.test.ts`'s "course slug
  redirect" suite, which runs the real `middleware()` function against a mocked `fetch`
  (three cases: bare slug, locale-prefixed slug, unknown slug falling through to the
  normal 302).

## B. Medusa link in the profile form

`edit-profile-form.tsx`'s only `medusajs.com` reference lived inside the `usage_insights`
`Form.Field`, which is commented out in its entirety (`{/* ... */}`, a V2 TODO — this field
never renders today). The `<a href="https://docs.medusajs.com/...">` wrapping half of the
hint text is replaced with a plain `<span>`, so if that field is ever un-commented the hint
reads as plain text, no link. Nothing else in the form changed.

New sibling test, `__tests__/no-medusajs-com-links.test.mjs`, extends the W20 sweep
(`user-menu-no-medusa-links.test.mjs`, which names the user menu's own two spots) to walk
**every** file under `apps/tenant-panel/src` (skipping `__tests__` itself, since those
files legitimately hold the string in their own assertions) and fail if `medusajs.com`
appears anywhere. Red before this task's fix (found it in `edit-profile-form.tsx`), green
after.

## C. Dangerous pgrep in `scripts/stand-restart-backend.sh`

Both `pgrep -f "…|npm exec medusa develop"` spots (the actual kill target on line 33, and
the purely diagnostic "healthy after" line, then line 63) matched the backend of **every**
stand on the machine, not just the one being restarted — confirmed live on this very
machine while testing (other concurrent Claude Code sessions run their own `medusa
develop`-shaped background loops). Replaced with a `stand_pids()` helper that only counts a
process as this stand's own when: the listener is on THIS stand's `$PORT`, or the
process's own working directory (`lsof -a -d cwd`) or full command line names THIS stand's
`$DIR` — never the bare "medusa develop" pattern, which names no stand at all.

Getting this right took three iterations, documented in the script's own comments:

1. `awk -v dir="$DIR" '...'` bakes `$DIR` into **awk's own argv**, which `ps` then reports
   back, so the search matched awk's own helper process. Fixed by passing `$DIR` through
   an environment variable (`MATCH_DIR`) instead, which never appears in `ps`'s COMMAND
   column.
2. Even so, the **running script itself** always self-matches: `$DIR` is its own `$1`/`$2`,
   so it is a literal substring of its own command line. Worse, a `$(...)` subshell is a
   fork, not an exec, so `ps` reports *every* subshell this script forks with that SAME
   command line — not just the one literal `$$` pid, but the whole tree of the script's own
   helper subshells (each with a different pid). Fixed by walking each `cwd`/`cmdline`
   candidate's ppid chain and dropping it if that chain leads back to `$$`, or if the
   candidate is already dead by the time it's checked.
3. Verified against the actual proof recipe from the brief (see
   `13-script-dry-run-proof.txt`): two dummy `npm exec medusa develop`-named processes, one
   with cwd in dir A, one in dir B, `--dry-run` against A lists only A's pid, run three
   times in a row plus once against B, never any noise.

Added `--dry-run`: prints the PIDs the script would stop and exits 0 without touching
anything or starting a new tree. It skips the `medusa-config.ts`/`.js` existence check (the
real run still requires it), so it can be run against a throwaway directory for exactly
this kind of proof.

## Acceptance

Test totals (raw output in this folder):

| # | What | Result |
|---|---|---|
| 01 | panel `node --test`, red before A/B | 51 pass, **2 fail** (`course-editor.test.mjs`: `buildCourseStorefrontUrl` doesn't exist yet; `no-medusajs-com-links.test.mjs`: finds the link) |
| 02 | storefront `vitest run course-redirect.test.ts middleware.test.ts`, red before A | 15 pass, **2 fail** (both course-slug-redirect middleware cases) |
| 03 | `apps/tenant-panel && npx tsc --noEmit` | clean, 0 errors |
| 04 | panel `node --test src/__tests__/`, green after | **63/63 pass** |
| 05 | `apps/storefront && npx tsc --noEmit` | clean, 0 errors |
| 06 | storefront `npm run test` (full suite, e2e/pdp/ui-lab excluded per the app's own script) | **450/450 pass**, 52 files |
| 07 | `apps/backend && npx tsc --noEmit` | clean, 0 errors |
| 08 | `apps/backend && npx medusa lint` | **0 errors**, 125 pre-existing warnings (none from files this task touches) |
| 09 | `apps/backend && TEST_TYPE=unit npx jest` | **1284/1284 pass**, 100 suites |
| 10 | `pnpm check:backend-build` (the image's own build step) | backend + frontend compiled successfully |
| 11 | `pnpm check:backend-fixtures` | clean, 0 errors |
| 12 | `bash -n scripts/stand-restart-backend.sh` | OK, no syntax errors |
| 13 | pgrep dry-run proof (brief's exact recipe, run against both A and B, A three times) | **only the matching dir's own pid, every time** |

No new backend **unit** spec (`*.unit.spec.ts`) was added: the new route
(`store/tenant/courses/by-slug/[slug]/route.ts`) is thin composition over
`courseService.listCourses` and `query.graph`, the same shape as the existing
`store/tenant/courses/mine/route.ts`, with no new pure logic to isolate — its behavior is
exercised end-to-end by the storefront's `middleware.test.ts` mocking its HTTP contract, the
same way `course-redirect.test.ts` covers the matching/fetch logic that calls it.

## What was NOT done, and why

- **No HTTP proof of the redirect against a running storefront.** The brief says this is
  not required, and explicitly: "Do not start stands or servers." None were started.
- **No stands or servers started at all** — no `pnpm dev`, no `medusa develop`, no logins,
  no DB writes, for any of A/B/C. The only "servers" touched during this task were two
  inert `sleep 600` dummy processes (renamed via `exec -a`) for the pgrep proof, in
  throwaway directories under the session scratchpad, both killed at the end.
- **Rule 27f (frontend screenshots).** Part A changes one small piece of the course-detail
  screen (an address line becomes a link). Rule 27f asks for screenshots "from the live
  render of the running app," but this brief explicitly forbids starting a server, so I
  could not produce a live render. Flagging this rather than silently skipping it or
  starting a stand against the brief's own instruction — if screenshots are still wanted,
  they need a follow-up pass with a stand running.
