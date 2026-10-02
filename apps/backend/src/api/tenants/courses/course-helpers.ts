import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import { COURSE_MODULE } from "../../../modules/course";
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
};

export const toCourseDto = (row: CourseRow) => ({
  id: row.id,
  product_id: row.product_id,
  title: row.title,
  slug: row.slug,
  description: row.description,
  status: row.status,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const toLessonDto = (row: LessonRow) => ({
  id: row.id,
  course_id: row.course_id,
  title: row.title,
  order: row.order,
  body: row.body,
  video_url: row.video_url,
});

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
export const markProductAsCourse = async (req: AuthenticatedMedusaRequest, productId: string) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id: productId },
  });
  const metadata = (data[0] as { metadata?: Record<string, unknown> | null } | undefined)?.metadata ?? null;

  if (!isDigitalProduct(metadata)) {
    await updateProductsWorkflow(req.scope).run({
      input: { selector: { id: productId }, update: { metadata: { ...(metadata ?? {}), digital: "true" } } },
    });
  }

  await releaseCourseShippingWorkflow(req.scope).run({ input: { product_ids: [productId] } });
};
