import { PaymentSessionStatus } from "@medusajs/framework/utils";
import { isBtcpayInvoiceOpen, mapBtcpayInvoiceStatus } from "../status";

/**
 * ask-20261005-070255-438f: the BTCPay → Medusa status table of the research's
 * `payment-flow.md`, row by row, plus the one rule the table implies: only
 * Settled captures, and a status nobody wrote down never does.
 */

describe("mapBtcpayInvoiceStatus", () => {
  it.each([
    ["New", "None", PaymentSessionStatus.PENDING],
    ["New", "PaidPartial", PaymentSessionStatus.PENDING],
    ["Processing", "None", PaymentSessionStatus.PENDING],
    ["Processing", "PaidOver", PaymentSessionStatus.PENDING],
    ["Settled", "None", PaymentSessionStatus.CAPTURED],
    ["Settled", "PaidOver", PaymentSessionStatus.CAPTURED],
    ["Settled", "Marked", PaymentSessionStatus.CAPTURED],
    ["Settled", null, PaymentSessionStatus.CAPTURED],
    ["Expired", "None", PaymentSessionStatus.CANCELED],
    ["Expired", null, PaymentSessionStatus.CANCELED],
    ["Expired", "Marked", PaymentSessionStatus.CANCELED],
    ["Expired", "PaidPartial", PaymentSessionStatus.REQUIRES_MORE],
    ["Expired", "PaidLate", PaymentSessionStatus.REQUIRES_MORE],
    ["Invalid", "None", PaymentSessionStatus.ERROR],
    ["Invalid", "Marked", PaymentSessionStatus.ERROR],
    ["Invalid", "Invalid", PaymentSessionStatus.ERROR],
  ])("%s / %s → %s", (status, additional, expected) => {
    expect(mapBtcpayInvoiceStatus(status, additional)).toBe(expected);
  });

  it("reads an unknown or missing status as pending, never as captured", () => {
    expect(mapBtcpayInvoiceStatus("Complete", "None")).toBe(PaymentSessionStatus.PENDING);
    expect(mapBtcpayInvoiceStatus("settled", "None")).toBe(PaymentSessionStatus.PENDING);
    expect(mapBtcpayInvoiceStatus(undefined)).toBe(PaymentSessionStatus.PENDING);
    expect(mapBtcpayInvoiceStatus(null, null)).toBe(PaymentSessionStatus.PENDING);
  });
});

describe("isBtcpayInvoiceOpen", () => {
  const now = new Date("2026-10-05T12:00:00.000Z");

  it("is open while New or Processing, closed once Settled or Invalid", () => {
    expect(isBtcpayInvoiceOpen("New", null, now)).toBe(true);
    expect(isBtcpayInvoiceOpen("Processing", null, now)).toBe(true);
    expect(isBtcpayInvoiceOpen("Settled", "2026-10-06T00:00:00.000Z", now)).toBe(false);
    expect(isBtcpayInvoiceOpen("Invalid", "2026-10-06T00:00:00.000Z", now)).toBe(false);
  });

  it("keeps an expired invoice open only inside its monitoring window", () => {
    expect(isBtcpayInvoiceOpen("Expired", "2026-10-05T12:30:00.000Z", now)).toBe(true);
    expect(isBtcpayInvoiceOpen("Expired", "2026-10-05T11:59:59.000Z", now)).toBe(false);
    expect(isBtcpayInvoiceOpen("Expired", null, now)).toBe(false);
  });
});
