import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import type { PutTenantRequisitesBody } from "../validators";
import { ownRequisites, requisitesView } from "./helpers";

/**
 * `GET /tenants/requisites` — the seller's legal details behind this shop's
 * `{{ТОКЕН}}` placeholders (t12-legal-requisites), the resolved
 * `{{ДОМЕН_САЙТА}}` value, and the "не заполнено" list the owner (or Ivan, on
 * their behalf) sends on to whoever fills in the rest.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { tenant, record } = await ownRequisites(req);
  res.json(await requisitesView(req, tenant, record));
};

/**
 * `PUT /tenants/requisites` — every field optional; a field omitted from the
 * body keeps its stored value, and an empty string clears it (same convention
 * as `PUT /tenants/notification-settings`). Nothing here is invented: the
 * route only stores what was sent.
 */
export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantRequisitesBody>,
  res: MedusaResponse,
) => {
  const { tenant, record } = await ownRequisites(req);
  const body = req.validatedBody;

  // Only a field the caller actually SENT is part of the update — a field left
  // out of the body must keep its stored value, so its key is left out of this
  // object entirely rather than passed through as `undefined` (same convention
  // as `PUT /tenants/notification-settings`). A field sent as `""` clears it.
  const TEXT_FIELDS = [
    "legal_name",
    "inn",
    "ogrn",
    "legal_address",
    "return_address",
    "phone",
    "email",
    "dpo_email",
    "delivery_methods",
    "effective_date",
    "revision_date",
    "document_date",
    "rkn_notice_date",
    "rkn_reg_number",
    "newsletter_management_url",
    "bank_details",
  ] as const;

  const update: Record<string, string | boolean | null> = {};
  for (const field of TEXT_FIELDS) {
    const value = body[field];
    if (value !== undefined) update[field] = value || null;
  }
  if (body.phone_confirmed !== undefined) update.phone_confirmed = body.phone_confirmed;

  await req.scope.resolve<TenantModuleService>(TENANT_MODULE).updateTenantRequisites({
    id: record.id,
    ...update,
  });

  const { record: saved } = await ownRequisites(req);
  res.json(await requisitesView(req, tenant, saved));
};
