import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { WISHLIST_MODULE } from "../../../../modules/wishlist";
import type WishlistModuleService from "../../../../modules/wishlist/service";
import { resolveTenantFromPublishableKey } from "../../tenant/resolve-tenant";
import type { WishlistItemRow } from "../wishlist-helpers";

/**
 * `DELETE /store/wishlist/:product_id` — the heart toggled off. Removing a
 * product that was never saved (or was already removed) is a no-op 200, not a
 * 404: a guest's stale localStorage id, or a double-click on a slow network,
 * must not surface as an error on the account page.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req as unknown as MedusaStoreRequest);
  const customerId = req.auth_context?.actor_id;

  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "You must be logged in.");
  }

  const productId = req.params.product_id;
  const wishlistService: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE);
  const existing = (await wishlistService.listWishlistItems({
    tenant_id: tenant.id,
    customer_id: customerId,
    product_id: productId,
  })) as WishlistItemRow[];

  if (existing.length) {
    await wishlistService.deleteWishlistItems(existing.map((row) => row.id));
  }

  res.status(200).json({ id: productId, deleted: true });
};
