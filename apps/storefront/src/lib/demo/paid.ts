/**
 * The cookie the demo till sets and the onboarding page reads. It lives in its
 * own module rather than in the route handler that writes it: a page importing
 * a value out of `app/api/**\/route.ts` drags that route's module graph into
 * the page bundle, which is a build-shaped surprise nobody asked for.
 *
 * httpOnly, so only the server that ran the classification can set it — the
 * screen says "оплачено" on the strength of this, and a client that never
 * opened the till must not be able to write it.
 */
export const PAID_COOKIE = "demo_paid"

export type PaidRecord = {
  funnel: number
  serviceId: string
  planId: string
  price: number
  at: string
}
