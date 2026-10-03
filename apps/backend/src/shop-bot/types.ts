/**
 * The shop bot (t-cherk-23, phase 1): one Telegram bot per shop, answering
 * buyers in chat with the same catalog, cart, wishlist and orders the site
 * shows. These types are the seam between the three parts:
 *
 * - `router.ts` turns one Telegram update into Bot API calls. It is pure: it
 *   only talks to `ShopBotApi` and `ShopPort`, so tests mock both.
 * - `medusa-shop.ts` implements `ShopPort` over the shop's Medusa data (the
 *   same carts, customers and orders as the site).
 * - the webhook route resolves the shop, checks Telegram's `secret_token`,
 *   claims the `update_id` once, and calls the router.
 */

export type ShopBotLocale = "ru" | "en";

/* ---------- Telegram update shapes (only the fields the bot reads) ---------- */

export type TgUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TgChat = { id: number; type: string };

export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  reply_to_message?: TgMessage;
};

export type TgCallbackQuery = {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
};

export type TgInlineQuery = {
  id: string;
  from: TgUser;
  query: string;
  offset?: string;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  inline_query?: TgInlineQuery;
};

/* ---------- Bot API surface the router may call ---------- */

/** A subset of `createBotApi()` (`src/telegram/bot-api.ts`), so tests pass a plain mock. */
export type ShopBotApi = {
  sendMessage: (params: Record<string, unknown>) => Promise<unknown>;
  sendPhoto: (params: Record<string, unknown>) => Promise<unknown>;
  editMessageText: (params: Record<string, unknown>) => Promise<unknown>;
  answerCallbackQuery: (params: Record<string, unknown>) => Promise<unknown>;
  answerInlineQuery: (params: Record<string, unknown>) => Promise<unknown>;
};

/* ---------- Shop data the router reads and writes ---------- */

export type ShopCategory = { id: string; name: string };

export type ShopPrice = {
  /** Major units as Medusa v2 stores them (e.g. 1290 = 1290 ₽). */
  amount: number;
  currency_code: string;
};

export type ShopVariant = {
  id: string;
  title: string;
  price: ShopPrice | null;
};

export type ShopProductSummary = {
  id: string;
  title: string;
  handle: string;
  thumbnail: string | null;
  /** The cheapest variant price in the shop's currency, or null when unpriced. */
  price: ShopPrice | null;
};

export type ShopProduct = ShopProductSummary & {
  description: string | null;
  variants: ShopVariant[];
};

export type ShopPage<T> = { items: T[]; total: number };

export type ShopCartLine = {
  id: string;
  title: string;
  variant_title: string | null;
  quantity: number;
  unit_price: number;
};

export type ShopCart = {
  id: string;
  currency_code: string;
  lines: ShopCartLine[];
  total: number;
};

export type ShopOrderSummary = {
  id: string;
  display_id: number;
  status: string;
  payment_status: string | null;
  fulfillment_status: string | null;
  total: number;
  currency_code: string;
  created_at: string;
};

/**
 * Everything the bot does to the shop. Every buyer-scoped call takes the
 * Telegram user: the implementation finds (or creates) the shop customer
 * linked to that Telegram identity (`telegram:<id>`, t-cherk-20), so the
 * site and the bot share one customer and one open cart.
 */
export type ShopPort = {
  listCategories: () => Promise<ShopCategory[]>;
  listProducts: (input: {
    categoryId?: string | null;
    offset: number;
    limit: number;
  }) => Promise<ShopPage<ShopProductSummary>>;
  searchProducts: (query: string, limit: number) => Promise<ShopProductSummary[]>;
  getProduct: (productId: string) => Promise<ShopProduct | null>;

  getCart: (user: TgUser) => Promise<ShopCart | null>;
  addToCart: (user: TgUser, variantId: string, quantity: number) => Promise<ShopCart>;
  setLineQuantity: (user: TgUser, lineId: string, quantity: number) => Promise<ShopCart>;
  removeLine: (user: TgUser, lineId: string) => Promise<ShopCart>;

  addToWishlist: (user: TgUser, productId: string) => Promise<void>;
  listOrders: (user: TgUser, limit: number) => Promise<ShopOrderSummary[]>;

  /** Stores the owner's chat as the `/manager` destination. */
  setManagerChat: (chatId: number) => Promise<void>;
};

/* ---------- Per-update context ---------- */

export type ShopBotContext = {
  api: ShopBotApi;
  shop: ShopPort;
  locale: ShopBotLocale;
  shopName: string;
  botUsername: string;
  /** The shop's storefront base URL, e.g. `https://olavka.ru/ru` (no trailing slash); null when unknown. */
  storefrontUrl: string | null;
  /** Owner chat for `/manager`; null until the owner opened the manager deep link. */
  managerChatId: number | null;
  /** The code that `/start mgr_<code>` must carry to register the manager chat; null when no webhook secret is set. */
  managerLinkCode: string | null;
};
