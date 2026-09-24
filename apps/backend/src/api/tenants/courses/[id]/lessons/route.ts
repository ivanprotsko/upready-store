import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { COURSE_MODULE } from "../../../../../modules/course";
import type CourseModuleService from "../../../../../modules/course/service";
import { getTenantScope } from "../../../tenant-scope";
import type { PostTenantLessonBody } from "../../validators";
import { assertOwnedCourse, byOrderAsc, type LessonRow, toLessonDto } from "../../course-helpers";

/** `GET /tenants/courses/:id/lessons` — the course's lessons, panel order. */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const course = await assertOwnedCourse(req, scope.id, req.params.id);

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const lessons = (
    (await courseService.listLessons({ tenant_id: scope.id, course_id: course.id })) as LessonRow[]
  ).sort(byOrderAsc);

  res.json({ lessons: lessons.map(toLessonDto) });
};

/**
 * `POST /tenants/courses/:id/lessons` — appends a lesson. Without an explicit
 * `order` it lands after the last existing lesson, which is what the panel's
 * «Добавить урок» button sends.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantLessonBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const course = await assertOwnedCourse(req, scope.id, req.params.id);
  const body = req.validatedBody;

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const existing = (await courseService.listLessons({
    tenant_id: scope.id,
    course_id: course.id,
  })) as LessonRow[];

  const order = body.order ?? existing.length;

  const created = await courseService.createLessons({
    tenant_id: scope.id,
    course_id: course.id,
    title: body.title,
    body: body.body,
    video_url: body.video_url ?? null,
    order,
  });

  const row = (Array.isArray(created) ? created[0] : created) as LessonRow;

  res.status(201).json({ lesson: toLessonDto(row) });
};
