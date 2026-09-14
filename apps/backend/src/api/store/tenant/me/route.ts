import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";

/** `GET /store/tenant/me` → `{ tenant: { id, handle, name } }` for the storefront's own key. */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  res.json({ tenant: { id: tenant.id, handle: tenant.handle, name: tenant.name } });
};
