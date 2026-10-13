import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import upsertTenantHomeWorkflow from "../../../../workflows/tenant/upsert-tenant-home";
import { notifyStorefrontRevalidate } from "../../../../storefront-revalidate";
import { getTenantScope } from "../../tenant-scope";
import { readTenantHomeDocument } from "../document";
import { applyTemplate, catalogTemplate, documentFromTemplate, presetOf } from "./apply";
import type { PostTenantHomeTemplateBodyType } from "./validators";

/**
 * `POST /tenants/home/template` — the shop applies a store template
 * (t-2026-10-12-33, `docs/templates/BLOCK-CONTRACT.md` §Template Contract). Body
 * `{ id, overrides? }`, answer `{ home, advisories }`.
 *
 * The template comes from the storefront's catalogue (`catalog.generated.json`), the
 * owner's overrides are laid over it (the palette, a layer, a section's props), and the
 * result passes the template validator as a whole (`validation.ts`) before anything is
 * written. It is expanded into the shop's home document: `settings`, `theme.preset`,
 * `theme.layers`, `content.sections` and `template`. The shop's own content (hero copy,
 * products, banners, block order) is kept as it was.
 *
 * Scope, auth and the write are the ones `PUT /tenants/home` uses: the tenant behind the
 * token, the `storefront` permission (`tenants/permissions.ts`), the one-step upsert
 * workflow with its compensation, then the storefront's revalidate call.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantHomeTemplateBodyType>,
  res: MedusaResponse,
) => {
  const tenant = await getTenantScope(req);
  const { id, overrides } = req.validatedBody;

  // A field of the body, not the resource addressed: 400, as `PUT /tenants/home` answers a
  // category of another shop.
  const source = catalogTemplate(id);
  if (!source) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `id must name a template of the catalogue.`);
  }

  const applied = applyTemplate(source, overrides);
  if (!applied.ok) {
    // The body `PUT /tenants/home` answers a FORBIDDEN pair with, so the panel renders one
    // failure frame for both routes.
    if (applied.forbidden) {
      const rule = applied.forbidden;
      res.status(422).json({
        error: "forbidden_combination",
        message: rule.reason,
        field: rule.field,
        value: rule.value,
        against: rule.against,
        againstValue: rule.againstValue,
        reason: rule.reason,
      });
      return;
    }
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      applied.errors.map((error) => `${error.field}: ${error.message}`).join(" "),
    );
  }

  const preset = presetOf(applied.manifest.theme.palette);
  if (!preset) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `theme.palette "${applied.manifest.theme.palette}" is not a preset this backend stores.`,
    );
  }

  const existing = await readTenantHomeDocument(req.scope, tenant.id);
  const document = documentFromTemplate(
    applied.manifest,
    preset,
    existing?.document ?? null,
    new Date().toISOString(),
  );

  await upsertTenantHomeWorkflow(req.scope).run({
    input: { tenant_id: tenant.id, config: document },
  });

  // The storefront caches the document under the shop's tag; the same call `PUT` makes.
  await notifyStorefrontRevalidate({ type: "tenant.home", handle: tenant.handle });

  res.json({ home: document, advisories: applied.advisories });
};
