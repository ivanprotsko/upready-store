import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";
import { readRequisites } from "../../../../tenant-legal/shop";

const text = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
};

/**
 * `GET /store/tenant/seller` — who sells in this storefront and how to reach them, for the
 * footer's brand block.
 *
 * The source is the tenant's own requisites row (t12-legal-requisites), the same one the
 * legal pages substitute their `{{ТОКЕН}}` placeholders from — not a second place to fill
 * in. Only what a shop prints about itself anyway leaves through here: the seller's legal
 * name, INN, OGRN, legal address, phone and e-mail. Bank details, the data-protection
 * contact, document dates and the Roskomnadzor registration stay in the owner's panel.
 *
 * A tenant that filled nothing answers with every field null, never a 404: the storefront
 * then renders the brand block without the rows it has no value for. The tenant is the
 * publishable key's own, so a neighbouring shop's requisites never reach this response.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const requisites = await readRequisites(req.scope, tenant.id);

  res.json({
    seller: {
      name: text(tenant.name as string | null),
      legal_name: text(requisites?.legal_name),
      inn: text(requisites?.inn),
      ogrn: text(requisites?.ogrn),
      legal_address: text(requisites?.legal_address),
      phone: text(requisites?.phone),
      email: text(requisites?.email),
    },
  });
};
