import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deleteMarketplaceKey,
  getMarketplaceKey,
  putMarketplaceKey,
  type MarketplaceKeyBody,
} from "../../marketplace-keys";

/**
 * `GET/PUT/DELETE /tenants/ozon/key` — the shop's Ozon `Client-Id` and
 * `Api-Key`, entered by its owner (w24-integration-keys-self-service).
 *
 * The same three functions `/tenants/marketplaces/ozon/key` calls; see
 * `api/tenants/marketplace-keys.ts` for why there is one implementation.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) =>
  getMarketplaceKey(req, res, "ozon");

export const PUT = async (
  req: AuthenticatedMedusaRequest<MarketplaceKeyBody>,
  res: MedusaResponse,
) => putMarketplaceKey(req, res, "ozon");

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) =>
  deleteMarketplaceKey(req, res, "ozon");
