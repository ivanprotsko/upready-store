import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";

import { TelegramBotApiError } from "../../../telegram/bot-api";
import { provisionMiniApp, resetMiniApp, type BotProfile } from "../../../telegram/provision";
import { readStoreRecord, toPublic, writeStoreRecord } from "../../../telegram/store-record";

/**
 * `GET`/`POST`/`DELETE /admin/telegram-mini-app` — the store's Telegram Mini App
 * on the owner's own bot. Admin-authenticated like every `/admin/*` route.
 *
 * POST body: `{ bot_token, storefront_url?, button_text?, name?,
 * short_description?, description?, commands? }`. The owner creates the bot in
 * BotFather (the one step Telegram keeps manual) and pastes the token; this
 * route does everything else in a few Bot API calls and answers with the launch
 * links and the timing of every step. Re-running is safe: identical profile
 * fields are skipped, the menu button is simply set again.
 */

type PostBody = {
  bot_token?: unknown;
  storefront_url?: unknown;
  button_text?: unknown;
  name?: unknown;
  short_description?: unknown;
  description?: unknown;
  commands?: unknown;
};

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new MedusaError(MedusaError.Types.INVALID_DATA, `${field} must be a string`);
  return value;
}

function parseBody(body: PostBody) {
  const token = optionalString(body.bot_token, "bot_token")?.trim();
  if (!token || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "bot_token must look like <bot id>:<secret>, as BotFather prints it");
  }
  const storefrontUrl =
    optionalString(body.storefront_url, "storefront_url")?.trim() || process.env.STOREFRONT_URL || "";
  if (!storefrontUrl) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "storefront_url is required when STOREFRONT_URL is not configured");
  }
  const profile: BotProfile = {
    name: optionalString(body.name, "name"),
    shortDescription: optionalString(body.short_description, "short_description"),
    description: optionalString(body.description, "description"),
  };
  if (body.commands !== undefined) {
    if (!Array.isArray(body.commands)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "commands must be an array");
    profile.commands = body.commands.map((c: { command?: unknown; description?: unknown }) => {
      if (typeof c?.command !== "string" || typeof c?.description !== "string") {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "each command needs string command and description");
      }
      return { command: c.command, description: c.description };
    });
  }
  return {
    token,
    storefrontUrl,
    buttonText: optionalString(body.button_text, "button_text")?.trim() || "",
    profile,
  };
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { record } = await readStoreRecord(req);
  res.status(200).json({ mini_app: record ? toPublic(record) : null });
}

export async function POST(req: MedusaRequest<PostBody>, res: MedusaResponse) {
  let input: ReturnType<typeof parseBody>;
  try {
    input = parseBody(req.body ?? {});
  } catch (error) {
    res.status(400).json({ error: "invalid_body", message: (error as Error).message });
    return;
  }

  const { store } = await readStoreRecord(req);
  const buttonText = input.buttonText || store?.name || "Shop";

  try {
    const result = await provisionMiniApp({
      token: input.token,
      storefrontUrl: input.storefrontUrl,
      buttonText,
      profile: input.profile,
    });
    const record = {
      botId: result.bot.id,
      botUsername: result.bot.username,
      botName: result.bot.name,
      botToken: input.token,
      storefrontUrl: input.storefrontUrl,
      launch: result.launch,
      provisionedAt: new Date().toISOString(),
      steps: result.steps,
      totalMs: result.totalMs,
    };
    await writeStoreRecord(req, record);
    res.status(200).json({ mini_app: toPublic(record) });
  } catch (error) {
    if (error instanceof TelegramBotApiError) {
      // Telegram's own verdict, with the method that failed: a wrong token dies at
      // getMe with 401, an http URL at setChatMenuButton with 400.
      res.status(error.errorCode === 401 ? 401 : 502).json({
        error: "telegram",
        method: error.method,
        telegram_error_code: error.errorCode,
        message: error.description,
        ms: error.ms,
      });
      return;
    }
    res.status(400).json({ error: "invalid_input", message: (error as Error).message });
  }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { record } = await readStoreRecord(req);
  if (!record) {
    res.status(404).json({ error: "not_found", message: "No Mini App is provisioned" });
    return;
  }
  let reset: { name: string; ms: number } | null = null;
  try {
    reset = await resetMiniApp({ token: record.botToken });
  } catch (error) {
    if (!(error instanceof TelegramBotApiError)) throw error;
    // A revoked token cannot reset what it can no longer reach; the record still goes.
    reset = { name: `${error.method}:failed:${error.errorCode}`, ms: error.ms };
  }
  await writeStoreRecord(req, null);
  res.status(200).json({ removed: true, reset });
}
