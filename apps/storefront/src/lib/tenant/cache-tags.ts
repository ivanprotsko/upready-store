/**
 * Cache tags that name one shop. A plain module, not a `"use server"` one, so
 * both the loader (`lib/data/tenant-home.ts`) and the webhook route
 * (`app/api/revalidate/route.ts`) can import the same function — every export
 * of a `"use server"` module becomes a server action, which a route handler has
 * no business calling.
 */

/** The shop's home-page document (`upready.tenant-home/v1`). */
export const tenantHomeTag = (handle: string): string => `tenant-home-${handle}`
