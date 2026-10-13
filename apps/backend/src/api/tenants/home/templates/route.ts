import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getTenantScope } from "../../tenant-scope";
import { readTenantHomeDocument } from "../document";
import { templateCatalogue } from "./catalogue";

/**
 * `GET /tenants/home/templates` — the store template catalogue for the panel's «Шаблоны»
 * section (t-2026-10-12-33 P2): the templates with the shape of their home pages, the palettes
 * with their colours, the layer vocabularies, and the template the shop has saved.
 *
 * Scope, auth and permission are those of `POST /tenants/home/template`: the tenant behind the
 * token and the `storefront` permission (`tenants/permissions.ts`). The catalogue is the same
 * for every shop; `current` is read from this shop's own document, so another shop's template
 * never reaches the answer.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const existing = await readTenantHomeDocument(req.scope, tenant.id);

  res.json(templateCatalogue(existing?.document ?? null));
};
