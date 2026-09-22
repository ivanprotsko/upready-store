import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantManualPaymentBody } from "../../validators";
import { readManualPayment, type TenantManualPayment } from "./manual-payment";

/**
 * `GET/PUT /tenants/payment-settings/manual` (olavka-payments) — the shop's
 * crypto wallets and manager contacts for the built-in `pp_system_default`
 * provider. Stored in `tenant.metadata.manual_payment` and merged section by
 * section on every write, the shape `PUT /tenants/branding` already uses, so
 * this route never overwrites `branding`, `analytics` or any other key that
 * shares the metadata document.
 *
 * Nothing here is captured automatically. The order a buyer places through
 * either section stays «awaiting payment» until the owner captures it in the
 * panel (`api/tenants/payments/[id]/capture`), which is the whole point of an
 * offline method.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const tenant = await tenantModuleService.retrieveTenant(scope.id);

  res.json({
    manual_payment: readManualPayment(tenant.metadata as Record<string, unknown> | null),
  });
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantManualPaymentBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const tenant = await tenantModuleService.retrieveTenant(scope.id);
  const metadata = (tenant.metadata ?? {}) as Record<string, unknown>;
  const current = readManualPayment(metadata);
  const body = req.validatedBody;

  const next: TenantManualPayment = {
    crypto: body.crypto
      ? {
          enabled: body.crypto.enabled,
          wallets: body.crypto.wallets.map((wallet) => ({
            network: wallet.network,
            currency: wallet.currency,
            address: wallet.address,
          })),
        }
      : current.crypto,
    manager: body.manager
      ? {
          enabled: body.manager.enabled,
          whatsapp: body.manager.whatsapp ?? null,
          telegram: body.manager.telegram ?? null,
          email: body.manager.email ?? null,
          note: body.manager.note ?? null,
        }
      : current.manager,
  };

  const updated = await tenantModuleService.updateTenants({
    id: scope.id,
    metadata: { ...metadata, manual_payment: next },
  });

  res.json({
    manual_payment: readManualPayment(updated.metadata as Record<string, unknown> | null),
  });
};
