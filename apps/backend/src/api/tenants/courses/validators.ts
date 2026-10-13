import { z } from "@medusajs/framework/zod";
import {
  LessonAttachmentsSchema,
  LessonLinksSchema,
  LessonVideosSchema,
} from "../../../modules/course/content";
import { COURSE_STATUSES } from "../../../modules/course/models/course";

/**
 * The course fields of t-2026-10-13-29 stage 2, the same in a create and an
 * update: the Telegram channel and chat, the stream's start (an ISO date or
 * instant) and how many days access lasts. Null clears one.
 */
const courseStreamFields = {
  telegram_channel_url: z.string().trim().url().max(2_000).nullable().optional(),
  telegram_chat_url: z.string().trim().url().max(2_000).nullable().optional(),
  start_date: z.coerce.date().nullable().optional(),
  access_days: z.number().int().min(1).max(36_500).nullable().optional(),
};

/**
 * The lesson fields of the same stage, shapes in `modules/course/content.ts`.
 * `available_from_day` is the day of the buyer's access the lesson opens on,
 * day 1 being the first (`lesson-schedule.ts` in the store routes).
 */
const lessonContentFields = {
  section: z.string().trim().max(200).nullable().optional(),
  section_order: z.number().int().min(0).nullable().optional(),
  cover_url: z.string().trim().url().max(2_000).nullable().optional(),
  summary: z.string().trim().max(500).nullable().optional(),
  videos: LessonVideosSchema.optional(),
  attachments: LessonAttachmentsSchema.optional(),
  links: LessonLinksSchema.optional(),
  available_from_day: z.number().int().min(0).max(3_650).nullable().optional(),
};

/**
 * `POST /tenants/courses` — a new course tied to one of the tenant's own
 * products (checked by the route through `assertOwnedProduct`, not here).
 * `slug` is optional: an omitted one is derived from `title` the same way the
 * product importer derives a handle (`product-csv/slugify.ts`).
 */
export const PostTenantCourseSchema = z.strictObject({
  product_id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(120).optional(),
  description: z.string().max(20_000).nullable().optional(),
  status: z.enum(COURSE_STATUSES).optional(),
  ...courseStreamFields,
});

export type PostTenantCourseBody = z.infer<typeof PostTenantCourseSchema>;

/**
 * `POST /tenants/courses/:id` — every field is optional, so the panel can save
 * one changed field (a status flip) without resending the whole course.
 */
export const PutTenantCourseSchema = z.strictObject({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(120).optional(),
  description: z.string().max(20_000).nullable().optional(),
  status: z.enum(COURSE_STATUSES).optional(),
  ...courseStreamFields,
});

export type PutTenantCourseBody = z.infer<typeof PutTenantCourseSchema>;

/** `POST /tenants/courses/:id/lessons` — a new lesson at the end of the list unless `order` is given. */
export const PostTenantLessonSchema = z.strictObject({
  title: z.string().min(1).max(200),
  body: z.string().max(200_000).default(""),
  video_url: z.string().url().max(2_000).nullable().optional(),
  order: z.number().int().min(0).optional(),
  ...lessonContentFields,
});

export type PostTenantLessonBody = z.infer<typeof PostTenantLessonSchema>;

/** `POST /tenants/courses/:id/lessons/:lessonId` — every field optional, same shape as the course update. */
export const PutTenantLessonSchema = z.strictObject({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(200_000).optional(),
  video_url: z.string().url().max(2_000).nullable().optional(),
  order: z.number().int().min(0).optional(),
  ...lessonContentFields,
});

export type PutTenantLessonBody = z.infer<typeof PutTenantLessonSchema>;

/** `POST /tenants/courses/:id/lessons/reorder` — the lesson panel's drag-to-reorder list, top to bottom. */
export const PostTenantLessonsReorderSchema = z.strictObject({
  ids: z.array(z.string().min(1)).min(1),
});

export type PostTenantLessonsReorderBody = z.infer<typeof PostTenantLessonsReorderSchema>;
