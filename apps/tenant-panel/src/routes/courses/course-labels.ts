import type { CourseStatus, TenantCourse } from "../../hooks/api/courses"

// o24-courses: pure helpers pulled out of the list/detail screens so they can
// be imported and run for real by `src/__tests__/course-editor.test.mjs` (this
// package has no vitest/jsdom, see `error-boundary-auth.test.mjs`).

export const STATUS_LABEL: Record<CourseStatus, string> = {
  draft: "Черновик",
  published: "Опубликован",
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
