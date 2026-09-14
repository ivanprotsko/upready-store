/**
 * payments.ts — ЕДИНСТВЕННОЕ место, где бот знает платёжные адреса.
 *
 * Tribute ещё не подключён: боевые ссылки Иван пришлёт позже, и до тех пор
 * переменных в окружении нет. Незаданный адрес — это ОТСУТСТВИЕ, а не рабочая
 * ссылка (правило 20a): кнопка с пустым или мусорным URL не рисуется никогда,
 * вместо неё сообщение честно говорит, что ссылку подключают, а дырка уходит
 * в лог оператора.
 *
 * Имена переменных строятся из НОМЕРА карточки (он же payload диплинка) и
 * способа оплаты:
 *
 *   TRIBUTE_URL_PLAN_1_RU_MIR    TRIBUTE_URL_PLAN_1_VISA_MC
 *   TRIBUTE_URL_PLAN_2_RU_MIR    TRIBUTE_URL_PLAN_2_VISA_MC
 *   TRIBUTE_URL_PLAN_3_RU_MIR    TRIBUTE_URL_PLAN_3_VISA_MC
 */

import { PLANS, type PaymentMethod, type Plan } from "./plans.ts";

/** Почему ссылки нет: переменная не задана либо задана не URL'ом. */
export type LinkGap = "unset" | "invalid";

export type PaymentLink = { readonly url: string } | { readonly gap: LinkGap };

/** Адреса всех планов: номер карточки → способ оплаты → ссылка или дырка. */
export type PaymentLinks = ReadonlyMap<number, ReadonlyMap<PaymentMethod, PaymentLink>>;

export function envNameFor(plan: Plan, method: PaymentMethod): string {
  return `TRIBUTE_URL_PLAN_${plan.number}_${method.toUpperCase()}`;
}

/**
 * Ссылка считается рабочей, только если это http(s)-адрес.
 * Пустая строка и пробелы значением не являются; всё прочее — `invalid`,
 * и это ГРОМКАЯ дырка: она означает опечатку в окружении, а не «ещё не завезли».
 */
export function readLink(raw: string | undefined): PaymentLink {
  if (raw === undefined || raw.trim() === "") return { gap: "unset" };
  const value = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { gap: "invalid" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { gap: "invalid" };
  return { url: value };
}

export function isResolved(link: PaymentLink): link is { readonly url: string } {
  return "url" in link;
}

/** Собирает все адреса из переданного окружения. Чистая функция — тестируется как есть. */
export function readPaymentLinks(env: Record<string, string | undefined>): PaymentLinks {
  const byPlan = new Map<number, ReadonlyMap<PaymentMethod, PaymentLink>>();
  for (const plan of PLANS) {
    const byMethod = new Map<PaymentMethod, PaymentLink>();
    for (const method of ["ru_mir", "visa_mc"] as const) {
      byMethod.set(method, readLink(env[envNameFor(plan, method)]));
    }
    byPlan.set(plan.number, byMethod);
  }
  return byPlan;
}

export function linkFor(links: PaymentLinks, plan: Plan, method: PaymentMethod): PaymentLink {
  return links.get(plan.number)?.get(method) ?? { gap: "unset" };
}
