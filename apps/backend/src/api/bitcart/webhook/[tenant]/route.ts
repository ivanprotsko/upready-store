import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { bitcartConnectionOf, getBitcartInvoice } from "../../../../bitcart/client";
import { BITCART_PROVIDER_ID } from "../../../../bitcart/session";
import {
  BITCART_SESSION_COLUMNS,
  bitcartSessionAlreadyPaid,
  settleBitcartSession,
  type BitcartSessionRow,
} from "../../../../bitcart/settle";
import { cryptoPaymentsAvailable } from "../../../../btcpay/availability";
import { readBitcartSecretPublic } from "../../../../tenant-secrets/bitcart";

/**
 * Bitcart's per-shop notification: `/bitcart/webhook/:tenant`
 * (ask-20261005-070255-438f, stage 2). The provider names this address in
 * every invoice it creates (`notification_url`, `bitcart/notification-url.ts`),
 * so the owner sets nothing up in Bitcart.
 *
 * Bitcart POSTs `{ "id": <invoice id>, "status": <status> }` on every status
 * change, UNSIGNED and never retried (`api/services/ipn_sender.py`, master at
 * e3bf1016: "TODO: IPN v2"). So the body is a hint and nothing more: anybody
 * can send it. The route only takes the invoice id from it, finds the session
 * of THIS shop that issued that invoice, and reads the invoice from the
 * shop's own Bitcart with the shop's own token. What the server says decides
 * (`bitcart/settle.ts`); a body that says "complete" completes nothing.
 *
 * Answers:
 * - 200 `ok` after the invoice was read and applied, a repeated notification
 *   included (idempotent, see `settleBitcartSession`). A session that is
 *   already paid is answered `already_captured` without reading anything, so
 *   repeating a notification for a paid invoice costs one query;
 * - 200 `ignored` for an invoice no payment session of this shop issued (the
 *   owner's own Bitcart store POS on the same store, say, or a made-up id),
 *   and for every notification on an instance that takes no cryptocurrency
 *   (`btcpay/availability.ts`), before anything is read;
 * - 404 for a shop with no Bitcart store saved, 400 for a body without an
 *   invoice id;
 * - 502 when the shop's server could not be read, 500 when the order could
 *   not be completed. Bitcart retries neither: the sweep job
 *   (`jobs/bitcart-invoice-sweep.ts`) settles that invoice within a minute.
 */

type BitcartNotificationBody = {
  id?: unknown;
  status?: unknown;
};

/** Bitcart ids are ULIDs; anything far from that shape never reaches a query. */
const INVOICE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const reject = (res: MedusaResponse, logger: Logger, status: number, reason: string, tenantId: string) => {
  logger.warn(`[bitcart/notification] rejected for tenant ${tenantId}: ${reason}`);
  res.status(status).json({ status: "error", reason });
};

const ignore = (res: MedusaResponse, logger: Logger, reason: string, detail: string) => {
  logger.info(`[bitcart/notification] ignored (${reason}): ${detail}`);
  res.status(200).json({ status: "ignored", reason });
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const tenantId = String(req.params.tenant ?? "");
  if (!cryptoPaymentsAvailable()) {
    return ignore(res, logger, "unavailable", `notification for tenant ${tenantId || "-"}`);
  }
  if (!tenantId) {
    return reject(res, logger, 400, "missing_tenant", "");
  }

  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readBitcartSecretPublic(pg, tenantId, logger, { includeDisabled: true });
  if (!secret) {
    return reject(res, logger, 404, "shop_not_configured", tenantId);
  }

  const body = (req.body ?? {}) as BitcartNotificationBody;
  const invoiceId = typeof body.id === "string" ? body.id : "";
  if (!INVOICE_ID.test(invoiceId)) {
    return reject(res, logger, 400, "malformed_payload", tenantId);
  }
  // Recorded on the session as `last_event`, for the log only, and only in the
  // shape Bitcart's own statuses have.
  const announced = typeof body.status === "string" && /^[a-z_]{1,32}$/.test(body.status) ? body.status : null;

  const row = (await pg("payment_session")
    .select(...BITCART_SESSION_COLUMNS)
    .where({ provider_id: BITCART_PROVIDER_ID })
    .whereRaw(`"data"->>'invoice_id' = ?`, [invoiceId])
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")
    .first()) as BitcartSessionRow | undefined;
  if (!row || row.data?.tenant_id !== tenantId) {
    return ignore(res, logger, "unknown_invoice", `invoice ${invoiceId}, tenant ${tenantId}`);
  }
  if (bitcartSessionAlreadyPaid(row)) {
    return res.status(200).json({ status: "ok", outcome: "already_captured" });
  }

  let invoice;
  try {
    invoice = await getBitcartInvoice(bitcartConnectionOf(secret), invoiceId);
  } catch (error) {
    logger.warn(
      `[bitcart/notification] invoice ${invoiceId} of tenant ${tenantId} could not be read: ${(error as Error).message}`,
    );
    return res.status(502).json({ status: "error", reason: "invoice_unreadable" });
  }

  try {
    const outcome = await settleBitcartSession(req.scope, row, invoice, {
      event: announced,
      logger,
      source: "notification",
    });
    res.status(200).json({ status: "ok", outcome });
  } catch (error) {
    logger.error(
      `[bitcart/notification] invoice ${invoiceId} read, but session ${row.id} could not be completed: ${
        (error as Error).message
      }`,
    );
    res.status(500).json({ status: "error", reason: "completion_failed" });
  }
};
