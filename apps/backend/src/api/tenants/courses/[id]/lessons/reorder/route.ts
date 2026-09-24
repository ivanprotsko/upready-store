import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../../../modules/course";
import type CourseModuleService from "../../../../../../modules/course/service";
import { getTenantScope } from "../../../../tenant-scope";
import type { PostTenantLessonsReorderBody } from "../../../validators";
import { assertOwnedCourse, byOrderAsc, type LessonRow, toLessonDto } from "../../../course-helpers";

/**
 * `POST /tenants/courses/:id/lessons/reorder` — the panel's drag-to-reorder
 * list, top to bottom. `ids` must name exactly the course's own lessons, once
 * each; anything else is refused before a single row is written, the same
 * all-or-nothing check `/tenants/shipping-methods/reorder` uses.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantLessonsReorderBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const course = await assertOwnedCourse(req, scope.id, req.params.id);
  const { ids } = req.validatedBody;

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const lessons = (await courseService.listLessons({
    tenant_id: scope.id,
    course_id: course.id,
  })) as LessonRow[];

  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  if (ids.length !== lessons.length || new Set(ids).size !== ids.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid request: 'ids' must list every lesson of this course exactly once",
    );
  }

  const foreign = ids.find((id) => !byId.has(id));
  if (foreign) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Lesson with id: ${foreign} was not found`);
  }

  await Promise.all(ids.map((id, index) => courseService.updateLessons({ id, order: index })));

  const reordered = (
    (await courseService.listLessons({ tenant_id: scope.id, course_id: course.id })) as LessonRow[]
  ).sort(byOrderAsc);

  res.json({ lessons: reordered.map(toLessonDto) });
};
