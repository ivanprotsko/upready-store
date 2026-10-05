import type { BtcpayInvoice } from "../client";
import type { BtcpaySessionData } from "../session";

/** A BTCPay session as `initiatePayment` leaves it, for the specs of this directory and its callers. */
export const sessionData = (overrides: Partial<BtcpaySessionData> = {}): BtcpaySessionData => ({
  provider: "btcpay",
  tenant_id: "ten_1",
  session_id: "payses_1",
  invoice_id: "inv_1",
  store_id: "Store1",
  checkout_link: "https://pay.example.com/i/inv_1",
  amount: "25.50",
  currency_code: "usd",
  return_url: null,
  invoice_status: "New",
  additional_status: "None",
  expires_at: null,
  monitoring_expires_at: null,
  confirmed_at: null,
  last_event: null,
  last_error: null,
  refunds: [],
  ...overrides,
});

/** The Greenfield invoice that session was created for. */
export const invoice = (overrides: Partial<BtcpayInvoice> = {}): BtcpayInvoice => ({
  id: "inv_1",
  storeId: "Store1",
  amount: "25.5",
  currency: "USD",
  checkoutLink: "https://pay.example.com/i/inv_1",
  status: "New",
  additionalStatus: "None",
  expirationTime: 1_790_000_900,
  monitoringExpiration: 1_790_087_300,
  ...overrides,
});
