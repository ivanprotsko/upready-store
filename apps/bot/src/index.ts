/**
 * index.ts — процесс бота: длинный опрос Telegram, маршрутизация апдейта,
 * ответ ядром из `message.ts`.
 *
 * Запуск:  node --env-file-if-exists=.env src/index.ts > run.log 2>&1
 * Токен:   TELEGRAM_UPREADY_STORE_BOT (файл .env, в git не уезжает)
 * Ссылки:  TRIBUTE_URL_PLAN_<1|2|3>_<RU_MIR|VISA_MC> — см. payments.ts
 */

import { log } from "./log.ts";
import { buildReply } from "./message.ts";
import { PLANS, METHOD_ORDER, METHOD_LABELS } from "./plans.ts";
import { envNameFor, isResolved, linkFor, readPaymentLinks } from "./payments.ts";
import {
  answerCallbackQuery,
  getMe,
  getUpdates,
  sendMessage,
  TelegramError,
  type TelegramUpdate,
} from "./telegram.ts";
import { routeUpdate } from "./route.ts";

const POLL_TIMEOUT_SECONDS = 25;

function requireToken(): string {
  const token = process.env["TELEGRAM_UPREADY_STORE_BOT"];
  if (token === undefined || token.trim() === "") {
    log("error", "token.missing", {
      hint: "переменная TELEGRAM_UPREADY_STORE_BOT не задана; положите её в apps/bot/.env",
    });
    process.exit(1);
  }
  return token.trim();
}

/**
 * Состояние платёжных ссылок пишется в лог ПРИ СТАРТЕ, а не только когда
 * придёт первый человек: дырка должна быть видна оператору до того, как в неё
 * кто-то упадёт.
 */
function reportLinks(links: ReturnType<typeof readPaymentLinks>): void {
  for (const plan of PLANS) {
    for (const method of METHOD_ORDER) {
      const link = linkFor(links, plan, method);
      if (isResolved(link)) {
        log("info", "payment.link.ready", {
          plan: plan.name,
          payload: plan.payload,
          method,
          env: envNameFor(plan, method),
        });
        continue;
      }
      log(plan.free && link.gap === "unset" ? "info" : "warn", "payment.link.missing", {
        plan: plan.name,
        payload: plan.payload,
        method,
        button: METHOD_LABELS[method],
        env: envNameFor(plan, method),
        gap: link.gap,
        effect: plan.free
          ? "бесплатный тариф: кнопки оплаты нет по замыслу"
          : "кнопка НЕ рисуется, сообщение говорит, что ссылку подключают",
      });
    }
  }
}

async function handle(token: string, update: TelegramUpdate): Promise<void> {
  const action = routeUpdate(update);
  if (action.kind === "ignore") {
    log("info", "update.ignored", { update_id: update.update_id, reason: action.reason });
    return;
  }

  const { message, warnings } = buildReply(action.payload, readPaymentLinks(process.env));
  for (const warning of warnings) {
    log(warning.level, "payment.link.missing.onSend", { ...warning, chat_id: action.chatId });
  }

  // Целиком — это и есть захват исходящего payload'а живого прогона.
  log("info", "sendMessage.request", {
    update_id: update.update_id,
    chat_id: action.chatId,
    payload: action.payload,
    source: action.source,
    body: { chat_id: action.chatId, ...message },
  });

  const sent = await sendMessage(token, action.chatId, message);
  log("info", "sendMessage.ok", {
    update_id: update.update_id,
    chat_id: action.chatId,
    message_id: sent.message_id,
  });

  if (action.callbackQueryId !== undefined) {
    await answerCallbackQuery(token, action.callbackQueryId);
  }
}

async function main(): Promise<void> {
  const token = requireToken();
  const me = await getMe(token);
  log("info", "bot.start", { id: me.id, username: me.username, first_name: me.first_name });
  reportLinks(readPaymentLinks(process.env));

  const controller = new AbortController();
  let running = true;
  const stop = (signal: string) => {
    running = false;
    controller.abort();
    log("info", "bot.stop", { signal });
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  let offset = 0;
  while (running) {
    let updates: TelegramUpdate[];
    try {
      updates = await getUpdates(token, offset, POLL_TIMEOUT_SECONDS, controller.signal);
    } catch (error) {
      if (!running) break;
      // Сеть моргнула или Telegram ответил ошибкой: это не повод падать, но и
      // не повод молчать.
      log("error", "getUpdates.failed", {
        error: error instanceof TelegramError ? error.message : String(error),
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }

    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1);
      try {
        await handle(token, update);
      } catch (error) {
        log("error", "handle.failed", {
          update_id: update.update_id,
          error: error instanceof TelegramError ? error.message : String(error),
        });
      }
    }
  }
  log("info", "bot.exit", {});
}

await main();
