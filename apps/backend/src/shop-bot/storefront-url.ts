import { shopOrigin } from "../tenant-notifications/storefront-origin";
import type { ShopBotLocale } from "./types";

/** The shop bot speaks Russian unless the shop's default locale is English. */
export const normalizeLocale = (locale: string | null | undefined): ShopBotLocale =>
  locale?.toLowerCase().startsWith("en") ? "en" : "ru";

/**
 * The address the bot opens as the shop's Mini App: the `web_app` button of
 * the `/start` greeting and the chat's menu button (t-2026-10-14-11) both use
 * this one builder, so the two can never point at different places.
 */
export const shopBotStorefrontUrl = (input: {
  handle: string;
  primaryDomain?: string | null;
  locale: ShopBotLocale;
}): string => `${shopOrigin({ handle: input.handle, primaryDomain: input.primaryDomain })}/${input.locale}`;
