/**
 * Pure helpers for a store's Telegram Mini App: launch URLs and the menu
 * button. No I/O, so the onboarding wizard, the admin route and the tests share
 * one truth.
 *
 * A Mini App is nothing more than a bot plus an HTTPS URL
 * (https://core.telegram.org/bots/api#webappinfo: "An HTTPS URL of the Web App
 * to be opened when the button is pressed"). The surfaces that launch it
 * (https://core.telegram.org/bots/webapps):
 *   - the menu button of the bot chat — set through Bot API `setChatMenuButton`,
 *     no BotFather step ("Launching Mini Apps from the Menu Button");
 *   - the main Mini App link `https://t.me/<bot>?startapp=<param>` — enabled once
 *     per bot in BotFather: /mybots > Bot Settings > Configure Mini App > Enable
 *     Mini App ("Launching the Main Mini App");
 *   - a direct link `https://t.me/<bot>/<app>?startapp=<param>` — an app created
 *     in BotFather ("Direct Link Mini Apps").
 * `startapp` reaches the page "in the start_param field and in the GET parameter
 * tgWebAppStartParam".
 */

import type { MenuButton } from "./bot-api";
import { MedusaError } from "@medusajs/framework/utils";

/** Our own constraint for a start parameter: a store handle or `product_<handle>`. */
export const START_PARAM_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * https://core.telegram.org/bots/features#botfather: "Usernames are 5-32
 * characters long and not case sensitive – but may only include Latin
 * characters, numbers, and underscores. Your bot's username must end in 'bot'".
 */
export const BOT_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{1,28}bot$/i;

export function isValidStartParam(value: string): boolean {
  return START_PARAM_RE.test(value);
}

export function isValidBotUsername(value: string): boolean {
  return BOT_USERNAME_RE.test(value);
}

function username(bot: string): string {
  const clean = bot.replace(/^@/, "");
  if (!isValidBotUsername(clean)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Not a Telegram bot username: ${bot}`);
  }
  return clean;
}

/** The chat with the bot; its menu button opens the Mini App. */
export function botChatUrl(bot: string): string {
  return `https://t.me/${username(bot)}`;
}

/** `https://t.me/<bot>?startapp[=<param>]` — needs the Main Mini App enabled in BotFather. */
export function mainMiniAppUrl(bot: string, startParam?: string): string {
  const base = `https://t.me/${username(bot)}?startapp`;
  if (startParam === undefined || startParam === "") return base;
  if (!isValidStartParam(startParam)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Not a valid startapp parameter: ${startParam}`);
  }
  return `${base}=${startParam}`;
}

/** `https://t.me/<bot>/<app>?startapp[=<param>]` — an app created in BotFather. */
export function directLinkUrl(bot: string, appShortName: string, startParam?: string): string {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(appShortName)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Not a valid Mini App short name: ${appShortName}`);
  }
  const base = `https://t.me/${username(bot)}/${appShortName}`;
  if (startParam === undefined || startParam === "") return base;
  if (!isValidStartParam(startParam)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Not a valid startapp parameter: ${startParam}`);
  }
  return `${base}?startapp=${startParam}`;
}

/**
 * The launch link every store gets at creation, with no per-store Telegram step:
 * ONE platform bot with its Main Mini App enabled once, the store handle as the
 * start parameter. The platform Mini App page reads `tgWebAppStartParam` and
 * sends the visitor to `https://<handle>.<base>/mini`.
 */
export function platformLaunchUrl(input: { platformBot: string; storeHandle: string }): string {
  return mainMiniAppUrl(input.platformBot, input.storeHandle);
}

/** `https://<storefront>/mini` — the storefront's Mini App entry route. */
export function miniAppEntryUrl(storefrontUrl: string): string {
  const url = assertHttpsUrl(storefrontUrl);
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}/mini`;
}

export function assertHttpsUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Not a URL: ${value}`);
  }
  if (url.protocol !== "https:") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Telegram opens only HTTPS URLs, got ${url.protocol}//${url.host}`);
  }
  return url;
}

/** The `web_app` menu button pointing at the storefront's Mini App entry. */
export function menuButtonFor(input: { storefrontUrl: string; text: string }): MenuButton {
  const text = input.text.trim();
  if (!text) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Menu button text is empty");
  return { type: "web_app", text, web_app: { url: miniAppEntryUrl(input.storefrontUrl) } };
}
