import type { Knex } from "@medusajs/framework/mikro-orm/knex";

/**
 * Whether a shop takes payments or ships in a provider's TEST contour right now (t-2026-10-04-21,
 * checkout-v2 acceptance A3): the storefront paints a red dot in the top-right corner while either
 * is on, so nobody mistakes a test order for a real one. Read from the providers' own `is_test`
 * flags, the same switch the panel flips («Robokassa: выход в тестовый режим», e6fdce75) — no
 * setting of its own. Only enabled, not-deleted accounts count: a switched-off account in test
 * mode takes no payment and ships nothing.
 *
 * x402 (t-2026-10-03-33) counts too: its row is `is_test` while the shop takes payments on a test
 * network, whose USDC is worthless, so an order paid there is a test order.
 */
export type TenantTestMode = {
  payments: boolean;
  delivery: boolean;
};

const PAYMENT_PROVIDERS = ["robokassa", "x402"] as const;
const DELIVERY_PROVIDERS = ["cdek", "apiship", "pochta"] as const;

export const testModeOf = (testProviders: readonly string[]): TenantTestMode => ({
  payments: testProviders.some((provider) => (PAYMENT_PROVIDERS as readonly string[]).includes(provider)),
  delivery: testProviders.some((provider) => (DELIVERY_PROVIDERS as readonly string[]).includes(provider)),
});

/** No payload is read or decrypted: only which provider rows carry `is_test`. */
export const readTenantTestMode = async (pg: Knex, tenantId: string): Promise<TenantTestMode> => {
  const rows = (await pg("tenant_integration_secret")
    .select("provider")
    .where({ tenant_id: tenantId, is_test: true, is_enabled: true })
    .whereIn("provider", [...PAYMENT_PROVIDERS, ...DELIVERY_PROVIDERS])
    .whereNull("deleted_at")) as { provider: string }[];

  return testModeOf(rows.map((row) => row.provider));
};
