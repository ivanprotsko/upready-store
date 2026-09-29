import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Logger } from "@medusajs/framework/types";

import { cartWeightGrams, requestedPoint, type PochtaStorePoint } from "../../../../pochta/method";
import { findPochtaPoint, quoteToPoint } from "../../../../pochta/quote";
import { quoteItemsOf } from "../../../../modules/pochta-fulfillment/service";
import { pochtaContext, pochtaUnavailable } from "../helpers";

/**
 * `GET /store/pochta/quote?cart_id=…&pochta_point_index=980063&pochta_point_kind=pvz`
 * — the price and the term to one point for this cart, shown on the point's
 * card before the buyer confirms it (46df-pochta).
 *
 * The same `quoteToPoint` the fulfillment provider charges with, over the same
 * cart weight, so the previewed price is the price the cart gets. The cart must
 * belong to the shop the publishable key names.
 */
export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const { tenant, secret, credentials } = await pochtaContext(req);
  if (!secret || !credentials) {
    res.status(200).json({ configured: false, quote: null });
    return;
  }

  const query = req.query as Record<string, string | undefined>;
  const requested = requestedPoint(query);
  const cartId = (query.cart_id ?? "").trim();
  if (!requested || !cartId) {
    res.status(400).json({ message: "Нужны cart_id и индекс пункта выдачи" });
    return;
  }

  const graph = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: carts } = await graph.graph({
    entity: "cart",
    fields: [
      "id",
      "sales_channel_id",
      "currency_code",
      "items.quantity",
      "items.unit_price",
      "items.variant.weight",
      "items.variant.product.weight",
    ],
    filters: { id: cartId },
  });
  const cart = carts[0] as { sales_channel_id?: string | null; currency_code?: string } | undefined;
  if (!cart || cart.sales_channel_id !== tenant.sales_channel_id) {
    res.status(404).json({ message: "Корзина не найдена" });
    return;
  }

  let point: PochtaStorePoint | null;
  try {
    point = await findPochtaPoint(credentials, requested);
  } catch (error) {
    res.status(200).json({
      configured: true,
      quote: null,
      ...pochtaUnavailable(req, "/store/pochta/quote", tenant.id, error),
    });
    return;
  }
  if (!point) {
    res.status(200).json({ configured: true, quote: null, error: "Пункт выдачи не найден в справочнике Почты России" });
    return;
  }
  const weight = cartWeightGrams(quoteItemsOf(cart), secret.credentials.default_weight_g);
  if (point.weight_limit_g && weight > point.weight_limit_g) {
    res.status(200).json({ configured: true, quote: null, error: "Посылка тяжелее, чем принимает этот пункт" });
    return;
  }

  try {
    const quote = await quoteToPoint(
      { credentials, sender_index: secret.credentials.sender_index, point, weight_g: weight },
      { logger: req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER) },
    );
    res.status(200).json({ configured: true, currency_code: cart.currency_code ?? "rub", quote });
  } catch (error) {
    res.status(200).json({
      configured: true,
      quote: null,
      ...pochtaUnavailable(req, "/store/pochta/quote", tenant.id, error),
    });
  }
}
