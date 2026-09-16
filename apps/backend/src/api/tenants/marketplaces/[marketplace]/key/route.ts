import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { MARKETPLACE_IDS, adapterFor } from "../../../../../modules/marketplace/registry";
import {
  deleteMarketplaceKey,
  getMarketplaceKey,
  putMarketplaceKey,
  type MarketplaceKeyBody,
} from "../../../marketplace-keys";

/**
 * `GET/PUT/DELETE /tenants/marketplaces/:marketplace/key` — the shop owner's
 * own key for ANY registered marketplace (w24-integration-keys-self-service).
 *
 * The general route: a marketplace registered in `registry.ts` gets a working
 * form here and in the panel with nothing written per marketplace (rule 20).
 * `/tenants/wb/key` and `/tenants/ozon/key` call the same handlers under the
 * names the task names.
 *
 * Authentication is the namespace's own: `/tenants/*` is behind
 * `authenticate("tenant", …)` in `src/api/middlewares.ts`, and every read and
 * write is scoped to the tenant `getTenantScope` resolves from the token, so
 * one shop can neither read nor replace another shop's key.
 */

const idOf = (req: AuthenticatedMedusaRequest): string => {
  const id = String(req.params.marketplace ?? "");
  if (!adapterFor(id)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Маркетплейс ${id} не подключён. Есть: ${MARKETPLACE_IDS.join(", ")}.`,
    );
  }
  return id;
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) =>
  getMarketplaceKey(req, res, idOf(req));

export const PUT = async (
  req: AuthenticatedMedusaRequest<MarketplaceKeyBody>,
  res: MedusaResponse,
) => putMarketplaceKey(req, res, idOf(req));

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) =>
  deleteMarketplaceKey(req, res, idOf(req));
