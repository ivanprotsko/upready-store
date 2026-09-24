import { model } from "@medusajs/framework/utils";

/**
 * One lesson of one course (o24-courses). `tenant_id` is denormalized onto
 * the row (not derived through `course_id` on every read) so a lesson list
 * can be scoped and counted without a join back to `course`, the same shape
 * `product_review` uses for `product_id`.
 *
 * `body` is markdown, rendered by the storefront's course player.
 * `video_url` is optional: a text-only lesson carries none.
 *
 * `order` is a plain integer the owner sets in the panel's lesson list, not a
 * computed position; two lessons of the same course may briefly share one
 * while the panel reorders them, so it is not part of a uniqueness
 * constraint.
 */
const Lesson = model
  .define("lesson", {
    id: model.id({ prefix: "lsn" }).primaryKey(),
    tenant_id: model.text(),
    course_id: model.text(),
    title: model.text(),
    order: model.number(),
    body: model.text(),
    video_url: model.text().nullable(),
  })
  .indexes([
    {
      on: ["tenant_id", "course_id", "order"],
      where: "deleted_at IS NULL",
    },
  ]);

export default Lesson;
