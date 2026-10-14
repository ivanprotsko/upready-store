import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

import { CdekError, cdekErrorLogLine, type CdekCredentials } from "../../../../cdek/client";
import {
  CDEK_DEFAULT_LABEL_FORMAT,
  CDEK_LABEL_FORMATS,
  CDEK_PRINT_MAX_ORDERS,
  CdekPrintTimeoutError,
  cdekPrintFailureReason,
  type CdekLabelFormat,
} from "../../../../cdek/print";
import { cdekApiCredentials, readCdekSecret } from "../../../../tenant-secrets/cdek";
import { listTenantOrderIds } from "../../tenant-scope";

/**
 * The CDEK label and receipt routes of the order card (t-2026-10-14-58, part A):
 *
 * - `GET /tenants/orders/:id/fulfillments/:fulfillment_id/cdek/label?format=A4|A5|A6`
 * - `GET /tenants/orders/:id/fulfillments/:fulfillment_id/cdek/waybill`
 * - `POST /tenants/orders/cdek/labels` with `{ fulfillment_ids, format? }`
 *
 * Each answers the PDF itself, read from CDEK inside the request: the file holds
 * the buyer's name and phone, so it never gets a URL of its own (the same rule
 * as the CSV exports, audit 2026-09-23, A-02).
 *
 * A refusal is `{ code, message }` JSON. The panel's SDK keeps only the status
 * and the `message` of an error answer, so every code has a status of its own
 * and every `message` but the 502's is a sentence the owner can read.
 */

/** The provider id Medusa gives the `cdek` provider of `cdek-fulfillment`. */
export const CDEK_PROVIDER_ID = "cdek_cdek";

export class CdekPrintRefusal extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CdekPrintRefusal";
    this.status = status;
    this.code = code;
  }
}

const NOT_REGISTERED_MESSAGE = "Отправление ещё не зарегистрировано в СДЭК";
const TIMEOUT_MESSAGE = "СДЭК не успел подготовить файл, попробуйте ещё раз через минуту";

export type CdekPrintTarget = {
  fulfillment_id: string;
  order_id: string;
  display_id: number | string;
  tenant_id: string;
  order_uuid: string;
};

type FulfillmentRow = {
  id: string;
  provider_id?: string | null;
  canceled_at?: string | Date | null;
  data?: Record<string, unknown> | null;
  order?: { id?: string | null; display_id?: number | null } | null;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * The fulfillments asked for, checked in this order, each check for the whole
 * list at once:
 *
 * 1. Every id is a fulfillment of an order of the caller's shop, and of `orderId`
 *    when the route names one. Otherwise 404, the same answer for a foreign id
 *    as for an id nobody has (`tenants/orders/helpers.ts`).
 * 2. Every one went through CDEK (provider `cdek_cdek`). Otherwise 422.
 * 3. Every one is registered with CDEK (`data.cdek_order_uuid`, set by
 *    `createFulfillment`) and not cancelled, which deletes it in CDEK. Otherwise 409.
 */
export const resolveCdekPrintTargets = async (
  req: AuthenticatedMedusaRequest,
  fulfillmentIds: string[],
  orderId?: string,
): Promise<CdekPrintTarget[]> => {
  const owned = new Set(await listTenantOrderIds(req));
  const ids = [...new Set(fulfillmentIds)];

  if (orderId && !owned.has(orderId)) {
    throw new CdekPrintRefusal(404, "not_found", `Order with id "${orderId}" was not found`);
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "provider_id", "canceled_at", "data", "order.id", "order.display_id"],
    filters: { id: ids },
  });
  const rows = new Map((data as FulfillmentRow[]).map((row) => [row.id, row]));

  const missing = ids.filter((id) => {
    const owner = rows.get(id)?.order?.id;
    return !owner || !owned.has(owner) || (orderId !== undefined && owner !== orderId);
  });
  if (missing.length) {
    throw new CdekPrintRefusal(404, "not_found", `Fulfillment with id "${missing.join('", "')}" was not found`);
  }

  const found = ids.map((id) => rows.get(id) as FulfillmentRow);

  const notCdek = found.filter((row) => row.provider_id !== CDEK_PROVIDER_ID);
  if (notCdek.length) {
    throw new CdekPrintRefusal(422, "cdek_not_cdek", "Это отправление не через СДЭК");
  }

  const notRegistered = found.filter(
    (row) => row.canceled_at || !text(row.data?.cdek_order_uuid) || !text(row.data?.tenant_id),
  );
  if (notRegistered.length) {
    throw new CdekPrintRefusal(409, "cdek_not_registered", NOT_REGISTERED_MESSAGE);
  }

  return found.map((row) => ({
    fulfillment_id: row.id,
    order_id: row.order?.id as string,
    display_id: row.order?.display_id ?? row.id,
    tenant_id: text(row.data?.tenant_id) as string,
    order_uuid: text(row.data?.cdek_order_uuid) as string,
  }));
};

/**
 * The CDEK account the shipment was registered with: the one of the shop named
 * in its own `data`, exactly as `cancelFulfillment` reads it. A shop that has
 * since switched CDEK off at checkout still prints what it has already
 * registered, so a disabled row is read too.
 */
export const cdekCredentialsFor = async (
  req: AuthenticatedMedusaRequest,
  targets: CdekPrintTarget[],
): Promise<CdekCredentials> => {
  const tenants = [...new Set(targets.map((target) => target.tenant_id))];
  if (tenants.length !== 1) {
    throw new CdekPrintRefusal(
      422,
      "cdek_mixed_accounts",
      "Отправления зарегистрированы в разных кабинетах СДЭК, распечатайте их по отдельности",
    );
  }
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readCdekSecret(pg, tenants[0], { includeDisabled: true });
  const credentials = secret && cdekApiCredentials(secret);
  if (!credentials) {
    throw new CdekPrintRefusal(
      422,
      "cdek_not_configured",
      "СДЭК не настроен для этого магазина: заполните доступ в настройках доставки",
    );
  }
  return credentials;
};

const formatSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(CDEK_LABEL_FORMATS));

/** `?format=` of the label route; absent means A6. */
export const parseLabelFormat = (value: unknown): CdekLabelFormat => {
  if (value === undefined || value === "") return CDEK_DEFAULT_LABEL_FORMAT;
  const parsed = formatSchema.safeParse(value);
  if (!parsed.success) {
    throw new CdekPrintRefusal(400, "invalid_data", `format must be one of ${CDEK_LABEL_FORMATS.join(", ")}`);
  }
  return parsed.data;
};

const batchSchema = z.strictObject({
  fulfillment_ids: z.array(z.string().trim().min(1)).min(1).max(CDEK_PRINT_MAX_ORDERS),
  format: z.string().optional(),
});

/** The body of `POST /tenants/orders/cdek/labels`. */
export const parseBatchBody = (body: unknown): { fulfillment_ids: string[]; format: CdekLabelFormat } => {
  const parsed = batchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new CdekPrintRefusal(
      400,
      "invalid_data",
      `fulfillment_ids must be a list of 1 to ${CDEK_PRINT_MAX_ORDERS} ids`,
    );
  }
  return { fulfillment_ids: parsed.data.fulfillment_ids, format: parseLabelFormat(parsed.data.format) };
};

/** The PDF as the answer, opened in the browser rather than saved. */
export const sendPdf = (res: MedusaResponse, pdf: Buffer, filename: string): void => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Content-Length", String(pdf.length));
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(pdf);
};

/**
 * Turns a failure into its `{ code, message }` answer. Anything this does not
 * recognise is raised again and reaches Medusa's own error handler.
 */
export const sendCdekPrintError = (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  error: unknown,
): void => {
  if (error instanceof CdekPrintRefusal) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  // `AbortSignal.timeout` rejects with a `TimeoutError` when CDEK hangs.
  if (error instanceof CdekPrintTimeoutError || (error as Error | null)?.name === "TimeoutError") {
    res.status(504).json({ code: "cdek_print_timeout", message: TIMEOUT_MESSAGE });
    return;
  }
  if (error instanceof CdekError) {
    req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER)?.warn(`[cdek print] ${cdekErrorLogLine(error)}`);
    res.status(502).json({ code: "cdek_print_failed", message: cdekPrintFailureReason(error) });
    return;
  }
  // Node's `fetch` rejects with this exact TypeError when CDEK cannot be reached.
  if (error instanceof TypeError && error.message === "fetch failed") {
    res.status(502).json({ code: "cdek_print_failed", message: "no_connection" });
    return;
  }
  throw error;
};
