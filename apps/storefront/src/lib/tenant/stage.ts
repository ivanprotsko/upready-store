/**
 * A stage site (t-2026-10-27-04): the copy of a shop where the owner's agent
 * writes first, at `stage.<shop's main address>`. The backend says so in
 * `/storefront/by-host` → `stage`. A stage site is never indexed, three ways
 * at once: the `X-Robots-Tag` header on every response (`src/middleware.ts`),
 * `<meta name="robots">` on every page (`app/layout.tsx`) and a robots.txt
 * that closes everything (`app/robots.ts`).
 */

export const STAGE_HEADER = "x-tenant-stage"

export const STAGE_X_ROBOTS_TAG = "noindex, nofollow"

/** Only a clear `true` is a stage site: a live shop never goes dark on a guess. */
export const readTenantStage = (value: unknown): boolean => value === true

export const isStageHeader = (value: string | null | undefined): boolean => value === "1"
