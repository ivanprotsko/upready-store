import type { ShopBotLocale } from "./types";

/**
 * The shop bot's ru/en text catalog (t-cherk-23). `router.ts` is the only
 * caller; everything else (medusa-shop.ts, the webhook route) never renders
 * user-facing text, so this is the one place translations live.
 *
 * Templates use `{var}` placeholders filled in by `t()`. No pluralization in
 * phase 1 — Russian cardinal plurals would need a real rule table, and
 * nothing here needs one yet.
 */

const ru = {
  start_greeting: "Добро пожаловать в {shopName}! Здесь каталог, корзина и быстрая связь с менеджером.",
  btn_open_shop: "Открыть магазин",
  btn_catalog: "Каталог",
  btn_cart: "Корзина",
  btn_orders: "Заказы",
  btn_all_products: "Все товары",
  btn_to_cart: "В корзину",
  btn_to_wishlist: "В избранное",
  btn_on_site: "На сайте",
  btn_back_to_catalog: "Назад к каталогу",
  btn_back: "Назад",
  btn_more: "Ещё",
  btn_checkout: "Оформить",
  btn_open: "Открыть",
  price_on_request: "Цена по запросу",
  added_to_cart: "Добавлено в корзину",
  added_to_wishlist: "Добавлено в избранное",
  catalog_title: "Каталог",
  catalog_empty: "В каталоге пока нет товаров.",
  cart_empty: "Корзина пуста",
  cart_line: "{title} ({variant}) × {qty} — {sum}",
  cart_line_no_variant: "{title} × {qty} — {sum}",
  cart_total: "Итого: {sum}",
  orders_empty: "Заказов пока нет",
  orders_line: "№{displayId} — {status} — {total} — {date}",
  manager_not_connected: "Менеджер пока не подключён",
  manager_usage: "Напишите /manager и свой вопрос, например: /manager когда доставка?",
  manager_forwarded:
    "Вопрос от {from} #u{chatId}:\n{text}\n\nОтветьте на это сообщение, чтобы ответить покупателю.",
  manager_question_sent: "Вопрос передан менеджеру, скоро ответим.",
  manager_reply_to_buyer: "Ответ менеджера:\n{text}",
  manager_reply_sent: "Отправлено покупателю.",
  manager_link_confirmed: "Готово, этот чат теперь получает вопросы покупателей.",
  manager_unknown_name: "Покупатель",
  product_not_found: "Товар не найден",
  help_intro: "Доступные команды:",
  unknown_command: "Не понимаю эту команду. Наберите /help, чтобы увидеть список.",
  callback_error: "Не получилось выполнить действие, попробуйте ещё раз",
  cmd_start_desc: "Открыть магазин",
  cmd_catalog_desc: "Каталог",
  cmd_cart_desc: "Корзина",
  cmd_orders_desc: "Мои заказы",
  cmd_manager_desc: "Написать менеджеру",
  cmd_help_desc: "Помощь",
} as const;

export type BotTextKey = keyof typeof ru;

// `en` must carry every `ru` key — the `Record<BotTextKey, string>`
// annotation makes a missing or misspelled key a compile error.
const en: Record<BotTextKey, string> = {
  start_greeting: "Welcome to {shopName}! Browse the catalog, build a cart, and reach the manager right here.",
  btn_open_shop: "Open shop",
  btn_catalog: "Catalog",
  btn_cart: "Cart",
  btn_orders: "Orders",
  btn_all_products: "All products",
  btn_to_cart: "Add to cart",
  btn_to_wishlist: "Add to wishlist",
  btn_on_site: "View on site",
  btn_back_to_catalog: "Back to catalog",
  btn_back: "Back",
  btn_more: "More",
  btn_checkout: "Checkout",
  btn_open: "Open",
  price_on_request: "Price on request",
  added_to_cart: "Added to cart",
  added_to_wishlist: "Added to wishlist",
  catalog_title: "Catalog",
  catalog_empty: "The catalog is empty for now.",
  cart_empty: "Your cart is empty",
  cart_line: "{title} ({variant}) × {qty} — {sum}",
  cart_line_no_variant: "{title} × {qty} — {sum}",
  cart_total: "Total: {sum}",
  orders_empty: "No orders yet",
  orders_line: "#{displayId} — {status} — {total} — {date}",
  manager_not_connected: "The manager is not connected yet",
  manager_usage: "Write /manager and your question, e.g.: /manager when will it ship?",
  manager_forwarded: "Question from {from} #u{chatId}:\n{text}\n\nReply to this message to answer the buyer.",
  manager_question_sent: "Your question was sent to the manager, we'll reply shortly.",
  manager_reply_to_buyer: "Manager's reply:\n{text}",
  manager_reply_sent: "Sent to the buyer.",
  manager_link_confirmed: "Done, this chat now receives buyer questions.",
  manager_unknown_name: "Customer",
  product_not_found: "Product not found",
  help_intro: "Available commands:",
  unknown_command: "Sorry, I didn't get that. Send /help to see the commands.",
  callback_error: "Something went wrong, please try again",
  cmd_start_desc: "Open the shop",
  cmd_catalog_desc: "Catalog",
  cmd_cart_desc: "Cart",
  cmd_orders_desc: "My orders",
  cmd_manager_desc: "Message the manager",
  cmd_help_desc: "Help",
};

const catalogs: Record<ShopBotLocale, Record<BotTextKey, string>> = { ru, en };

/** Fills `{var}` placeholders; a var missing from `vars` is left as-is rather than throwing. */
export function t(locale: ShopBotLocale, key: BotTextKey, vars?: Record<string, string | number>): string {
  const template = catalogs[locale][key];
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in vars ? String(vars[name]) : placeholder
  );
}

/** Medusa v2 amounts are already major units (e.g. 1290 = 1290 ₽), so this never divides by 100. */
export function formatPrice(amount: number, currency: string, locale: ShopBotLocale): string {
  const intlLocale = locale === "ru" ? "ru-RU" : "en-US";
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Not a valid ISO 4217 code (e.g. a shop-specific token) — show the number plainly rather than throw.
    return `${amount} ${currency.toUpperCase()}`;
  }
}
