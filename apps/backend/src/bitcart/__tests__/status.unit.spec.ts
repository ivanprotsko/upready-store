import { PaymentSessionStatus } from "@medusajs/framework/utils";
import { mapBitcartInvoiceStatus } from "../status";

/**
 * ask-20261005-070255-438f, stage 2: Bitcart's statuses (`api/invoices.py`)
 * read as Medusa's. `complete` is the only one that captures, and anything
 * unknown waits.
 */

describe("mapBitcartInvoiceStatus", () => {
  it.each(["pending", "paid", "unconfirmed", "confirmed"])("%s waits as pending", (status) => {
    expect(mapBitcartInvoiceStatus(status, "none")).toBe(PaymentSessionStatus.PENDING);
  });

  it("captures complete, an overpaid one included", () => {
    expect(mapBitcartInvoiceStatus("complete", "none")).toBe(PaymentSessionStatus.CAPTURED);
    expect(mapBitcartInvoiceStatus("complete", "paid_over")).toBe(PaymentSessionStatus.CAPTURED);
  });

  it("an expired invoice that took part of the money needs the owner; one that took nothing is canceled", () => {
    expect(mapBitcartInvoiceStatus("expired", "paid_partial")).toBe(PaymentSessionStatus.REQUIRES_MORE);
    expect(mapBitcartInvoiceStatus("expired", "none")).toBe(PaymentSessionStatus.CANCELED);
    expect(mapBitcartInvoiceStatus("expired", null)).toBe(PaymentSessionStatus.CANCELED);
  });

  it("refunded is canceled, invalid is an error", () => {
    expect(mapBitcartInvoiceStatus("refunded", "none")).toBe(PaymentSessionStatus.CANCELED);
    expect(mapBitcartInvoiceStatus("invalid", "failed_confirm")).toBe(PaymentSessionStatus.ERROR);
  });

  it("never turns an unknown or missing status into a paid order", () => {
    expect(mapBitcartInvoiceStatus("settled_by_some_plugin")).toBe(PaymentSessionStatus.PENDING);
    expect(mapBitcartInvoiceStatus(undefined)).toBe(PaymentSessionStatus.PENDING);
    expect(mapBitcartInvoiceStatus("Complete")).toBe(PaymentSessionStatus.PENDING);
  });
});
