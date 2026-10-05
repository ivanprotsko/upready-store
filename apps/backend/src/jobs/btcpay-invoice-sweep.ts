import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { btcpayConnectionOf, getBtcpayInvoice, type BtcpayClientOptions } from "../btcpay/client";
import { BTCPAY_PROVIDER_ID } from "../btcpay/session";
import { BTCPAY_SESSION_COLUMNS, settleBtcpaySession, type BtcpaySessionRow } from "../btcpay/settle";
import { readBtcpaySecretPublic, type ResolvedBtcpaySecret } from "../tenant-secrets/btcpay";

/**
 * The safety net under BTCPay's webhook (ask-20261005-070255-438f). Every
 * minute it reads, from each shop's own BTCPay Server, the invoices of the
 * BTCPay sessions that are not paid yet, and applies what it reads exactly as
 * the webhook does (`settleBtcpaySession`). A webhook lost in transit, a
 * webhook URL the owner mistyped, or a completion that failed half-way all end
 * here within a minute instead of never.
 *
 * KEPT CHEAP. Only `pp_btcpay_btcpay` sessions that are not authorized,
 * younger than `MAX_AGE_DAYS`, and either still watched by BTCPay
 * (`monitoring_expires_at` in the future, or not known yet) or confirmed but
 * not completed. At most `BATCH` of them per run, newest first, read one at a
 * time with each request's own timeout, and a run stops starting new reads
 * after `TIME_BUDGET_MS`, so a slow server cannot pile runs on top of each
 * other. While no shop uses BTCPay the job is one query on `payment_session`
 * that returns nothing; that table has no index on `provider_id`
 * (`@medusajs/payment` 2.19 migrations index `payment_collection_id` only), so
 * the query scans it. Add an index there if the table ever makes this slow.
 *
 * Silent when nothing changed; a change is logged by `settleBtcpaySession`.
 */
export const BATCH = 50;
export const MAX_AGE_DAYS = 7;
export const TIME_BUDGET_MS = 45_000;

let running = false;

export const findOpenBtcpaySessions = async (pg: Knex, limit = BATCH): Promise<BtcpaySessionRow[]> =>
  (await pg("payment_session")
    .select(...BTCPAY_SESSION_COLUMNS)
    .where({ provider_id: BTCPAY_PROVIDER_ID })
    .whereNull("deleted_at")
    .whereNotIn("status", ["authorized", "captured"])
    .whereRaw(`"created_at" > now() - (? || ' days')::interval`, [String(MAX_AGE_DAYS)])
    .whereRaw(`"data"->>'invoice_id' is not null`)
    .where((open) =>
      open
        .whereRaw(`"data"->>'confirmed_at' is not null`)
        .orWhereRaw(`coalesce("data"->>'monitoring_expires_at', '') = ''`)
        .orWhereRaw(`("data"->>'monitoring_expires_at')::timestamptz > now()`),
    )
    .orderBy("created_at", "desc")
    .limit(limit)) as BtcpaySessionRow[];

export const sweepBtcpayInvoices = async (
  container: MedusaContainer,
  options: { clientOptions?: BtcpayClientOptions; now?: () => number } = {},
): Promise<{ checked: number; changed: number; failed: number }> => {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const now = options.now ?? Date.now;
  const startedAt = now();

  const rows = await findOpenBtcpaySessions(pg);
  if (rows.length === BATCH) {
    logger.warn(`[btcpay/sweep] ${BATCH} open BTCPay sessions or more; this run reads the newest ${BATCH}`);
  }

  const secrets = new Map<string, ResolvedBtcpaySecret | null>();
  const summary = { checked: 0, changed: 0, failed: 0 };

  for (const row of rows) {
    if (now() - startedAt > TIME_BUDGET_MS) {
      logger.warn(`[btcpay/sweep] time budget spent after ${summary.checked} of ${rows.length} sessions`);
      break;
    }
    const tenantId = row.data?.tenant_id;
    if (!tenantId) {
      continue;
    }
    if (!secrets.has(tenantId)) {
      secrets.set(tenantId, await readBtcpaySecretPublic(pg, tenantId, logger, { includeDisabled: true }));
    }
    const secret = secrets.get(tenantId);
    if (!secret) {
      continue;
    }

    summary.checked += 1;
    try {
      const invoice = await getBtcpayInvoice(btcpayConnectionOf(secret), row.data.invoice_id, options.clientOptions);
      const outcome = await settleBtcpaySession(container, row, invoice, { logger, source: "sweep" });
      if (outcome !== "unchanged" && outcome !== "already_captured") {
        summary.changed += 1;
      }
    } catch (error) {
      summary.failed += 1;
      logger.warn(
        `[btcpay/sweep] session ${row.id}, invoice ${row.data.invoice_id}, tenant ${tenantId}: ${(error as Error).message}`,
      );
    }
  }

  return summary;
};

export default async function btcpayInvoiceSweepJob(container: MedusaContainer) {
  // One run at a time in this process: a run that outlives its minute is not
  // joined by the next one reading the same sessions.
  if (running) {
    return;
  }
  running = true;
  try {
    await sweepBtcpayInvoices(container);
  } finally {
    running = false;
  }
}

export const config = {
  name: "btcpay-invoice-sweep",
  schedule: "* * * * *",
};
