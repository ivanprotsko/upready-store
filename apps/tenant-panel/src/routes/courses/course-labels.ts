import type { CourseStatus, TenantCourse } from "../../hooks/api/courses"

// o24-courses: pure helpers pulled out of the list/detail screens so they can
// be imported and run for real by `src/__tests__/course-editor.test.mjs` (this
// package has no vitest/jsdom, see `error-boundary-auth.test.mjs`).

/** The status words live in `courses.status.<status>` (t-2026-10-14-01, G4: rule 7). */
export const STATUS_LABEL_KEY: Record<CourseStatus, string> = {
  draft: "courses.status.draft",
  published: "courses.status.published",
}

export const STATUS_BADGE_COLOR: Record<CourseStatus, "grey" | "green"> = {
  draft: "grey",
  published: "green",
}

type MinimalProduct = { id: string; title: string }

/**
 * A product may carry at most one course (the backend's own unique index on
 * `tenant_id`+`product_id`, checked again here so the picker never offers a
 * choice the create call would refuse).
 */
export const productsWithoutCourse = <TProduct extends MinimalProduct>(
  products: TProduct[],
  courses: Pick<TenantCourse, "product_id">[]
): TProduct[] => {
  const taken = new Set(courses.map((course) => course.product_id))
  return products.filter((product) => !taken.has(product.id))
}

export const productTitleById = (products: MinimalProduct[]): Map<string, string> =>
  new Map(products.map((product) => [product.id, product.title]))

/**
 * t-2026-09-25-17: the course's REAL storefront address — the product page it
 * is sold on, `/<locale>/products/<handle>`, not the `/course-<slug>` address
 * no storefront route ever served. `primaryHost` is the same field
 * `OpenShop` (`components/layout/shell/shell.tsx`) already builds the "open
 * shop" button from; `null` while either the host or the handle has not
 * loaded yet, so the caller can fall back to a plain, non-clickable path.
 */
export const buildCourseStorefrontUrl = (
  primaryHost: string | undefined,
  locale: string | undefined,
  handle: string | undefined
): string | null =>
  primaryHost && handle ? `https://${primaryHost}/${locale ?? "ru"}/products/${handle}` : null
