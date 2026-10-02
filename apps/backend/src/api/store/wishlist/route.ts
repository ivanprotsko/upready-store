import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { WISHLIST_MODULE } from "../../../modules/wishlist";
import type WishlistModuleService from "../../../modules/wishlist/service";
import { resolveTenantFromPublishableKey } from "../tenant/resolve-tenant";
import {
  sortWishlistNewestFirst,
  toWishlistItemDto,
  type WishlistItemRow,
  type WishlistProductSummary,
} from "./wishlist-helpers";
import type { PostStoreWishlistBody } from "./validators";

/**
 * `GET /store/wishlist` — every product the signed-in customer saved on THIS
 * shop (tenant from the publishable key, customer from the bearer/session
 * token — `authenticate("customer", …)` in `middlewares.ts` refuses an
 * anonymous call before this route runs). A product saved on another shop, or
 * by another customer, never appears: both are in the filter, never a field a
 * caller could send.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req as unknown as MedusaStoreRequest);
  const customerId = req.auth_context?.actor_id;

  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "You must be logged in.");
  }

  const wishlistService: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE);
  const rows = (await wishlistService.listWishlistItems({
    tenant_id: tenant.id,
    customer_id: customerId,
  })) as WishlistItemRow[];

  if (!rows.length) {
    res.json({ items: [] });
    return;
  }

  const productIds = [...new Set(rows.map((row) => row.product_id))];
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "thumbnail", "variants.id"],
    filters: { id: productIds },
  });
  const productsById = new Map<string, WishlistProductSummary>(
    (products as Array<Record<string, unknown>>).map((product) => [
      product.id as string,
      {
        id: product.id as string,
        title: product.title as string,
        handle: (product.handle as string | null) ?? null,
        thumbnail: (product.thumbnail as string | null) ?? null,
        variant_ids: ((product.variants ?? []) as Array<{ id?: string } | null>)
          .map((variant) => variant?.id)
          .filter((id): id is string => Boolean(id)),
      },
    ]),
  );

  const items = sortWishlistNewestFirst(rows).map((row) => toWishlistItemDto(row, productsById));

  res.json({ items });
};

/**
 * `POST /store/wishlist` — the heart toggled on. Adding a product already
 * saved is a no-op that answers the existing row (the heart button can POST
 * twice in a row — a slow network, a guest merge replaying a product already
 * synced — without turning into a duplicate or an error).
 *
 * The product must belong to the storefront's own tenant, checked the same
 * way `/store/tenant/reviews` does, so this route cannot be used to save a
 * neighbouring shop's product.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostStoreWishlistBody>,
  res: MedusaResponse,
) => {
  const tenant = await resolveTenantFromPublishableKey(req as unknown as MedusaStoreRequest);
  const customerId = req.auth_context?.actor_id;

  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "You must be logged in.");
  }

  const { product_id } = req.validatedBody;

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [owner],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "products.id"],
    filters: { id: [tenant.id] },
  });

  const owns = (owner?.products ?? []).some(
    (product: { id?: string } | null) => product?.id === product_id,
  );

  if (!owns) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product with id "${product_id}" was not found`,
    );
  }

  const wishlistService: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE);
  const existing = (await wishlistService.listWishlistItems({
    tenant_id: tenant.id,
    customer_id: customerId,
    product_id,
  })) as WishlistItemRow[];

  const row =
    existing[0] ??
    (await wishlistService.createWishlistItems({
      tenant_id: tenant.id,
      customer_id: customerId,
      product_id,
    }));

  res.status(201).json({ item: toWishlistItemDto(Array.isArray(row) ? row[0] : row, new Map()) });
};
