import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../../../../../modules/course";
import type CourseModuleService from "../../../../../../../../modules/course/service";
import type { LessonRow } from "../../../../../../../tenants/courses/course-helpers";
import { resolveTenantFromPublishableKey } from "../../../../../resolve-tenant";
import {
  assertCourseAccess,
  computeCourseProgress,
  getOwnedCourse,
  type ProgressRow,
} from "../../../../store-course-helpers";

/**
 * `POST /store/tenant/courses/:id/lessons/:lessonId/viewed` — «Отметить
 * просмотренным» (o24-courses). Idempotent: viewing an already-viewed lesson
 * again keeps its original `viewed_at` rather than bumping it, so «when did I
 * finish this» stays the first time, not the last time the button was
 * pressed. Access is checked the same way the player route checks it —
 * marking progress on a lesson never bought is refused too.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req as unknown as MedusaStoreRequest);
  const customerId = req.auth_context?.actor_id;

  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "You must be logged in.");
  }

  const course = await getOwnedCourse(req, tenant.id, req.params.id);
  await assertCourseAccess(req, tenant.id, customerId, course);

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const [lesson] = (await courseService.listLessons({
    id: req.params.lessonId,
    tenant_id: tenant.id,
    course_id: course.id,
  })) as LessonRow[];

  if (!lesson) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Lesson with id: ${req.params.lessonId} was not found`,
    );
  }

  const [existing] = (await courseService.listCourseProgresses({
    tenant_id: tenant.id,
    customer_id: customerId,
    lesson_id: lesson.id,
  })) as ProgressRow[];

  if (!existing) {
    await courseService.createCourseProgresses({
      tenant_id: tenant.id,
      customer_id: customerId,
      course_id: course.id,
      lesson_id: lesson.id,
      viewed_at: new Date(),
    });
  }

  const lessons = (await courseService.listLessons({
    tenant_id: tenant.id,
    course_id: course.id,
  })) as LessonRow[];
  const progressRows = (await courseService.listCourseProgresses({
    tenant_id: tenant.id,
    customer_id: customerId,
    course_id: course.id,
  })) as ProgressRow[];

  res.json({ progress: computeCourseProgress(lessons, progressRows) });
};
