import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantPaymentPreNoticeBody } from "../../validators";
import {
  type PaymentPreNoticeEntry,
  readPaymentPreNotice,
  storedPaymentPreNotice,
} from "../../../../tenant-legal/payment-pre-notice";

/**
 * `GET/PUT /tenants/payment-settings/pre-notice` (rule 5zd) — per payment
 * method, the fields the owner edits for the pre-payment notice: the charge
 * currency, whether the method is a foreign card, where paying redirects to,
 * the rate source and the refund terms. Stored in
 * `tenant.metadata.payment_pre_notice`, merged into the rest of the metadata
 * on every write (same convention as `payment-settings/manual`).
 *
 * `PUT` always names one `provider_key` and changes only that provider's
 * fields; every field on it is optional, so a save changes only what the
 * owner actually touched — a field left out keeps its stored value, same
 * convention as `PUT /tenants/requisites`.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const tenant = await tenantModuleService.retrieveTenant(scope.id);

  res.json({ payment_pre_notice: readPaymentPreNotice(tenant.metadata as Record<string, unknown> | null) });
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantPaymentPreNoticeBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const tenant = await tenantModuleService.retrieveTenant(scope.id);
  const metadata = (tenant.metadata ?? {}) as Record<string, unknown>;
  const current = readPaymentPreNotice(metadata);
  const body = req.validatedBody;

  const patch: Partial<PaymentPreNoticeEntry> = {};
  if (body.charge_currency_code !== undefined) {
    patch.charge_currency_code = body.charge_currency_code ? body.charge_currency_code.toLowerCase() : null;
  }
  if (body.is_foreign_card !== undefined) patch.is_foreign_card = body.is_foreign_card;
  if (body.redirect_kind !== undefined) patch.redirect_kind = body.redirect_kind;
  if (body.redirect_value !== undefined) patch.redirect_value = body.redirect_value || null;
  if (body.rate_source !== undefined) patch.rate_source = body.rate_source || null;
  if (body.refund_terms !== undefined) patch.refund_terms = body.refund_terms || null;

  const next = storedPaymentPreNotice(current, body.provider_key, patch);

  const updated = await tenantModuleService.updateTenants({
    id: scope.id,
    metadata: { ...metadata, payment_pre_notice: next },
  });

  res.json({
    payment_pre_notice: readPaymentPreNotice(updated.metadata as Record<string, unknown> | null),
  });
};
