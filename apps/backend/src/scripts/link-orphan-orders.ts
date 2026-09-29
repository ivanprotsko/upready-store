import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import {
  describeOrphanOrders,
  linkOrphanOrders,
  type LinkOrphanOrdersSummary,
} from "../tenant-orders/link-orphan-orders";

/**
 * Links every placed order that its shop never got (review-2026-09-21 T-1,
 * audit 46df A-05). The rules live in `src/tenant-orders/link-orphan-orders.ts`;
 * this is the boot step of `docker-entrypoint.sh` and the tool to count the
 * orphans of a database by hand. Idempotent: a second run reports 0.
 *
 *   npx medusa exec ./src/scripts/link-orphan-orders.ts dry-run
 *   npx medusa exec ./src/scripts/link-orphan-orders.ts
 *
 * The argument carries no leading dashes: `medusa exec` parses its own argv
 * first and rejects a `--flag` meant for the script.
 *
 * It exits non-zero when an order could not be linked, after trying all of
 * them, so the entrypoint prints its warning.
 */
export default async function linkOrphanOrdersScript({
  container,
  args,
}: ExecArgs): Promise<LinkOrphanOrdersSummary> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const dryRun = (args ?? []).includes("dry-run");

  const summary = await linkOrphanOrders(container, { dryRun });
  logger.info(describeOrphanOrders(summary, dryRun));

  if (summary.failed.length) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `${summary.failed.length} order(s) are still without a shop link`,
    );
  }
  return summary;
}
