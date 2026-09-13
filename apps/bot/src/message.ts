/**
 * message.ts — чистое ядро бота: payload → ровно то сообщение, которое уйдёт
 * в Telegram. Ни сети, ни окружения, ни времени: на вход payload и уже
 * прочитанные адреса, на выход — тело `sendMessage` и список дырок для лога
 * оператора. Поэтому оно и проверяется юнит-тестом дословно.
 */

import {
  METHOD_LABELS,
  METHOD_ORDER,
  PLANS,
  planByPayload,
  type PaymentMethod,
  type Plan,
} from "./plans.ts";
import { isResolved, linkFor, envNameFor, type LinkGap, type PaymentLinks } from "./payments.ts";

export interface InlineButton {
  readonly text: string;
  readonly url?: string;
  readonly callback_data?: string;
}

export interface OutgoingMessage {
  readonly text: string;
  readonly parse_mode: "HTML";
  readonly disable_web_page_preview: true;
  readonly reply_markup?: { readonly inline_keyboard: readonly (readonly InlineButton[])[] };
}

/**
 * Дырка в платёжных адресах, какой её увидит оператор.
 * `level: "info"` — у бесплатного тарифа платить нечего, отсутствие ссылки
 * там ожидаемо; `warn` — платный тариф без ссылки либо мусор в переменной.
 */
export interface LinkWarning {
  readonly level: "warn" | "info";
  readonly plan: string;
  readonly payload: string;
  readonly method: PaymentMethod;
  readonly env: string;
  readonly gap: LinkGap;
}

export interface BuildResult {
  readonly message: OutgoingMessage;
  readonly warnings: readonly LinkWarning[];
}

const GREETING = "Здравствуйте! Это бот upready.dev — здесь оформляется подписка на магазин.";

/** Telegram разбирает HTML, поэтому три символа в тексте экранируются всегда. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function priceLines(plan: Plan): string[] {
  const lines = [`<b>${escapeHtml(plan.name)}</b> — ${escapeHtml(plan.priceAnnual)}.`];
  if (plan.priceMonthly !== plan.priceAnnual) {
    lines.push(escapeHtml(`Помесячно — ${plan.priceMonthly}.`));
  }
  if (plan.trial !== null) {
    lines.push(escapeHtml(`${plan.trial.lead}: ${plan.trial.terms}.`));
  }
  return lines;
}

function includesBlock(plan: Plan): string {
  return ["Что входит:", ...plan.includes.map((item) => `• ${escapeHtml(item)}`)].join("\n");
}

/** Сообщение по выбранному тарифу — одно на весь сценарий. */
export function buildPlanMessage(plan: Plan, links: PaymentLinks): BuildResult {
  const warnings: LinkWarning[] = [];
  const buttons: InlineButton[][] = [];
  const pending: string[] = [];

  for (const method of METHOD_ORDER) {
    const link = linkFor(links, plan, method);
    if (isResolved(link)) {
      buttons.push([{ text: METHOD_LABELS[method], url: link.url }]);
      continue;
    }
    pending.push(METHOD_LABELS[method]);
    warnings.push({
      level: plan.free && link.gap === "unset" ? "info" : "warn",
      plan: plan.name,
      payload: plan.payload,
      method,
      env: envNameFor(plan, method),
      gap: link.gap,
    });
  }

  const blocks = [GREETING, priceLines(plan).join("\n"), includesBlock(plan)];

  if (buttons.length > 0) {
    blocks.push(
      pending.length === 0
        ? "Выберите способ оплаты:"
        : `Выберите способ оплаты. Способ «${escapeHtml(pending.join("», «"))}» пока подключаем — ссылка появится здесь в ближайшее время.`,
    );
  } else if (plan.free) {
    // Платить нечего: у бесплатного тарифа отсутствие платёжной ссылки — это
    // не дырка, а свойство тарифа.
    blocks.push(
      "Этот тариф бесплатный — оплачивать нечего. Магазин создаётся сразу: на upready.dev нажмите «Создать магазин».",
    );
  } else {
    blocks.push(
      "Оплату сейчас подключаем: платёжные ссылки появятся здесь в ближайшее время. Напишите /start, чтобы проверить снова.",
    );
  }

  const message: OutgoingMessage = {
    text: blocks.join("\n\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons.length > 0 ? { reply_markup: { inline_keyboard: buttons } } : {}),
  };
  return { message, warnings };
}

/** `/start` без payload и любой нераспознанный payload — выбор тарифа. */
export function buildMenuMessage(): BuildResult {
  const list = PLANS.map((plan) => `• ${escapeHtml(`${plan.name} — ${plan.priceAnnual}`)}`);
  const message: OutgoingMessage = {
    text: [
      GREETING,
      ["Тарифы:", ...list].join("\n"),
      "Выберите тариф — расскажу, что входит, и открою оплату.",
    ].join("\n\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [PLANS.map((plan) => ({ text: plan.name, callback_data: plan.payload }))],
    },
  };
  return { message, warnings: [] };
}

/**
 * Единственная точка входа ядра: текст payload'а (может быть пустым) → ответ.
 * Неизвестный payload ведёт в меню, а не в первый тариф (правило 20a).
 */
export function buildReply(payload: string, links: PaymentLinks): BuildResult {
  const plan = planByPayload(payload.trim());
  return plan === null ? buildMenuMessage() : buildPlanMessage(plan, links);
}
