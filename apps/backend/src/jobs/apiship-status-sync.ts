import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { syncApishipStatuses } from "../apiship/status-sync";

/**
 * THE APISHIP STATUS POLL (t-2026-10-14-58, checklist item 5).
 *
 * ApiShip offers a webhook (`POST /webhooks`, `ORDER_STATUS` and
 * `ORDER_NUMBER_UPDATE`), and the settings route registers it. This job is the
 * second road for the same statuses: a stand ApiShip cannot reach (a laptop,
 * a stand behind a firewall), a webhook that was never registered because the
 * token was pasted before this release, or a callback that was lost (ApiShip
 * retries a 5xx three times and then stops). Both roads end in the same
 * function, so a status applied by the webhook is a no-op here and the other
 * way round.
 *
 * Every ten minutes, every shop with an ApiShip token: its open ApiShip
 * fulfillments (an ApiShip order id, not delivered, not cancelled, not in a
 * final status) are asked for in batches of 100 (`POST /orders/statuses`).
 *
 * APISHIP_SCHEDULER=off, the same switch `MP_SCHEDULER=off` is for the
 * marketplace sync: a local backend holding a copy of the live database must
 * not poll ApiShip with the shops' own tokens next to production. Off means
 * off before anything else runs and is logged once per process.
 */
let loggedSchedulerOff = false;

export default async function apishipStatusSyncJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  if (process.env.APISHIP_SCHEDULER === "off") {
    if (!loggedSchedulerOff) {
      logger.info("[apiship-sync] расписание выключено (APISHIP_SCHEDULER=off) — статусы только по кнопке и по вебхуку");
      loggedSchedulerOff = true;
    }
    return;
  }

  const result = await syncApishipStatuses(container, {});
  if (result.checked) {
    logger.info(
      `[apiship-sync] checked ${result.checked} shipment(s) of ${result.tenants} shop(s): ${result.updated} updated, ${result.shipped} shipped, ${result.delivered} delivered, ${result.failed} failed`,
    );
  }
}

export const config = {
  name: "apiship-status-sync",
  schedule: "*/10 * * * *",
};
