import { model } from "@medusajs/framework/utils";

/**
 * One customer's viewed-state of one lesson (o24-courses). `course_id` is
 * denormalized from `lesson_id` at write time so the store API's progress-%
 * endpoint can count a customer's viewed rows for a course with a single
 * filtered list, without joining back through `lesson`.
 *
 * `viewed_at` null would be a row with nothing to say, so a lesson is either
 * not represented here or viewed: "mark lesson viewed" always writes a
 * timestamp, never a false/pending state.
 */
const CourseProgress = model
  .define("course_progress", {
    id: model.id({ prefix: "cprg" }).primaryKey(),
    tenant_id: model.text(),
    customer_id: model.text(),
    course_id: model.text(),
    lesson_id: model.text(),
    viewed_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["tenant_id", "customer_id", "lesson_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "customer_id", "course_id"],
      where: "deleted_at IS NULL",
    },
  ]);

export default CourseProgress;
