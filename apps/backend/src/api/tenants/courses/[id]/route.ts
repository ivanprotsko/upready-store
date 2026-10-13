import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../modules/course";
import type CourseModuleService from "../../../../modules/course/service";
import { toSlug, firstFreeSlug } from "../../../../product-csv/slugify";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantCourseBody } from "../validators";
import {
  assertOwnedCourse,
  byOrderAsc,
  type CourseRow,
  courseStreamForWrite,
  type LessonRow,
  toCourseDto,
  toLessonDto,
} from "../course-helpers";

/**
 * `GET /tenants/courses/:id` — one course of the tenant, with its lessons in
 * panel order. A course another tenant owns is a 404, identical to an id that
 * does not exist (`assertOwnedCourse`).
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const course = await assertOwnedCourse(req, scope.id, req.params.id);

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const lessons = (
    (await courseService.listLessons({ tenant_id: scope.id, course_id: course.id })) as LessonRow[]
  ).sort(byOrderAsc);

  res.json({ course: toCourseDto(course), lessons: lessons.map(toLessonDto) });
};

/**
 * `POST /tenants/courses/:id` — updates title, slug, description or status.
 * `product_id` is not writable here: repointing a course at a different
 * product is a delete-and-recreate, not an edit, since the entitlement grant
 * (`grant-course-on-paid`) reads `product_id` at the moment an order pays and
 * a silent repoint would grant the wrong course for orders already in flight.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PutTenantCourseBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const course = await assertOwnedCourse(req, scope.id, req.params.id);
  const body = req.validatedBody;

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);

  let slug = course.slug;
  if (body.slug !== undefined && body.slug !== course.slug) {
    const existingSlugs = new Set(
      ((await courseService.listCourses({ tenant_id: scope.id })) as CourseRow[])
        .filter((row) => row.id !== course.id)
        .map((row) => row.slug),
    );
    const baseSlug = toSlug(body.slug) || course.slug;
    if (existingSlugs.has(baseSlug)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Invalid request: address "${baseSlug}" is already taken by another course`,
      );
    }
    slug = firstFreeSlug(baseSlug, existingSlugs);
  }

  const updated = await courseService.updateCourses({
    id: course.id,
    ...(body.title !== undefined && { title: body.title }),
    slug,
    ...(body.description !== undefined && { description: body.description }),
    ...(body.status !== undefined && { status: body.status }),
    ...courseStreamForWrite(body),
  });

  const row = (Array.isArray(updated) ? updated[0] : updated) as CourseRow;

  res.json({ course: toCourseDto(row) });
};

/**
 * `DELETE /tenants/courses/:id` — removes the course and every one of its
 * lessons. Entitlement and progress rows of customers who already bought it
 * are left alone: deleting the course from the catalog must not erase the
 * record of who paid for it.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const course = await assertOwnedCourse(req, scope.id, req.params.id);

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const lessons = (await courseService.listLessons({
    tenant_id: scope.id,
    course_id: course.id,
  })) as LessonRow[];

  if (lessons.length) {
    await courseService.deleteLessons(lessons.map((lesson) => lesson.id));
  }
  await courseService.deleteCourses([course.id]);

  res.json({ id: course.id, object: "course", deleted: true });
};
