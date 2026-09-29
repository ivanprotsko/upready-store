import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import tenantOrderLink from "../links/tenant-order";
import tenantSalesChannelLink from "../links/tenant-sales-channel";
import linkOrderToTenantWorkflow from "../workflows/tenant/link-order-to-tenant";

/**
 * The convergence half of the tenant-order link (review-2026-09-21 T-1,
 * audit 46df A-05).
 *
 * The `order.placed` subscriber is the only writer of the link, and it gets
 * one attempt: a handler that throws, a read that races the order commit
 * (`throwIfKeyNotFound` in the workflow) or a restart while the in-memory
 * event bus still holds the event, and the order never reaches the owner's
 * `GET /tenants/orders`, the one list the panel reads. Nobody packs an order
 * nobody sees.
 *
 * An orphan is an order that is not a draft, sits in a sales channel some
 * shop owns (the tenant-sales-channel link) and has no tenant-order link.
 * Each one is handed to the SAME `linkOrderToTenantWorkflow` the subscriber
 * runs, so the owner is decided in one place. All orphans are counted first
 * and linked after, one workflow run per order, and a failure of one order is
 * reported without stopping the rest. The link repository upserts, so a run
 * racing the subscriber on the same order writes nothing twice, and a second
 * run finds nothing to do.
 *
 * Run from `docker-entrypoint.sh` on every boot (`src/scripts/link-orphan-orders.ts`)
 * and every ten minutes (`src/jobs/link-orphan-orders.ts`).
 */

export type LinkOrphanOrdersOptions = {
  /** Count the orphans and link none of them. */
  dryRun?: boolean;
  /**
   * Leave orders placed at or after this moment to the subscriber, whose
   * event may still be on its way. Unset means every order.
   */
  placedBefore?: Date;
};

export type LinkOrphanOrdersSummary = {
  /** Orders in a sales channel some shop owns, drafts excluded. */
  checked: number;
  /** Of those, the ones with no tenant-order link when the run started. */
  orphans: number;
  /** Orphans this run linked. Zero on a dry run. */
  linked: number;
  /** Orphans whose workflow run threw, by order id. */
  failed: string[];
};

const PAGE_SIZE = 500;

type GraphQuery = {
  graph: (input: {
    entity: string;
    fields: string[];
    filters?: Record<string, unknown>;
    pagination?: { skip: number; take: number; order?: Record<string, "ASC" | "DESC"> };
  }) => Promise<{ data: Record<string, unknown>[] }>;
};

const idsOf = (rows: Record<string, unknown>[], key: string): string[] =>
  rows.map((row) => row[key]).filter((id): id is string => typeof id === "string" && id.length > 0);

export const linkOrphanOrders = async (
  container: MedusaContainer,
  { dryRun = false, placedBefore }: LinkOrphanOrdersOptions = {},
): Promise<LinkOrphanOrdersSummary> => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as unknown as GraphQuery;

  const { data: owned } = await query.graph({
    entity: tenantSalesChannelLink.entryPoint,
    fields: ["sales_channel_id"],
  });
  const channelIds = [...new Set(idsOf(owned, "sales_channel_id"))];

  const summary: LinkOrphanOrdersSummary = { checked: 0, orphans: 0, linked: 0, failed: [] };
  if (!channelIds.length) {
    return summary;
  }

  const orphanIds: string[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id"],
      filters: {
        sales_channel_id: channelIds,
        is_draft_order: false,
        ...(placedBefore ? { created_at: { $lt: placedBefore } } : {}),
      },
      pagination: { skip, take: PAGE_SIZE, order: { id: "ASC" } },
    });
    const pageIds = idsOf(orders, "id");
    if (!pageIds.length) {
      break;
    }
    summary.checked += pageIds.length;

    const { data: links } = await query.graph({
      entity: tenantOrderLink.entryPoint,
      fields: ["order_id"],
      filters: { order_id: pageIds },
    });
    const linkedIds = new Set(idsOf(links, "order_id"));
    orphanIds.push(...pageIds.filter((id) => !linkedIds.has(id)));

    if (pageIds.length < PAGE_SIZE) {
      break;
    }
  }

  summary.orphans = orphanIds.length;
  if (dryRun) {
    return summary;
  }

  for (const orderId of orphanIds) {
    try {
      const { result } = await linkOrderToTenantWorkflow(container).run({
        input: { order_id: orderId },
      });
      if (result.linked) {
        summary.linked += 1;
      }
    } catch (error) {
      summary.failed.push(orderId);
      logger.error(
        `[orphan-orders] order ${orderId} could not be linked to its shop: ${(error as Error).message}`,
      );
    }
  }

  return summary;
};

/** One log line for a summary, the same wording from the script and the job. */
export const describeOrphanOrders = (summary: LinkOrphanOrdersSummary, dryRun = false): string =>
  `[orphan-orders] ${summary.checked} shop order(s) checked, ${summary.orphans} without a shop link` +
  (dryRun
    ? ", dry run: nothing linked"
    : `, linked ${summary.linked}` +
      (summary.failed.length ? `, failed ${summary.failed.length}: ${summary.failed.join(", ")}` : ""));
