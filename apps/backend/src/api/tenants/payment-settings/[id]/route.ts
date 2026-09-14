import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { assertOwnedPaymentSettings } from "../helpers";

/**
 * `GET /tenants/payment-settings/:id` — one masked record by id, 404 unless it
 * belongs to the caller's shop. This is the route the isolation check of
 * t03-tenant-secrets-robokassa quotes: tenant B naming tenant A's id gets a 404.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ settings: await assertOwnedPaymentSettings(req, req.params.id) });
};
