import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../modules/course";
import type CourseModuleService from "../../../modules/course/service";

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

export const byOrderAsc = (a: LessonRow, b: LessonRow) => a.order - b.order;

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
