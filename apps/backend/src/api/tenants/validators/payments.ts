import { z } from "@medusajs/framework/zod";
import { ROBOKASSA_SNO_VALUES, ROBOKASSA_TAX_VALUES } from "../../../tenant-secrets/robokassa";
import { normalizeBtcpayServerUrl } from "../../../tenant-secrets/btcpay";
import { normalizeBitcartUrl } from "../../../tenant-secrets/bitcart";
import { normalizeX402FacilitatorUrl } from "../../../tenant-secrets/x402";
import { checkedEvmAddress } from "../../../x402/eip55";
import { x402NetworkById } from "../../../x402/networks";
import {
  BANK_NUMBER_PATTERN,
  CRYPTO_ADDRESS_FORMATS,
  CRYPTO_CURRENCIES,
  CRYPTO_NETWORKS,
  REQUISITES_MAX,
} from "../payment-settings/manual/manual-payment";
import { BANK_ICON_KEYS } from "../payment-settings/manual/presets";
import {
  PAYMENT_PRE_NOTICE_PROVIDER_KEYS,
  PAYMENT_PRE_NOTICE_REDIRECT_KINDS,
} from "../../../tenant-legal/payment-pre-notice";

/**
 * Body schemas for the ways a shop takes payment. That covers Robokassa, the
 * offline ways to pay, the pre-payment notice, Tribute, BTCPay, Bitcart and x402.
 *
 * `../validators.ts` re-exports every schema of this folder, so callers import
 * from there (t-2026-10-14-55).
 */

/**
 * `PUT /tenants/payment-settings` — the shop's Robokassa account
 * (t03-tenant-secrets-robokassa). A password left out or sent empty keeps the
 * stored value, so the owner can rotate one password without retyping four;
 * the first save has to carry every password of the pair its mode uses,
 * which the route checks against the merged result, not this schema.
 */
export const optionalSecret = z
  .string()
  .max(200)
  .optional()
  .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined));

export const PutTenantPaymentSettingsSchema = z.strictObject({
  provider: z.literal("robokassa"),
  merchant_login: z.string().trim().min(1).max(100),
  hash_algorithm: z.enum(["md5", "sha256", "sha384", "sha512"]).optional(),
  is_test: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
  password1: optionalSecret,
  password2: optionalSecret,
  test_password1: optionalSecret,
  test_password2: optionalSecret,
  /**
   * t-cherk-30: the 54-FZ receipt (`Receipt`) Robokassa prints when the shop
   * sends it — mandatory in practice for an ИП (Ivan, 2026-10-02: «ИП, а разве
   * робокасса чеки не делает?»). Off by default, same as every other switch
   * on this form.
   */
  fiscalization_enabled: z.boolean().optional(),
  sno: z.enum(ROBOKASSA_SNO_VALUES).optional(),
  default_tax: z.enum(ROBOKASSA_TAX_VALUES).optional(),
  /**
   * t-2026-10-12-13 (Ivan 12.10, 4.1: «нужно выключить оплату СБП»): the
   * Robokassa methods (`IncCurrLabel` aliases) the checkout must not offer.
   * Absent keeps the stored list; an empty list switches every method on.
   */
  disabled_methods: z
    .array(z.string().regex(/^[A-Za-z0-9_]{1,40}$/))
    .max(24)
    .optional(),
});
export type PutTenantPaymentSettingsBody = z.infer<typeof PutTenantPaymentSettingsSchema>;

/**
 * `PUT /tenants/payment-settings/manual` (olavka-payments) — the shop's two
 * offline ways to pay on `pp_system_default`: crypto wallets and «card via
 * manager». Each section is optional so a PUT changes only the section it
 * names; inside a section the whole section is replaced, because a wallet list
 * has no field-by-field merge that makes sense. An empty contact clears it, the
 * convention `PutTenantSeoVerificationSchema` above already uses.
 *
 * `whatsapp` is the number `https://wa.me/<number>` takes (digits, optional
 * leading `+`), `telegram` the username `https://t.me/<username>` takes (the
 * `@` is stripped). Neither is a default anywhere: an empty section is a
 * method the checkout does not offer.
 */
const optionalContact = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .max(200)
    .regex(pattern, message)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

/** An id the panel got from a GET, or none for a new item (the route then makes one). */
const requisiteId = z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/).optional();

const BankRequisiteSchema = z.strictObject({
  id: requisiteId,
  kind: z.literal("bank"),
  icon: z
    .string()
    .nullable()
    .optional()
    .refine((value) => !value || BANK_ICON_KEYS.includes(value), "an icon from the bank list, or none")
    .transform((value) => value || null),
  bank: z.string().trim().min(1).max(60),
  number: z
    .string()
    .trim()
    .regex(BANK_NUMBER_PATTERN, "a card number, an account number or an IBAN: letters, digits, spaces or dashes"),
  holder: nullableText(100),
});

const CryptoRequisiteSchema = z
  .strictObject({
    id: requisiteId,
    kind: z.literal("crypto"),
    currency: z.enum(CRYPTO_CURRENCIES),
    network: z.enum(CRYPTO_NETWORKS),
    address: z.string().trim().min(1).max(200),
  })
  .superRefine((value, ctx) => {
    const format = CRYPTO_ADDRESS_FORMATS[value.network];
    if (!format.pattern.test(value.address)) {
      ctx.addIssue({ code: "custom", path: ["address"], message: `Expected ${format.hint}` });
    }
  });

/**
 * t-cherk-com-hotfix batch 6: the one ordered list (`enabled`, `requisites`,
 * `contacts`), each key optional so a PUT changes only what it names; the list
 * is replaced whole. The two sections below (`crypto`, `manager`) are the
 * body of a panel build from before the list; the route folds them into it.
 */
export const PutTenantManualPaymentSchema = z.strictObject({
  enabled: z.boolean().optional(),
  requisites: z
    .array(z.discriminatedUnion("kind", [BankRequisiteSchema, CryptoRequisiteSchema]))
    .max(REQUISITES_MAX)
    .optional(),
  contacts: z
    .strictObject({
      whatsapp: optionalContact(/^$|^\+?\d{7,15}$/, "a phone number in international format, digits only"),
      telegram: optionalContact(/^$|^@?[A-Za-z0-9_]{4,32}$/, "a Telegram username").transform(
        (value) => (value ? value.replace(/^@/, "") : null),
      ),
      email: optionalContact(/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, "an email address"),
      note: nullableText(500),
    })
    .optional(),
  crypto: z
    .strictObject({
      enabled: z.boolean(),
      wallets: z
        .array(
          z.strictObject({
            network: z.string().trim().min(1).max(40),
            currency: z.string().trim().min(1).max(20),
            address: z.string().trim().min(1).max(200),
          }),
        )
        .max(10),
    })
    .optional(),
  manager: z
    .strictObject({
      enabled: z.boolean(),
      cards: z
        .array(
          z.strictObject({
            bank: z.string().trim().min(1).max(60),
            number: z.string().trim().min(1).max(40),
            holder: z
              .string()
              .trim()
              .max(100)
              .nullable()
              .optional()
              .transform((value) => (value ? value : null)),
          }),
        )
        .max(5)
        .optional(),
      whatsapp: optionalContact(/^$|^\+?\d{7,15}$/, "a phone number in international format, digits only"),
      telegram: optionalContact(/^$|^@?[A-Za-z0-9_]{4,32}$/, "a Telegram username").transform(
        (value) => (value ? value.replace(/^@/, "") : null),
      ),
      email: optionalContact(/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, "an email address"),
      note: z
        .string()
        .trim()
        .max(500)
        .nullable()
        .optional()
        .transform((value) => (value ? value : null)),
    })
    .optional(),
});
export type PutTenantManualPaymentBody = z.infer<typeof PutTenantManualPaymentSchema>;

/**
 * `PUT /tenants/payment-settings/pre-notice` (rule 5zd, t-2026-10-03-32) —
 * one payment method's fields for the pre-payment notice. Every field but
 * `provider_key` is optional, and a field left out keeps its stored value
 * (same convention as `PUT /tenants/requisites`); a field sent as an empty
 * string or `null` clears it.
 */
export const PutTenantPaymentPreNoticeSchema = z.strictObject({
  provider_key: z.enum(PAYMENT_PRE_NOTICE_PROVIDER_KEYS),
  charge_currency_code: z.string().trim().max(10).optional(),
  is_foreign_card: z.boolean().optional(),
  redirect_kind: z.enum(PAYMENT_PRE_NOTICE_REDIRECT_KINDS).nullable().optional(),
  redirect_value: z.string().trim().max(200).optional(),
  rate_source: z.string().trim().max(200).optional(),
  refund_terms: z.string().trim().max(1000).optional(),
});
export type PutTenantPaymentPreNoticeBody = z.infer<typeof PutTenantPaymentPreNoticeSchema>;

/**
 * `PUT /tenants/tribute` (t-cherk-22) — the shop's Tribute Shop API key.
 *
 * ONE secret, unlike Robokassa's two password pairs: the same key both calls
 * `POST /shop/orders` and signs the webhook body. Absent `api_key` keeps the
 * stored one, same "re-save without re-typing" rule as every other slot.
 */
export const PutTenantTributeSchema = z.strictObject({
  api_key: z.string().max(500).optional().transform((value) => (value && value.trim() ? value.trim() : undefined)),
  shop_id: z.string().max(128).optional().transform((value) => (value && value.trim() ? value.trim() : undefined)),
  is_enabled: z.boolean().optional(),
});
export type PutTenantTributeBody = z.infer<typeof PutTenantTributeSchema>;

const optionalBtcpayText = (max: number) =>
  z.string().max(max).optional().transform((value) => (value && value.trim() ? value.trim() : undefined));

/**
 * `PUT /tenants/payment-settings/btcpay` (ask-20261005-070255-438f) — the
 * shop's own BTCPay Server store. Every field is optional, so the owner can
 * change one value without retyping the others: an absent or empty field keeps
 * the stored one, and the route decides on the merged result whether the
 * switch may be on. `server_url` comes out normalized
 * (`normalizeBtcpayServerUrl`), so the route stores what the client will call.
 */
export const PutTenantBtcpaySchema = z.strictObject({
  server_url: optionalBtcpayText(2048)
    .refine((value) => value === undefined || normalizeBtcpayServerUrl(value) !== null, {
      message:
        "server_url must be an https:// address without a query or fragment (http:// only for localhost outside production).",
    })
    .transform((value) => (value === undefined ? undefined : (normalizeBtcpayServerUrl(value) as string))),
  store_id: optionalBtcpayText(128).refine((value) => value === undefined || /^[A-Za-z0-9_-]+$/.test(value), {
    message: "store_id holds letters, digits, «-» and «_» only, as BTCPay shows it in the store settings.",
  }),
  api_key: optionalBtcpayText(500),
  webhook_secret: optionalBtcpayText(500),
  is_enabled: z.boolean().optional(),
});
export type PutTenantBtcpayBody = z.infer<typeof PutTenantBtcpaySchema>;

const bitcartUrl = (field: string) =>
  optionalBtcpayText(2048)
    .refine((value) => value === undefined || normalizeBitcartUrl(value) !== null, {
      message: `${field} must be an https:// address without a query or fragment (http:// only for localhost outside production).`,
    })
    .transform((value) => (value === undefined ? undefined : (normalizeBitcartUrl(value) as string)));

/**
 * `PUT /tenants/payment-settings/bitcart` (ask-20261005-070255-438f, stage 2)
 * — the shop's own Bitcart store, the shape of `PutTenantBtcpaySchema`: every
 * field optional, an absent or empty one keeps the stored value, and both
 * addresses come out normalized (`normalizeBitcartUrl`). `server_url` is the
 * Merchants API, `admin_url` the admin app that serves the checkout page.
 */
export const PutTenantBitcartSchema = z.strictObject({
  server_url: bitcartUrl("server_url"),
  admin_url: bitcartUrl("admin_url"),
  store_id: optionalBtcpayText(128).refine((value) => value === undefined || /^[A-Za-z0-9_-]+$/.test(value), {
    message: "store_id holds letters, digits, «-» and «_» only, as Bitcart shows it on the store.",
  }),
  api_key: optionalBtcpayText(500),
  is_enabled: z.boolean().optional(),
});
export type PutTenantBitcartBody = z.infer<typeof PutTenantBitcartSchema>;

/**
 * `PUT /tenants/payment-settings/x402` (t-2026-10-03-33) — the shop's x402
 * settings. Every field is optional, as for BTCPay: an absent one keeps the
 * stored value, and the route decides on the merged result whether the
 * switch may be on.
 *
 * `pay_to` comes out in its EIP-55 form, and a mixed-case address whose case
 * contradicts its checksum is refused (`checkedEvmAddress`): a typo there
 * sends the buyer's money to an address nobody holds. `networks` takes known
 * CAIP-2 ids only; whether this instance offers each one is the route's call.
 */
export const PutTenantX402Schema = z.strictObject({
  pay_to: z
    .string()
    .max(64)
    .optional()
    .refine((value) => value === undefined || !value.trim() || checkedEvmAddress(value) !== null, {
      message:
        "pay_to must be an EVM address, 0x and 40 hex digits; a mixed-case address must match its EIP-55 checksum, so copy it from your wallet.",
    })
    .transform((value) => (value && value.trim() ? (checkedEvmAddress(value) as string) : undefined)),
  networks: z
    .array(
      z.string().refine((value) => x402NetworkById(value) !== null, {
        message: "networks holds CAIP-2 ids x402 supports here: eip155:84532 (Base Sepolia) or eip155:8453 (Base).",
      }),
    )
    .max(10)
    .optional(),
  facilitator_url: optionalBtcpayText(2048)
    .refine((value) => value === undefined || normalizeX402FacilitatorUrl(value) !== null, {
      message:
        "facilitator_url must be an https:// address without a query or fragment (http:// only for localhost outside production).",
    })
    .transform((value) => (value === undefined ? undefined : (normalizeX402FacilitatorUrl(value) as string))),
  is_enabled: z.boolean().optional(),
});
export type PutTenantX402Body = z.infer<typeof PutTenantX402Schema>;
