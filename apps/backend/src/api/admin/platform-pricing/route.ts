import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PLATFORM_PRICING_MODULE } from "../../../modules/platform-pricing";
import type PlatformPricingModuleService from "../../../modules/platform-pricing/service";
import type { PostAdminPlatformPricingBody } from "../../../modules/platform-pricing/schema";
import { pricingResponse } from "../../platform/pricing/response";

/**
 * `GET /admin/platform-pricing` — the pricing page as the admin editor loads it
 * (t-2026-09-25-08). Staff only: the framework's default `/admin/*` middleware
 * (actor type `user`) guards it like every custom admin route.
 *
 * A page nobody has seeded answers `pricing: null` rather than 404, so the
 * editor can say what to run instead of showing an error.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const service: PlatformPricingModuleService = req.scope.resolve(PLATFORM_PRICING_MODULE);
  const row = await service.retrievePage();

  if (!row) {
    res.status(200).json({ pricing: null, revision: null, updated_at: null });
    return;
  }

  res.status(200).json(pricingResponse(row));
};

/**
 * `POST /admin/platform-pricing` — saves the whole page. The body was validated
 * by `PostAdminPlatformPricingSchema` in middlewares.ts (400 names the field);
 * a stale `revision` is a 409 from the service.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminPlatformPricingBody>,
  res: MedusaResponse,
) => {
  const service: PlatformPricingModuleService = req.scope.resolve(PLATFORM_PRICING_MODULE);
  const { pricing, revision } = req.validatedBody;

  const saved = await service.savePage({
    document: pricing,
    expectedRevision: revision,
    updatedBy: req.auth_context?.actor_id ?? null,
  });

  res.status(200).json(pricingResponse(saved));
};
