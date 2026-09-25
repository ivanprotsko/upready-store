import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { PLATFORM_PRICING_MODULE } from "../../../modules/platform-pricing";
import type PlatformPricingModuleService from "../../../modules/platform-pricing/service";
import { pricingResponse } from "./response";

/**
 * How long a shared cache may keep the answer. Short on purpose: an admin save
 * has to show on `/pricing` without a rebuild, and the storefront itself
 * fetches with `no-store`, so this only bounds a proxy in front of the backend.
 */
export const PUBLIC_PRICING_MAX_AGE_S = 15;

/**
 * `GET /platform/pricing` — the pricing page for the storefront's `/pricing`
 * on the platform hosts (t-2026-09-25-08).
 *
 * Public: no auth and no publishable key. It cannot live under `/store/*`,
 * where the framework answers 400 to a call without a key, and a platform host
 * resolves to no tenant, so it has no key to send (same reason as
 * `/storefront/by-host`). It reads only the platform's own row and nothing
 * tenant-scoped.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: PlatformPricingModuleService = req.scope.resolve(PLATFORM_PRICING_MODULE);
  const row = await service.retrievePage();

  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "The pricing page has not been filled in yet.");
  }

  res.setHeader("Cache-Control", `public, max-age=${PUBLIC_PRICING_MAX_AGE_S}`);
  res.status(200).json(pricingResponse(row));
};
