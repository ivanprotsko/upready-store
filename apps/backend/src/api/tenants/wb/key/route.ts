import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deleteMarketplaceKey,
  getMarketplaceKey,
  putMarketplaceKey,
  type MarketplaceKeyBody,
} from "../../marketplace-keys";

/**
 * `GET/PUT/DELETE /tenants/wb/key` — the shop's Wildberries token, entered by
 * its owner (w24-integration-keys-self-service).
 *
 * The same three functions `/tenants/marketplaces/wb/key` calls, under the
 * path this repository already uses for everything Wildberries
 * (`/tenants/wb/status`, `/tenants/wb/tables`). Two paths, ONE implementation:
 * a second copy would be the drift the shared handler exists to prevent.
 *
 * The key lands in the READ slot (`wildberries`). The write slot
 * (`wildberries_write`, w20) is filled by no route at all — the product only
 * reads marketplaces (Ivan, 2026-09-16 02:46 WITA).
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) =>
  getMarketplaceKey(req, res, "wb");

export const PUT = async (
  req: AuthenticatedMedusaRequest<MarketplaceKeyBody>,
  res: MedusaResponse,
) => putMarketplaceKey(req, res, "wb");

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) =>
  deleteMarketplaceKey(req, res, "wb");
