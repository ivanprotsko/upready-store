import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../modules/course";
import type CourseModuleService from "../../../../modules/course/service";
import type { CourseRow, LessonRow } from "../../../tenants/courses/course-helpers";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";
import {
  computeCourseProgress,
  findCourseEntitlement,
  translateCourse,
  type CourseProgressSummary,
  type ProgressRow,
} from "./store-course-helpers";
import { accessStartOf, lessonLock } from "./lesson-schedule";

/**
 * `GET /store/tenant/courses?product_id=…` — the product page's course block
 * (o24-courses): title, description and the lesson list, locked or not.
 *
 * The tenant comes from the publishable key, never the request, so a
 * `product_id` from another shop simply matches nothing (404, worded like a
 * missing course rather than confirming the product exists elsewhere).
 *
 * Auth is OPTIONAL here (`allowUnauthenticated`, wired in `middlewares.ts`):
 * an anonymous visitor sees every lesson locked, a logged-in customer with no
 * entitlement sees the same, and an entitled customer sees every lesson
 * unlocked plus their progress. Lesson `body`/`video_url` are never sent from
 * this route regardless of access — the player route
 * (`/store/tenant/courses/:id/lessons/:lessonId`) is the only place content
 * leaves the server, so a locked lesson cannot be read from the network tab.
 *
 * The course's title and description and every lesson title come in the
 * visitor's language (`x-medusa-locale`, t-2026-10-04-19), from the
 * translation module, else in the owner's own text (`translateCourse`).
 *
 * For an entitled customer a lesson that opens on a later day of their access
 * stays locked, with its `opens_at` (t-2026-10-13-29 stage 2, `lessonLock`).
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const productId = req.query.product_id;

  if (typeof productId !== "string" || !productId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid request: 'product_id' is required",
    );
  }

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const [course] = (await courseService.listCourses({
    tenant_id: tenant.id,
    product_id: productId,
    status: "published",
  })) as CourseRow[];

  if (!course) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Course for product "${productId}" was not found`,
    );
  }

  const lessons = (
    (await courseService.listLessons({
      tenant_id: tenant.id,
      course_id: course.id,
    })) as LessonRow[]
  ).sort((a, b) => a.order - b.order);

  const customerId = (req as AuthenticatedMedusaRequest).auth_context?.actor_id;
  const entitlement = customerId
    ? await findCourseEntitlement(req, tenant.id, customerId, course.id)
    : null;
  const unlocked = Boolean(entitlement);
  const start = accessStartOf(entitlement, course);
  const now = new Date();

  let progress: CourseProgressSummary | null = null;
  if (unlocked && customerId) {
    const progressRows = (await courseService.listCourseProgresses({
      tenant_id: tenant.id,
      customer_id: customerId,
      course_id: course.id,
    })) as ProgressRow[];
    progress = computeCourseProgress(lessons, progressRows);
  }

  const translated = await translateCourse(req.scope, course, lessons, req.locale);

  res.json({
    course: {
      id: course.id,
      product_id: course.product_id,
      title: translated.course.title,
      slug: course.slug,
      description: translated.course.description,
    },
    lessons: translated.lessons.map((lesson) => {
      const lock = lessonLock(lesson, start, now);
      return {
        id: lesson.id,
        title: lesson.title,
        order: lesson.order,
        section: lesson.section ?? null,
        locked: !unlocked || lock.locked,
        opens_at: unlocked ? lock.opens_at : null,
      };
    }),
    has_access: unlocked,
    progress,
  });
};
