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
 *
 * A RECORD and not an object with a catchall: `zodValidator` calls `.strict()`
 * on any schema that has the method (`@medusajs/framework` 2.19.0,
 * `dist/zod/zod-helpers.js`), and on a ZodObject that overrides the catchall,
 * so every field of every marketplace came back «Unrecognized fields»
 * (measured: 8 of 10 seam tests). A record has no `.strict`, so the shape
 * survives; WHICH names are allowed is the route's check against
 * `credentialFields`, which is where that knowledge lives anyway.
 */
export const PutTenantMarketplaceKeyBody = z.record(
  z.string(),
  z.string().trim().min(1, "Пустое значение не сохраняется: уберите поле или введите ключ."),
);

export type PutTenantMarketplaceKeyBodyType = z.infer<typeof PutTenantMarketplaceKeyBody>;
