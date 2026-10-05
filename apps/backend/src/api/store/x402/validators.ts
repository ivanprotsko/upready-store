import { z } from "@medusajs/framework/zod";

/**
 * `POST /store/x402/purchase` (t-2026-10-03-33) — what an AI agent sends to
 * buy from a shop with x402. The same body twice: first without payment, to
 * get the 402 and its price, then with the signed `PAYMENT-SIGNATURE` header.
 *
 * `shipping_address` is required as soon as one line has to be posted (the
 * route decides that from the products, `cartNeedsShipping`); a course alone
 * needs none. `country_code` picks the region, and so the price list, when
 * there is no address; it defaults to `us`. x402 takes USD only, so the region
 * must be priced in USD.
 */
const AddressSchema = z.strictObject({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  address_1: z.string().trim().min(1).max(255),
  address_2: z.string().trim().max(255).optional(),
  city: z.string().trim().min(1).max(100),
  postal_code: z.string().trim().min(1).max(20),
  province: z.string().trim().max(100).optional(),
  country_code: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "country_code is an ISO 3166-1 alpha-2 code, e.g. us")
    .transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(32).optional(),
  company: z.string().trim().max(100).optional(),
});

export const PostStoreX402PurchaseSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        variant_id: z.string().trim().min(1).max(64),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(50),
  email: z.string().trim().toLowerCase().email().max(254),
  shipping_address: AddressSchema.optional(),
  shipping_option_id: z.string().trim().min(1).max(64).optional(),
  country_code: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "country_code is an ISO 3166-1 alpha-2 code, e.g. us")
    .transform((value) => value.toLowerCase())
    .optional(),
});
export type PostStoreX402PurchaseBody = z.infer<typeof PostStoreX402PurchaseSchema>;
