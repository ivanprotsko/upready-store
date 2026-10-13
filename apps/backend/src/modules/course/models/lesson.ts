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
 *
 * `quiz` is the short test the storefront shows after the lesson
 * (ask-20261005-061005-2e78): up to three questions, each with two to four
 * options and the index of the right one, shaped and checked by
 * `LessonQuizSchema` in `../quiz.ts`. Null for a lesson with no test.
 *
 * `title` is `.translatable()` (t-2026-10-04-19), under the reference
 * `lesson`, the same way `course.title` is; see `course.ts`. `body` and the
 * quiz are not: a lesson's text in a second language is a separate piece of
 * work, not a field of the translation module.
 *
 * The rest came with the GetCourse courses (t-2026-10-13-29 stage 2), all
 * nullable, shaped and read by `../content.ts`:
 * - `section` and `section_order`: the module a lesson sits in («Подготовка»)
 *   and that module's place; the school folds lessons with one `section` into
 *   one group (`foldSections`).
 * - `cover_url` and `summary`: the picture and the line under the title in
 *   the school's list.
 * - `videos`, `attachments`, `links`: several videos in order, the lesson's
 *   files and its Telegram or YouTube links. A video or a file the platform
 *   stores carries its file `key`, and the Store API hands it out as the media
 *   route (`/store/tenant/courses/:id/media?key=…`), never as the stored URL.
 *   `video_url` stays the first video for readers that know only it.
 * - `available_from_day`: the lesson opens on day N of the buyer's access,
 *   day 1 being the day it starts (`lessonOpensAt`); null opens at once.
 * - `metadata`: the importer's bookkeeping, `getcourse_id` and the files it
 *   uploaded (`scripts/course-import-export.ts`).
 */
const Lesson = model
  .define("lesson", {
    id: model.id({ prefix: "lsn" }).primaryKey(),
    tenant_id: model.text(),
    course_id: model.text(),
    title: model.text().translatable(),
    order: model.number(),
    body: model.text(),
    video_url: model.text().nullable(),
    quiz: model.json().nullable(),
    section: model.text().nullable(),
    section_order: model.number().nullable(),
    cover_url: model.text().nullable(),
    summary: model.text().nullable(),
    videos: model.json().nullable(),
    attachments: model.json().nullable(),
    links: model.json().nullable(),
    available_from_day: model.number().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["tenant_id", "course_id", "order"],
      where: "deleted_at IS NULL",
    },
  ]);

export default Lesson;
