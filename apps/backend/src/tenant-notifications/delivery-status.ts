import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { ensureSettings } from "./shop";

/**
 * The last delivery of each channel, as the PANEL shows it
 * (t08-order-notifications, rule 20a).
 *
 * A failure has to surface at both ends: the log line the operator reads
 * carries the order id, and this row is what the owner sees without a log at
 * all. Writing it must never be the reason an order fails, so every error here
 * is logged and swallowed — the order is already placed, and the customer is
 * not made to pay for our bookkeeping.
 */

export type DeliveryChannel = "email" | "telegram";

export type DeliveryOutcome = {
  status: "ok" | "failed";
  /** Empty on success; a short reason on failure, the same one the log carries. */
  error?: string | null;
  /** The order as the owner knows it (`display_id`), or its id when there is none. */
  order?: string | null;
};

export const recordDelivery = async (
  container: MedusaContainer,
  tenantId: string | null,
  channel: DeliveryChannel,
  outcome: DeliveryOutcome,
): Promise<void> => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  if (!tenantId) {
    // A single-store install has no per-shop row to write to. The log line
    // above this call is the only record, which is the same place it was
    // before tenants existed.
    return;
  }

  try {
    const settings = await ensureSettings(container, tenantId);
    const now = new Date();

    await container.resolve<TenantModuleService>(TENANT_MODULE).updateTenantNotificationSettings({
      id: settings.id,
      [`${channel}_last_status`]: outcome.status,
      [`${channel}_last_at`]: now,
      // A previous failure must not survive a success, and vice versa: the
      // panel shows ONE last attempt, not a mixture of two.
      [`${channel}_last_error`]: outcome.status === "failed" ? (outcome.error ?? "") : null,
      [`${channel}_last_order`]: outcome.order ?? null,
    });
  } catch (error) {
    logger.warn(
      `[tenant-notifications] Could not record the ${channel} delivery status of tenant ${tenantId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};
