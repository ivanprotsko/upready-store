import { PaymentSessionStatus } from "@medusajs/framework/utils";
import type { BtcpayInvoice } from "../client";
import { invoiceMismatch, readInvoiceInto, unixToIso } from "../session";
import { invoice, sessionData } from "./fixtures";

/**
 * ask-20261005-070255-438f: one reading of an invoice applied to a session.
 * The point is what can NOT happen: an invoice for another amount, store or
 * currency never reads as captured, and a second Settled reading never moves
 * the first `confirmed_at`.
 */

const NOW = new Date("2026-10-05T12:00:00.000Z");

describe("unixToIso", () => {
  it("turns Greenfield's unix seconds into ISO, and nothing else", () => {
    expect(unixToIso(1_790_000_900)).toBe(new Date(1_790_000_900_000).toISOString());
    expect(unixToIso(undefined)).toBeNull();
    expect(unixToIso("1790000900")).toBeNull();
    expect(unixToIso(0)).toBeNull();
  });
});

describe("invoiceMismatch", () => {
  it("accepts the session's own invoice in any spelling of its amount", () => {
    expect(invoiceMismatch(invoice(), sessionData())).toBeNull();
    expect(invoiceMismatch(invoice({ amount: "25.50000000" }), sessionData(), "25.5")).toBeNull();
  });

  it.each([
    ["invoice_id", { id: "inv_2" }],
    ["store_id", { storeId: "Store2" }],
    ["currency", { currency: "EUR" }],
    ["amount", { amount: "1.00" }],
  ])("names %s when the invoice differs there", (field, override) => {
    expect(invoiceMismatch(invoice(override as Partial<BtcpayInvoice>), sessionData())).toBe(field);
  });

  it("also checks the session's own amount when the caller has it", () => {
    expect(invoiceMismatch(invoice(), sessionData(), "30")).toBe("amount");
  });
});

describe("readInvoiceInto", () => {
  it("records a Processing invoice as pending, with its times", () => {
    const reading = readInvoiceInto(sessionData(), invoice({ status: "Processing" }), { event: "InvoiceProcessing", now: NOW });

    expect(reading.status).toBe(PaymentSessionStatus.PENDING);
    expect(reading.changed).toBe(true);
    expect(reading.data).toMatchObject({
      invoice_status: "Processing",
      last_event: "InvoiceProcessing",
      confirmed_at: null,
      expires_at: new Date(1_790_000_900_000).toISOString(),
      monitoring_expires_at: new Date(1_790_087_300_000).toISOString(),
    });
  });

  it("stamps confirmed_at once on Settled and keeps the first stamp afterwards", () => {
    const first = readInvoiceInto(sessionData(), invoice({ status: "Settled" }), { now: NOW });
    expect(first.status).toBe(PaymentSessionStatus.CAPTURED);
    expect(first.data.confirmed_at).toBe(NOW.toISOString());

    const later = readInvoiceInto(first.data, invoice({ status: "Settled", additionalStatus: "PaidOver" }), {
      now: new Date("2026-10-06T00:00:00.000Z"),
    });
    expect(later.data.confirmed_at).toBe(NOW.toISOString());
    expect(later.data.additional_status).toBe("PaidOver");
  });

  it("reports no change when the server says what the session already holds", () => {
    const first = readInvoiceInto(sessionData(), invoice(), { now: NOW });
    const second = readInvoiceInto(first.data, invoice(), { now: NOW });
    expect(second.changed).toBe(false);
  });

  it("never captures a Settled invoice for another amount, and keeps the stored status", () => {
    const reading = readInvoiceInto(sessionData(), invoice({ status: "Settled", amount: "0.01" }), { now: NOW });

    expect(reading.status).toBe(PaymentSessionStatus.ERROR);
    expect(reading.mismatch).toBe("amount");
    expect(reading.data.confirmed_at).toBeNull();
    expect(reading.data.invoice_status).toBe("New");
    expect(reading.data.last_error).toBe("invoice_mismatch:amount");
  });
});
