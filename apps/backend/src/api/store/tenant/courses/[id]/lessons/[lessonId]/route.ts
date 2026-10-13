import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../../../../modules/course";
import { parseLessonLinks, toStoreAttachments, toStoreVideos } from "../../../../../../../modules/course/content";
import { parseLessonQuiz } from "../../../../../../../modules/course/quiz";
import type CourseModuleService from "../../../../../../../modules/course/service";
import type { LessonRow } from "../../../../../../tenants/courses/course-helpers";
import { resolveTenantFromPublishableKey } from "../../../../resolve-tenant";
import {
  assertCourseAccess,
  getOwnedCourse,
  LESSON_REFERENCE,
  LESSON_TRANSLATABLE_FIELDS,
  sendLessonLocked,
  translateRows,
  type ProgressRow,
} from "../../../store-course-helpers";
import { accessStartOf, lessonLock } from "../../../lesson-schedule";

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
 *
 * t-2026-10-13-29 stage 2: a lesson that opens on a later day of this buyer's
 * access answers 403 `{ code: "lesson_locked", opens_at }` and nothing of its
 * content. An open one carries its `videos`, `attachments` and `links`; a
 * video or a file the platform stores is the media route
 * (`/store/tenant/courses/:id/media?key=…`), never the file's own address,
 * and `video_url` is the first of the videos for readers that know only it.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req as unknown as MedusaStoreRequest);
  const customerId = req.auth_context?.actor_id;

  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "You must be logged in.");
  }

  const course = await getOwnedCourse(req, tenant.id, req.params.id);
  const entitlement = await assertCourseAccess(req, tenant.id, customerId, course);

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

  const lock = lessonLock(lesson, accessStartOf(entitlement, course));
  if (lock.locked) {
    sendLessonLocked(res, lock.opens_at);
    return;
  }

  const [[progress], [translated]] = await Promise.all([
    courseService.listCourseProgresses({
      tenant_id: tenant.id,
      customer_id: customerId,
      lesson_id: lesson.id,
    }) as Promise<ProgressRow[]>,
    translateRows(req.scope, LESSON_REFERENCE, [lesson], LESSON_TRANSLATABLE_FIELDS, req.locale),
  ]);

  const videos = toStoreVideos(course.id, lesson.videos);

  res.json({
    lesson: {
      id: lesson.id,
      course_id: lesson.course_id,
      title: translated.title,
      order: lesson.order,
      body: lesson.body,
      video_url: videos[0]?.url ?? lesson.video_url,
      videos,
      attachments: toStoreAttachments(course.id, lesson.attachments),
      links: parseLessonLinks(lesson.links),
      section: lesson.section ?? null,
      cover_url: lesson.cover_url ?? null,
      summary: lesson.summary ?? null,
      opens_at: lock.opens_at,
      quiz: parseLessonQuiz(lesson.quiz),
      viewed_at: progress?.viewed_at ?? null,
    },
  });
};
