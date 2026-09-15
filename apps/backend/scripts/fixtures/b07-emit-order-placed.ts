import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * b07-store-api-isolation — acceptance fixture ONLY, outside `src/` for the
 * reason `scripts/fixtures/README.md` gives.
 *
 * It emits `order.placed` for one order so the order-placed email is actually
 * built and sent, which is the only way to read the confirmation link the
 * customer receives. The link now has to carry the order's access token
 * (`src/store-order-access/token.ts`); without it a guest clicking the link in
 * their own email would land on a 404, and the URL is assembled inside the
 * React Email template, where no unit test in this repo looks.
 *
 * Point SMTP at a local sink before running it:
 *   SMTP_HOST=127.0.0.1 SMTP_PORT=21588 SMTP_SECURE=false \
 *   B07_ORDER_ID=order_… npx medusa exec ./scripts/fixtures/b07-emit-order-placed.ts
 */
export default async function emitOrderPlaced({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const orderId = process.env.B07_ORDER_ID;
  if (!orderId) {
    throw new Error("b07-emit: B07_ORDER_ID is required.");
  }

  const eventBus = container.resolve(Modules.EVENT_BUS);
  await eventBus.emit({ name: "order.placed", data: { id: orderId } });

  // The local event bus dispatches asynchronously; give the subscriber time to
  // render and hand the letter to the provider before the process exits.
  await new Promise((resolve) => setTimeout(resolve, 8000));

  logger.info(`b07-emit: order.placed emitted for ${orderId}`);
}
