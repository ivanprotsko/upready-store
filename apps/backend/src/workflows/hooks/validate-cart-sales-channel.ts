import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { addToCartWorkflow, createCartWorkflow } from "@medusajs/medusa/core-flows";
import { assertCourseQuantityOnAdd } from "./validate-cart-course-quantity";

/**
 * A cart may only hold variants of products sold in its own sales channel.
 *
 * The storefront calls the API with a tenant's publishable key, which puts the
 * cart in that tenant's sales channel and filters `GET /store/products` by it.
 * Adding a line item by `variant_id` bypassed that filter: a cart in tenant A's
 * channel accepted a variant of tenant B's product, completed into one order,
 * and `order.placed` handed the whole order, B's item included, to A (measured
 * on the stand, 2026-09-11: order_01M2640GHNN75FE6C4A4A5ZX18). Three workflows
 * take items into a cart, and each has a `validate` hook that runs before its
 * writes; this file consumes all three so the rule holds at every entry:
 *
 * - `createCartWorkflow`: `POST /store/carts` with `items`
 * - `addToCartWorkflow`: `POST /store/carts/:id/line-items`
 * - `completeCartWorkflow`: `POST /store/carts/:id/complete`, the last gate,
 *   for a cart that gathered a foreign item before this rule existed. That one
 *   is registered in `complete-cart-validate.ts`, because Medusa accepts a
 *   single handler per hook and the completion gate now enforces two rules.
 *
 * `updateLineItemInCartWorkflow` is not consumed: it changes quantity and
 * metadata of an existing item and cannot swap its variant.
 *
 * A cart without a sales channel (no publishable key in play) is out of scope:
 * nothing then says which catalog it belongs to.
 *
 * The same two handlers also hold an online course to one per cart
 * (`validate-cart-course-quantity.ts`, t-cherk-com-hotfix batch 5): Medusa
 * accepts a single handler per hook.
 */
export type CartLike = {
  sales_channel_id?: string | null;
  items?: { variant_id?: string | null }[] | null;
};

export const variantIdsOf = (items?: { variant_id?: string | null }[] | null): string[] =>
  Array.from(
    new Set((items ?? []).map((item) => item.variant_id).filter((id): id is string => Boolean(id))),
  );

export const assertVariantsSoldInSalesChannel = async (
  container: MedusaContainer,
  salesChannelId: string | null | undefined,
  variantIds: string[],
): Promise<void> => {
  if (!salesChannelId || variantIds.length === 0) {
    return;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "product.id", "product.sales_channels.id"],
    filters: { id: variantIds },
  });

  const foreign = variants.filter(
    (variant) =>
      !(variant.product?.sales_channels ?? []).some((channel) => channel?.id === salesChannelId),
  );

  if (foreign.length > 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Variants ${foreign.map((variant) => variant.id).join(", ")} are not sold in the cart's sales channel.`,
    );
  }
};

createCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  const draft = cart as unknown as CartLike;
  await assertVariantsSoldInSalesChannel(container, draft.sales_channel_id, variantIdsOf(draft.items));
  await assertCourseQuantityOnAdd(container, null, draft.items);
});

addToCartWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  await assertVariantsSoldInSalesChannel(
    container,
    (cart as CartLike).sales_channel_id,
    variantIdsOf(input.items),
  );
  await assertCourseQuantityOnAdd(container, input.cart_id, input.items);
});
