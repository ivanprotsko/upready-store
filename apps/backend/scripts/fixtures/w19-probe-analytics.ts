import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";
import { WB_MODULE } from "../../src/modules/wb";
import type WbModuleService from "../../src/modules/wb/service";
import { wbRead } from "../../src/modules/wb/transport";
import { readWildberriesSecret } from "../../src/tenant-secrets/wildberries";
import { inspectToken } from "../../src/modules/wb/token";

/**
 * Asks the live cabinet what the two seller-analytics reports answer
 * (w19-mp-analytics).
 *
 * WHY IT EXISTS. The dashboard has a rating block and a turnover block, and
 * both have a marketplace-side source: `data.sellerRating.current` of
 * `/api/analytics/v2/item-rating`, and `saleRate` / `avgStockTurnover` of
 * `/api/v2/stocks-report/products/products`. WB's own doc line above the
 * rating method says "Method is available by Personal token, Service token",
 * so a base token is expected to be refused — and «expected» is not a
 * measurement (rule 17a). This script is the measurement: whatever comes back,
 * status and body, goes verbatim into the report and decides what the screen
 * says.
 *
 * It writes the transport journal (`wb_api_call` / the carried `mp_api_call`),
 * which is what lets the screen name the moment the rating was last asked for
 * instead of asserting «недоступно» from nowhere.
 *
 * Two requests, no loop: the stocks report gives a base token 2 requests an
 * hour and the rating 3 a minute. A refusal is an answer; it is not retried.
 *
 *   WB_TENANT=cherkashino npx medusa exec ./scripts/fixtures/w19-probe-analytics.ts
 */
export default async function w19ProbeAnalytics({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);
  const wb = container.resolve<WbModuleService>(WB_MODULE);

  const handle =
    process.env.WB_TENANT ??
    args.find((arg) => arg.startsWith("tenant="))?.slice("tenant=".length) ??
    "cherkashino";

  const [tenant] = await tenantModule.listTenants({ handle });
  if (!tenant) {
    logger.error(`w19-probe-analytics: no shop with handle ${handle} on this stand.`);
    process.exitCode = 1;
    return;
  }

  const secret = await readWildberriesSecret(pg, tenant.id);
  const token = typeof secret?.credentials.api_key === "string" ? secret.credentials.api_key : "";
  if (!token) {
    logger.error(`w19-probe-analytics: no Wildberries key stored for ${handle}.`);
    process.exitCode = 1;
    return;
  }

  const facts = inspectToken(token);
  logger.info(
    `w19-probe-analytics: key kind=${facts.kind ?? "?"} readOnly=${String(facts.readOnly)} ` +
      `mask=${facts.mask ?? "?"} granted bits=${facts.categories
        .filter((one) => one.granted)
        .map((one) => one.bit)
        .join(",")}`,
  );

  const journal = async (row: Record<string, unknown>) => {
    await wb.createWbApiCalls([row as never]);
  };

  /** The last 30 days, the same default period the dashboard opens on. */
  const day = (shift: number) =>
    new Date(Date.now() - shift * 86_400_000).toISOString().slice(0, 10);
  const currentPeriod = { start: day(29), end: day(0) };

  const probe = async (endpointId: string, body: unknown) => {
    try {
      const result = await wbRead(endpointId, { token, tenantId: tenant.id, body, journal });
      /** Keys only for the big report; the rating block is small and printed whole. */
      logger.info(`w19-probe-analytics: ${endpointId} -> HTTP ${result.status}`);
      logger.info(
        `w19-probe-analytics: ${endpointId} answer -> ${JSON.stringify(result.data).slice(0, 1200)}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      /* The refusal IS the result of this script; it is printed, not swallowed. */
      logger.warn(`w19-probe-analytics: ${endpointId} refused -> ${message.slice(0, 1200)}`);
    }
  };

  await probe("analytics.item-rating", {
    currentPeriod,
    orderBy: { field: "feedbackCount", mode: "desc" },
    limit: 5,
    offset: 0,
  });

  await probe("analytics.stocks-report.products", {
    currentPeriod,
    stockType: "",
    skipDeletedNm: true,
    orderBy: { field: "avgOrders", mode: "desc" },
    availabilityFilters: ["deficient", "actual", "balanced", "nonActual", "nonLiquid", "invalidData"],
    limit: 5,
    offset: 0,
  });

  logger.info("w19-probe-analytics: done, two requests spent.");
}
