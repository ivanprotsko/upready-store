import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import linkOrderToTenantWorkflow from "../workflows/tenant/link-order-to-tenant";

/**
 * Every placed order is offered to the tenant that owns its sales channel.
 * A storefront calling the API with tenant A's publishable key puts its cart
 * in A's sales channel, so the order it completes lands in A's
 * `GET /tenants/orders` and nobody else's. Orders from a channel no tenant
 * owns are logged and left unlinked.
 */
export default async function orderPlacedTenantLinkHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const { result } = await linkOrderToTenantWorkflow(container).run({
    input: { order_id: data.id },
  });

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
