import { z } from "@medusajs/framework/zod";

/**
 * `POST /tenants/orders/:id/payment-receipt/reject` (t-cherk-com-hotfix
 * batch 5): why the owner does not accept the buyer's receipt. The storefront
 * prints it to the buyer as it is, so it is required and kept short.
 */
export const PostTenantRejectPaymentReceiptSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500),
});

export type PostTenantRejectPaymentReceiptBody = z.infer<typeof PostTenantRejectPaymentReceiptSchema>;
