import { z } from "@medusajs/framework/zod";
import { optionalSecret } from "./payments";

/**
 * Body schemas for who hears about the shop's orders, the seller's requisites,
 * and the shop's delivery accounts with CDEK, ApiShip and Russian Post.
 *
 * `../validators.ts` re-exports every schema of this folder, so callers import
 * from there (t-2026-10-14-55).
 */

/**
 * `PUT /tenants/notification-settings` — the two fields the owner controls over
 * their customers' letters (t08-order-notifications). The `From` ADDRESS is
 * deliberately absent: the platform's SMTP account sends for every shop, and an
 * address a shop owner typed would be a domain we cannot sign for.
 *
 * An empty string is a legal value and means «clear it», which is why neither
 * field trims down to `undefined` the way a secret does.
 */
export const PutTenantNotificationSettingsSchema = z.strictObject({
  email_from_name: z.string().trim().max(100).optional(),
  email_reply_to: z
    .string()
    .trim()
    .max(200)
    .refine((value) => value === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
      message: "a valid e-mail address, or empty to clear it",
    })
    .optional(),
});
export type PutTenantNotificationSettingsBody = z.infer<
  typeof PutTenantNotificationSettingsSchema
>;

// ---- t12-legal-requisites: seller requisites (/tenants/requisites)

/**
 * `PUT /tenants/requisites` — every field optional and every field an empty
 * string means "clear it", the same convention as
 * `PutTenantNotificationSettingsSchema`: an owner has to be able to take a
 * value back out as easily as they put it in, and a field simply omitted from
 * the body must leave the stored value untouched (a partial save from a form
 * that only shows some fields at a time).
 *
 * `phone_confirmed` has no free-text shape to police, so it is the one boolean
 * here. Nothing here validates an ИНН/ОГРН checksum: this repository must not
 * invent or "correct" a registration number, only store what the owner typed
 * (step plan piece 4 and "What NOT to do").
 */
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const PutTenantRequisitesSchema = z.strictObject({
  legal_name: optionalText(200),
  inn: optionalText(20),
  ogrn: optionalText(20),
  legal_address: optionalText(500),
  return_address: optionalText(500),
  phone: optionalText(50),
  phone_confirmed: z.boolean().optional(),
  email: optionalText(200),
  dpo_email: optionalText(200),
  delivery_methods: optionalText(500),
  effective_date: optionalText(100),
  revision_date: optionalText(100),
  document_date: optionalText(100),
  rkn_notice_date: optionalText(100),
  rkn_reg_number: optionalText(100),
  newsletter_management_url: optionalText(500),
  bank_details: optionalText(1000),
});
export type PutTenantRequisitesBody = z.infer<typeof PutTenantRequisitesSchema>;

/**
 * `PUT /tenants/delivery-settings` (i02-apiship-cdek-shipping) — the shop's CDEK
 * account and what it ships with. A password absent from the body keeps the
 * stored one, the same rule the Robokassa form follows, so the panel can show a
 * masked value and save the rest of the form without re-typing it.
 */
export const PutTenantDeliverySettingsSchema = z.strictObject({
  provider: z.literal("cdek"),
  is_test: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
  account: z.string().trim().max(200).optional(),
  test_account: z.string().trim().max(200).optional(),
  password: optionalSecret,
  test_password: optionalSecret,
  sender_mode: z.enum(["door", "warehouse"]).optional(),
  sender_city_code: z.number().int().positive().nullable().optional(),
  sender_city_name: optionalText(200),
  sender_address: optionalText(500),
  sender_name: optionalText(200),
  sender_phone: optionalText(50),
  shipment_point: optionalText(50),
  /** Which delivery kinds the shop offers; an empty list switches CDEK off at the checkout. */
  kinds: z.array(z.enum(["courier", "pickup", "postamat"])).max(3).optional(),
  markup_amount: z.number().min(0).max(1_000_000).optional(),
  markup_percent: z.number().min(0).max(100).optional(),
  free_above_total: z.number().min(0).max(100_000_000).nullable().optional(),
});
export type PutTenantDeliverySettingsBody = z.infer<typeof PutTenantDeliverySettingsSchema>;

/**
 * `PUT /tenants/apiship/key` (p01-settings-integrations-restructure) — the
 * shop's ApiShip token.
 *
 * ONE field, because ApiShip authenticates with a bare `Authorization: <token>`
 * header and nothing else (measured 2026-09-16, `src/apiship/client.ts`).
 *
 * `min(1)` after `trim()` for the reason the marketplace key schema gives: an
 * empty string is not «keep the stored value», it is a value of the same
 * quantity that would overwrite a working token with nothing (rule 20a). This
 * route has no «keep» case at all — a token is either being replaced or the row
 * is being deleted — so an empty body is refused rather than silently ignored.
 */
export const PutTenantApishipKeySchema = z.strictObject({
  token: z
    .string()
    .trim()
    .min(1, "Пустое значение не сохраняется: введите токен ApiShip.")
    .max(500),
  is_enabled: z.boolean().optional(),
});
export type PutTenantApishipKeyBody = z.infer<typeof PutTenantApishipKeySchema>;

/**
 * `PUT /tenants/pochta` (46df-pochta) — the shop's Russian Post «Отправка»
 * access and the two settings a quote needs.
 *
 * A secret absent from the body keeps the stored one, so the panel can show a
 * masked value and save the rest of the form without re-typing it.
 * `clear_user_key` is the one way to remove the user key: an empty string is
 * never «delete», for the reason `PutTenantApishipKeySchema` gives.
 */
export const PutTenantPochtaSchema = z.strictObject({
  token: z.string().max(500).optional().transform((value) => (value && value.trim() ? value.trim() : undefined)),
  user_key: z.string().max(500).optional().transform((value) => (value && value.trim() ? value.trim() : undefined)),
  clear_user_key: z.boolean().optional(),
  sender_index: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Индекс отделения — шесть цифр.")
    .optional(),
  default_weight_g: z.number().int().min(1).max(50_000).optional(),
  is_enabled: z.boolean().optional(),
});

export type PutTenantPochtaBody = z.infer<typeof PutTenantPochtaSchema>;
