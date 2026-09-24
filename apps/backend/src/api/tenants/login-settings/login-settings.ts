/**
 * How a shop's buyers are allowed to sign in (o25-login-methods): email and
 * password, Yandex ID, or both. Lives in `tenant.metadata.buyer_login_method`,
 * the same convention `branding`/`seo_verification`/`analytics` already use
 * (`api/tenants/branding/branding.ts`) rather than a new model+migration — one
 * scalar, no merge-by-field needed because there is only the one field.
 *
 * The setting alone never turns Yandex ID on: the provider is registered
 * platform-wide only when `YANDEX_CLIENT_ID` is set
 * (`medusa-config.ts`, `modules/auth-yandex`), one process serving every shop.
 * `platformHasYandexKeys` is what the panel and the storefront both read to
 * tell "this shop chose Yandex" from "Yandex is actually reachable here".
 *
 * A method is always exactly one of the three values below, so "zero methods
 * enabled" cannot be represented — the panel offers a choice, never a set of
 * checkboxes that could end up all unchecked.
 */
export type BuyerLoginMethod = "email" | "yandex" | "both";

export const BUYER_LOGIN_METHODS: readonly BuyerLoginMethod[] = ["email", "yandex", "both"];

/**
 * No explicit choice saved yet (every shop before this feature, and every new
 * shop until its owner picks something) reads as `"both"`. That is today's
 * behaviour exactly: email and password already worked for every shop, and
 * Yandex ID worked wherever the platform had keys — `"both"` combined with
 * `platformHasYandexKeys()` reproduces both halves without a migration
 * backfilling a value onto every existing tenant row.
 */
const DEFAULT_BUYER_LOGIN_METHOD: BuyerLoginMethod = "both";

const isBuyerLoginMethod = (value: unknown): value is BuyerLoginMethod =>
  typeof value === "string" && (BUYER_LOGIN_METHODS as readonly string[]).includes(value);

/** `tenant.metadata.buyer_login_method` as stored, defensively read (rule 20: a malformed value falls back rather than throws). */
export const readBuyerLoginMethod = (
  metadata: Record<string, unknown> | null | undefined,
): BuyerLoginMethod => {
  const raw = metadata?.buyer_login_method;
  return isBuyerLoginMethod(raw) ? raw : DEFAULT_BUYER_LOGIN_METHOD;
};

export const allowsEmailLogin = (method: BuyerLoginMethod): boolean =>
  method === "email" || method === "both";

export const allowsYandexLogin = (method: BuyerLoginMethod): boolean =>
  method === "yandex" || method === "both";

/** Whether the DEPLOYMENT has Yandex ID keys at all — independent of any one shop's choice. */
export const platformHasYandexKeys = (): boolean => Boolean(process.env.YANDEX_CLIENT_ID);

/** The wire shape both `/tenants/login-settings` and `/storefront/by-host` answer with. */
export const loginSettingsResponse = (method: BuyerLoginMethod) => ({
  method,
  yandex_platform_available: platformHasYandexKeys(),
});

export type TenantLoginSettingsResponse = ReturnType<typeof loginSettingsResponse>;
