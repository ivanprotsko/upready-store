import type { MedusaRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../../../../modules/course";
import type CourseModuleService from "../../../../modules/course/service";
import type { CourseRow, LessonRow } from "../../../tenants/courses/course-helpers";

export type EntitlementRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  course_id: string;
  order_id: string | null;
  granted_at: Date | string;
  status: "active" | "revoked";
};

export type ProgressRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  course_id: string;
  lesson_id: string;
  viewed_at: Date | string;
};

/** Whether this customer holds a live grant for the course, tenant-scoped. */
export const hasCourseAccess = async (
  req: MedusaRequest,
  tenantId: string,
  customerId: string,
  courseId: string,
): Promise<boolean> => {
  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const [entitlement] = (await courseService.listCourseEntitlements({
    tenant_id: tenantId,
    customer_id: customerId,
    course_id: courseId,
    status: "active",
  })) as EntitlementRow[];

  return Boolean(entitlement);
};

/** 403 for a customer with no live entitlement, 404 for a course another tenant owns. */
export const assertCourseAccess = async (
  req: MedusaRequest,
  tenantId: string,
  customerId: string,
  course: CourseRow,
): Promise<void> => {
  if (course.tenant_id !== tenantId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Course with id: ${course.id} was not found`);
  }

  const allowed = await hasCourseAccess(req, tenantId, customerId, course.id);
  if (!allowed) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "This course has not been purchased by this customer.",
    );
  }
};

export const getOwnedCourse = async (
  req: MedusaRequest,
  tenantId: string,
  courseId: string,
): Promise<CourseRow> => {
  const courseService: CourseModuleService = req.scope.resolve(COURSE_MODULE);
  const [course] = (await courseService.listCourses({
    id: courseId,
    tenant_id: tenantId,
  })) as CourseRow[];

  if (!course) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Course with id: ${courseId} was not found`);
  }

  return course;
};

export type CourseProgressSummary = { completed: number; total: number; percent: number };

/** Progress against every lesson of the course, viewed rows only counted once each. */
export const computeCourseProgress = (
  lessons: LessonRow[],
  progressRows: ProgressRow[],
): CourseProgressSummary => {
  const viewedLessonIds = new Set(progressRows.map((row) => row.lesson_id));
  const total = lessons.length;
  const completed = lessons.filter((lesson) => viewedLessonIds.has(lesson.id)).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return { completed, total, percent };
};

export type OrderForPendingCourse = {
  id: string;
  display_id: number | null;
  status: string;
  payment_status: string;
  items: Array<{ product_id: string | null } | null> | null;
};

export type PendingOrderRef = { id: string; display_id: number | null };

/**
 * Payment states that mean the order has been captured at least once, so an
 * entitlement for it already exists (or should — `grant-course-on-paid.ts`
 * runs on `payment.captured`) rather than being merely awaited.
 */
export const CAPTURED_PAYMENT_STATUSES = ["captured", "partially_captured", "refunded", "partially_refunded"];

/**
 * t-cherk-com-hotfix batch 6, item 6: a product id → the first still-unpaid
 * order of the customer's that carries it. A cancelled order, and an order
 * already captured at least once, name nothing here — the entitlement for a
 * captured order already exists or is on its way through `payment.captured`,
 * not something to show as "pending". A buyer with two unpaid orders for the
 * same course gets one pending entry, the earlier order in the list.
 */
export const collectPendingProducts = (orders: OrderForPendingCourse[]): Map<string, PendingOrderRef> => {
  const pendingByProduct = new Map<string, PendingOrderRef>();

  for (const order of orders) {
    if (order.status === "canceled" || CAPTURED_PAYMENT_STATUSES.includes(order.payment_status)) {
      continue;
    }
    for (const item of order.items ?? []) {
      if (item?.product_id && !pendingByProduct.has(item.product_id)) {
        pendingByProduct.set(item.product_id, { id: order.id, display_id: order.display_id });
      }
    }
  }

  return pendingByProduct;
};
