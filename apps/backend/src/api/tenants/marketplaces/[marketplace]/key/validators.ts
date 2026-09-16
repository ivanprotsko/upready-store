import { z } from "@medusajs/framework/zod";

/**
 * `PUT /tenants/marketplaces/:marketplace/key`, `PUT /tenants/wb/key`,
 * `PUT /tenants/ozon/key` (w24-integration-keys-self-service).
 *
 * The body is one string per field the adapter declares — `{ api_key }` on
 * Wildberries, `{ client_id, api_key }` on Ozon — so the SHAPE is checked here
 * and WHICH fields are required is checked against `credentialFields` in the
 * route. Spelling the field names into a schema per marketplace would be the
 * second enumeration the registry exists to remove (rule 20): a third
 * marketplace would pass the schema of nobody.
 *
 * `min(1)` after `trim()` because an empty string is not «keep the stored
 * value», it is a value of the same quantity that would overwrite a working
 * key with nothing (rule 20a). Keeping a stored secret is done by LEAVING THE
 * FIELD OUT, which the route reads as «not typed».
 */
export const PutTenantMarketplaceKeyBody = z
  .object({})
  .catchall(z.string().trim().min(1, "Пустое значение не сохраняется: уберите поле или введите ключ."));

export type PutTenantMarketplaceKeyBodyType = z.infer<typeof PutTenantMarketplaceKeyBody>;
