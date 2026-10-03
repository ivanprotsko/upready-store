import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import {
  estimateChargeAmount,
  type ChargeEstimateVariant,
} from "../../../../tenant-legal/charge-estimate";
import type { PostStoreChargeEstimateBody } from "./validators";

/**
 * `POST /store/payment-settings/charge-estimate` `{cart_id, currency_code}` —
 * the cart's total converted into `currency_code`, for rule 5zd's «≈
 * <сумма>». `amount` is `null` whenever there is no reliable, already-stamped
 * rate to use (`tenant-legal/charge-estimate.ts`): the storefront then names
 * the rate source with no sum, never a guess.
 */
export const POST = async (req: MedusaRequest<PostStoreChargeEstimateBody>, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { cart_id, currency_code } = req.validatedBody;

  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: ["id", "currency_code", "items.quantity", "items.unit_price", "items.variant_id"],
    filters: { id: cart_id },
  });

  if (!cart) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart id not found: ${cart_id}`);
  }

  type Line = { quantity: unknown; unit_price: unknown; variant_id?: string | null };
  const items = ((cart.items ?? []) as Line[]).map((item) => ({
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    variant_id: item.variant_id ?? null,
  }));

  const variantIds = [
    ...new Set(items.map((item) => item.variant_id).filter((id): id is string => Boolean(id))),
  ];

  const { data: variants } = variantIds.length
    ? await query.graph({ entity: "variant", fields: ["id", "metadata"], filters: { id: variantIds } })
    : { data: [] as ChargeEstimateVariant[] };

  const amount = estimateChargeAmount(
    items,
    variants as ChargeEstimateVariant[],
    cart.currency_code as string,
    currency_code,
  );

  res.json({ currency_code, amount });
};
