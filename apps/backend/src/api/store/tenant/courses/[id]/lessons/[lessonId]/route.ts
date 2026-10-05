import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../../../../modules/course";
import { parseLessonQuiz } from "../../../../../../../modules/course/quiz";
import type CourseModuleService from "../../../../../../../modules/course/service";
import type { LessonRow } from "../../../../../../tenants/courses/course-helpers";
import { resolveTenantFromPublishableKey } from "../../../../resolve-tenant";
import {
  assertCourseAccess,
  getOwnedCourse,
  LESSON_REFERENCE,
  LESSON_TRANSLATABLE_FIELDS,
  translateRows,
  type ProgressRow,
} from "../../../store-course-helpers";

/**
 * `GET /store/tenant/courses/:id/lessons/:lessonId` — the lesson player's one
 * fetch: full content plus whether this customer has already viewed it.
 *
 * `assertCourseAccess` throws before any lesson content is read, so a
 * customer with no entitlement gets a 403 and never the body/video URL, even
 * by guessing a lesson id directly.
 *
 * `quiz` is the test after the lesson (ask-20261005-061005-2e78), right
 * answers included: a self-check the storefront scores on the spot, not an
 * exam, behind the same access check as the body. Null when the lesson has
 * none, or when what is stored is not a test `parseLessonQuiz` accepts.
 *
 * The title comes in the visitor's language (`translateRows`,
 * t-2026-10-04-19), the same one the contents list shows for this lesson. The
 * body and the questions stay as the owner wrote them: neither is a
 * translatable field.
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

  const [[progress], [translated]] = await Promise.all([
    courseService.listCourseProgresses({
      tenant_id: tenant.id,
      customer_id: customerId,
      lesson_id: lesson.id,
    }) as Promise<ProgressRow[]>,
    translateRows(req.scope, LESSON_REFERENCE, [lesson], LESSON_TRANSLATABLE_FIELDS, req.locale),
  ]);

  res.json({
    lesson: {
      id: lesson.id,
      course_id: lesson.course_id,
      title: translated.title,
      order: lesson.order,
      body: lesson.body,
      video_url: lesson.video_url,
      quiz: parseLessonQuiz(lesson.quiz),
      viewed_at: progress?.viewed_at ?? null,
    },
  });
};
