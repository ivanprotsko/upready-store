import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import { COURSE_MODULE } from "../../../modules/course";
import { parseLessonAttachments, parseLessonLinks, parseLessonVideos } from "../../../modules/course/content";
import type { PutTenantCourseBody, PutTenantLessonBody } from "./validators";
import type CourseModuleService from "../../../modules/course/service";
import releaseCourseShippingWorkflow, {
  isDigitalProduct,
} from "../../../workflows/tenant/release-course-shipping";

export type CourseRow = {
  id: string;
  tenant_id: string;
  product_id: string;
  title: string;
  slug: string;
  description: string | null;
  status: "draft" | "published";
  telegram_channel_url?: string | null;
  telegram_chat_url?: string | null;
  start_date?: Date | string | null;
  access_days?: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type LessonRow = {
  id: string;
  tenant_id: string;
  course_id: string;
  title: string;
  order: number;
  body: string;
  video_url: string | null;
  /** `lesson.quiz` as stored, read through `parseLessonQuiz` before it leaves the API. */
  quiz?: unknown;
  section?: string | null;
  section_order?: number | null;
  cover_url?: string | null;
  summary?: string | null;
  /** `lesson.videos`, `attachments` and `links` as stored, read through `modules/course/content.ts`. */
  videos?: unknown;
  attachments?: unknown;
  links?: unknown;
  available_from_day?: number | null;
  metadata?: Record<string, unknown> | null;
};

export const toCourseDto = (row: CourseRow) => ({
  id: row.id,
  product_id: row.product_id,
  title: row.title,
  slug: row.slug,
  description: row.description,
  status: row.status,
  telegram_channel_url: row.telegram_channel_url ?? null,
  telegram_chat_url: row.telegram_chat_url ?? null,
  start_date: row.start_date ?? null,
  access_days: row.access_days ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

/**
 * The lesson as the owner's panel reads and writes it: videos and files as
 * stored, `key` included, since the owner's own file addresses are no secret
 * to the owner. The buyer's copy goes through `toStoreVideos` instead.
 */
export const toLessonDto = (row: LessonRow) => ({
  id: row.id,
  course_id: row.course_id,
  title: row.title,
  order: row.order,
  body: row.body,
  video_url: row.video_url,
  section: row.section ?? null,
  section_order: row.section_order ?? null,
  cover_url: row.cover_url ?? null,
  summary: row.summary ?? null,
  videos: parseLessonVideos(row.videos),
  attachments: parseLessonAttachments(row.attachments),
  links: parseLessonLinks(row.links),
  available_from_day: row.available_from_day ?? null,
});

const COURSE_STREAM_KEYS = ["telegram_channel_url", "telegram_chat_url", "start_date", "access_days"] as const;
const LESSON_CONTENT_KEYS = [
  "section",
  "section_order",
  "cover_url",
  "summary",
  "videos",
  "attachments",
  "links",
  "available_from_day",
] as const;

const sentFields = <B extends object, K extends keyof B>(body: B, keys: readonly K[]): Partial<Pick<B, K>> =>
  Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])) as Partial<
    Pick<B, K>
  >;

/** The stream fields of a course write (t-2026-10-13-29 stage 2) the body sent, null included. */
export const courseStreamForWrite = (body: PutTenantCourseBody) => sentFields(body, COURSE_STREAM_KEYS);

/** `model.json()` types its column as an object; a list is stored as it is all the same. */
type JsonColumn = Record<string, unknown>;

/** The content fields of a lesson write (t-2026-10-13-29 stage 2) the body sent, null included. */
export const lessonContentForWrite = (body: PutTenantLessonBody) => {
  const { videos, attachments, links, ...rest } = sentFields(body, LESSON_CONTENT_KEYS);

  return {
    ...rest,
    ...(videos !== undefined && { videos: videos as unknown as JsonColumn }),
    ...(attachments !== undefined && { attachments: attachments as unknown as JsonColumn }),
    ...(links !== undefined && { links: links as unknown as JsonColumn }),
  };
};

/**
 * `video_url` as the first video, for readers that know only it (the
 * contract of t-2026-10-13-29 stage 2): a write that sends `videos` sets it
 * from `videos[0]` unless it names `video_url` itself; one that sends neither
 * leaves it alone.
 */
export const videoUrlForWrite = (body: {
  videos?: Array<{ url: string }>;
  video_url?: string | null;
}): { video_url?: string | null } => {
  if (body.video_url !== undefined) {
    return { video_url: body.video_url };
  }

  if (body.videos !== undefined) {
    return { video_url: body.videos[0]?.url ?? null };
  }

  return {};
};

/**
 * `order` is not unique (the o24-courses seed groups several lessons under one
 * module number), so a tie needs a second key or two reads of the same course
 * can hand the panel and the storefront the lessons in a different sequence —
 * caught manually clicking through the new panel screen against
 * `upready_store_e2e`'s seeded «Очищение печени» course.
 */
export const byOrderAsc = (a: LessonRow, b: LessonRow) =>
  a.order - b.order || a.id.localeCompare(b.id);

/**
 * 404 for a course another tenant owns, worded like every other tenant-scoped
 * miss (`tenant-scope.ts`). `course` carries its own `tenant_id` (the
 * `product_review` shape, not a link table), so ownership is one equality
 * check rather than a graph walk.
 */
export const assertOwnedCourse = async (
  req: AuthenticatedMedusaRequest,
  tenantId: string,
  courseId: string,
): Promise<CourseRow> => {
  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const [course] = (await courseService.listCourses({
    id: courseId,
    tenant_id: tenantId,
  })) as CourseRow[];

  if (!course) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Course with id: ${courseId} was not found`);
  }

  return course;
};

/** 404 for a lesson outside this course (another tenant's, or another course's). */
export const assertOwnedLesson = async (
  req: AuthenticatedMedusaRequest,
  tenantId: string,
  courseId: string,
  lessonId: string,
): Promise<LessonRow> => {
  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const [lesson] = (await courseService.listLessons({
    id: lessonId,
    tenant_id: tenantId,
    course_id: courseId,
  })) as LessonRow[];

  if (!lesson) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Lesson with id: ${lessonId} was not found`);
  }

  return lesson;
};

/**
 * A product that sells a course is a course (t-cherk-com-hotfix batch 5):
 * `metadata.digital = "true"`, the marker the storefront checkout and the
 * cart sidebar read, and no shipping (`release-course-shipping`), so a buyer
 * of the course is asked for no address and no delivery. The rest of the
 * metadata is kept.
 */
export const markProductAsCourse = (req: AuthenticatedMedusaRequest, productId: string) =>
  markProductAsCourseIn(req.scope, productId);

/**
 * The same, outside a request: `scripts/mark-course-product.ts` runs it for a
 * course that was sold before this helper wrote the marker.
 */
export const markProductAsCourseIn = async (scope: MedusaContainer, productId: string) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id: productId },
  });
  const metadata = (data[0] as { metadata?: Record<string, unknown> | null } | undefined)?.metadata ?? null;

  if (!isDigitalProduct(metadata)) {
    await updateProductsWorkflow(scope).run({
      input: { selector: { id: productId }, update: { metadata: { ...(metadata ?? {}), digital: "true" } } },
    });
  }

  await releaseCourseShippingWorkflow(scope).run({ input: { product_ids: [productId] } });
};
