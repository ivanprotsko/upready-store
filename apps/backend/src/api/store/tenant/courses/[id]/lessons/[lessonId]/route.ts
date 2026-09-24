import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../../../../modules/course";
import type CourseModuleService from "../../../../../../../modules/course/service";
import type { LessonRow } from "../../../../../../tenants/courses/course-helpers";
import { resolveTenantFromPublishableKey } from "../../../../resolve-tenant";
import { assertCourseAccess, getOwnedCourse, type ProgressRow } from "../../../store-course-helpers";

/**
 * `GET /store/tenant/courses/:id/lessons/:lessonId` — the lesson player's one
 * fetch: full content plus whether this customer has already viewed it.
 *
 * `assertCourseAccess` throws before any lesson content is read, so a
 * customer with no entitlement gets a 403 and never the body/video URL, even
 * by guessing a lesson id directly.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
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

  const [progress] = (await courseService.listCourseProgresses({
    tenant_id: tenant.id,
    customer_id: customerId,
    lesson_id: lesson.id,
  })) as ProgressRow[];

  res.json({
    lesson: {
      id: lesson.id,
      course_id: lesson.course_id,
      title: lesson.title,
      order: lesson.order,
      body: lesson.body,
      video_url: lesson.video_url,
      viewed_at: progress?.viewed_at ?? null,
    },
  });
};
