#!/usr/bin/env node
/**
 * A mock of the Telegram Bot API surface the Mini App provisioning uses, so the
 * whole backend flow can run without a bot token. Answers like api.telegram.org
 * (https://core.telegram.org/bots/api): `{ ok: true, result }`, or
 * `{ ok: false, error_code, description }` for an unknown token.
 *
 *   node mock-bot-api.mjs [port]            # default 8099
 *   TELEGRAM_API_BASE_URL=http://127.0.0.1:8099  (backend .env)
 *
 * Accepted tokens: `<digits>:<secret>` where the secret starts with "mock".
 * Every call is appended to mock-bot-api.calls.jsonl next to this file.
 */
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] ?? 8099);
const journal = join(dirname(fileURLToPath(import.meta.url)), "mock-bot-api.calls.jsonl");
const bots = new Map();

function botFor(token) {
  const m = /^(\d+):(mock[A-Za-z0-9_-]*)$/.exec(token);
  if (!m) return null;
  if (!bots.has(token)) {
    bots.set(token, {
      me: { id: Number(m[1]), is_bot: true, first_name: `Mock bot ${m[1]}`, username: `mock${m[1]}_bot` },
      menu_button: { type: "default" },
      name: `Mock bot ${m[1]}`,
      short_description: "",
      description: "",
      commands: [],
    });
  }
  return bots.get(token);
}

function handle(bot, method, params) {
  switch (method) {
    case "getMe": return bot.me;
    case "getChatMenuButton": return bot.menu_button;
    case "setChatMenuButton":
      if (params.menu_button?.type === "web_app" && !/^https:\/\//.test(params.menu_button.web_app?.url ?? "")) {
        throw { error_code: 400, description: "Bad Request: WEB_APP_URL_INVALID" };
      }
      bot.menu_button = params.menu_button ?? { type: "default" }; return true;
    case "getMyName": return { name: bot.name };
    case "setMyName": bot.name = params.name ?? ""; bot.me.first_name = bot.name; return true;
    case "getMyShortDescription": return { short_description: bot.short_description };
    case "setMyShortDescription": bot.short_description = params.short_description ?? ""; return true;
    case "getMyDescription": return { description: bot.description };
    case "setMyDescription": bot.description = params.description ?? ""; return true;
    case "setMyCommands": bot.commands = params.commands ?? []; return true;
    default: throw { error_code: 404, description: "Not Found" };
  }
}

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const m = /^\/bot([^/]+)\/([A-Za-z]+)$/.exec(req.url ?? "");
    const send = (status, payload) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (!m) return send(404, { ok: false, error_code: 404, description: "Not Found" });
    const [, token, method] = m;
    let params = {};
    try { params = body ? JSON.parse(body) : {}; } catch { /* Telegram answers 400 here; irrelevant for the mock */ }
    const bot = botFor(token);
    appendFileSync(journal, JSON.stringify({ ts: new Date().toISOString(), method, params, authorized: !!bot }) + "\n");
    if (!bot) return send(401, { ok: false, error_code: 401, description: "Unauthorized" });
    try {
      send(200, { ok: true, result: handle(bot, method, params) });
    } catch (error) {
      send(error.error_code ?? 500, { ok: false, error_code: error.error_code ?? 500, description: error.description ?? String(error) });
    }
  });
}).listen(port, "127.0.0.1", () => console.log(`mock Bot API on http://127.0.0.1:${port}, journal ${journal}`));
