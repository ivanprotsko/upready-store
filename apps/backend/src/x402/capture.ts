import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows";
import { X402_PROVIDER_ID } from "./session";

type OrderPayment = {
  id: string;
  provider_id: string | null;
  amount: unknown;
  captured_at: string | Date | null;
  canceled_at: string | Date | null;
  data: Record<string, unknown> | null;
};

/**
 * Captures every settled x402 payment of a placed order (t-2026-10-03-33).
 *
 * WHY THIS IS A STEP OF ITS OWN. The transfer is on the chain by the time the
 * order exists, so the payment could be captured inside `authorizePayment` by
 * answering CAPTURED. The payment module would then capture it silently: in
 * Medusa 2.19 only `capturePaymentWorkflow` emits `payment.captured`
 * (`core-flows/dist/payment/workflows/capture-payment.js`), and an order that
 * never emits it never grants its course (`grant-course-on-paid.ts`) nor sends
 * the payment letter. So the provider authorizes, and this runs the workflow.
 *
 * Idempotent: a payment already captured or canceled is skipped, and one that
 * never settled is not touched (the provider would refuse it anyway). Returns
 * the ids it captured.
 */
export const captureSettledX402Payments = async (
  container: MedusaContainer,
  orderId: string,
): Promise<string[]> => {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "payment_collections.payments.id",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.amount",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.canceled_at",
      "payment_collections.payments.data",
    ],
    filters: { id: orderId },
  });
  const order = orders[0] as { payment_collections?: Array<{ payments?: OrderPayment[] | null } | null> | null } | undefined;
  const payments = (order?.payment_collections ?? []).flatMap((collection) => collection?.payments ?? []);

  const captured: string[] = [];
  for (const payment of payments) {
    if (!payment || payment.provider_id !== X402_PROVIDER_ID || payment.captured_at || payment.canceled_at) {
      continue;
    }
    if (!payment.data?.settled_at || !payment.data?.transaction) {
      logger.warn(`[x402] order ${orderId}: payment ${payment.id} is not settled, left uncaptured`);
      continue;
    }
    await capturePaymentWorkflow(container).run({ input: { payment_id: payment.id } });
    captured.push(payment.id);
    logger.info(`[x402] order ${orderId}: payment ${payment.id} captured (transaction ${String(payment.data.transaction)})`);
  }
  return captured;
};
