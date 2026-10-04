import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { isDigitalProduct } from "../tenant/release-course-shipping/digital";

/**
 * Whether anything in a cart has to be posted (t-2026-10-04-23).
 *
 * A line ships nothing when the line says so (`requires_shipping === false`, a
 * product with no shipping profile) or when its product is a course by the o24
 * contract (`product.metadata.digital === "true"`), which keeps the seeded
 * courses working while their profile is still attached. The storefront answers
 * the same question with the same two fields (`isNoDeliveryLine`,
 * `apps/storefront/src/lib/util/shipping-address.ts`); a third marker belongs in
 * both.
 *
 * Why the backend needs it at all: a buyer adds a physical product, picks DHL,
 * then removes the product. The cart keeps the DHL method, so a course-only cart
 * reached place-order carrying 3 500 ₽ of shipping and no address, and the
 * address guard refused it with a 400 the buyer saw as «Что-то пошло не так»
 * (measured on the stand, `cart_01M3YKC6VAKK5CEY2AM5E2CGKF`, 2026-10-04).
 */
export type ShippingNeedItem = {
  requires_shipping?: boolean | null;
  product_id?: string | null;
  product?: { metadata?: Record<string, unknown> | null } | null;
};

/**
 * `items` is what the caller already holds. Medusa's completion cart carries
 * `items.*` but not the product's metadata, so the products of the lines still in
 * doubt are read here, once. An unknown `items` (the caller did not load them)
 * answers "ships", the old behaviour, never "ships nothing".
 */
export const cartNeedsShipping = async (
  container: MedusaContainer,
  items?: ShippingNeedItem[] | null,
): Promise<boolean> => {
  if (!items) {
    return true;
  }

  const inDoubt = items.filter(
    (item) => item.requires_shipping !== false && !isDigitalProduct(item.product?.metadata),
  );

  if (inDoubt.length === 0) {
    return false;
  }

  // A custom line with no product behind it and no `requires_shipping: false`
  // is taken at its word.
  if (inDoubt.some((item) => !item.product_id)) {
    return true;
  }

  const productIds = Array.from(new Set(inDoubt.map((item) => item.product_id as string)));
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id: productIds },
  });

  const digital = new Set(
    (products as { id: string; metadata?: Record<string, unknown> | null }[])
      .filter((product) => isDigitalProduct(product.metadata))
      .map((product) => product.id),
  );

  return inDoubt.some((item) => !digital.has(item.product_id as string));
};
