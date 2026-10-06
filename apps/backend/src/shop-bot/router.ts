import type {
  ShopBotContext,
  ShopBotLocale,
  TgCallbackQuery,
  TgInlineQuery,
  TgMessage,
  TgUpdate,
  TgUser,
} from "./types";
import { passwordMatches } from "./access-gate";
import { formatPrice, t } from "./i18n";

/**
 * The shop bot's router (t-cherk-23): turns one Telegram update into Bot API
 * calls. Pure — it only talks to `ctx.api` and `ctx.shop`, nothing else, so
 * tests mock both and never touch Telegram or Medusa.
 */

const PRODUCT_PAGE_SIZE = 8;
const ORDERS_LIMIT = 5;

type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
};

type View = { text: string; keyboard: InlineKeyboardButton[][] };

export function SHOP_BOT_COMMANDS(locale: ShopBotLocale): { command: string; description: string }[] {
  return [
    { command: "start", description: t(locale, "cmd_start_desc") },
    { command: "catalog", description: t(locale, "cmd_catalog_desc") },
    { command: "cart", description: t(locale, "cmd_cart_desc") },
    { command: "orders", description: t(locale, "cmd_orders_desc") },
    { command: "manager", description: t(locale, "cmd_manager_desc") },
    { command: "help", description: t(locale, "cmd_help_desc") },
  ];
}

export async function handleUpdate(update: TgUpdate, ctx: ShopBotContext): Promise<void> {
  if (!(await passesAccessGate(update, ctx))) {
    return;
  }
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, ctx);
    return;
  }
  if (update.inline_query) {
    await handleInlineQuery(update.inline_query, ctx);
    return;
  }
  if (update.message) {
    await handleMessage(update.message, ctx);
  }
}

/* ---------- closed mode (access-gate.ts) ---------- */

/**
 * `true` lets the update through to the normal handlers. `false` means the
 * gate has already answered (prompt, wrong password, or «accepted» plus the
 * greeting) or chose silence, and nothing else must run. Open mode
 * (`accessPasswordHash` null) is always `true`.
 *
 * Who passes without typing: the owner's chat (`managerChatId`), anyone the
 * shop already remembers (`hasBotAccess`), and the owner arriving by the
 * `/start mgr_<code>` link — that code is the owner's own key, so it is also
 * remembered and the normal `/start` handler then registers the chat.
 */
async function passesAccessGate(update: TgUpdate, ctx: ShopBotContext): Promise<boolean> {
  const hash = ctx.accessPasswordHash;
  if (!hash) {
    return true;
  }

  const user = update.message?.from ?? update.callback_query?.from ?? update.inline_query?.from;
  if (!user || user.is_bot) {
    return false;
  }
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? null;
  if (chatId !== null && ctx.managerChatId !== null && chatId === ctx.managerChatId) {
    return true;
  }
  if (await ctx.shop.hasBotAccess(user)) {
    return true;
  }

  if (update.message) {
    const message = update.message;
    if (message.chat.type !== "private") {
      return false;
    }
    const text = (message.text ?? "").trim();
    const parsed = parseCommand(text);

    if (
      parsed?.command === "start" &&
      ctx.managerLinkCode &&
      parsed.arg === `mgr_${ctx.managerLinkCode}`
    ) {
      await ctx.shop.grantBotAccess(user);
      return true;
    }

    const isAttempt = text !== "" && !parsed;
    if (isAttempt && passwordMatches(hash, text)) {
      await ctx.shop.grantBotAccess(user);
      await ctx.api.sendMessage({ chat_id: message.chat.id, text: t(ctx.locale, "access_granted") });
      await sendGreeting(message.chat.id, ctx);
      return false;
    }
    await ctx.api.sendMessage({
      chat_id: message.chat.id,
      text: t(ctx.locale, isAttempt ? "access_wrong_password" : "access_prompt"),
    });
    return false;
  }

  if (update.callback_query) {
    await ctx.api.answerCallbackQuery({
      callback_query_id: update.callback_query.id,
      text: t(ctx.locale, "access_prompt"),
      show_alert: true,
    });
    return false;
  }

  if (update.inline_query) {
    await ctx.api.answerInlineQuery({
      inline_query_id: update.inline_query.id,
      results: [],
      cache_time: 0,
      is_personal: true,
    });
  }
  return false;
}

/* ---------- messages ---------- */

async function handleMessage(message: TgMessage, ctx: ShopBotContext): Promise<void> {
  if (message.from?.is_bot) {
    return;
  }
  if (message.chat.type !== "private") {
    return;
  }
  if (!message.from) {
    return;
  }

  if (await tryHandleManagerReply(message, ctx)) {
    return;
  }

  const text = message.text;
  if (!text) {
    return;
  }

  const parsed = parseCommand(text);
  if (!parsed) {
    await ctx.api.sendMessage({ chat_id: message.chat.id, text: t(ctx.locale, "unknown_command") });
    return;
  }

  switch (parsed.command) {
    case "start":
      await handleStartCommand(message, parsed.arg, ctx);
      return;
    case "catalog": {
      const view = await renderCatalogRoot(ctx);
      await sendView(ctx, message.chat.id, view);
      return;
    }
    case "cart": {
      const view = await renderCart(ctx, message.from);
      await sendView(ctx, message.chat.id, view);
      return;
    }
    case "orders": {
      const view = await renderOrders(ctx, message.from);
      await sendView(ctx, message.chat.id, view);
      return;
    }
    case "manager":
      await handleManagerCommand(message, parsed.arg, ctx);
      return;
    case "help":
      await sendHelp(message.chat.id, ctx);
      return;
    default:
      await ctx.api.sendMessage({ chat_id: message.chat.id, text: t(ctx.locale, "unknown_command") });
  }
}

function parseCommand(text: string): { command: string; arg: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const spaceIndex = trimmed.indexOf(" ");
  const head = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  // Telegram deep links send "/start@BotName arg" in group contexts too — strip the @mention.
  const command = head.slice(1).split("@")[0]!.toLowerCase();
  const arg = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();
  return { command, arg };
}

async function handleStartCommand(message: TgMessage, arg: string, ctx: ShopBotContext): Promise<void> {
  if (arg.startsWith("product_")) {
    await sendProductCard(ctx, message.chat.id, arg.slice("product_".length));
    return;
  }
  if (arg.startsWith("mgr_")) {
    const code = arg.slice("mgr_".length);
    if (ctx.managerLinkCode && code === ctx.managerLinkCode) {
      await ctx.shop.setManagerChat(message.chat.id);
      await ctx.api.sendMessage({ chat_id: message.chat.id, text: t(ctx.locale, "manager_link_confirmed") });
      return;
    }
    // Wrong or missing code: fall through to a plain /start — never reveal why it didn't register.
  }
  await sendGreeting(message.chat.id, ctx);
}

async function sendGreeting(chatId: number, ctx: ShopBotContext): Promise<void> {
  const keyboard: InlineKeyboardButton[][] = [];
  if (ctx.storefrontUrl) {
    keyboard.push([{ text: t(ctx.locale, "btn_open_shop"), web_app: { url: ctx.storefrontUrl } }]);
  }
  keyboard.push([
    { text: t(ctx.locale, "btn_catalog"), callback_data: "catalog" },
    { text: t(ctx.locale, "btn_cart"), callback_data: "cart" },
    { text: t(ctx.locale, "btn_orders"), callback_data: "orders" },
  ]);
  await sendView(ctx, chatId, { text: t(ctx.locale, "start_greeting", { shopName: ctx.shopName }), keyboard });
}

async function sendHelp(chatId: number, ctx: ShopBotContext): Promise<void> {
  const lines = [
    t(ctx.locale, "help_intro"),
    ...SHOP_BOT_COMMANDS(ctx.locale).map((c) => `/${c.command} — ${c.description}`),
  ];
  await ctx.api.sendMessage({ chat_id: chatId, text: lines.join("\n") });
}

async function handleManagerCommand(message: TgMessage, arg: string, ctx: ShopBotContext): Promise<void> {
  if (!ctx.managerChatId) {
    await ctx.api.sendMessage({ chat_id: message.chat.id, text: t(ctx.locale, "manager_not_connected") });
    return;
  }
  if (!arg) {
    await ctx.api.sendMessage({ chat_id: message.chat.id, text: t(ctx.locale, "manager_usage") });
    return;
  }
  const user = message.from as TgUser; // handleMessage already guarded message.from
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || t(ctx.locale, "manager_unknown_name");
  const from = user.username ? `${name} (@${user.username})` : name;
  await ctx.api.sendMessage({
    chat_id: ctx.managerChatId,
    text: t(ctx.locale, "manager_forwarded", { from, chatId: message.chat.id, text: arg }),
  });
  await ctx.api.sendMessage({ chat_id: message.chat.id, text: t(ctx.locale, "manager_question_sent") });
}

/** A reply, in any chat, to a message carrying `#u<chatId>` is the manager answering that buyer. */
async function tryHandleManagerReply(message: TgMessage, ctx: ShopBotContext): Promise<boolean> {
  const replyText = message.reply_to_message?.text;
  const text = message.text;
  if (!replyText || !text) {
    return false;
  }
  const match = replyText.match(/#u(\d+)/);
  if (!match) {
    return false;
  }
  const buyerChatId = Number(match[1]);
  await ctx.api.sendMessage({ chat_id: buyerChatId, text: t(ctx.locale, "manager_reply_to_buyer", { text }) });
  await ctx.api.sendMessage({ chat_id: message.chat.id, text: t(ctx.locale, "manager_reply_sent") });
  return true;
}

/* ---------- catalog & product card ---------- */

async function renderCatalogRoot(ctx: ShopBotContext): Promise<View> {
  const categories = await ctx.shop.listCategories();
  if (categories.length === 0) {
    return renderProductList(ctx, null, 0);
  }
  const keyboard: InlineKeyboardButton[][] = categories.map((category) => [
    { text: category.name, callback_data: `c:${category.id}:0` },
  ]);
  keyboard.push([{ text: t(ctx.locale, "btn_all_products"), callback_data: "c:-:0" }]);
  return { text: t(ctx.locale, "catalog_title"), keyboard };
}

async function renderProductList(ctx: ShopBotContext, categoryId: string | null, offset: number): Promise<View> {
  const page = await ctx.shop.listProducts({ categoryId, offset, limit: PRODUCT_PAGE_SIZE });
  const keyboard: InlineKeyboardButton[][] = page.items.map((product) => [
    { text: product.title, callback_data: `p:${product.id}` },
  ]);

  const categoryToken = categoryId ?? "-";
  const navRow: InlineKeyboardButton[] = [];
  if (offset > 0) {
    navRow.push({ text: "◀︎", callback_data: `c:${categoryToken}:${Math.max(0, offset - PRODUCT_PAGE_SIZE)}` });
  }
  if (offset + page.items.length < page.total) {
    navRow.push({ text: "▶︎", callback_data: `c:${categoryToken}:${offset + PRODUCT_PAGE_SIZE}` });
  }
  if (navRow.length > 0) {
    keyboard.push(navRow);
  }

  const text = page.items.length === 0 ? t(ctx.locale, "catalog_empty") : t(ctx.locale, "catalog_title");
  return { text, keyboard };
}

async function sendProductCard(ctx: ShopBotContext, chatId: number, productId: string): Promise<void> {
  const product = await ctx.shop.getProduct(productId);
  if (!product) {
    await ctx.api.sendMessage({ chat_id: chatId, text: t(ctx.locale, "product_not_found") });
    return;
  }

  const priceText = product.price
    ? formatPrice(product.price.amount, product.price.currency_code, ctx.locale)
    : t(ctx.locale, "price_on_request");
  const description = product.description ? escapeHtml(truncate(product.description, 700)) : null;
  const caption = [`<b>${escapeHtml(product.title)}</b>`, priceText, description]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  const keyboard: InlineKeyboardButton[][] = [];
  if (product.variants.length <= 1) {
    const variant = product.variants[0];
    if (variant) {
      keyboard.push([{ text: t(ctx.locale, "btn_to_cart"), callback_data: `a:${variant.id}` }]);
    }
  } else {
    for (const variant of product.variants) {
      if (!variant.price) {
        continue;
      }
      const label = `${variant.title} — ${formatPrice(variant.price.amount, variant.price.currency_code, ctx.locale)}`;
      keyboard.push([{ text: label, callback_data: `a:${variant.id}` }]);
    }
  }
  keyboard.push([{ text: t(ctx.locale, "btn_to_wishlist"), callback_data: `f:${product.id}` }]);
  if (ctx.storefrontUrl) {
    keyboard.push([{ text: t(ctx.locale, "btn_on_site"), url: `${ctx.storefrontUrl}/products/${product.handle}` }]);
  }
  keyboard.push([{ text: t(ctx.locale, "btn_back_to_catalog"), callback_data: "c:-:0" }]);

  if (product.thumbnail) {
    await ctx.api.sendPhoto({
      chat_id: chatId,
      photo: product.thumbnail,
      caption,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    });
  } else {
    await ctx.api.sendMessage({
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

/* ---------- cart & orders ---------- */

async function renderCart(ctx: ShopBotContext, user: TgUser): Promise<View> {
  const cart = await ctx.shop.getCart(user);
  if (!cart || cart.lines.length === 0) {
    return {
      text: t(ctx.locale, "cart_empty"),
      keyboard: [[{ text: t(ctx.locale, "btn_catalog"), callback_data: "catalog" }]],
    };
  }

  const keyboard: InlineKeyboardButton[][] = [];
  const lines = cart.lines.map((line) => {
    const sum = formatPrice(line.unit_price * line.quantity, cart.currency_code, ctx.locale);
    keyboard.push([
      { text: "−", callback_data: `q:${line.id}:${line.quantity - 1}` },
      { text: "+", callback_data: `q:${line.id}:${line.quantity + 1}` },
      { text: "✕", callback_data: `r:${line.id}` },
    ]);
    return line.variant_title
      ? t(ctx.locale, "cart_line", { title: line.title, variant: line.variant_title, qty: line.quantity, sum })
      : t(ctx.locale, "cart_line_no_variant", { title: line.title, qty: line.quantity, sum });
  });
  lines.push(t(ctx.locale, "cart_total", { sum: formatPrice(cart.total, cart.currency_code, ctx.locale) }));

  if (ctx.storefrontUrl) {
    // The link is `/mini/checkout`, not `/checkout`. The storefront's Mini App
    // entry first opens this very cart for the buyer
    // (`POST /store/telegram-bot/cart`) and only then shows the checkout. The
    // checkout page itself reads the cart of the webview's own cookie, which is
    // another cart or none.
    keyboard.push([{ text: t(ctx.locale, "btn_checkout"), web_app: { url: `${ctx.storefrontUrl}/mini/checkout` } }]);
  }
  return { text: lines.join("\n"), keyboard };
}

async function renderOrders(ctx: ShopBotContext, user: TgUser): Promise<View> {
  const orders = await ctx.shop.listOrders(user, ORDERS_LIMIT);
  if (orders.length === 0) {
    return { text: t(ctx.locale, "orders_empty"), keyboard: [] };
  }
  const lines = orders.map((order) =>
    t(ctx.locale, "orders_line", {
      displayId: order.display_id,
      status: order.status,
      total: formatPrice(order.total, order.currency_code, ctx.locale),
      date: formatOrderDate(order.created_at, ctx.locale),
    })
  );
  return { text: lines.join("\n"), keyboard: [] };
}

function formatOrderDate(iso: string, locale: ShopBotLocale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium" }).format(date);
}

/* ---------- callback queries ---------- */

async function handleCallbackQuery(query: TgCallbackQuery, ctx: ShopBotContext): Promise<void> {
  try {
    await dispatchCallback(query, ctx);
  } catch {
    // Errors from ctx.shop (stock, payment, etc.) surface as a toast; a truly unexpected
    // bug would already have been thrown before this catch sees it (see dispatchCallback).
    await ctx.api.answerCallbackQuery({
      callback_query_id: query.id,
      text: t(ctx.locale, "callback_error"),
      show_alert: true,
    });
  }
}

async function dispatchCallback(query: TgCallbackQuery, ctx: ShopBotContext): Promise<void> {
  const data = query.data ?? "";
  const message = query.message;

  if (data === "catalog") {
    await editView(ctx, message, await renderCatalogRoot(ctx));
    await ack(ctx, query);
    return;
  }
  if (data === "cart") {
    await editView(ctx, message, await renderCart(ctx, query.from));
    await ack(ctx, query);
    return;
  }
  if (data === "orders") {
    await editView(ctx, message, await renderOrders(ctx, query.from));
    await ack(ctx, query);
    return;
  }
  if (data.startsWith("c:")) {
    const [, idPart, offsetPart] = data.split(":");
    const categoryId = idPart === "-" ? null : idPart ?? null;
    const offset = Number(offsetPart) || 0;
    await editView(ctx, message, await renderProductList(ctx, categoryId, offset));
    await ack(ctx, query);
    return;
  }
  if (data.startsWith("p:")) {
    const chatId = message?.chat.id;
    if (chatId !== undefined) {
      await sendProductCard(ctx, chatId, data.slice(2));
    }
    await ack(ctx, query);
    return;
  }
  if (data.startsWith("a:")) {
    await ctx.shop.addToCart(query.from, data.slice(2), 1);
    await ack(ctx, query, t(ctx.locale, "added_to_cart"));
    return;
  }
  if (data.startsWith("f:")) {
    await ctx.shop.addToWishlist(query.from, data.slice(2));
    await ack(ctx, query, t(ctx.locale, "added_to_wishlist"));
    return;
  }
  if (data.startsWith("q:")) {
    const [, lineId, qtyPart] = data.split(":");
    const quantity = Number(qtyPart);
    if (lineId) {
      if (quantity > 0) {
        await ctx.shop.setLineQuantity(query.from, lineId, quantity);
      } else {
        await ctx.shop.removeLine(query.from, lineId);
      }
    }
    await editView(ctx, message, await renderCart(ctx, query.from));
    await ack(ctx, query);
    return;
  }
  if (data.startsWith("r:")) {
    await ctx.shop.removeLine(query.from, data.slice(2));
    await editView(ctx, message, await renderCart(ctx, query.from));
    await ack(ctx, query);
    return;
  }

  // Unknown callback_data (e.g. from a stale keyboard): just stop the client's spinner.
  await ack(ctx, query);
}

async function ack(ctx: ShopBotContext, query: TgCallbackQuery, text?: string): Promise<void> {
  await ctx.api.answerCallbackQuery({
    callback_query_id: query.id,
    ...(text ? { text } : {}),
  });
}

/* ---------- inline mode ---------- */

async function handleInlineQuery(query: TgInlineQuery, ctx: ShopBotContext): Promise<void> {
  const trimmed = query.query.trim();
  const products = trimmed
    ? await ctx.shop.searchProducts(trimmed, 10)
    : (await ctx.shop.listProducts({ categoryId: null, offset: 0, limit: 10 })).items;

  const results = products.map((product) => {
    const priceText = product.price
      ? formatPrice(product.price.amount, product.price.currency_code, ctx.locale)
      : t(ctx.locale, "price_on_request");
    const link = ctx.storefrontUrl ? `${ctx.storefrontUrl}/products/${product.handle}` : null;
    const messageLines = [product.title, priceText, ...(link ? [link] : [])];

    return {
      type: "article",
      id: product.id,
      title: product.title,
      description: priceText,
      ...(product.thumbnail ? { thumbnail_url: product.thumbnail } : {}),
      input_message_content: { message_text: messageLines.join("\n") },
      reply_markup: {
        inline_keyboard: [
          [{ text: t(ctx.locale, "btn_open"), url: `https://t.me/${ctx.botUsername}?start=product_${product.id}` }],
        ],
      },
    };
  });

  await ctx.api.answerInlineQuery({
    inline_query_id: query.id,
    results,
    cache_time: 30,
    is_personal: false,
  });
}

/* ---------- delivery (send for commands, edit for callbacks) ---------- */

function viewParams(view: View): Record<string, unknown> {
  return view.keyboard.length > 0 ? { text: view.text, reply_markup: { inline_keyboard: view.keyboard } } : { text: view.text };
}

async function sendView(ctx: ShopBotContext, chatId: number, view: View): Promise<void> {
  await ctx.api.sendMessage({ chat_id: chatId, ...viewParams(view) });
}

async function editView(ctx: ShopBotContext, message: TgMessage | undefined, view: View): Promise<void> {
  if (!message) {
    // A callback whose original message is gone (or an inline-mode callback) has nothing to edit.
    return;
  }
  await ctx.api.editMessageText({ chat_id: message.chat.id, message_id: message.message_id, ...viewParams(view) });
}
