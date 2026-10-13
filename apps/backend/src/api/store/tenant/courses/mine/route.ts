import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../../modules/course";
import type CourseModuleService from "../../../../../modules/course/service";
import type { CourseRow, LessonRow } from "../../../../tenants/courses/course-helpers";
import { resolveTenantFromPublishableKey } from "../../resolve-tenant";
import {
  collectPendingProducts,
  COURSE_REFERENCE,
  COURSE_TRANSLATABLE_FIELDS,
  computeCourseProgress,
  type EntitlementRow,
  type OrderForPendingCourse,
  pickContinueLessonId,
  type ProgressRow,
  translateRows,
} from "../store-course-helpers";
import { accessStartOf, lessonLock } from "../lesson-schedule";

type ProductCard = { id: string; title: string; handle: string; thumbnail: string | null };

/**
 * `GET /store/tenant/courses/mine` — «Мои курсы» (o24-courses): every course
 * this customer holds a live entitlement for, in the storefront's own tenant,
 * each with its progress. A course whose entitlement was revoked, or that
 * belongs to another tenant, is not in this list.
 *
 * t-cherk-com-hotfix batch 6, item 6: a course the customer ordered but has
 * not paid for yet is listed too, `access: false`, `progress: null`, with the
 * `order` it is pending on — so a buyer paying by transfer sees the course
 * they are waiting on, not just the ones already open. Access itself still
 * opens only on `payment.captured` (`grant-course-on-paid.ts`); nothing here
 * grants it. A product already entitled is never listed twice as pending,
 * even if its order's `payment_status` lags behind (a webhook retry window).
 *
 * ask-20261005-053807-eaae: `continue_lesson_id` is the lesson the card's
 * «Продолжить» opens (`pickContinueLessonId`), `null` while nothing is viewed
 * yet and for a course without access, where the card opens the course's
 * contents in the account instead.
 *
 * A course's title comes in the visitor's language (`translateRows`,
 * t-2026-10-04-19), the one its contents page shows.
 *
 * «Продолжить» skips a lesson that opens on a later day of the buyer's access
 * (t-2026-10-13-29 stage 2, `lessonLock`), the way the contents page does.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req as unknown as MedusaStoreRequest);
  const customerId = req.auth_context?.actor_id;

  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "You must be logged in.");
  }

  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const entitlements = (await courseService.listCourseEntitlements({
    tenant_id: tenant.id,
    customer_id: customerId,
    status: "active",
  })) as EntitlementRow[];
  const entitledCourseIds = new Set(entitlements.map((row) => row.course_id));
  const entitlementByCourse = new Map(entitlements.map((row) => [row.course_id, row]));
  const now = new Date();

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "status", "payment_status", "items.product_id"],
    filters: { customer_id: customerId, sales_channel_id: tenant.sales_channel_id },
  });

  const pendingByProduct = collectPendingProducts(orders as unknown as OrderForPendingCourse[]);

  const [grantedCourses, pendingCourseCandidates] = await Promise.all([
    entitledCourseIds.size
      ? (courseService.listCourses({
          id: [...entitledCourseIds],
          tenant_id: tenant.id,
        }) as Promise<CourseRow[]>)
      : Promise.resolve([] as CourseRow[]),
    pendingByProduct.size
      ? (courseService.listCourses({
          product_id: [...pendingByProduct.keys()],
          tenant_id: tenant.id,
        }) as Promise<CourseRow[]>)
      : Promise.resolve([] as CourseRow[]),
  ]);

  const pendingCourses = pendingCourseCandidates.filter((course) => !entitledCourseIds.has(course.id));
  const courses = await translateRows(
    req.scope,
    COURSE_REFERENCE,
    [...grantedCourses, ...pendingCourses],
    COURSE_TRANSLATABLE_FIELDS,
    req.locale,
  );

  if (!courses.length) {
    res.json({ courses: [] });
    return;
  }

  const productIds = courses.map((course) => course.product_id);
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "thumbnail"],
    filters: { id: productIds },
  });
  const productById = new Map((products as ProductCard[]).map((product) => [product.id, product]));

  const result = await Promise.all(
    courses.map(async (course) => {
      const access = entitledCourseIds.has(course.id);
      const product = productById.get(course.product_id);

      const lessons = access
        ? ((await courseService.listLessons({
            tenant_id: tenant.id,
            course_id: course.id,
          })) as LessonRow[])
        : [];
      const progressRows = access
        ? ((await courseService.listCourseProgresses({
            tenant_id: tenant.id,
            customer_id: customerId,
            course_id: course.id,
          })) as ProgressRow[])
        : [];

      const pendingOrder = pendingByProduct.get(course.product_id);
      const start = accessStartOf(entitlementByCourse.get(course.id), course);
      const openLessons = lessons.filter((lesson) => !lessonLock(lesson, start, now).locked);

      return {
        id: course.id,
        title: course.title,
        slug: course.slug,
        product: product
          ? { id: product.id, title: product.title, handle: product.handle, thumbnail: product.thumbnail ?? null }
          : null,
        access,
        progress: access ? computeCourseProgress(lessons, progressRows) : null,
        continue_lesson_id: access ? pickContinueLessonId(openLessons, progressRows) : null,
        order: access || !pendingOrder ? null : { id: pendingOrder.id, display_id: pendingOrder.display_id },
      };
    }),
  );

  res.json({ courses: result });
};
