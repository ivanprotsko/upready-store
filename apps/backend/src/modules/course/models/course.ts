import { model } from "@medusajs/framework/utils";

export const COURSE_STATUSES = ["draft", "published"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

/**
 * One online course of one shop (o24-courses). Scope is `tenant_id`, set from
 * the token on every tenant-side write and never from the request body, the
 * same pattern as `product_review` (rule 20a: no link table for a fact
 * `tenant_id` already holds).
 *
 * `product_id` is the digital product the course sells under: the storefront
 * buy button is the product's own add-to-cart, and `course_entitlement` is
 * granted on that product's order being paid (`grant-course-on-paid`
 * subscriber). One product sells at most one course, enforced by the unique
 * index below.
 *
 * A `draft` course is never returned to the storefront or counted in a
 * `product_id` ownership check there; only the owner panel lists it.
 *
 * `title` and `description` are `.translatable()` (t-2026-10-04-19): the
 * visitor reads them in the product page's «Course programme» block and in the
 * account, so they go through the translation module under the reference
 * `course`, the path a product title takes. The flag changes no column. The
 * translation module registers the entity in `translation_settings` on its own
 * at boot (`onApplicationStart`), so there is no migration for it. The store
 * routes resolve them for `x-medusa-locale` (`translateRows` in
 * `api/store/tenant/courses/store-course-helpers.ts`).
 */
const Course = model
  .define("course", {
    id: model.id({ prefix: "crs" }).primaryKey(),
    tenant_id: model.text(),
    product_id: model.text(),
    title: model.text().translatable(),
    slug: model.text(),
    description: model.text().translatable().nullable(),
    status: model.enum([...COURSE_STATUSES]).default("draft"),
  })
  .indexes([
    {
      on: ["tenant_id", "product_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "slug"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "status"],
      where: "deleted_at IS NULL",
    },
  ]);

export default Course;
