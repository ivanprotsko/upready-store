import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";
import { wbRead } from "../../src/modules/wb/transport";
import { readWildberriesSecret } from "../../src/tenant-secrets/wildberries";

/**
 * Asks the live cabinet what an FBS order and an FBS supply actually look like
 * (w23-wb-write-fbs-orders).
 *
 * Why this exists: the saved documentation renders its response samples
 * COLLAPSED (`{"orders": [{}]}`), so the field names of the order object are
 * not in the extract. The mirror's mapping may not be invented from the shape
 * of the neighbouring endpoints (rule 17a), so it is read from the answer of
 * the cabinet the mirror is for.
 *
 * Prints KEYS and value TYPES, never values: an assembly order carries the
 * buyer's address and phone, and this output ends up in a report.
 *
 *   WB_TENANT=cherkashino npx medusa exec ./scripts/fixtures/w23-probe-fbs.ts
 */
export default async function w23ProbeFbs({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);

  const handle =
    process.env.WB_TENANT ??
    args.find((arg) => arg.startsWith("tenant="))?.slice("tenant=".length) ??
    "cherkashino";

  const [tenant] = await tenantModule.listTenants({ handle });
  if (!tenant) {
    logger.error(`w23-probe-fbs: no shop with handle ${handle} on this stand.`);
    process.exitCode = 1;
    return;
  }

  const secret = await readWildberriesSecret(pg, tenant.id);
  const token = typeof secret?.credentials.api_key === "string" ? secret.credentials.api_key : "";
  if (!token) {
    logger.error(`w23-probe-fbs: no Wildberries key stored for ${handle}.`);
    process.exitCode = 1;
    return;
  }

  /** Field names and value types of the first element, never its values. */
  const shapeOf = (sample: unknown): string => {
    if (!sample || typeof sample !== "object") {
      return `(не объект: ${typeof sample})`;
    }
    return Object.entries(sample as Record<string, unknown>)
      .map(([key, value]) => `${key}:${Array.isArray(value) ? "array" : typeof value}`)
      .sort()
      .join(" ");
  };

  const probe = async (
    endpointId: string,
    options: { query?: Record<string, string | number>; body?: unknown },
    pick: (answer: unknown) => unknown[],
  ) => {
    try {
      const result = await wbRead(endpointId, { token, tenantId: tenant.id, ...options });
      const rows = pick(result.data) ?? [];
      logger.info(`w23-probe-fbs: ${endpointId} -> HTTP ${result.status}, ${rows.length} rows`);
      if (rows.length) {
        logger.info(`w23-probe-fbs: ${endpointId} fields: ${shapeOf(rows[0])}`);
      }
      return rows;
    } catch (error) {
      logger.warn(
        `w23-probe-fbs: ${endpointId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  };

  const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

  const newOrders = await probe("marketplace.fbs.orders.new", {}, (answer) =>
    asArray((answer as { orders?: unknown[] })?.orders),
  );

  const orders = await probe(
    "marketplace.fbs.orders",
    { query: { limit: 10, next: 0 } },
    (answer) => asArray((answer as { orders?: unknown[] })?.orders),
  );

  const supplies = await probe(
    "marketplace.fbs.supplies",
    { query: { limit: 10, next: 0 } },
    (answer) => asArray((answer as { supplies?: unknown[] })?.supplies),
  );

  const ids = [...newOrders, ...orders]
    .map((order) => (order as { id?: unknown }).id)
    .filter((id): id is number => typeof id === "number")
    .slice(0, 10);

  if (ids.length) {
    await probe("marketplace.fbs.orders.status", { body: { orders: ids } }, (answer) =>
      asArray((answer as { orders?: unknown[] })?.orders),
    );
  } else {
    logger.info("w23-probe-fbs: статусы не спрашивали — ни одного идентификатора заказа не пришло.");
  }

  logger.info(
    `w23-probe-fbs: итог — new ${newOrders.length}, orders ${orders.length}, supplies ${supplies.length}.`,
  );
}
