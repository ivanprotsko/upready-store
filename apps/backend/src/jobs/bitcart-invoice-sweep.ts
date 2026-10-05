import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { bitcartConnectionOf, getBitcartInvoice, type BitcartClientOptions } from "../bitcart/client";
import { BITCART_PROVIDER_ID } from "../bitcart/session";
import { BITCART_SESSION_COLUMNS, settleBitcartSession, type BitcartSessionRow } from "../bitcart/settle";
import { BITCART_SETTLED_FOR_GOOD } from "../bitcart/status";
import { cryptoPaymentsAvailable } from "../btcpay/availability";
import { readBitcartSecretPublic, type ResolvedBitcartSecret } from "../tenant-secrets/bitcart";

/**
 * Bitcart's real settlement path (ask-20261005-070255-438f, stage 2). Bitcart
 * sends one unsigned notification per status change and never retries it
 * (`api/services/ipn_sender.py`), so this job, not the notification, is what
 * makes sure a paid invoice becomes an order. Every minute it reads, from each
 * shop's own Bitcart, the invoices of the Bitcart sessions that are not paid
 * yet, and applies what it reads exactly as the notification route does
 * (`settleBitcartSession`). A lost notification, a deployment without
 * `BACKEND_PUBLIC_URL` (invoices then carry no notification address at all),
 * or a completion that failed half-way all end here within a minute.
 *
 * KEPT CHEAP, the way `btcpay-invoice-sweep.ts` is. Only `pp_bitcart_bitcart`
 * sessions that are not authorized, younger than `MAX_AGE_DAYS`, not
 * `invalid` or `refunded` for good, and either inside their watch window
 * (`watch_until` in the future, or not known yet) or confirmed but not
 * completed. At most `BATCH` of them per run, newest first, read one at a time
 * with each request's own timeout, and a run stops starting new reads after
 * `TIME_BUDGET_MS`. While no shop uses Bitcart the job is one query on
 * `payment_session` that returns nothing (no index on `provider_id`, the same
 * note as BTCPay's sweep).
 *
 * Silent when nothing changed; a change is logged by `settleBitcartSession`.
 * On an instance that takes no cryptocurrency (`btcpay/availability.ts`) a run
 * returns before its first query.
 */
export const BATCH = 50;
export const MAX_AGE_DAYS = 7;
export const TIME_BUDGET_MS = 45_000;

let running = false;

export const findOpenBitcartSessions = async (pg: Knex, limit = BATCH): Promise<BitcartSessionRow[]> =>
  (await pg("payment_session")
    .select(...BITCART_SESSION_COLUMNS)
    .where({ provider_id: BITCART_PROVIDER_ID })
    .whereNull("deleted_at")
    .whereNotIn("status", ["authorized", "captured"])
    .whereRaw(`"created_at" > now() - (? || ' days')::interval`, [String(MAX_AGE_DAYS)])
    .whereRaw(`"data"->>'invoice_id' is not null`)
    .where((open) =>
      open.whereRaw(`"data"->>'confirmed_at' is not null`).orWhere((watched) =>
        watched
          .whereRaw(`coalesce("data"->>'invoice_status', '') not in (${BITCART_SETTLED_FOR_GOOD.map(() => "?").join(", ")})`, [
            ...BITCART_SETTLED_FOR_GOOD,
          ])
          .where((window) =>
            window
              .whereRaw(`coalesce("data"->>'watch_until', '') = ''`)
              .orWhereRaw(`("data"->>'watch_until')::timestamptz > now()`),
          ),
      ),
    )
    .orderBy("created_at", "desc")
    .limit(limit)) as BitcartSessionRow[];

export const sweepBitcartInvoices = async (
  container: MedusaContainer,
  options: { clientOptions?: BitcartClientOptions; now?: () => number } = {},
): Promise<{ checked: number; changed: number; failed: number }> => {
  if (!cryptoPaymentsAvailable()) {
    return { checked: 0, changed: 0, failed: 0 };
  }
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const now = options.now ?? Date.now;
  const startedAt = now();

  const rows = await findOpenBitcartSessions(pg);
  if (rows.length === BATCH) {
    logger.warn(`[bitcart/sweep] ${BATCH} open Bitcart sessions or more; this run reads the newest ${BATCH}`);
  }

  const secrets = new Map<string, ResolvedBitcartSecret | null>();
  const summary = { checked: 0, changed: 0, failed: 0 };

  for (const row of rows) {
    if (now() - startedAt > TIME_BUDGET_MS) {
      logger.warn(`[bitcart/sweep] time budget spent after ${summary.checked} of ${rows.length} sessions`);
      break;
    }
    const tenantId = row.data?.tenant_id;
    if (!tenantId) {
      continue;
    }
    if (!secrets.has(tenantId)) {
      secrets.set(tenantId, await readBitcartSecretPublic(pg, tenantId, logger, { includeDisabled: true }));
    }
    const secret = secrets.get(tenantId);
    if (!secret) {
      continue;
    }

    summary.checked += 1;
    try {
      const invoice = await getBitcartInvoice(bitcartConnectionOf(secret), row.data.invoice_id, options.clientOptions);
      const outcome = await settleBitcartSession(container, row, invoice, { logger, source: "sweep" });
      if (outcome !== "unchanged" && outcome !== "already_captured") {
        summary.changed += 1;
      }
    } catch (error) {
      summary.failed += 1;
      logger.warn(
        `[bitcart/sweep] session ${row.id}, invoice ${row.data.invoice_id}, tenant ${tenantId}: ${(error as Error).message}`,
      );
    }
  }

  return summary;
};

export default async function bitcartInvoiceSweepJob(container: MedusaContainer) {
  // One run at a time in this process: a run that outlives its minute is not
  // joined by the next one reading the same sessions.
  if (running) {
    return;
  }
  running = true;
  try {
    await sweepBitcartInvoices(container);
  } finally {
    running = false;
  }
}

export const config = {
  name: "bitcart-invoice-sweep",
  schedule: "* * * * *",
};
