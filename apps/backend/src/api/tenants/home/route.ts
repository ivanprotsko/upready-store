import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import upsertTenantHomeWorkflow from "../../../workflows/tenant/upsert-tenant-home";
import { notifyStorefrontRevalidate } from "../../../storefront-revalidate";
import { getTenantScope, listTenantCategoryIds } from "../tenant-scope";
import {
  isForbidden,
  TENANT_HOME_SCHEMA_ID,
  type PutTenantHomeBodyType,
  type TenantHomeDocument,
} from "./validators";
import type { StorefrontSettingsInput } from "../../store/storefront-settings/validation";

/**
 * `GET`/`PUT /tenants/home` — the tenant's home-page document
 * (`upready.tenant-home/v1`, `docs/tenant-panel/api-contract.md` "Piece 8").
 * One row per tenant in `tenant_home_config`, written by the panel's
 * `/home-settings` screen and read by that tenant's storefront through the
 * public `GET /store/tenant/home`.
 *
 * Scope: the tenant behind the token, never a body field. The row is addressed
 * by `tenant_id`, so there is no id in the URL to leak and no foreign row to
 * reach; the one foreign reference a body can carry, `content.products.
 * category_id`, is checked against the tenant-product-category link below.
 *
 * The write is the contract's own "upsert via the tenant module service",
 * wrapped in a one-step workflow the way `POST /tenants/me` wraps its own
 * update (`workflows/tenant/upsert-tenant-home`): the service call is the step's
 * body, and the step carries the compensation that puts the previous document
 * back. A bare service call from the route would also trip the repo's own lint
 * rule `@medusajs/no-service-mutations-in-api-route`.
 */

const readDocument = async (
  req: AuthenticatedMedusaRequest,
  tenantId: string,
): Promise<{ id: string; document: TenantHomeDocument } | null> => {
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const [row] = await tenantModuleService.listTenantHomeConfigs({ tenant_id: tenantId });

  if (!row) {
    return null;
  }

  return { id: row.id, document: row.config as unknown as TenantHomeDocument };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const existing = await readDocument(req, tenant.id);

  res.json({ home: existing?.document ?? null });
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantHomeBodyType>,
  res: MedusaResponse,
) => {
  const tenant = await getTenantScope(req);
  const body = req.validatedBody;
  const settings = body.settings as unknown as StorefrontSettingsInput;

  // The FORBIDDEN pair is a 422, the same status and the same body
  // `PUT /store/storefront-settings` already answers with, so the panel renders
  // one failure frame for either route. It is written here rather than thrown as
  // a MedusaError because the framework's error handler maps no MedusaError type
  // to 422 except DUPLICATE_ERROR and PAYMENT_AUTHORIZATION_ERROR, neither of
  // which describes a composition that two saved values forbid
  // (@medusajs/framework/dist/http/middlewares/error-handler.js).
  const forbidden = isForbidden(settings);
  if (forbidden) {
    res.status(422).json({
      error: "forbidden_combination",
      // `message` is not part of the storefront-settings body; it is added here
      // because the js-sdk's FetchError carries only `message` (it falls back to
      // the status text), and without it the panel would show "Unprocessable
      // Entity" instead of the reason the pair is blocked.
      message: forbidden.reason,
      field: forbidden.field,
      value: forbidden.value,
      against: forbidden.against,
      againstValue: forbidden.againstValue,
      reason: forbidden.reason,
    });
    return;
  }

  // A category the tenant does not own is INVALID_DATA (400), not 404: the id is
  // a field of the document being written, not the resource being addressed, and
  // the message names no category, so the answer says nothing about whether a
  // foreign id exists.
  if (body.content.products.source === "category") {
    const ownedCategoryIds = await listTenantCategoryIds(req);
    if (!ownedCategoryIds.includes(body.content.products.category_id)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "content.products.category_id must name a category of your own.",
      );
    }
  }

  const document: TenantHomeDocument = {
    schema: TENANT_HOME_SCHEMA_ID,
    theme: body.theme,
    settings,
    content: body.content,
    updatedAt: new Date().toISOString(),
  };

  await upsertTenantHomeWorkflow(req.scope).run({
    input: { tenant_id: tenant.id, config: document },
  });

  // The storefront caches this document (tag `tenant-home-<handle>`), so without
  // this call the shop keeps rendering its previous theme, hero and home blocks
  // until the process restarts. The receiver has always understood the
  // `tenant.home` type — nobody was sending it (measured 2026-09-14: the only
  // caller of /api/revalidate in this app was the product subscriber).
  await notifyStorefrontRevalidate({ type: "tenant.home", handle: tenant.handle });

  res.json({ home: document });
};
