import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import linkOrderToTenantWorkflow from "../workflows/tenant/link-order-to-tenant";

/**
 * Every placed order is offered to the tenant that owns its sales channel.
 * A storefront calling the API with tenant A's publishable key puts its cart
 * in A's sales channel, so the order it completes lands in A's
 * `GET /tenants/orders` and nobody else's. Orders from a channel no tenant
 * owns are logged and left unlinked.
 *
 * This is the one attempt the event bus gives. A run that throws is logged at
 * `error` with the order id and rethrown, so the bus keeps its own account of
 * the failure; the order is picked up by the `link-orphan-orders` job within
 * ten minutes, or by the same step on the next boot (review-2026-09-21 T-1).
 */
export default async function orderPlacedTenantLinkHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  let result: { tenant_id: string | null; linked: boolean };
  try {
    ({ result } = await linkOrderToTenantWorkflow(container).run({
      input: { order_id: data.id },
    }));
  } catch (error) {
    logger.error(
      `tenant: order ${data.id} was NOT linked to its shop (${(error as Error).message}); ` +
        "the link-orphan-orders job retries it within ten minutes.",
    );
    throw error;
  }

  if (!result.tenant_id) {
    logger.info(`tenant: order ${data.id} placed in a sales channel no tenant owns — not linked.`);
    return;
  }

  logger.info(
    `tenant: order ${data.id} → tenant ${result.tenant_id}${result.linked ? "" : " (already linked)"}.`,
  );
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
