import type { MedusaContainer } from "@medusajs/framework";
import type { LinkDefinition, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";

/**
 * Moves each tenant's sales channel and publishable key from the two text
 * columns the `tenant` table carried at first into the module links
 * tenant-sales-channel and tenant-api-key.
 *
 * `medusa db:migrate` runs in three stages: module migrations, link sync,
 * migration scripts. The link tables exist only after stage two, so the module
 * migration that drops the columns (stage one) cannot write them. It copies
 * the mapping into `tenant_link_backfill` first, and this script (stage three)
 * turns the copy into link rows and drops it. On a database that never had the
 * columns there is no such table and nothing to do; the runner records the
 * script as run either way.
 */
type BackfillRow = {
  tenant_id: string;
  sales_channel_id: string;
  publishable_api_key_id: string;
};

const BACKFILL_TABLE = "tenant_link_backfill";

export default async function backfillTenantLinks({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);

  if (!(await pg.schema.hasTable(BACKFILL_TABLE))) {
    logger.info(`backfill-tenant-links: no ${BACKFILL_TABLE} table — nothing to move.`);
    return;
  }

  const rows: BackfillRow[] = await pg(BACKFILL_TABLE).select(
    "tenant_id",
    "sales_channel_id",
    "publishable_api_key_id",
  );

  if (rows.length > 0) {
    const link = container.resolve(ContainerRegistrationKeys.LINK);
    await link.create(
      rows.flatMap((row): LinkDefinition[] => [
        {
          [TENANT_MODULE]: { tenant_id: row.tenant_id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: row.sales_channel_id },
        },
        {
          [TENANT_MODULE]: { tenant_id: row.tenant_id },
          [Modules.API_KEY]: { api_key_id: row.publishable_api_key_id },
        },
      ]),
    );
  }

  await pg.schema.dropTable(BACKFILL_TABLE);

  logger.info(
    `backfill-tenant-links: ${rows.length} tenant(s) → ${rows.length * 2} link(s); ${BACKFILL_TABLE} dropped.`,
  );
}
