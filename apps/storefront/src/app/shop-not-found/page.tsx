import { notFound } from "next/navigation"

/**
 * Reached only through `src/middleware.ts`, which rewrites every page of a host
 * the backend answered "No storefront is configured for host" to this path
 * (t-2026-10-12-32 FX4). Lives outside `[locale]` like `/start`: every page
 * there needs a publishable key such a host cannot produce, and before this
 * the host got an empty shop under the build profile's name with a 200.
 *
 * The page itself is only `notFound()`: that is what makes Next answer 404,
 * and `not-found.tsx` beside it draws the words.
 */
export default function ShopNotFoundPage(): never {
  notFound()
}
