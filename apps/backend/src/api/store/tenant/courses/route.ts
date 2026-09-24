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
  hasCourseAccess,
  type CourseProgressSummary,
  type ProgressRow,
} from "./store-course-helpers";

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
  const unlocked = customerId
    ? await hasCourseAccess(req, tenant.id, customerId, course.id)
    : false;

  let progress: CourseProgressSummary | null = null;
  if (unlocked && customerId) {
    const progressRows = (await courseService.listCourseProgresses({
      tenant_id: tenant.id,
      customer_id: customerId,
      course_id: course.id,
    })) as ProgressRow[];
    progress = computeCourseProgress(lessons, progressRows);
  }

  res.json({
    course: {
      id: course.id,
      product_id: course.product_id,
      title: course.title,
      slug: course.slug,
      description: course.description,
    },
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      order: lesson.order,
      locked: !unlocked,
    })),
    has_access: unlocked,
    progress,
  });
};
