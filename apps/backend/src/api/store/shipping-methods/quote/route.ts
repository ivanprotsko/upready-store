import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { isTenantMethodData, quoteTariff, type QuoteItem } from "../../../../shipping-tariffs/tariff";
import { zoneLabelFor } from "../../../../shipping-tariffs/ru-zone-presets";
import type { PostStoreShippingQuoteBody } from "../../../tenants/shipping-methods/validators";

/**
 * `POST /store/shipping-methods/quote` `{cart_id, shipping_option_id}` — the
 * price of one tenant method for one cart, plus the one-line explanation the
 * checkout shows under it («2,4 кг × 180 ₽ + 150 ₽»). Medusa's own
 * `/store/shipping-options/:id/calculate` returns the amount alone; this route
 * runs the SAME `quoteTariff` the provider runs, so the two numbers agree.
 *
 * The option must be reachable from the cart's sales channel (channel →
 * stock locations → fulfillment sets), or the answer is a 404: a shop's
 * tariff is priced only for carts in that shop.
 */
export const POST = async (req: MedusaRequest<PostStoreShippingQuoteBody>, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { cart_id, shipping_option_id } = req.validatedBody;

  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "currency_code",
      "locale",
      "sales_channel_id",
      "items.quantity",
      "items.unit_price",
      "items.variant.weight",
      "items.product.weight",
    ],
    filters: { id: cart_id },
  });
  if (!cart) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart id not found: ${cart_id}`);
  }

  const {
    data: [option],
  } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "price_type", "provider_id", "data", "service_zone.fulfillment_set_id"],
    filters: { id: shipping_option_id },
  });

  const channelId = cart.sales_channel_id;
  if (!channelId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart ${cart_id} has no sales channel`);
  }
  const {
    data: [channel],
  } = await query.graph({
    entity: "sales_channels",
    fields: ["id", "stock_locations.fulfillment_sets.id"],
    filters: { id: channelId },
  });
  type LocationRow = { fulfillment_sets?: ({ id: string } | null)[] | null } | null;
  const reachable = new Set<string>(
    ((channel?.stock_locations ?? []) as LocationRow[]).flatMap((location) =>
      (location?.fulfillment_sets ?? []).flatMap((set) => (set ? [set.id] : [])),
    ),
  );

  if (!option || !reachable.has(option.service_zone?.fulfillment_set_id as string)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Shipping option with id: ${shipping_option_id} was not found`,
    );
  }
  if (!isTenantMethodData(option.data)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "This shipping option carries no tariff to quote.");
  }

  type Line = {
    quantity: number;
    unit_price: number;
    variant?: { weight?: number | null } | null;
    product?: { weight?: number | null } | null;
  };
  const items: QuoteItem[] = ((cart.items ?? []) as Line[]).map((item) => ({
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    weight: item.variant?.weight ?? null,
    product_weight: item.product?.weight ?? null,
  }));

  const quote = quoteTariff(option.data.tariff, {
    items,
    currency_code: cart.currency_code,
    locale: cart.locale ?? null,
    default_weight_g: option.data.default_weight_g,
  });

  res.json({
    quote: {
      shipping_option_id: option.id,
      name: option.name,
      currency_code: cart.currency_code,
      // b03-shipping-zones-weight: WHICH zone priced this parcel, in the
      // owner's own words («Урал»), so the buyer sees it before he pays.
      zone_label: option.data.zone?.label || zoneLabelFor(option.data.zone ?? null),
      ...quote,
    },
  });
};
