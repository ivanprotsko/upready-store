import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { captureSettledX402Payments } from "../x402/capture";

/**
 * An order paid by x402 (t-2026-10-03-33) is captured right after it is
 * placed, through `capturePaymentWorkflow`, so `payment.captured` fires and
 * the course and the payment letter follow (`x402/capture.ts` says why the
 * provider does not capture by itself). A no-op for every other order.
 *
 * A run that throws is logged and rethrown. The order then stays «authorized»
 * with its transaction hash shown in the panel, and the owner can capture it
 * there by hand: the provider's capture is bookkeeping for a settled transfer.
 */
export default async function x402CaptureOnPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    await captureSettledX402Payments(container, data.id);
  } catch (error) {
    logger.error(`[x402] order ${data.id}: capture after placing failed (${(error as Error).message})`);
    throw error;
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
