import { completeCartWorkflow } from "@medusajs/medusa/core-flows";
import {
  assertVariantsSoldInSalesChannel,
  variantIdsOf,
  type CartLike as SalesChannelCart,
} from "./validate-cart-sales-channel";
import {
  assertPostableShippingAddress,
  type CartLike as ShippingAddressCart,
} from "./validate-cart-shipping-address";
import { assertPochtaPointChosen, type CartLike as PochtaPointCart } from "./validate-cart-pochta-point";

/**
 * Everything that must hold before a cart becomes an order.
 *
 * Medusa accepts exactly ONE handler per workflow hook — a second
 * `completeCartWorkflow.hooks.validate(…)` anywhere in `src` refuses to boot
 * with «Cannot define multiple hook handlers for the validate hook» (measured
 * on the f04 stand, 2026-09-15). So the checks live in their own files, each
 * exporting a plain assertion with its own reasoning and its own unit tests,
 * and this file is the single place they are wired to the completion gate. A
 * new rule for cart completion is a new `assert…` call here, not a new hook.
 *
 * The order is deliberate: the sales-channel rule protects another tenant's
 * catalog, the address rule protects this tenant's own shipment, and the first
 * failure is the one the customer sees.
 */
completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  const salesChannelCart = cart as unknown as SalesChannelCart;
  await assertVariantsSoldInSalesChannel(
    container,
    salesChannelCart.sales_channel_id,
    variantIdsOf(salesChannelCart.items),
  );

  await assertPostableShippingAddress(
    container,
    cart as unknown as ShippingAddressCart,
  );

  await assertPochtaPointChosen(container, cart as unknown as PochtaPointCart);
});
