export const ERROR_MESSAGE_KEYS = [
  "generic",
  "network",
  "invalidCredentials",
  "emailExists",
  "invalidEmail",
  "unauthorized",
  "notFound",
  "insufficientInventory",
  "invalidDiscount",
  "paymentFailed",
  "passwordTooShort",
  "passwordMismatch",
  "invalidResetLink",
  "shippingAddressIncomplete",
  "shippingMethodMissing",
  "pickupPointMissing",
  "itemUnavailable",
] as const

export type ErrorMessageKey = (typeof ERROR_MESSAGE_KEYS)[number]

const extractMessage = (error: unknown): string => {
  if (typeof error === "string") return error
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "")
  }
  return String(error ?? "")
}

const stripTechnicalPrefixes = (text: string): string =>
  text
    .replace(/^\s*[A-Za-z]*error:\s*/i, "")
    .replace(/^\s*error setting up the request:\s*/i, "")
    .replace(/^\s*no response received:\s*/i, "")
    .trim()

const RULES: { pattern: RegExp; key: ErrorMessageKey }[] = [
  // The storefront's own codes come first: they are exact, and some of them
  // would otherwise be swallowed by the looser patterns below.
  { pattern: /^passwordTooShort$/, key: "passwordTooShort" },
  { pattern: /^passwordMismatch$/, key: "passwordMismatch" },
  { pattern: /^invalidResetLink$/, key: "invalidResetLink" },
  // Place-order's known refusals (t-2026-10-04-23, rule 5ze item 3): each one tells
  // the buyer what to fix instead of «Что-то пошло не так». The texts are the
  // backend's own: `validate-cart-shipping-address.ts`, Medusa's
  // `validateShippingStep`, `validate-cart-pochta-point.ts` and
  // `validate-cart-sales-channel.ts`. They come before the looser patterns below.
  {
    pattern: /shipping address is missing|parcel cannot be posted/i,
    key: "shippingAddressIncomplete",
  },
  {
    pattern: /no shipping method selected|shipping profiles that are not satisfied/i,
    key: "shippingMethodMissing",
  },
  { pattern: /пункт выдачи|pickup point/i, key: "pickupPointMissing" },
  { pattern: /not sold in the cart's sales channel/i, key: "itemUnavailable" },
  {
    pattern:
      /network|no response|setting up the request|failed to fetch|fetch failed|econnrefused|etimedout|timeout|socket hang up/i,
    key: "network",
  },
  {
    pattern:
      /invalid (email|password|credential)|(wrong|incorrect).*(email|password)|invalid email or password/i,
    key: "invalidCredentials",
  },
  {
    pattern: /already (exists|registered|taken)|identity with email/i,
    key: "emailExists",
  },
  {
    pattern: /(invalid|not a valid|malformed).*email|email.*(invalid|not valid)/i,
    key: "invalidEmail",
  },
  {
    pattern: /promotion|discount|coupon|promo code|voucher/i,
    key: "invalidDiscount",
  },
  {
    pattern: /inventory|out of stock|not enough|insufficient stock|no stock|quantity/i,
    key: "insufficientInventory",
  },
  {
    pattern: /payment|card|charge|transaction|stripe|declined/i,
    key: "paymentFailed",
  },
  {
    pattern: /unauthor|not authenticated|authentication required|forbidden|not allowed|permission/i,
    key: "unauthorized",
  },
  {
    pattern: /not found|does not exist|no .* found|could not find/i,
    key: "notFound",
  },
]

export const resolveErrorKey = (error: unknown): ErrorMessageKey => {
  const raw = stripTechnicalPrefixes(extractMessage(error))

  if (!raw) return "generic"

  // A key handed over as it is: a server action answers with one, because a thrown
  // message does not survive a production build (`placeOrderOrReason`).
  if ((ERROR_MESSAGE_KEYS as readonly string[]).includes(raw)) {
    return raw as ErrorMessageKey
  }

  for (const { pattern, key } of RULES) {
    if (pattern.test(raw)) return key
  }

  return "generic"
}
