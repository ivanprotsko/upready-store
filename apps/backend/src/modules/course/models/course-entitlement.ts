import { model } from "@medusajs/framework/utils";

export const COURSE_ENTITLEMENT_STATUSES = ["active", "revoked"] as const;
export type CourseEntitlementStatus = (typeof COURSE_ENTITLEMENT_STATUSES)[number];

/**
 * One customer's access grant to one course (o24-courses). Written by
 * `grant-course-on-paid` on `payment.captured`, never by a storefront
 * request: access is a fact of the paid order, not something a caller can
 * assert about itself.
 *
 * The unique index on (`tenant_id`, `order_id`, `course_id`) is the grant's
 * own idempotency key — `payment.captured` can fire more than once for the
 * same order (a retried webhook, a captured-then-recaptured payment), and the
 * subscriber upserts against it instead of inserting a duplicate row.
 * `order_id` is nullable so a grant an owner makes by hand in the panel (a
 * comped course) has somewhere to live without inventing a fake order.
 */
const CourseEntitlement = model
  .define("course_entitlement", {
    id: model.id({ prefix: "cent" }).primaryKey(),
    tenant_id: model.text(),
    customer_id: model.text(),
    course_id: model.text(),
    order_id: model.text().nullable(),
    granted_at: model.dateTime(),
    status: model.enum([...COURSE_ENTITLEMENT_STATUSES]).default("active"),
  })
  .indexes([
    {
      on: ["tenant_id", "customer_id", "course_id"],
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "order_id", "course_id"],
      unique: true,
      where: "deleted_at IS NULL AND order_id IS NOT NULL",
    },
  ]);

export default CourseEntitlement;
