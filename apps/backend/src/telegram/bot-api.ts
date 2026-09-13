/**
 * Minimal Telegram Bot API client: only the methods the Mini App provisioning
 * needs, every call timed. No SDK on purpose — the surface is a handful of
 * POSTs, and a dependency would touch pnpm-lock.yaml for shop owners who never
 * enable Telegram.
 *
 * Reference: https://core.telegram.org/bots/api (Bot API 10.3, 2026-08-24).
 * `TELEGRAM_API_BASE_URL` overrides https://api.telegram.org so the whole flow
 * can run against a mock server without a bot token (see
 * artifacts/docs/2026-09-13-telegram-miniapp/mock-bot-api.mjs).
 */

export const DEFAULT_BOT_API_BASE_URL = "https://api.telegram.org";

export type BotApiResult<T> = { ok: true; result: T; ms: number };

/** Telegram's own `{ ok: false, error_code, description }`, or a transport failure (`errorCode` 0). */
export class TelegramBotApiError extends Error {
  readonly method: string;
  readonly errorCode: number;
  readonly description: string;
  readonly ms: number;

  constructor(method: string, errorCode: number, description: string, ms: number) {
    super(`Telegram ${method} failed: ${errorCode} ${description}`);
    this.name = "TelegramBotApiError";
    this.method = method;
    this.errorCode = errorCode;
    this.description = description;
    this.ms = ms;
  }
}

export type BotUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export type MenuButton =
  | { type: "commands" }
  | { type: "default" }
  | { type: "web_app"; text: string; web_app: { url: string } };

export type BotCommand = { command: string; description: string };

export type BotApiOptions = {
  token: string;
  /** Defaults to `TELEGRAM_API_BASE_URL` or https://api.telegram.org. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function botApiBaseUrl(): string {
  return (process.env.TELEGRAM_API_BASE_URL || DEFAULT_BOT_API_BASE_URL).replace(/\/+$/, "");
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}

export function createBotApi(options: BotApiOptions) {
  const base = (options.baseUrl ?? botApiBaseUrl()).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function call<T>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<BotApiResult<T>> {
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let payload: { ok: boolean; result?: T; error_code?: number; description?: string };
    try {
      // The token travels only in the URL, never in a log line or an error.
      const response = await fetchImpl(`${base}/bot${options.token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal,
      });
      payload = (await response.json()) as typeof payload;
    } catch (error) {
      const description = error instanceof Error ? error.message : String(error);
      throw new TelegramBotApiError(method, 0, description, round(performance.now() - started));
    } finally {
      clearTimeout(timer);
    }
    const ms = round(performance.now() - started);
    if (!payload.ok) {
      throw new TelegramBotApiError(
        method,
        payload.error_code ?? 0,
        payload.description ?? "unknown error",
        ms
      );
    }
    return { ok: true, result: payload.result as T, ms };
  }

  return {
    call,
    getMe: () => call<BotUser>("getMe"),
    getChatMenuButton: () => call<MenuButton>("getChatMenuButton"),
    setChatMenuButton: (menu_button: MenuButton) =>
      call<true>("setChatMenuButton", { menu_button }),
    getMyName: () => call<{ name: string }>("getMyName"),
    setMyName: (name: string) => call<true>("setMyName", { name }),
    getMyShortDescription: () =>
      call<{ short_description: string }>("getMyShortDescription"),
    setMyShortDescription: (short_description: string) =>
      call<true>("setMyShortDescription", { short_description }),
    getMyDescription: () => call<{ description: string }>("getMyDescription"),
    setMyDescription: (description: string) => call<true>("setMyDescription", { description }),
    setMyCommands: (commands: BotCommand[]) => call<true>("setMyCommands", { commands }),
  };
}

export type BotApi = ReturnType<typeof createBotApi>;
