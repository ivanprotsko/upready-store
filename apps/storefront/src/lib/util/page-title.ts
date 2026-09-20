import { getSiteName } from "@lib/data/cookies"

/**
 * Suffixes a page title with the store name: `Cart | <store name>`. Keeps the
 * separator in one place so every route reads the same in search results and
 * browser tabs. The home page is the exception: its title is the store name on
 * its own, so it reads `getSiteName()` directly there instead of calling this.
 *
 * Async because the name is per-request (the tenant resolved from the Host,
 * `docs/multitenancy/storefront-by-host.md` §2), not a build constant — every
 * caller is already inside an async `generateMetadata`/server component, so
 * this costs an `await` at the call site, nothing more.
 *
 * A tenant page title can carry a `{{ТОКЕН}}` left unfilled, which the backend
 * wraps in backticks so the body's markdown reader shows it as a code span
 * (t12-legal-requisites, `tenant-legal/requisites.ts`). `<title>` has no
 * markdown reader behind it, so that backtick is stripped here rather than
 * reaching a browser tab or a search result literally.
 */
export async function pageTitle(title: string) {
  return `${title.replace(/`/g, "")} | ${await getSiteName()}`
}
