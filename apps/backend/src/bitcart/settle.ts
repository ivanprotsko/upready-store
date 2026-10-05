import type { IPaymentModuleService, Logger, MedusaContainer } from "@medusajs/framework/types";
import { Modules, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils";
import { processPaymentWorkflow } from "@medusajs/medusa/core-flows";
import type { BitcartInvoice } from "./client";
import { readBitcartInvoiceInto, type BitcartSessionData } from "./session";

/** The columns of `payment_session` the notification route and the sweep read. `amount` is Postgres numeric, so a string. */
export type BitcartSessionRow = {
  id: string;
  data: BitcartSessionData;
  amount: unknown;
  currency_code: string;
  status: string;
};

export const BITCART_SESSION_COLUMNS = ["id", "data", "amount", "currency_code", "status"] as const;

export type BitcartSettleOutcome =
  /** The invoice is complete and this call ran `processPaymentWorkflow`. */
  | "captured"
  /** Complete, and the session was already authorized by an earlier call: nothing ran again. */
  | "already_captured"
  /** Not complete; the session's data (and status) now say what Bitcart says. */
  | "updated"
  /** Not complete, and nothing changed since the last reading. */
  | "unchanged"
  /** The invoice does not belong to this session; nothing captured. */
  | "mismatch";

const PAID_SESSION_STATUSES = new Set<string>([PaymentSessionStatus.AUTHORIZED, PaymentSessionStatus.CAPTURED]);

/** Whether this row is in the state a finished capture leaves behind, so nothing needs reading again. */
export const bitcartSessionAlreadyPaid = (row: Pick<BitcartSessionRow, "status" | "data">): boolean =>
  PAID_SESSION_STATUSES.has(row.status) && Boolean(row.data?.confirmed_at);

/**
 * One reading of a session's invoice, applied (ask-20261005-070255-438f,
 * stage 2), the same contract as `settleBtcpaySession`. The notification route
 * and the sweep job both call this with an invoice they have just read from
 * the shop's own Bitcart themselves, never with a request body.
 *
 * IDEMPOTENT. A complete invoice runs `processPaymentWorkflow` unless the
 * session is already authorized with `confirmed_at` stamped, which is the
 * state that workflow leaves behind. So a repeated notification, the sweep
 * finding the same invoice a minute later, or the buyer's own cart completion
 * (`authorizePayment` re-reads too) never make a second payment or order. A
 * run that failed half-way leaves the session unauthorized, and the next
 * notification or sweep runs the workflow again, which is itself safe to
 * repeat: the payment module's authorization and capture are idempotent and
 * the cart is completed only while it has no order.
 *
 * A session that is not complete gets the server's status written onto it,
 * only when something changed, so a buyer back from an expired invoice sees a
 * canceled session and the checkout can open a new one.
 *
 * A failing workflow throws: the notification route answers 500, and the sweep
 * tries again on its next run. Bitcart itself never retries a notification.
 */
export const settleBitcartSession = async (
  container: MedusaContainer,
  row: BitcartSessionRow,
  invoice: BitcartInvoice,
  options: { event?: string | null; logger: Logger; source: "notification" | "sweep" },
): Promise<BitcartSettleOutcome> => {
  const { logger, source } = options;
  const reading = readBitcartInvoiceInto(row.data, invoice, { event: options.event, expectedAmount: row.amount });
  const paymentModule = container.resolve<IPaymentModuleService>(Modules.PAYMENT);
  const alreadyPaid = PAID_SESSION_STATUSES.has(row.status);

  const write = (status?: PaymentSessionStatus) =>
    paymentModule.updatePaymentSession({
      id: row.id,
      amount: row.amount as number,
      currency_code: row.currency_code,
      data: reading.data as unknown as Record<string, unknown>,
      ...(status ? { status } : {}),
    });

  if (reading.mismatch) {
    logger.error(
      `[bitcart/${source}] invoice ${invoice.id} does not match session ${row.id} (${reading.mismatch}); not capturing`,
    );
    if (reading.changed) {
      await write();
    }
    return "mismatch";
  }

  if (reading.status === PaymentSessionStatus.CAPTURED) {
    if (bitcartSessionAlreadyPaid(row)) {
      if (reading.changed) {
        await write();
      }
      logger.info(`[bitcart/${source}] invoice ${invoice.id} already settled into session ${row.id}, nothing to do`);
      return "already_captured";
    }

    if (reading.changed) {
      await write();
    }
    logger.info(`[bitcart/${source}] invoice ${invoice.id} complete, completing session ${row.id}`);
    await processPaymentWorkflow(container).run({
      input: {
        action: PaymentActions.SUCCESSFUL,
        data: { session_id: row.id, amount: Number(row.amount) },
      },
    });
    return "captured";
  }

  if (!reading.changed) {
    return "unchanged";
  }
  // A session already paid keeps its status: Bitcart reporting it otherwise
  // later (the owner's refund turns it `refunded`) is recorded, never
  // un-captured here.
  await write(alreadyPaid ? undefined : reading.status);
  if (alreadyPaid) {
    logger.warn(
      `[bitcart/${source}] invoice ${invoice.id} reads ${reading.data.invoice_status} after session ${row.id} was paid; recorded, not reversed`,
    );
  } else {
    logger.info(
      `[bitcart/${source}] invoice ${invoice.id}: ${reading.data.invoice_status}/${reading.data.exception_status ?? "none"}, session ${row.id} is ${reading.status}`,
    );
  }
  return "updated";
};
