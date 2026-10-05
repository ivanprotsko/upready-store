import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { cryptoPaymentsAvailable } from "../../../../btcpay/availability";
import { btcpayConnectionOf, getBtcpayInvoice } from "../../../../btcpay/client";
import { BTCPAY_PROVIDER_ID } from "../../../../btcpay/session";
import { BTCPAY_SESSION_COLUMNS, settleBtcpaySession, type BtcpaySessionRow } from "../../../../btcpay/settle";
import { readBtcpaySecretPublic, verifyBtcpaySignature } from "../../../../tenant-secrets/btcpay";

/**
 * BTCPay's per-shop webhook: `/btcpay/webhook/:tenant`
 * (ask-20261005-070255-438f). The owner adds a webhook to their BTCPay store
 * with this URL, `:tenant` filled in with their tenant id (the panel shows the
 * exact address), and a secret they also save in the panel.
 *
 * The tenant is in the PATH for the reason Tribute's is: the signature can
 * only be checked once we know whose secret to check it against.
 *
 * The body is a hint and nothing more. After `BTCPay-Sig` checks out against
 * the RAW body (`bodyParser: { preserveRawBody: true }` in
 * `src/api/middlewares.ts`), the route reads the invoice from the shop's own
 * BTCPay Server and decides from that alone (`btcpay/settle.ts`): a body that
 * says "settled" settles nothing.
 *
 * Answers, chosen so BTCPay retries only what a retry can fix (its own
 * redelivery: after 10 s, 1 min, then up to six times every 10 min):
 * - 200 `ok` after the invoice was read and applied, a repeated delivery
 *   included (idempotent, see `settleBtcpaySession`);
 * - 200 `ignored` for an event this shop has nothing to do with: a non-invoice
 *   event, another store's, or an invoice no payment session of this shop
 *   issued (BTCPay's own Point of Sale on the same store, say); and for every
 *   delivery on an instance that takes no cryptocurrency
 *   (`btcpay/availability.ts`), before anything is read;
 * - 401 for a missing or wrong signature, 404 for a shop with no BTCPay store
 *   saved, 400 for a body that is not BTCPay's;
 * - 502 when the shop's server could not be read, 500 when the order could not
 *   be completed: both are retried, and the sweep job is the second chance.
 */

type BtcpayWebhookBody = {
  deliveryId?: string;
  isRedelivery?: boolean;
  type?: string;
  storeId?: string;
  invoiceId?: string;
};

const INVOICE_EVENTS = new Set([
  "InvoiceCreated",
  "InvoiceReceivedPayment",
  "InvoicePaymentSettled",
  "InvoiceProcessing",
  "InvoiceExpired",
  "InvoiceSettled",
  "InvoiceInvalid",
]);

const reject = (res: MedusaResponse, logger: Logger, status: number, reason: string, tenantId: string) => {
  logger.warn(`[btcpay/webhook] rejected for tenant ${tenantId}: ${reason}`);
  res.status(status).json({ status: "error", reason });
};

const ignore = (res: MedusaResponse, logger: Logger, reason: string, detail: string) => {
  logger.info(`[btcpay/webhook] ignored (${reason}): ${detail}`);
  res.status(200).json({ status: "ignored", reason });
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const tenantId = String(req.params.tenant ?? "");
  if (!cryptoPaymentsAvailable()) {
    return ignore(res, logger, "unavailable", `delivery for tenant ${tenantId || "-"}`);
  }
  if (!tenantId) {
    return reject(res, logger, 400, "missing_tenant", "");
  }

  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readBtcpaySecretPublic(pg, tenantId, logger, { includeDisabled: true });
  if (!secret || !secret.credentials.webhook_secret) {
    return reject(res, logger, 404, "shop_not_configured", tenantId);
  }

  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    return reject(res, logger, 400, "missing_raw_body", tenantId);
  }
  if (!verifyBtcpaySignature(rawBody, secret.credentials.webhook_secret, req.headers["btcpay-sig"])) {
    return reject(res, logger, 401, "bad_signature", tenantId);
  }

  const body = (req.body ?? {}) as BtcpayWebhookBody;
  const type = typeof body.type === "string" ? body.type : "";
  if (!type) {
    return reject(res, logger, 400, "malformed_payload", tenantId);
  }
  const delivery = `${type} delivery ${body.deliveryId ?? "-"}${body.isRedelivery ? " (redelivery)" : ""}`;
  const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : "";
  if (!INVOICE_EVENTS.has(type) || !invoiceId) {
    return ignore(res, logger, "event", `${delivery} for tenant ${tenantId}`);
  }
  if (body.storeId && body.storeId !== secret.credentials.store_id) {
    return ignore(res, logger, "foreign_store", `${delivery} from store ${body.storeId} for tenant ${tenantId}`);
  }

  const row = (await pg("payment_session")
    .select(...BTCPAY_SESSION_COLUMNS)
    .where({ provider_id: BTCPAY_PROVIDER_ID })
    .whereRaw(`"data"->>'invoice_id' = ?`, [invoiceId])
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")
    .first()) as BtcpaySessionRow | undefined;
  if (!row || row.data?.tenant_id !== tenantId) {
    return ignore(res, logger, "unknown_invoice", `${delivery}, invoice ${invoiceId}, tenant ${tenantId}`);
  }

  let invoice;
  try {
    invoice = await getBtcpayInvoice(btcpayConnectionOf(secret), invoiceId);
  } catch (error) {
    logger.warn(
      `[btcpay/webhook] invoice ${invoiceId} of tenant ${tenantId} could not be read: ${(error as Error).message}`,
    );
    return res.status(502).json({ status: "error", reason: "invoice_unreadable" });
  }

  try {
    const outcome = await settleBtcpaySession(req.scope, row, invoice, { event: type, logger, source: "webhook" });
    res.status(200).json({ status: "ok", outcome });
  } catch (error) {
    logger.error(
      `[btcpay/webhook] invoice ${invoiceId} read, but session ${row.id} could not be completed: ${
        (error as Error).message
      }`,
    );
    res.status(500).json({ status: "error", reason: "completion_failed" });
  }
};
