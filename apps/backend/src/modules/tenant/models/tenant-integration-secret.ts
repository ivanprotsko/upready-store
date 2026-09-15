import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * The providers a shop can hold credentials for. One row per (tenant, provider);
 * the shape of `payload` is decided per provider in `src/tenant-secrets/`.
 *
 * `wildberries` is the shop's WB Seller API key (w01-wb-readonly-client). It
 * sits here for the same reason Robokassa does: one backend serves every shop
 * and a WB cabinet belongs to a shop, not to the process. The key is only ever
 * READ from here, by `src/modules/wb/transport.ts`, which cannot write to WB.
 *
 * `ozon` is the shop's Ozon Seller API pair, `{ client_id, api_key }`
 * (w11-ozon-readonly-client). Two values rather than one because Ozon
 * authenticates with a `Client-Id` header beside the `Api-Key`, and they are
 * useless apart. Read only by `src/modules/ozon/transport.ts`, which cannot
 * write to Ozon.
 */
export const TENANT_INTEGRATION_PROVIDERS = ["robokassa", "wildberries", "ozon"] as const;
export type TenantIntegrationProvider = (typeof TENANT_INTEGRATION_PROVIDERS)[number];

/**
 * Credentials of a third-party account that belong to ONE shop, not to the
 * platform (t03-tenant-secrets-robokassa, closes `q-cherkashina-tenant-secrets`).
 *
 * Why a row and not an env var: one backend serves every tenant, and a payment
 * account (Robokassa MerchantLogin + passwords) is a property of the shop, so
 * the provider has to look the credentials up per request, for the tenant the
 * cart belongs to. `@gorgo/medusa-integration` keys its rows by a config-time
 * `provider_id` (`int_<identifier>[_<instance>]`, unique index, every instance
 * declared in `medusa-config`), so it cannot carry a per-tenant dimension
 * without a hardcoded instance list, which `AGENTS.md` forbids.
 *
 * `payload` is the JSON of the credentials encrypted with AES-256-GCM under the
 * platform's `INTEGRATION_ENCRYPTION_KEY` (`src/tenant-secrets/crypto.ts`),
 * never plaintext, and never returned by any route: the panel reads a masked
 * view (`src/api/tenants/payment-settings`). `is_test` selects the test
 * passwords and marks the payment as a test one on the provider side.
 */
const TenantIntegrationSecret = model
  .define("tenant_integration_secret", {
    id: model.id({ prefix: "tis" }).primaryKey(),
    provider: model.enum([...TENANT_INTEGRATION_PROVIDERS]),
    /** `iv ‖ authTag ‖ ciphertext`, base64 — see `src/tenant-secrets/crypto.ts`. */
    payload: model.text(),
    is_test: model.boolean().default(true),
    is_enabled: model.boolean().default(true),
    tenant: model.belongsTo(() => Tenant, {
      mappedBy: "integration_secrets",
    }),
  })
  .indexes([
    {
      on: ["tenant_id", "provider"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default TenantIntegrationSecret;
