import type { BitcartInvoice } from "../client";
import type { BitcartSessionData } from "../session";

/** A Bitcart session as `initiatePayment` leaves it, for the specs of this directory and its callers. */
export const bitcartSessionData = (overrides: Partial<BitcartSessionData> = {}): BitcartSessionData => ({
  provider: "bitcart",
  tenant_id: "ten_1",
  session_id: "payses_1",
  invoice_id: "01JINV1",
  store_id: "01JSTORE1",
  checkout_link: "https://pay.example.com/admin/i/01JINV1",
  amount: "25.50",
  currency_code: "usd",
  return_url: null,
  invoice_status: "pending",
  exception_status: "none",
  expires_at: null,
  watch_until: null,
  confirmed_at: null,
  last_event: null,
  last_error: null,
  refunds: [],
  ...overrides,
});

/** The Bitcart invoice that session was created for. */
export const bitcartInvoice = (overrides: Partial<BitcartInvoice> = {}): BitcartInvoice => ({
  id: "01JINV1",
  store_id: "01JSTORE1",
  price: "25.50",
  currency: "USD",
  status: "pending",
  exception_status: "none",
  created: "2026-10-05T11:50:00.000Z",
  expiration: 15,
  time_left: 300,
  ...overrides,
});
