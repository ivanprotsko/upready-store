/**
 * index.ts — процесс бота: длинный опрос Telegram, маршрутизация апдейта,
 * ответ ядром из `message.ts`.
 *
 * Запуск:  node --env-file-if-exists=.env src/index.ts > run.log 2>&1
 * Токен:   TELEGRAM_UPREADY_STORE_BOT (файл .env, в git не уезжает)
 * Ссылки:  TRIBUTE_URL_PLAN_<1|2|3>_<RU_MIR|VISA_MC> — см. payments.ts
 * Привязка магазина: UPREADY_BACKEND_URL + TELEGRAM_LINK_SECRET — см. link.ts
 */

import { log } from "./log.ts";
import { buildReply, escapeHtml } from "./message.ts";
import { isLinkPayload, readLinkConfig, redeemLinkCode } from "./link.ts";
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

  // Привязка чата к магазину (t08-order-notifications). Отдельная ветка до
  // тарифного ядра: это другой payload и другой собеседник — владелец магазина,
  // который уже всё оплатил, а не покупатель тарифа.
  if (isLinkPayload(action.payload)) {
    await handleLink(token, update, action.chatId, action.payload.trim());
    if (action.callbackQueryId !== undefined) {
      await answerCallbackQuery(token, action.callbackQueryId);
    }
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

/**
 * Код из `/start lk_…` уходит на бэкенд, ответ печатается владельцу как есть.
 * Ненастроенная привязка — это дырка оператора, и она видна в логе И в чате:
 * человек, нажавший кнопку в панели, обязан получить ответ (правило 20a).
 */
async function handleLink(
  token: string,
  update: TelegramUpdate,
  chatId: number,
  code: string,
): Promise<void> {
  const config = readLinkConfig(process.env);
  const chat = update.message?.chat ?? update.callback_query?.message?.chat;
  const from = update.message?.from ?? update.callback_query?.from;

  if (config === null || chat === undefined) {
    log("error", "link.unconfigured", {
      update_id: update.update_id,
      chat_id: chatId,
      hint: "нужны UPREADY_BACKEND_URL и TELEGRAM_LINK_SECRET, те же значения, что у бэкенда",
      has_chat: chat !== undefined,
    });
    await sendMessage(token, chatId, {
      text: "Привязка магазина на этом боте пока не настроена. Напишите в поддержку.",
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return;
  }

  const outcome = await redeemLinkCode(config, code, chat, from);
  log(outcome.status === "linked" ? "info" : "warn", "link.outcome", {
    update_id: update.update_id,
    chat_id: chatId,
    status: outcome.status,
  });

  const sent = await sendMessage(token, chatId, {
    text: escapeHtml(outcome.text),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  log("info", "link.reply.ok", { chat_id: chatId, message_id: sent.message_id });
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
