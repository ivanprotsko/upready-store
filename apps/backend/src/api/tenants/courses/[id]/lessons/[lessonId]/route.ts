import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { COURSE_MODULE } from "../../../../../../modules/course";
import type CourseModuleService from "../../../../../../modules/course/service";
import { getTenantScope } from "../../../../tenant-scope";
import type { PutTenantLessonBody } from "../../../validators";
import {
  assertOwnedCourse,
  assertOwnedLesson,
  lessonContentForWrite,
  type LessonRow,
  toLessonDto,
  videoUrlForWrite,
} from "../../../course-helpers";

/** `GET /tenants/courses/:id/lessons/:lessonId` — one lesson, full content, for the panel editor. */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const course = await assertOwnedCourse(req, scope.id, req.params.id);
  const lesson = await assertOwnedLesson(req, scope.id, course.id, req.params.lessonId);

  res.json({ lesson: toLessonDto(lesson) });
};

/** `POST /tenants/courses/:id/lessons/:lessonId` — saves the fields the panel editor sent. */
export const POST = async (
  req: AuthenticatedMedusaRequest<PutTenantLessonBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const course = await assertOwnedCourse(req, scope.id, req.params.id);
  const lesson = await assertOwnedLesson(req, scope.id, course.id, req.params.lessonId);
  const body = req.validatedBody;

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const updated = await courseService.updateLessons({
    id: lesson.id,
    ...(body.title !== undefined && { title: body.title }),
    ...(body.body !== undefined && { body: body.body }),
    ...videoUrlForWrite(body),
    ...(body.order !== undefined && { order: body.order }),
    ...lessonContentForWrite(body),
  });

  const row = (Array.isArray(updated) ? updated[0] : updated) as LessonRow;

  res.json({ lesson: toLessonDto(row) });
};

/** `DELETE /tenants/courses/:id/lessons/:lessonId` — removes the lesson. Progress rows already written for it are left alone (a historical fact, not something a later edit erases). */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const course = await assertOwnedCourse(req, scope.id, req.params.id);
  const lesson = await assertOwnedLesson(req, scope.id, course.id, req.params.lessonId);

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  await courseService.deleteLessons([lesson.id]);

  res.json({ id: lesson.id, object: "lesson", deleted: true });
};
