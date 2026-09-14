import { z } from "@medusajs/framework/zod";

/**
 * `GET /tenants/customers` and `POST /tenants/customers/export` query
 * params. `q` is the customer module's own search (searchable on
 * `company_name`, `first_name`, `last_name`, `email`, `phone` — verified in
 * `@medusajs/customer/dist/models/customer.js`), so it reaches the database
 * as one filter rather than an in-memory scan.
 *
 * `order` includes two computed columns (`orders_count`, `total_spent`)
 * alongside the real `created_at` column, which is why this is a hand-written
 * schema rather than the Admin's `createFindParams` + its `allowed` field
 * list: those two are never real columns to validate against, and the route
 * sorts by them itself from the aggregate it already builds.
 */
export const TenantGetCustomersParams = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order: z
    .enum(["created_at", "-created_at", "orders_count", "-orders_count"])
    .default("-created_at"),
});

export type TenantCustomersQuery = z.infer<typeof TenantGetCustomersParams>;

/** The export takes the same filters as the list, but no pagination: it ships every matching row. */
export const TenantExportCustomersParams = TenantGetCustomersParams.pick({ q: true });

export type TenantExportCustomersQuery = z.infer<typeof TenantExportCustomersParams>;
