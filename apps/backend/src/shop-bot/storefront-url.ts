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

/** The one call of Medusa's Query the reader below makes, typed by hand. */
export type ShopQuery = {
  graph: (args: {
    entity: string;
    fields: string[];
    filters: Record<string, unknown>;
  }) => Promise<{ data: unknown[] }>;
};

/**
 * The shop's Mini App address and the bot's language, read off the tenant: its
 * default locale and its primary domain. «Подключить бота» sets the chat's menu
 * button to this address (`api/tenants/telegram-bot/webhook/route.ts`), and
 * `GET /store/telegram-mini-app` reports it, so the two read it in one place.
 */
export const shopMiniAppEntry = async (
  query: ShopQuery,
  handle: string,
): Promise<{ url: string; locale: ShopBotLocale }> => {
  const {
    data: [shop],
  } = await query.graph({
    entity: "tenant",
    fields: ["handle", "locale_settings.default_locale", "domains.host", "domains.is_primary"],
    filters: { handle },
  });
  const raw = shop as
    | {
        locale_settings?: { default_locale?: string | null } | null;
        domains?: Array<{ host?: string | null; is_primary?: boolean | null }> | null;
      }
    | undefined;
  const locale = normalizeLocale(raw?.locale_settings?.default_locale);
  const primaryDomain = raw?.domains?.find((domain) => domain.is_primary && domain.host)?.host ?? null;
  return { url: shopBotStorefrontUrl({ handle, primaryDomain, locale }), locale };
};
