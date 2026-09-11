import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import type { ProductDTO, ProductVariantDTO } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import {
  remapProductResponse,
  remapVariantResponse,
} from "@medusajs/medusa/api/admin/products/helpers";
import { listTenantProductIds } from "../tenant-scope";

/**
 * The Admin's own product response remapper, behind one cast.
 *
 * `query.graph` types a product row from the entity map Medusa generates into
 * `.medusa/types` while it runs, where every relation is `Maybe<T>`; the
 * Admin's remapper is written against `ProductDTO`, where the same relations
 * are `T | null`. It is the same row either way. Doing the remap ourselves
 * would be the alternative, and the remap is not cosmetic: the graph nests
 * prices under `variant.price_set.prices` and every Admin screen reads them as
 * `variant.prices`, so this keeps that translation in the Admin's hands.
 */
export const remapTenantProduct = (product: unknown) =>
  remapProductResponse(product as ProductDTO);

/** The same cast for one variant row, for the variant routes' responses. */
export const remapTenantVariant = (variant: unknown) =>
  remapVariantResponse(variant as ProductVariantDTO);

const variantNotFound = (variantId: string) =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    `Product variant with id "${variantId}" was not found`,
  );

/**
 * The variant ids of one product, read straight from the product module. Used
 * by the variant sub-routes to answer the only question that matters for
 * isolation: is this variant a child of the product in the URL, which the
 * caller has already been proven to own?
 */
export const listProductVariantIds = async (
  req: AuthenticatedMedusaRequest,
  productId: string,
): Promise<string[]> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id"],
    filters: { product_id: [productId] },
  });

  return variants.map((variant) => variant?.id).filter((id): id is string => Boolean(id));
};

/**
 * 404 for a variant that is not a child of `productId`. Call it after
 * `assertOwnedProduct`: together they are the ownership check for every
 * `/tenants/products/:id/variants/:variant_id` verb.
 *
 * The Admin's own DELETE does not enforce the parent (`deleteProductVariantsWorkflow`
 * takes ids alone and the upstream route says so in a comment), which for the
 * Admin is harmless because staff see every product. Here it is the whole
 * isolation boundary, so the check is ours and it runs before the workflow.
 */
export const assertProductVariant = async (
  req: AuthenticatedMedusaRequest,
  productId: string,
  variantId: string,
): Promise<void> => {
  const variantIds = await listProductVariantIds(req, productId);

  if (!variantIds.includes(variantId)) {
    throw variantNotFound(variantId);
  }
};

/** Every variant id of every product the tenant owns. */
export const listTenantVariantIds = async (
  req: AuthenticatedMedusaRequest,
): Promise<string[]> => {
  const ownedProductIds = await listTenantProductIds(req);

  if (ownedProductIds.length === 0) {
    return [];
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id"],
    filters: { product_id: ownedProductIds },
  });

  return variants.map((variant) => variant?.id).filter((id): id is string => Boolean(id));
};

/** 404 for a variant outside every product the tenant owns. */
export const assertOwnedVariants = async (
  req: AuthenticatedMedusaRequest,
  variantIds: string[],
): Promise<void> => {
  if (variantIds.length === 0) {
    return;
  }

  const ownedVariantIds = new Set(await listTenantVariantIds(req));
  const foreign = variantIds.find((id) => !ownedVariantIds.has(id));

  if (foreign) {
    throw variantNotFound(foreign);
  }
};

/**
 * The inventory items the tenant's own variants consume, through the
 * variant-to-inventory-item link. Same two hops as `GET
 * /tenants/inventory-items`, which is the read side of the same set.
 */
export const listTenantInventoryItemIds = async (
  req: AuthenticatedMedusaRequest,
): Promise<string[]> => {
  const ownedProductIds = await listTenantProductIds(req);

  if (ownedProductIds.length === 0) {
    return [];
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "inventory_items.inventory_item_id"],
    filters: { product_id: ownedProductIds },
  });

  return [
    ...new Set(
      variants
        .flatMap((variant) => variant?.inventory_items ?? [])
        .map((link) => link?.inventory_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
};

/** 404 for an inventory item no variant of the tenant's uses. */
export const assertOwnedInventoryItems = async (
  req: AuthenticatedMedusaRequest,
  inventoryItemIds: string[],
): Promise<void> => {
  if (inventoryItemIds.length === 0) {
    return;
  }

  const ownedItemIds = new Set(await listTenantInventoryItemIds(req));
  const foreign = inventoryItemIds.find((id) => !ownedItemIds.has(id));

  if (foreign) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Inventory item with id "${foreign}" was not found`,
    );
  }
};

/**
 * 404 for a product image that is not one of `productId`'s own images. The
 * image-to-variants batch route addresses an image by id alone, so the parent
 * has to be proven the same way a variant's is.
 */
export const assertProductImage = async (
  req: AuthenticatedMedusaRequest,
  productId: string,
  imageId: string,
): Promise<void> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "images.id"],
    filters: { id: [productId] },
  });

  const imageIds = (products[0]?.images ?? [])
    .map((image: { id?: string | null } | null) => image?.id)
    .filter((id: string | null | undefined): id is string => Boolean(id));

  if (!imageIds.includes(imageId)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product image with id "${imageId}" was not found`,
    );
  }
};
