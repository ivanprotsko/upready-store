import type { MedusaContainer } from "@medusajs/framework";
import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { refreshCartItemsWorkflow } from "@medusajs/medusa/core-flows";

import {
  cartNeedsShipping,
  type ShippingNeedItem,
} from "../../../../../workflows/hooks/cart-needs-shipping";

/**
 * `POST /store/carts/:id/drop-shipping` — takes the shipping methods off a cart
 * that has nothing left to post (t-2026-10-04-23).
 *
 * A buyer adds a physical product, picks DHL, then removes the product: the
 * cart keeps the DHL method. On the stand the course «Очищение печени» went to
 * payment as 18 900 + 3 500 ₽ of shipping, and place-order failed on the address
 * guard (`cart_01M3YKC6VAKK5CEY2AM5E2CGKF`, 2026-10-04). The Store API has no
 * DELETE for a shipping method, so the storefront calls this before it renders
 * the payment step and after the last physical line is removed.
 *
 * - A cart where any line still ships is refused with 409; its method is the
 *   buyer's choice and stays.
 * - The tenant's ₽0 «Цифровая доставка» method (`metadata.digital_delivery`,
 *   `scripts/fixtures/o24-seed-digital-shipping-option.ts`) stays: a course whose
 *   product still has a shipping profile needs one method, or Medusa's own
 *   `validateShippingStep` refuses the order.
 * - Everything else is soft-deleted the way core's own
 *   `removeShippingMethodFromCartStep` does it, and the cart is refreshed so the
 *   payment collection follows the new total.
 *
 * `ensureCartTenantScope` (`/store/carts/*`) already refuses another shop's cart.
 */
type CartRow = {
  id: string;
  completed_at?: string | Date | null;
  items?: ShippingNeedItem[] | null;
  shipping_methods?: { id: string; shipping_option_id?: string | null }[] | null;
};

const DIGITAL_DELIVERY_METADATA_KEY = "digital_delivery";

const digitalDeliveryOptionIds = async (
  container: MedusaContainer,
  optionIds: string[],
): Promise<Set<string>> => {
  if (optionIds.length === 0) {
    return new Set();
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "metadata"],
    filters: { id: optionIds },
  });

  return new Set(
    (options as { id: string; metadata?: Record<string, unknown> | null }[])
      .filter((option) => option.metadata?.[DIGITAL_DELIVERY_METADATA_KEY] === "true")
      .map((option) => option.id),
  );
};

export const dropShippingFromCart = async (
  container: MedusaContainer,
  cartId: string,
): Promise<string[]> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [cart],
  } = (await query.graph({
    entity: "cart",
    fields: [
      "id",
      "completed_at",
      "items.id",
      "items.requires_shipping",
      "items.product_id",
      "items.product.metadata",
      "shipping_methods.id",
      "shipping_methods.shipping_option_id",
    ],
    filters: { id: cartId },
  })) as { data: CartRow[] };

  if (!cart?.id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart with id: ${cartId} was not found`);
  }

  if (cart.completed_at) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Cart ${cartId} is already completed.`);
  }

  if (await cartNeedsShipping(container, cart.items ?? [])) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      `Cart ${cartId} holds an item that has to be shipped; its shipping method stays.`,
    );
  }

  const methods = cart.shipping_methods ?? [];
  const keep = await digitalDeliveryOptionIds(
    container,
    Array.from(
      new Set(
        methods
          .map((method) => method.shipping_option_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  );
  const dropped = methods
    .filter((method) => !method.shipping_option_id || !keep.has(method.shipping_option_id))
    .map((method) => method.id);

  if (dropped.length === 0) {
    return dropped;
  }

  await container.resolve(Modules.CART).softDeleteShippingMethods(dropped);
  await refreshCartItemsWorkflow(container).run({ input: { cart_id: cartId } });

  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(`Cart ${cartId} ships nothing; dropped shipping methods ${dropped.join(", ")}.`);

  return dropped;
};

export const POST = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const dropped = await dropShippingFromCart(req.scope, req.params.id);

  res.status(200).json({ cart_id: req.params.id, dropped });
};
