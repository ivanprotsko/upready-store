import type { IFulfillmentModuleService, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import {
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows";

import { carrierLabel } from "./carriers";
import { isApishipShippingMethodData, type ApishipShippingMethodData } from "./method";
import { getOrderStatuses, type ApishipOrderInfo, type ApishipOrderStatus } from "./orders";
import {
  APISHIP_DELIVERED_STATUSES,
  APISHIP_FINAL_STATUSES,
  APISHIP_SHIPPED_STATUSES,
  apishipTrackingUrl,
  type ApishipStatusEntry,
} from "./statuses";
import { apishipApiCredentials, readApishipSecret } from "../tenant-secrets/apiship";

/**
 * ApiShip statuses → the Medusa fulfillment (t-2026-10-14-58, checklist 5).
 *
 * One function for the webhook, the ten-minute job and the panel's «Обновить
 * статус»: whichever road brings a status, the same things happen, once.
 *
 * - The status and the carrier's number land in the fulfillment's `data`
 *   (`apiship_status`, `apiship_provider_number`, the history), the way the
 *   direct СДЭК webhook keeps its own.
 * - The carrier's number becomes a fulfillment LABEL (`tracking_number`,
 *   `tracking_url`) and the carrier's name goes to `metadata.carrier`, because
 *   that is what the panel's fulfillment card, the storefront's order page and
 *   the «заказ отправлен» letter already read («СДЭК 1110019183»).
 * - A status that means «the parcel is in the carrier's hands» marks the
 *   fulfillment shipped through `createOrderShipmentWorkflow`, the same
 *   workflow the panel's own «Передать в доставку» runs: the order's
 *   fulfillment status moves, `shipment.created` fires, the buyer gets the
 *   letter with the number. `delivered` runs
 *   `markOrderFulfillmentAsDeliveredWorkflow` the same way.
 */

export type ApishipFulfillmentRow = {
  id: string;
  data: ApishipShippingMethodData;
  shipped_at: Date | string | null;
  delivered_at: Date | string | null;
  canceled_at: Date | string | null;
  metadata: Record<string, unknown> | null;
};

type FulfillmentLabelRow = {
  id: string;
  tracking_number: string;
  tracking_url: string;
  label_url: string;
};

const toRow = (raw: Record<string, unknown>): ApishipFulfillmentRow | null => {
  const data = raw.data;
  if (!isApishipShippingMethodData(data)) return null;
  return {
    id: String(raw.id),
    data,
    shipped_at: (raw.shipped_at as Date | null) ?? null,
    delivered_at: (raw.delivered_at as Date | null) ?? null,
    canceled_at: (raw.canceled_at as Date | null) ?? null,
    metadata: (raw.metadata as Record<string, unknown> | null) ?? null,
  };
};

const FULFILLMENT_COLUMNS = ["id", "data", "shipped_at", "delivered_at", "canceled_at", "metadata"];

/** The fulfillment that carries this ApiShip order id, of this shop when given. */
export const findApishipFulfillment = async (
  pg: Knex,
  input: { apishipOrderId: number; tenantId?: string },
): Promise<ApishipFulfillmentRow | null> => {
  let query = pg("fulfillment")
    .select(FULFILLMENT_COLUMNS)
    .whereRaw("data->>'apiship_order_id' = ?", [String(input.apishipOrderId)])
    .whereNull("deleted_at");
  if (input.tenantId) {
    query = query.whereRaw("data->>'tenant_id' = ?", [input.tenantId]);
  }
  const raw = (await query.first()) as Record<string, unknown> | undefined;
  return raw ? toRow(raw) : null;
};

/**
 * The shop's ApiShip fulfillments still worth asking about: registered with
 * ApiShip, not cancelled here, not delivered, and not in a final status.
 * `fulfillmentIds` narrows to the ones the panel asked for.
 */
export const listOpenApishipFulfillments = async (
  pg: Knex,
  input: { tenantId?: string; fulfillmentIds?: string[]; includeFinal?: boolean },
): Promise<ApishipFulfillmentRow[]> => {
  let query = pg("fulfillment")
    .select(FULFILLMENT_COLUMNS)
    .whereRaw("data->>'provider' = 'apiship'")
    .whereRaw("data->>'apiship_order_id' is not null")
    .whereNull("deleted_at")
    .whereNull("canceled_at");
  if (input.tenantId) {
    query = query.whereRaw("data->>'tenant_id' = ?", [input.tenantId]);
  }
  if (input.fulfillmentIds?.length) {
    query = query.whereIn("id", input.fulfillmentIds);
  } else {
    query = query.whereNull("delivered_at");
  }
  if (!input.includeFinal && !input.fulfillmentIds?.length) {
    query = query.whereRaw(
      "coalesce(data->>'apiship_status', '') not in (" + [...APISHIP_FINAL_STATUSES].map(() => "?").join(",") + ")",
      [...APISHIP_FINAL_STATUSES],
    );
  }
  const rows = (await query.orderBy("created_at", "asc").limit(2000)) as Array<Record<string, unknown>>;
  return rows.map(toRow).filter((row): row is ApishipFulfillmentRow => row !== null);
};

/** The lines of the fulfillment, as the shipment workflow wants them named. */
const listShipmentItems = async (pg: Knex, fulfillmentId: string): Promise<Array<{ id: string; quantity: number }>> => {
  const rows = (await pg("fulfillment_item")
    .select("line_item_id", "quantity")
    .where({ fulfillment_id: fulfillmentId })
    .whereNull("deleted_at")) as Array<{ line_item_id: string | null; quantity: unknown }>;
  const byLine = new Map<string, number>();
  for (const row of rows) {
    if (!row.line_item_id) continue;
    byLine.set(row.line_item_id, Math.max(byLine.get(row.line_item_id) ?? 0, Number(row.quantity) || 1));
  }
  return [...byLine].map(([id, quantity]) => ({ id, quantity }));
};

const listLabels = async (pg: Knex, fulfillmentId: string): Promise<FulfillmentLabelRow[]> =>
  (await pg("fulfillment_label")
    .select("id", "tracking_number", "tracking_url", "label_url")
    .where({ fulfillment_id: fulfillmentId })
    .whereNull("deleted_at")) as FulfillmentLabelRow[];

const orderIdOf = async (container: MedusaContainer, fulfillmentId: string): Promise<string | null> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { fulfillments: { id: fulfillmentId } },
  });
  return (orders[0] as { id?: string } | undefined)?.id ?? null;
};

export type ApishipStatusUpdate = {
  orderInfo: ApishipOrderInfo;
  status: ApishipOrderStatus | null;
};

export type ApplyResult = {
  fulfillment_id: string;
  apiship_order_id: number | null;
  status: string | null;
  provider_number: string | null;
  changed: boolean;
  shipped: boolean;
  delivered: boolean;
  error: string | null;
};

const entryOf = (update: ApishipStatusUpdate): ApishipStatusEntry | null =>
  update.status?.key
    ? {
        key: update.status.key,
        at: update.status.created || new Date().toISOString(),
        name: update.status.name ?? null,
        provider_code: update.status.providerCode || null,
        provider_name: update.status.providerName || null,
        provider_description: update.status.providerDescription || null,
        error_code: update.status.errorCode || null,
      }
    : null;

/**
 * Apply one status answer (or a bare number update) to one fulfillment.
 * Idempotent: the same answer twice changes nothing the second time.
 */
export const applyApishipStatus = async (
  container: MedusaContainer,
  row: ApishipFulfillmentRow,
  update: ApishipStatusUpdate,
): Promise<ApplyResult> => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const data = row.data;
  const result: ApplyResult = {
    fulfillment_id: row.id,
    apiship_order_id: data.apiship_order_id ?? null,
    status: data.apiship_status ?? null,
    provider_number: data.apiship_provider_number ?? null,
    changed: false,
    shipped: false,
    delivered: false,
    error: null,
  };

  const providerNumber = update.orderInfo?.providerNumber?.trim() || data.apiship_provider_number || null;
  const trackingUrl = providerNumber
    ? apishipTrackingUrl(data.provider_key, providerNumber, update.orderInfo?.trackingUrl)
    : null;
  const entry = entryOf(update);
  const history = Array.isArray(data.apiship_statuses) ? (data.apiship_statuses as ApishipStatusEntry[]) : [];
  const isNewEntry =
    entry !== null && !history.some((past) => past.key === entry.key && past.at === entry.at);

  const nextData: ApishipShippingMethodData = {
    ...data,
    apiship_provider_number: providerNumber,
    apiship_tracking_url: trackingUrl,
    ...(entry && isNewEntry
      ? {
          apiship_status: entry.key,
          apiship_status_at: entry.at,
          apiship_status_name: entry.name ?? null,
          apiship_status_detail: entry.provider_description ?? null,
          apiship_statuses: [...history, entry].slice(-50) as Array<Record<string, unknown>>,
        }
      : {}),
  };
  const dataChanged =
    isNewEntry ||
    providerNumber !== (data.apiship_provider_number ?? null) ||
    trackingUrl !== (data.apiship_tracking_url ?? null);

  const statusKey = nextData.apiship_status ?? null;
  const carrier = carrierLabel(data.provider_key);
  const metadata = row.metadata ?? {};
  const carrierMissing = metadata.carrier !== carrier;

  const existingLabels = await listLabels(pg, row.id);
  const labelMissing = Boolean(providerNumber) && !existingLabels.some((label) => label.tracking_number === providerNumber);
  const desiredLabels = providerNumber
    ? [
        ...existingLabels
          .filter((label) => label.tracking_number !== providerNumber)
          .map((label) => ({ tracking_number: label.tracking_number, tracking_url: label.tracking_url, label_url: label.label_url })),
        { tracking_number: providerNumber, tracking_url: trackingUrl ?? "", label_url: "" },
      ]
    : null;

  const willShip =
    statusKey !== null && APISHIP_SHIPPED_STATUSES.has(statusKey) && !row.shipped_at && !row.canceled_at;
  const willDeliver =
    statusKey !== null && APISHIP_DELIVERED_STATUSES.has(statusKey) && !row.delivered_at && !row.canceled_at;

  try {
    if (dataChanged || carrierMissing || (labelMissing && !willShip)) {
      // The module service, the way the direct СДЭК webhook writes its data:
      // the labels list REPLACES the fulfillment's labels, so the ones already
      // there are passed back by id and the carrier's number is added once.
      const update: Record<string, unknown> = { data: nextData };
      if (carrierMissing) update.metadata = { ...metadata, carrier };
      if (labelMissing && !willShip && desiredLabels) {
        update.labels = [
          ...existingLabels.map((label) => ({
            id: label.id,
            tracking_number: label.tracking_number,
            tracking_url: label.tracking_url,
            label_url: label.label_url,
          })),
          { tracking_number: providerNumber as string, tracking_url: trackingUrl ?? "", label_url: "" },
        ];
      }
      const fulfillmentModule = container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT);
      await fulfillmentModule.updateFulfillment(row.id, update);
      result.changed = true;
    }

    if (willShip || willDeliver) {
      const orderId = await orderIdOf(container, row.id);
      if (!orderId) {
        throw new Error(`no order links to fulfillment ${row.id}`);
      }
      if (willShip) {
        await createOrderShipmentWorkflow(container).run({
          input: {
            order_id: orderId,
            fulfillment_id: row.id,
            items: await listShipmentItems(pg, row.id),
            labels: desiredLabels ?? [],
            no_notification: false,
            created_by: "apiship",
          },
        });
        result.shipped = true;
        result.changed = true;
      }
      if (willDeliver) {
        await markOrderFulfillmentAsDeliveredWorkflow(container).run({
          input: { orderId, fulfillmentId: row.id },
        });
        result.delivered = true;
        result.changed = true;
      }
    }
  } catch (error) {
    result.error = (error as Error).message;
    logger.warn(`[apiship-sync] fulfillment ${row.id}: ${result.error}`);
  }

  result.status = statusKey;
  result.provider_number = providerNumber;
  return result;
};

export type SyncResult = {
  tenants: number;
  checked: number;
  updated: number;
  shipped: number;
  delivered: number;
  failed: number;
  results: ApplyResult[];
};

/**
 * Pull statuses for the open ApiShip fulfillments of one shop, or of every
 * shop, in batches of 100, and apply each one. A shop without a readable,
 * enabled token is skipped: not having ApiShip is a normal state of a shop.
 */
export const syncApishipStatuses = async (
  container: MedusaContainer,
  input: { tenantId?: string; fulfillmentIds?: string[] },
): Promise<SyncResult> => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const rows = await listOpenApishipFulfillments(pg, input);
  const summary: SyncResult = { tenants: 0, checked: 0, updated: 0, shipped: 0, delivered: 0, failed: 0, results: [] };

  const byTenant = new Map<string, ApishipFulfillmentRow[]>();
  for (const row of rows) {
    const list = byTenant.get(row.data.tenant_id) ?? [];
    list.push(row);
    byTenant.set(row.data.tenant_id, list);
  }

  for (const [tenantId, mine] of byTenant) {
    let credentials;
    try {
      credentials = apishipApiCredentials(await readApishipSecret(pg, tenantId));
    } catch (error) {
      logger.warn(`[apiship-sync] tenant ${tenantId}: token unreadable (${(error as Error).name}); skipped`);
      continue;
    }
    if (!credentials) continue;
    summary.tenants += 1;

    const ids = mine.map((row) => Number(row.data.apiship_order_id)).filter((id) => Number.isInteger(id) && id > 0);
    let answer;
    try {
      answer = await getOrderStatuses(credentials, ids);
    } catch (error) {
      logger.warn(`[apiship-sync] tenant ${tenantId}: statuses call failed: ${(error as Error).message}`);
      summary.failed += ids.length;
      continue;
    }
    summary.checked += ids.length;

    for (const item of answer.succeedOrders) {
      const orderId = Number(item.orderInfo?.orderId);
      const row = mine.find((candidate) => Number(candidate.data.apiship_order_id) === orderId);
      if (!row) continue;
      const result = await applyApishipStatus(container, row, { orderInfo: item.orderInfo, status: item.status ?? null });
      summary.results.push(result);
      if (result.error) summary.failed += 1;
      else if (result.changed) summary.updated += 1;
      if (result.shipped) summary.shipped += 1;
      if (result.delivered) summary.delivered += 1;
    }
    for (const failed of answer.failedOrders) {
      summary.failed += 1;
      const row = mine.find((candidate) => Number(candidate.data.apiship_order_id) === Number(failed.orderId));
      summary.results.push({
        fulfillment_id: row?.id ?? "",
        apiship_order_id: Number(failed.orderId) || null,
        status: row?.data.apiship_status ?? null,
        provider_number: row?.data.apiship_provider_number ?? null,
        changed: false,
        shipped: false,
        delivered: false,
        error: failed.message,
      });
    }
  }

  return summary;
};
