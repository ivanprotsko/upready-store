import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../../../modules/course";
import type CourseModuleService from "../../../../../../modules/course/service";
import type { CourseRow, LessonRow } from "../../../../../tenants/courses/course-helpers";
import { resolveTenantFromPublishableKey } from "../../../resolve-tenant";
import {
  assertCourseAccess,
  computeCourseProgress,
  pickContinueLessonId,
  type ProgressRow,
} from "../../store-course-helpers";

/**
 * `GET /store/tenant/courses/mine/:slug` — one bought course's contents in the
 * customer's account (ask-20261005-053807-eaae, Ivan 05.10: «Курс всегда в
 * личном кабинете — покупатель видит оглавление в кабинете а не на лендинге
 * курса»): the lessons in order, each with this customer's `viewed_at`, the
 * progress and the lesson «Продолжить» opens.
 *
 * Looked up by the course's own slug, tenant-scoped, and without a `status`
 * filter, the same as «Мои курсы» and the lesson player: what decides is the
 * customer's entitlement, so a course the owner moved back to draft stays
 * readable to whoever bought it. 404 for a slug this shop does not have, 403
 * (`assertCourseAccess`) for a course this customer holds no live grant for.
 * Lesson `body`/`video_url` stay with the player route.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req as unknown as MedusaStoreRequest);
  const customerId = req.auth_context?.actor_id;

  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "You must be logged in.");
  }

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const [course] = (await courseService.listCourses({
    tenant_id: tenant.id,
    slug: req.params.slug,
  })) as CourseRow[];

  if (!course) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Course with slug: ${req.params.slug} was not found`);
  }

  await assertCourseAccess(req, tenant.id, customerId, course);

  const lessons = (
    (await courseService.listLessons({
      tenant_id: tenant.id,
      course_id: course.id,
    })) as LessonRow[]
  ).sort((a, b) => a.order - b.order);
  const progressRows = (await courseService.listCourseProgresses({
    tenant_id: tenant.id,
    customer_id: customerId,
    course_id: course.id,
  })) as ProgressRow[];
  const viewedAt = new Map(progressRows.map((row) => [row.lesson_id, row.viewed_at]));

  res.json({
    course: {
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description,
    },
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      order: lesson.order,
      viewed_at: viewedAt.get(lesson.id) ?? null,
    })),
    progress: computeCourseProgress(lessons, progressRows),
    continue_lesson_id: pickContinueLessonId(lessons, progressRows),
  });
};
