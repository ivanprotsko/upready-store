import { z } from "@medusajs/framework/zod";

/**
 * `POST /store/payment-settings/charge-estimate` — the cart's approximate
 * total in another currency, for rule 5zd's pre-payment notice. Never the
 * cart's own currency: the caller already knows that total.
 */
export const PostStoreChargeEstimateSchema = z.strictObject({
  cart_id: z.string().trim().min(1).max(120),
  currency_code: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .transform((value) => value.toLowerCase()),
});

export type PostStoreChargeEstimateBody = z.infer<typeof PostStoreChargeEstimateSchema>;
