import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import {
  chargeConversionFactor,
  type ChargeEstimateVariant,
} from "../../../../tenant-legal/charge-estimate";
import type { PostStoreChargeEstimateBody } from "./validators";

/**
 * `POST /store/payment-settings/charge-estimate` `{cart_id, currency_code}` —
 * the factor to multiply the cart's OWN total by, for rule 5zd's «≈
 * <сумма>» (lead review, t-2026-10-03-32: the amount must be the buyer's
 * real charge, shipping/discounts/tax included, never a sum of line items
 * recomputed here — the caller already has that number, the same one
 * `CheckoutTotals` renders). `factor` is `null` whenever there is no
 * reliable, already-stamped rate to use (`tenant-legal/charge-estimate.ts`):
 * the storefront then names the rate source with no sum, never a guess.
 */
export const POST = async (req: MedusaRequest<PostStoreChargeEstimateBody>, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { cart_id, currency_code } = req.validatedBody;

  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: ["id", "currency_code", "items.variant_id"],
    filters: { id: cart_id },
  });

  if (!cart) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart id not found: ${cart_id}`);
  }

  type Line = { variant_id?: string | null };
  const items = ((cart.items ?? []) as Line[]).map((item) => ({ variant_id: item.variant_id ?? null }));

  const variantIds = [
    ...new Set(items.map((item) => item.variant_id).filter((id): id is string => Boolean(id))),
  ];

  const { data: variants } = variantIds.length
    ? await query.graph({ entity: "variant", fields: ["id", "metadata"], filters: { id: variantIds } })
    : { data: [] as ChargeEstimateVariant[] };

  const factor = chargeConversionFactor(
    items,
    variants as ChargeEstimateVariant[],
    cart.currency_code as string,
    currency_code,
  );

  res.json({ currency_code, factor });
};
