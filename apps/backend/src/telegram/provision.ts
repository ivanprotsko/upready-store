/**
 * Provisioning a store's Telegram Mini App on the owner's own bot: every step is
 * a Bot API call, every step is timed, and the result is what the admin route
 * persists and the measurement script prints.
 *
 * What CANNOT be done here: creating the bot. Bots come only from BotFather
 * (https://core.telegram.org/bots/features#botfather, "/newbot"), so the owner
 * creates the bot once and pastes its token; from that moment on nothing is
 * manual. The Main Mini App link and a direct-link app are BotFather settings
 * too — optional, because the menu button set below already launches the shop.
 */

import { createBotApi, type BotApi, type BotCommand } from "./bot-api";
import { MedusaError } from "@medusajs/framework/utils";
import { botChatUrl, mainMiniAppUrl, menuButtonFor } from "./mini-app";

export type BotProfile = {
  name?: string;
  shortDescription?: string;
  description?: string;
  commands?: BotCommand[];
};

export type ProvisionInput = {
  token: string;
  /** `https://<host>[/<base path>]` — the entry becomes `<storefrontUrl>/mini`. */
  storefrontUrl: string;
  /** Text on the menu button in the bot chat. */
  buttonText: string;
  profile?: BotProfile;
  /** Test seam; defaults to a client on `TELEGRAM_API_BASE_URL`. */
  api?: BotApi;
};

export type ProvisionStep = { name: string; ms: number; skipped?: true };

export type ProvisionResult = {
  bot: { id: number; username: string; name: string };
  launch: {
    chatUrl: string;
    /** Works once the Main Mini App is enabled in BotFather; the menu button works before that. */
    mainMiniAppUrl: string;
    menuButton: { text: string; url: string };
  };
  steps: ProvisionStep[];
  totalMs: number;
};

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}

export async function provisionMiniApp(input: ProvisionInput): Promise<ProvisionResult> {
  const api = input.api ?? createBotApi({ token: input.token });
  const steps: ProvisionStep[] = [];
  const started = performance.now();

  const me = await api.getMe();
  steps.push({ name: "getMe", ms: me.ms });
  if (!me.result.username) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "The bot has no username; Telegram gives every bot one at creation");
  }

  const menuButton = menuButtonFor({ storefrontUrl: input.storefrontUrl, text: input.buttonText });
  const set = await api.setChatMenuButton(menuButton);
  steps.push({ name: "setChatMenuButton", ms: set.ms });

  const profile = input.profile ?? {};
  // Name and descriptions are written only when they differ: a repeated identical
  // write is a wasted round trip, and re-running provisioning must stay cheap.
  if (profile.name !== undefined) {
    const current = await api.getMyName();
    steps.push({ name: "getMyName", ms: current.ms });
    if (current.result.name !== profile.name) {
      const r = await api.setMyName(profile.name);
      steps.push({ name: "setMyName", ms: r.ms });
    } else {
      steps.push({ name: "setMyName", ms: 0, skipped: true });
    }
  }
  if (profile.shortDescription !== undefined) {
    const current = await api.getMyShortDescription();
    steps.push({ name: "getMyShortDescription", ms: current.ms });
    if (current.result.short_description !== profile.shortDescription) {
      const r = await api.setMyShortDescription(profile.shortDescription);
      steps.push({ name: "setMyShortDescription", ms: r.ms });
    } else {
      steps.push({ name: "setMyShortDescription", ms: 0, skipped: true });
    }
  }
  if (profile.description !== undefined) {
    const current = await api.getMyDescription();
    steps.push({ name: "getMyDescription", ms: current.ms });
    if (current.result.description !== profile.description) {
      const r = await api.setMyDescription(profile.description);
      steps.push({ name: "setMyDescription", ms: r.ms });
    } else {
      steps.push({ name: "setMyDescription", ms: 0, skipped: true });
    }
  }
  if (profile.commands !== undefined) {
    const r = await api.setMyCommands(profile.commands);
    steps.push({ name: "setMyCommands", ms: r.ms });
  }

  const username = me.result.username;
  return {
    bot: { id: me.result.id, username, name: me.result.first_name },
    launch: {
      chatUrl: botChatUrl(username),
      mainMiniAppUrl: mainMiniAppUrl(username),
      menuButton: { text: menuButton.type === "web_app" ? menuButton.text : "", url: menuButton.type === "web_app" ? menuButton.web_app.url : "" },
    },
    steps,
    totalMs: round(performance.now() - started),
  };
}

/** Puts the bot's menu button back to Telegram's default; the bot itself stays. */
export async function resetMiniApp(input: { token: string; api?: BotApi }): Promise<ProvisionStep> {
  const api = input.api ?? createBotApi({ token: input.token });
  const r = await api.setChatMenuButton({ type: "default" });
  return { name: "setChatMenuButton:default", ms: r.ms };
}
