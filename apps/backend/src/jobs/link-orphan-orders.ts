import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { describeOrphanOrders, linkOrphanOrders } from "../tenant-orders/link-orphan-orders";

/**
 * Every ten minutes, links the placed orders whose `order.placed` subscriber
 * failed or never ran (review-2026-09-21 T-1, audit 46df A-05), so a missed
 * link costs the owner ten minutes and not the order. The boot step in
 * `docker-entrypoint.sh` does the same once per deploy.
 *
 * Orders younger than `SUBSCRIBER_GRACE_MS` are left to the subscriber, whose
 * event may still be on its way: linking them here would be harmless (the
 * link is upserted) but would report a working subscriber as a miss. The job
 * is silent when there is nothing to link, and a found orphan is a `warn`,
 * because it means the subscriber missed one.
 */
export const SUBSCRIBER_GRACE_MS = 5 * 60 * 1000;

export default async function linkOrphanOrdersJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const summary = await linkOrphanOrders(container, {
    placedBefore: new Date(Date.now() - SUBSCRIBER_GRACE_MS),
  });

  if (summary.orphans) {
    logger.warn(describeOrphanOrders(summary));
  }
}

export const config = {
  name: "link-orphan-orders",
  schedule: "*/10 * * * *",
};
