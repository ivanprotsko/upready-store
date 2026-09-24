import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { COURSE_MODULE } from "../modules/course";
import type CourseModuleService from "../modules/course/service";
import type { CourseRow } from "../api/tenants/courses/course-helpers";

const TAG = "grant-course-on-paid";

type PaidOrder = {
  id: string;
  customer_id: string | null;
  items: Array<{ product_id: string | null } | null> | null;
};

type EntitlementRow = { id: string; course_id: string; order_id: string | null };

/**
 * On `payment.captured` (o24-courses), grants every course sold under a
 * product the paid order carries. Mirrors `payment-captured-email.ts`:
 * `payment.captured` names a PAYMENT, so the order is reached through its
 * payment collection.
 *
 * Idempotent on (`tenant_id`, `order_id`, `course_id`) — the same unique index
 * the model declares — so a webhook retry or a captured-then-recaptured
 * payment never grants a second row; the write is skipped, not upserted,
 * because a grant already on file needs nothing changed on a retry.
 *
 * An order with no customer (a guest checkout the platform does not support
 * for a digital course, or a payment event arriving before the order link is
 * ready) logs and returns rather than granting an entitlement to nobody.
 */
export default async function grantCourseOnPaidHandler({
  event,
  container,
}: SubscriberArgs<{ id?: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  const paymentId = event.data?.id;
  if (!paymentId) {
    logger.warn(`[${TAG}] Missing payment id in event payload`);
    return;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: payments } = await query.graph({
    entity: "payment",
    fields: [
      "id",
      "payment_collection.order.id",
      "payment_collection.order.customer_id",
      "payment_collection.order.items.product_id",
    ],
    filters: { id: paymentId },
  });

  const order = (payments[0] as { payment_collection?: { order?: PaidOrder } } | undefined)
    ?.payment_collection?.order;

  if (!order) {
    logger.warn(`[${TAG}] No order linked to payment: ${paymentId}`);
    return;
  }

  if (!order.customer_id) {
    logger.warn(`[${TAG}] Order ${order.id} has no customer_id, skipping course grant`);
    return;
  }

  const productIds = [
    ...new Set((order.items ?? []).map((item) => item?.product_id).filter((id): id is string => Boolean(id))),
  ];

  if (!productIds.length) {
    return;
  }

  const courseService: CourseModuleService = container.resolve(COURSE_MODULE);
  const courses = (await courseService.listCourses({ product_id: productIds })) as CourseRow[];

  if (!courses.length) {
    return;
  }

  for (const course of courses) {
    const existing = (await courseService.listCourseEntitlements({
      tenant_id: course.tenant_id,
      order_id: order.id,
      course_id: course.id,
    })) as EntitlementRow[];

    if (existing.length) {
      continue;
    }

    await courseService.createCourseEntitlements({
      tenant_id: course.tenant_id,
      customer_id: order.customer_id,
      course_id: course.id,
      order_id: order.id,
      granted_at: new Date(),
      status: "active",
    });

    logger.info(
      `[${TAG}] Granted course ${course.id} to customer ${order.customer_id} for order ${order.id}`,
    );
  }
}

export const config: SubscriberConfig = {
  event: "payment.captured",
};
