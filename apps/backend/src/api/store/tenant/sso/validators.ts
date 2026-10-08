import { z } from "@medusajs/framework/zod";

/**
 * `POST /store/tenant/sso/code` — the buyer comes from the token and the shop
 * from the publishable key, so the body names only where the code goes. The
 * host check against `SCHOOL_SSO_RETURN_HOSTS` is the route's own.
 */
export const PostStoreSsoCodeSchema = z.strictObject({
  return_to: z.string().min(1).max(2048),
});

export type PostStoreSsoCodeBody = z.infer<typeof PostStoreSsoCodeSchema>;

/** `POST /store/tenant/sso/exchange` — the code the school's callback received. */
export const PostStoreSsoExchangeSchema = z.strictObject({
  code: z.string().min(1).max(256),
});

export type PostStoreSsoExchangeBody = z.infer<typeof PostStoreSsoExchangeSchema>;
