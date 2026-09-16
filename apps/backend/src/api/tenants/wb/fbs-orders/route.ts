import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { MARKETPLACE_WRITE_MODULE } from "../../../../modules/marketplace-write";
import type MarketplaceWriteModuleService from "../../../../modules/marketplace-write/service";
import { WB_MODULE } from "../../../../modules/wb";
import type WbModuleService from "../../../../modules/wb/service";
import { assembleRefusal, cancelRefusal } from "../../../../modules/wb-write/fbs-orders";
import { WB_MARKETPLACE, WB_WRITE_ENDPOINTS } from "../../../../modules/wb-write/write-endpoints";
import {
  inspectWbWriteCredential,
  WB_WRITE_LIVE_ENV,
} from "../../../../modules/wb-write/write-transport";
import { readWildberriesWriteSecret } from "../../../../tenant-secrets/wildberries";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/wb/fbs-orders` — the FBS desk (w23-wb-write-fbs-orders).
 *
 * Everything here is read from OUR mirror (`wb_fbs_order`, `wb_supply`), never
 * from Wildberries: the imports fill the mirror
 * (`WB_KIND=supplies,fbs_orders pnpm --filter backend wb:sync`) and this route
 * opens no socket at all. A screen that called WB on every render would burn
 * the shop's 300-requests-a-minute budget on scrolling.
 *
 * Each order carries WHY an action is unavailable rather than a bare boolean,
 * because "кнопка серая" with no reason is the thing an owner writes to
 * support about. The reason comes from the same module the action itself goes
 * through (`modules/wb-write/fbs-orders.ts`), so the button and the refusal
 * can never disagree.
 *
 * Owner-scoped like its neighbours: `/tenants/*` sits behind
 * `authenticate("tenant", …)` and the tenant comes from the token through
 * `getTenantScope`, never from the query.
 */

/** How many orders one page of the desk shows. */
const PAGE = 100;

/** The statuses the desk offers as a filter, plus `all`. */
const FILTERS = ["new", "confirm", "complete", "cancel", "all"] as const;

type OrderRow = {
  order_id: string;
  rid: string | null;
  supply_id: string | null;
  supplier_status: string | null;
  wb_status: string | null;
  is_cancellable: boolean | null;
  nm_id: string | null;
  article: string | null;
  price: number | string | null;
  converted_price: number | string | null;
  currency_code: string | null;
  delivery_type: string | null;
  warehouse_id: string | null;
  wb_created_at: Date | string | null;
  status_fetched_at: Date | string | null;
};

type SupplyRow = {
  supply_id: string;
  name: string | null;
  done: boolean;
  cargo_type: number | null;
  wb_created_at: Date | string | null;
  closed_at: Date | string | null;
};

type SyncRow = {
  kind: string;
  status: string;
  rows: number;
  requests: number;
  started_at: Date | string;
  finished_at: Date | string | null;
  error: string | null;
};

const asIso = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * WB's minor units to whole roubles.
 *
 * Measured on the live cabinet 2026-09-16: an order of «Мумие банка» carries
 * `price` 81600 with `currencyCode` 643, and the item sells for 816 ₽. For an
 * order paid in another currency `convertedPrice` is the same amount in the
 * seller's own currency, which is why the desk shows that one.
 */
const asRoubles = (value: number | string | null): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 100 : null;
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const wb = req.scope.resolve<WbModuleService>(WB_MODULE);
  const writeService = req.scope.resolve<MarketplaceWriteModuleService>(MARKETPLACE_WRITE_MODULE);

  const asked = String(req.query.status ?? "new");
  const filter = (FILTERS as readonly string[]).includes(asked) ? asked : "new";

  const orders = (await wb.listWbFbsOrders(
    {
      tenant_id: tenant.id,
      ...(filter === "all" ? {} : { supplier_status: filter }),
    },
    { order: { wb_created_at: "DESC" }, take: PAGE },
  )) as OrderRow[];

  const supplies = (await wb.listWbSupplies(
    { tenant_id: tenant.id, done: false },
    { order: { wb_created_at: "DESC" }, take: PAGE },
  )) as SupplyRow[];

  // How many mirrored orders each open supply holds. The desk needs it because
  // WB refuses to close a supply with no orders in it, and a button that
  // always fails is worse than a button that is not there.
  const counted = (await pg("wb_fbs_order")
    .where({ tenant_id: tenant.id })
    .whereNull("deleted_at")
    .whereNotNull("supply_id")
    .groupBy("supply_id")
    .select("supply_id")
    .count<{ supply_id: string; count: string }[]>("* as count")) as Array<{
    supply_id: string;
    count: string;
  }>;
  const ordersPerSupply = new Map(counted.map((row) => [row.supply_id, Number(row.count)]));

  const byStatus = (await pg("wb_fbs_order")
    .where({ tenant_id: tenant.id })
    .whereNull("deleted_at")
    .groupBy("supplier_status")
    .select("supplier_status")
    .count<{ supplier_status: string | null; count: string }[]>("* as count")) as Array<{
    supplier_status: string | null;
    count: string;
  }>;

  const runs = (await wb.listWbSyncRuns(
    { tenant_id: tenant.id, kind: ["fbs_orders", "supplies"] },
    { order: { started_at: "DESC" }, take: 20 },
  )) as SyncRow[];

  const newestRun = (kind: string) => {
    const row = runs.find((run) => run.kind === kind);
    return row
      ? {
          kind,
          status: row.status,
          rows: row.rows,
          requests: row.requests,
          started_at: asIso(row.started_at),
          finished_at: asIso(row.finished_at),
          error: row.error,
        }
      : { kind, status: null, rows: 0, requests: 0, started_at: null, finished_at: null, error: null };
  };

  // The gates, reported and never settable from here: the desk has to be able
  // to say WHY an action will not reach Wildberries today.
  const secret = await readWildberriesWriteSecret(pg, tenant.id, { includeDisabled: true });
  const facts = secret ? inspectWbWriteCredential(secret.credentials) : null;

  const [setting] = (await writeService.listMarketplaceWriteSettings({
    tenant_id: tenant.id,
    marketplace: WB_MARKETPLACE,
  })) as Array<{ is_enabled: boolean }>;

  const [consent] = (await writeService.listMarketplaceWriteConsents({
    tenant_id: tenant.id,
    marketplace: WB_MARKETPLACE,
    op_class: "fbs_orders",
  })) as Array<{ confirmed_by: string; confirmed_at: Date | string }>;

  res.json({
    marketplace: WB_MARKETPLACE,
    filter,
    filters: FILTERS,
    orders: orders.map((order) => {
      const facts_ = {
        order_id: order.order_id,
        supplier_status: order.supplier_status,
        wb_status: order.wb_status,
        supply_id: order.supply_id,
        is_cancellable: order.is_cancellable,
      };
      return {
        ...facts_,
        rid: order.rid,
        nm_id: order.nm_id,
        article: order.article,
        price_rub: asRoubles(order.converted_price ?? order.price),
        currency_code: order.currency_code,
        delivery_type: order.delivery_type,
        warehouse_id: order.warehouse_id,
        created_at: asIso(order.wb_created_at),
        status_fetched_at: asIso(order.status_fetched_at),
        /** `null` means the action is available. A string is the reason it is not. */
        assemble_refusal: assembleRefusal(facts_),
        cancel_refusal: cancelRefusal(facts_),
      };
    }),
    supplies: supplies.map((supply) => ({
      supply_id: supply.supply_id,
      name: supply.name,
      done: supply.done,
      cargo_type: supply.cargo_type,
      orders: ordersPerSupply.get(supply.supply_id) ?? 0,
      created_at: asIso(supply.wb_created_at),
      closed_at: asIso(supply.closed_at),
    })),
    counts: Object.fromEntries(
      byStatus.map((row) => [row.supplier_status ?? "unknown", Number(row.count)]),
    ),
    sync: [newestRun("fbs_orders"), newestRun("supplies")],
    /** The class this desk writes through, and what stands between it and WB. */
    write: {
      op_class: "fbs_orders",
      endpoints: WB_WRITE_ENDPOINTS.filter((entry) => entry.opClass === "fbs_orders").map(
        (entry) => ({
          id: entry.id,
          method: entry.method,
          host: entry.host,
          path: entry.path,
          summary: entry.summary,
          doc_url: entry.docUrl,
          irreversible: entry.irreversible ?? false,
        }),
      ),
      gates: {
        credential: { usable: facts?.usable ?? false, reason: facts?.usable === false ? facts.reason : null },
        enabled: setting?.is_enabled ?? false,
        consent: consent
          ? { confirmed_by: consent.confirmed_by, confirmed_at: asIso(consent.confirmed_at) }
          : null,
        live: { env_var: WB_WRITE_LIVE_ENV, enabled: process.env[WB_WRITE_LIVE_ENV] === "1" },
      },
    },
  });
};
