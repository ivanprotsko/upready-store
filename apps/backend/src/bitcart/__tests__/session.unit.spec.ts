import { PaymentSessionStatus } from "@medusajs/framework/utils";
import type { BitcartInvoice } from "../client";
import { toBitcartPrice } from "../amount";
import { bitcartNotificationUrl } from "../notification-url";
import { bitcartExpiresAt, bitcartInvoiceMismatch, bitcartWatchUntil, readBitcartInvoiceInto } from "../session";
import { bitcartInvoice, bitcartSessionData } from "./fixtures";

/**
 * ask-20261005-070255-438f, stage 2: one reading of a Bitcart invoice applied
 * to a session. The point is what can NOT happen: an invoice for another
 * amount, store or currency never reads as captured (Bitcart serves any
 * invoice to anyone, so the store check matters), and a second complete
 * reading never moves the first `confirmed_at`.
 */

const NOW = new Date("2026-10-05T12:00:00.000Z");

describe("times", () => {
  it("expires_at is created plus expiration minutes, and the watch lasts a day longer", () => {
    expect(bitcartExpiresAt({ created: "2026-10-05T11:50:00.000Z", expiration: 15 })).toBe("2026-10-05T12:05:00.000Z");
    expect(bitcartWatchUntil("2026-10-05T12:05:00.000Z")).toBe("2026-10-06T12:05:00.000Z");
  });

  it("are null when the server sent nothing usable", () => {
    expect(bitcartExpiresAt({ created: null, expiration: 15 })).toBeNull();
    expect(bitcartExpiresAt({ created: "not a date", expiration: 15 })).toBeNull();
    expect(bitcartExpiresAt({ created: "2026-10-05T11:50:00.000Z", expiration: 0 })).toBeNull();
    expect(bitcartWatchUntil(null)).toBeNull();
  });
});

describe("toBitcartPrice and bitcartNotificationUrl", () => {
  it("price is a decimal string with the currency's digits", () => {
    expect(toBitcartPrice(25.5, "usd")).toBe("25.50");
    expect(toBitcartPrice(0.1 + 0.2, "eur")).toBe("0.30");
    expect(toBitcartPrice(1000, "jpy")).toBe("1000");
  });

  it("the notification address needs BACKEND_PUBLIC_URL and nothing else", () => {
    expect(bitcartNotificationUrl("ten_1", { BACKEND_PUBLIC_URL: "https://shipshift.dev/" })).toBe(
      "https://shipshift.dev/bitcart/webhook/ten_1",
    );
    expect(bitcartNotificationUrl("ten_1", {})).toBeNull();
    expect(bitcartNotificationUrl("", { BACKEND_PUBLIC_URL: "https://shipshift.dev" })).toBeNull();
  });
});

describe("bitcartInvoiceMismatch", () => {
  it("accepts the session's own invoice in any spelling of its price", () => {
    expect(bitcartInvoiceMismatch(bitcartInvoice(), bitcartSessionData())).toBeNull();
    expect(bitcartInvoiceMismatch(bitcartInvoice({ price: "25.5" }), bitcartSessionData(), "25.50")).toBeNull();
  });

  it.each([
    ["invoice_id", { id: "01JINV2" }],
    ["store_id", { store_id: "01JSTORE2" }],
    ["store_id", { store_id: null }],
    ["currency", { currency: "EUR" }],
    ["amount", { price: "1.00" }],
  ])("names %s when the invoice differs there", (field, override) => {
    expect(bitcartInvoiceMismatch(bitcartInvoice(override as Partial<BitcartInvoice>), bitcartSessionData())).toBe(field);
  });

  it("also checks the session's own amount when the caller has it", () => {
    expect(bitcartInvoiceMismatch(bitcartInvoice(), bitcartSessionData(), "30")).toBe("amount");
  });
});

describe("readBitcartInvoiceInto", () => {
  it("records a paid invoice as pending, with its times and the announced status", () => {
    const reading = readBitcartInvoiceInto(bitcartSessionData(), bitcartInvoice({ status: "paid" }), {
      event: "paid",
      now: NOW,
    });

    expect(reading.status).toBe(PaymentSessionStatus.PENDING);
    expect(reading.changed).toBe(true);
    expect(reading.data).toMatchObject({
      invoice_status: "paid",
      exception_status: "none",
      last_event: "paid",
      confirmed_at: null,
      expires_at: "2026-10-05T12:05:00.000Z",
      watch_until: "2026-10-06T12:05:00.000Z",
    });
  });

  it("stamps confirmed_at once on complete and keeps the first stamp afterwards", () => {
    const first = readBitcartInvoiceInto(bitcartSessionData(), bitcartInvoice({ status: "complete" }), { now: NOW });
    expect(first.status).toBe(PaymentSessionStatus.CAPTURED);
    expect(first.data.confirmed_at).toBe(NOW.toISOString());

    const later = readBitcartInvoiceInto(first.data, bitcartInvoice({ status: "complete", exception_status: "paid_over" }), {
      now: new Date("2026-10-06T00:00:00.000Z"),
    });
    expect(later.data.confirmed_at).toBe(NOW.toISOString());
    expect(later.data.exception_status).toBe("paid_over");
  });

  it("reports no change when the server says what the session already holds", () => {
    const first = readBitcartInvoiceInto(bitcartSessionData(), bitcartInvoice(), { now: NOW });
    const second = readBitcartInvoiceInto(first.data, bitcartInvoice(), { now: NOW });
    expect(second.changed).toBe(false);
  });

  it("never captures a complete invoice of another store, and keeps the stored status", () => {
    const reading = readBitcartInvoiceInto(
      bitcartSessionData(),
      bitcartInvoice({ status: "complete", store_id: "01JSOMEONEELSE" }),
      { now: NOW },
    );

    expect(reading.status).toBe(PaymentSessionStatus.ERROR);
    expect(reading.mismatch).toBe("store_id");
    expect(reading.data.confirmed_at).toBeNull();
    expect(reading.data.invoice_status).toBe("pending");
    expect(reading.data.last_error).toBe("invoice_mismatch:store_id");
  });
});
