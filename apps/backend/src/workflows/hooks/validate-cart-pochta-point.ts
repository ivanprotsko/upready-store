import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

import { requestedPoint } from "../../pochta/method";

/** Provider id of `src/modules/pochta-fulfillment`, spelled here so this file loads no provider code. */
export const POCHTA_PROVIDER_ID = "pochta_pochta";

type MethodLike = { shipping_option_id?: string | null; data?: Record<string, unknown> | null };

export type CartLike = {
  id?: string;
  shipping_methods?: MethodLike[] | null;
};

/**
 * A Russian Post method carries its pickup point (46df-pochta).
 *
 * The provider's `validateFulfillmentData` already refuses a method without a
 * point when the cart is priced, but that runs at `setShippingMethod`, and a
 * client that never calls it, or a method written before this provider
 * existed, would otherwise become an order the owner cannot ship. This is the
 * half no client can skip: `completeCartWorkflow` is the one door every order
 * comes through (`complete-cart-validate.ts`).
 *
 * The point must be one the SERVER recorded — `provider: "pochta"` is written
 * by the provider, never by the storefront — so a hand-made `data` with an
 * index alone does not pass.
 */
export const methodHasPochtaPoint = (data?: Record<string, unknown> | null): boolean =>
  data?.provider === "pochta" && requestedPoint(data) !== null;

export const assertPochtaPointChosen = async (container: MedusaContainer, cart: CartLike): Promise<void> => {
  let methods: MethodLike[] = cart.shipping_methods ?? [];
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  // The hook's cart may come without `shipping_methods.data`; read it back
  // rather than judging a method by a field that was never loaded.
  if (cart.id && methods.some((method) => method.data === undefined)) {
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: ["id", "shipping_methods.shipping_option_id", "shipping_methods.data"],
      filters: { id: cart.id },
    });
    methods = ((carts[0] as { shipping_methods?: MethodLike[] } | undefined)?.shipping_methods ?? []) as MethodLike[];
  }

  const optionIds = Array.from(
    new Set(methods.map((method) => method.shipping_option_id).filter((id): id is string => Boolean(id))),
  );
  if (!optionIds.length) return;

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "provider_id"],
    filters: { id: optionIds },
  });
  const pochtaOptions = new Set(
    (options as Array<{ id: string; provider_id?: string | null }>)
      .filter((option) => option.provider_id === POCHTA_PROVIDER_ID)
      .map((option) => option.id),
  );
  if (!pochtaOptions.size) return;

  const missing = methods.some(
    (method) => method.shipping_option_id && pochtaOptions.has(method.shipping_option_id) && !methodHasPochtaPoint(method.data),
  );
  if (missing) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Выберите пункт выдачи Почты России: без него заказ нельзя передать на доставку.",
    );
  }
};
