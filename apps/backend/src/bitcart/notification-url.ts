/**
 * Where Bitcart sends its notification for a shop's invoice:
 * `<BACKEND_PUBLIC_URL>/bitcart/webhook/<tenant id>` (ask-20261005-070255-438f,
 * stage 2).
 *
 * Unlike BTCPay's webhook, which the owner configures once on the store,
 * Bitcart takes the address per invoice (`notification_url`), so the provider
 * has to know the backend's public origin when it creates one, outside any
 * request. Only the deployment's own `BACKEND_PUBLIC_URL` says that: the store
 * request that opens the session arrives from the storefront's server over the
 * internal network, under a host no Bitcart can reach. Without the variable
 * no address is sent and the sweep job alone settles the shop's invoices,
 * within a minute.
 */
export const bitcartNotificationUrl = (tenantId: string, env: NodeJS.ProcessEnv = process.env): string | null => {
  const origin = (env.BACKEND_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  if (!origin || !tenantId) {
    return null;
  }
  return `${origin}/bitcart/webhook/${encodeURIComponent(tenantId)}`;
};
