import { accessPasswordHashFromEnv, passwordMatches, sha256Hex } from "../access-gate";
import { handleUpdate, SHOP_BOT_COMMANDS } from "../router";
import type {
  ShopBotApi,
  ShopBotContext,
  ShopCart,
  ShopPort,
  ShopProduct,
  TgCallbackQuery,
  TgMessage,
  TgUpdate,
  TgUser,
} from "../types";

/* ---------- fakes ---------- */

function fakeApi(): { [K in keyof ShopBotApi]: jest.Mock } {
  return {
    sendMessage: jest.fn(async () => ({})),
    sendPhoto: jest.fn(async () => ({})),
    editMessageText: jest.fn(async () => ({})),
    answerCallbackQuery: jest.fn(async () => ({})),
    answerInlineQuery: jest.fn(async () => ({})),
  };
}

function emptyCart(): ShopCart {
  return { id: "cart_1", currency_code: "rub", lines: [], total: 0 };
}

function fakeShop(overrides: Partial<ShopPort> = {}): { [K in keyof ShopPort]: jest.Mock } & ShopPort {
  return {
    listCategories: jest.fn(async () => []),
    listProducts: jest.fn(async () => ({ items: [], total: 0 })),
    searchProducts: jest.fn(async () => []),
    getProduct: jest.fn(async () => null),
    getCart: jest.fn(async () => null),
    addToCart: jest.fn(async () => emptyCart()),
    setLineQuantity: jest.fn(async () => emptyCart()),
    removeLine: jest.fn(async () => emptyCart()),
    addToWishlist: jest.fn(async () => undefined),
    listOrders: jest.fn(async () => []),
    setManagerChat: jest.fn(async () => undefined),
    hasBotAccess: jest.fn(async () => false),
    grantBotAccess: jest.fn(async () => undefined),
    ...overrides,
  } as { [K in keyof ShopPort]: jest.Mock } & ShopPort;
}

function fakeCtx(overrides: Partial<ShopBotContext> = {}): ShopBotContext {
  return {
    api: fakeApi(),
    shop: fakeShop(),
    locale: "ru",
    shopName: "Олавка",
    botUsername: "olavka_bot",
    storefrontUrl: "https://olavka.ru/ru",
    managerChatId: null,
    managerLinkCode: "linkcode123",
    accessPasswordHash: null,
    ...overrides,
  };
}

function buyer(overrides: Partial<TgUser> = {}): TgUser {
  return { id: 555, first_name: "Иван", username: "ivan99", ...overrides };
}

function privateMessage(overrides: Partial<TgMessage> = {}): TgMessage {
  return { message_id: 1, from: buyer(), chat: { id: 555, type: "private" }, ...overrides };
}

function messageUpdate(message: TgMessage): TgUpdate {
  return { update_id: 1, message };
}

function callbackUpdate(overrides: Partial<TgCallbackQuery> & { data: string }): TgUpdate {
  const query: TgCallbackQuery = {
    id: "cbq1",
    from: buyer(),
    message: privateMessage({ text: "placeholder" }),
    ...overrides,
  };
  return { update_id: 2, callback_query: query };
}

function sampleProduct(overrides: Partial<ShopProduct> = {}): ShopProduct {
  return {
    id: "prod_01",
    title: "Кружка",
    handle: "mug",
    thumbnail: "https://olavka.ru/mug.jpg",
    price: { amount: 990, currency_code: "rub" },
    description: "Керамическая кружка на 350 мл.",
    variants: [{ id: "variant_01", title: "350 мл", price: { amount: 990, currency_code: "rub" } }],
    ...overrides,
  };
}

/* ---------- closed mode (access-gate.ts) ---------- */

describe("closed mode", () => {
  const PASSWORD = "secret-pass";
  const closed = (overrides: Partial<ShopBotContext> = {}) =>
    fakeCtx({ accessPasswordHash: sha256Hex(PASSWORD), ...overrides });

  it("answers /start from a stranger with the password prompt only", async () => {
    const ctx = closed();
    await handleUpdate(messageUpdate(privateMessage({ text: "/start" })), ctx);

    expect(ctx.api.sendMessage).toHaveBeenCalledTimes(1);
    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.text).toContain("пароль");
    expect(call.reply_markup).toBeUndefined();
    expect(ctx.shop.listCategories).not.toHaveBeenCalled();
    expect(ctx.shop.grantBotAccess).not.toHaveBeenCalled();
  });

  it("a wrong password is refused and nothing is remembered", async () => {
    const ctx = closed();
    await handleUpdate(messageUpdate(privateMessage({ text: "nope" })), ctx);

    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.text).toBe("Неверный пароль. Попробуйте ещё раз.");
    expect(ctx.shop.grantBotAccess).not.toHaveBeenCalled();
  });

  it("the right password is remembered and followed by the greeting", async () => {
    const ctx = closed();
    await handleUpdate(messageUpdate(privateMessage({ text: ` ${PASSWORD} ` })), ctx);

    expect(ctx.shop.grantBotAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 555 }));
    const texts = (ctx.api.sendMessage as jest.Mock).mock.calls.map((c) => c[0].text as string);
    expect(texts[0]).toBe("Пароль принят, доступ открыт.");
    expect(texts[1]).toContain("Олавка");
  });

  it("a remembered chat goes straight through", async () => {
    const ctx = closed({ shop: fakeShop({ hasBotAccess: jest.fn(async () => true) }) });
    await handleUpdate(messageUpdate(privateMessage({ text: "/start" })), ctx);

    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.text).toContain("Олавка");
    expect(call.reply_markup.inline_keyboard[1][0]).toEqual({ text: "Каталог", callback_data: "catalog" });
  });

  it("the owner's chat and the owner's mgr_ deep link need no password", async () => {
    const owner = closed({ managerChatId: 555 });
    await handleUpdate(messageUpdate(privateMessage({ text: "/catalog" })), owner);
    expect(owner.shop.listCategories).toHaveBeenCalled();

    const link = closed();
    await handleUpdate(messageUpdate(privateMessage({ text: "/start mgr_linkcode123" })), link);
    expect(link.shop.grantBotAccess).toHaveBeenCalled();
    expect(link.shop.setManagerChat).toHaveBeenCalledWith(555);
  });

  it("button taps and inline queries from a stranger get the prompt and no data", async () => {
    const ctx = closed();
    await handleUpdate(callbackUpdate({ data: "catalog" }), ctx);
    expect(ctx.api.answerCallbackQuery).toHaveBeenCalledWith(
      expect.objectContaining({ callback_query_id: "cbq1", show_alert: true })
    );
    expect(ctx.api.editMessageText).not.toHaveBeenCalled();

    await handleUpdate({ update_id: 3, inline_query: { id: "iq1", from: buyer(), query: "кружка" } }, ctx);
    expect(ctx.shop.searchProducts).not.toHaveBeenCalled();
    expect(ctx.api.answerInlineQuery).toHaveBeenCalledWith(expect.objectContaining({ results: [] }));
  });

  it("open mode (no hash) changes nothing", async () => {
    const ctx = fakeCtx();
    await handleUpdate(messageUpdate(privateMessage({ text: "/start" })), ctx);
    expect(ctx.shop.hasBotAccess).not.toHaveBeenCalled();
    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.text).toContain("Олавка");
  });

  it("accessPasswordHashFromEnv accepts only a sha256 hex", () => {
    expect(accessPasswordHashFromEnv({})).toBeNull();
    expect(accessPasswordHashFromEnv({ SHOP_BOT_ACCESS_PASSWORD_SHA256: "abc" })).toBeNull();
    const hex = sha256Hex("x").toUpperCase();
    expect(accessPasswordHashFromEnv({ SHOP_BOT_ACCESS_PASSWORD_SHA256: ` ${hex} ` })).toBe(hex.toLowerCase());
    expect(passwordMatches(hex.toLowerCase(), "x")).toBe(true);
    expect(passwordMatches(hex.toLowerCase(), "y")).toBe(false);
  });
});

/* ---------- /start ---------- */

describe("/start", () => {
  it("greets with the shop name, a web_app button and the catalog/cart/orders row", async () => {
    const ctx = fakeCtx();
    await handleUpdate(messageUpdate(privateMessage({ text: "/start" })), ctx);

    expect(ctx.api.sendMessage).toHaveBeenCalledTimes(1);
    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.chat_id).toBe(555);
    expect(call.text).toContain("Олавка");
    expect(call.reply_markup.inline_keyboard[0]).toEqual([
      { text: "Открыть магазин", web_app: { url: "https://olavka.ru/ru" } },
    ]);
    expect(call.reply_markup.inline_keyboard[1]).toEqual([
      { text: "Каталог", callback_data: "catalog" },
      { text: "Корзина", callback_data: "cart" },
      { text: "Заказы", callback_data: "orders" },
    ]);
  });

  it("omits the web_app row when storefrontUrl is null", async () => {
    const ctx = fakeCtx({ storefrontUrl: null });
    await handleUpdate(messageUpdate(privateMessage({ text: "/start" })), ctx);
    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.reply_markup.inline_keyboard[0]).toEqual([
      { text: "Каталог", callback_data: "catalog" },
      { text: "Корзина", callback_data: "cart" },
      { text: "Заказы", callback_data: "orders" },
    ]);
  });

  it("/start product_<id> sends the product card", async () => {
    const product = sampleProduct();
    const ctx = fakeCtx({ shop: fakeShop({ getProduct: jest.fn(async () => product) }) });
    await handleUpdate(messageUpdate(privateMessage({ text: "/start product_prod_01" })), ctx);

    expect(ctx.shop.getProduct).toHaveBeenCalledWith("prod_01");
    expect(ctx.api.sendPhoto).toHaveBeenCalledTimes(1);
    const call = (ctx.api.sendPhoto as jest.Mock).mock.calls[0][0];
    expect(call.caption).toContain("<b>Кружка</b>");
    expect(call.parse_mode).toBe("HTML");
  });

  it("/start mgr_<code> with the right code stores the manager chat", async () => {
    const ctx = fakeCtx({ managerLinkCode: "right-code" });
    await handleUpdate(messageUpdate(privateMessage({ text: "/start mgr_right-code" })), ctx);
    expect(ctx.shop.setManagerChat).toHaveBeenCalledWith(555);
    expect(ctx.api.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("/start mgr_<code> with the wrong code behaves like a plain /start", async () => {
    const ctx = fakeCtx({ managerLinkCode: "right-code" });
    await handleUpdate(messageUpdate(privateMessage({ text: "/start mgr_wrong" })), ctx);
    expect(ctx.shop.setManagerChat).not.toHaveBeenCalled();
    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.text).toContain("Олавка"); // the plain greeting, not a confirmation
  });
});

/* ---------- /catalog ---------- */

describe("/catalog", () => {
  it("lists categories plus \"Все товары\", and pages a category via callback", async () => {
    const shop = fakeShop({
      listCategories: jest.fn(async () => [{ id: "cat_1", name: "Кружки" }]),
      listProducts: jest.fn(async () => ({
        items: Array.from({ length: 8 }, (_, i) => ({
          id: `prod_${i}`,
          title: `Товар ${i}`,
          handle: `item-${i}`,
          thumbnail: null,
          price: { amount: 100, currency_code: "rub" },
        })),
        total: 10,
      })),
    });
    const ctx = fakeCtx({ shop });

    await handleUpdate(messageUpdate(privateMessage({ text: "/catalog" })), ctx);
    const rootCall = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(rootCall.reply_markup.inline_keyboard).toEqual([
      [{ text: "Кружки", callback_data: "c:cat_1:0" }],
      [{ text: "Все товары", callback_data: "c:-:0" }],
    ]);

    await handleUpdate(callbackUpdate({ data: "c:cat_1:0" }), ctx);
    expect(ctx.shop.listProducts).toHaveBeenCalledWith({ categoryId: "cat_1", offset: 0, limit: 8 });
    expect(ctx.api.editMessageText).toHaveBeenCalledTimes(1);
    const pageCall = (ctx.api.editMessageText as jest.Mock).mock.calls[0][0];
    expect(pageCall.reply_markup.inline_keyboard).toHaveLength(9); // 8 products + nav row
    expect(pageCall.reply_markup.inline_keyboard[8]).toEqual([{ text: "▶︎", callback_data: "c:cat_1:8" }]);
    expect(ctx.api.answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it("goes straight to the product list when there are no categories", async () => {
    const ctx = fakeCtx();
    await handleUpdate(messageUpdate(privateMessage({ text: "/catalog" })), ctx);
    expect(ctx.shop.listProducts).toHaveBeenCalledWith({ categoryId: null, offset: 0, limit: 8 });
  });
});

/* ---------- product card ---------- */

describe("product card", () => {
  it("single variant gets one \"В корзину\" button", async () => {
    const product = sampleProduct();
    const ctx = fakeCtx({ shop: fakeShop({ getProduct: jest.fn(async () => product) }) });
    await handleUpdate(callbackUpdate({ data: "p:prod_01" }), ctx);
    const call = (ctx.api.sendPhoto as jest.Mock).mock.calls[0][0];
    expect(call.reply_markup.inline_keyboard[0]).toEqual([{ text: "В корзину", callback_data: "a:variant_01" }]);
    expect(call.reply_markup.inline_keyboard).toEqual(
      expect.arrayContaining([[{ text: "В избранное", callback_data: "f:prod_01" }]])
    );
  });

  it("several variants get one priced button each, skipping unpriced ones", async () => {
    const product = sampleProduct({
      variants: [
        { id: "v1", title: "S", price: { amount: 500, currency_code: "rub" } },
        { id: "v2", title: "M", price: { amount: 600, currency_code: "rub" } },
        { id: "v3", title: "L", price: null },
      ],
    });
    const ctx = fakeCtx({ shop: fakeShop({ getProduct: jest.fn(async () => product) }) });
    await handleUpdate(callbackUpdate({ data: "p:prod_01" }), ctx);
    const call = (ctx.api.sendPhoto as jest.Mock).mock.calls[0][0];
    expect(call.reply_markup.inline_keyboard[0]).toEqual([{ text: expect.stringContaining("S"), callback_data: "a:v1" }]);
    expect(call.reply_markup.inline_keyboard[1]).toEqual([{ text: expect.stringContaining("M"), callback_data: "a:v2" }]);
    expect(
      call.reply_markup.inline_keyboard.some((row: { callback_data?: string }[]) => row[0]?.callback_data === "a:v3")
    ).toBe(false);
  });

  it("falls back to sendMessage and \"Цена по запросу\" without a thumbnail or price", async () => {
    const product = sampleProduct({ thumbnail: null, price: null });
    const ctx = fakeCtx({ shop: fakeShop({ getProduct: jest.fn(async () => product) }) });
    await handleUpdate(callbackUpdate({ data: "p:prod_01" }), ctx);
    expect(ctx.api.sendPhoto).not.toHaveBeenCalled();
    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.text).toContain("Цена по запросу");
  });
});

/* ---------- a: / f: callbacks ---------- */

describe("add to cart / wishlist callbacks", () => {
  it("a: adds to cart and answers the callback", async () => {
    const ctx = fakeCtx();
    await handleUpdate(callbackUpdate({ data: "a:variant_01" }), ctx);
    expect(ctx.shop.addToCart).toHaveBeenCalledWith(expect.objectContaining({ id: 555 }), "variant_01", 1);
    expect(ctx.api.answerCallbackQuery).toHaveBeenCalledWith({
      callback_query_id: "cbq1",
      text: "Добавлено в корзину",
    });
  });

  it("f: adds to wishlist and answers the callback", async () => {
    const ctx = fakeCtx();
    await handleUpdate(callbackUpdate({ data: "f:prod_01" }), ctx);
    expect(ctx.shop.addToWishlist).toHaveBeenCalledWith(expect.objectContaining({ id: 555 }), "prod_01");
    expect(ctx.api.answerCallbackQuery).toHaveBeenCalledWith({
      callback_query_id: "cbq1",
      text: "Добавлено в избранное",
    });
  });

  it("an error from ctx.shop answers with an alert instead of throwing", async () => {
    const shop = fakeShop({ addToCart: jest.fn(async () => { throw new Error("out of stock"); }) });
    const ctx = fakeCtx({ shop });
    await expect(handleUpdate(callbackUpdate({ data: "a:variant_01" }), ctx)).resolves.toBeUndefined();
    expect(ctx.api.answerCallbackQuery).toHaveBeenCalledWith({
      callback_query_id: "cbq1",
      text: "Не получилось выполнить действие, попробуйте ещё раз",
      show_alert: true,
    });
  });

  it("unknown callback_data just answers", async () => {
    const ctx = fakeCtx();
    await handleUpdate(callbackUpdate({ data: "z:whatever" }), ctx);
    expect(ctx.api.answerCallbackQuery).toHaveBeenCalledWith({ callback_query_id: "cbq1" });
  });
});

/* ---------- /cart ---------- */

describe("/cart", () => {
  function cartWithOneLine(): ShopCart {
    return {
      id: "cart_1",
      currency_code: "rub",
      total: 1980,
      lines: [{ id: "line_1", title: "Кружка", variant_title: "350 мл", quantity: 2, unit_price: 990 }],
    };
  }

  it("renders lines, the total, and per-line buttons", async () => {
    const ctx = fakeCtx({ shop: fakeShop({ getCart: jest.fn(async () => cartWithOneLine()) }) });
    await handleUpdate(messageUpdate(privateMessage({ text: "/cart" })), ctx);
    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.text).toContain("Кружка (350 мл) × 2");
    expect(call.text).toContain("Итого:");
    expect(call.reply_markup.inline_keyboard[0]).toEqual([
      { text: "−", callback_data: "q:line_1:1" },
      { text: "+", callback_data: "q:line_1:3" },
      { text: "✕", callback_data: "r:line_1" },
    ]);
    expect(call.reply_markup.inline_keyboard.at(-1)).toEqual([
      { text: "Оформить", web_app: { url: "https://olavka.ru/ru/mini/checkout" } },
    ]);
  });

  it("empty cart shows \"Корзина пуста\" and a Каталог button", async () => {
    const ctx = fakeCtx();
    await handleUpdate(messageUpdate(privateMessage({ text: "/cart" })), ctx);
    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.text).toBe("Корзина пуста");
    expect(call.reply_markup.inline_keyboard).toEqual([[{ text: "Каталог", callback_data: "catalog" }]]);
  });

  it("q: with qty-1 = 0 removes the line and re-renders by editing", async () => {
    const shop = fakeShop({ getCart: jest.fn(async () => emptyCart()) });
    const ctx = fakeCtx({ shop });
    await handleUpdate(callbackUpdate({ data: "q:line_1:0" }), ctx);
    expect(ctx.shop.removeLine).toHaveBeenCalledWith(expect.objectContaining({ id: 555 }), "line_1");
    expect(ctx.shop.setLineQuantity).not.toHaveBeenCalled();
    expect(ctx.api.editMessageText).toHaveBeenCalledTimes(1);
    expect(ctx.api.sendMessage).not.toHaveBeenCalled();
  });

  it("q: with a positive quantity calls setLineQuantity", async () => {
    const shop = fakeShop({ getCart: jest.fn(async () => cartWithOneLine()) });
    const ctx = fakeCtx({ shop });
    await handleUpdate(callbackUpdate({ data: "q:line_1:3" }), ctx);
    expect(ctx.shop.setLineQuantity).toHaveBeenCalledWith(expect.objectContaining({ id: 555 }), "line_1", 3);
    expect(ctx.api.editMessageText).toHaveBeenCalledTimes(1);
  });

  it("r: removes the line and re-renders by editing", async () => {
    const ctx = fakeCtx();
    await handleUpdate(callbackUpdate({ data: "r:line_1" }), ctx);
    expect(ctx.shop.removeLine).toHaveBeenCalledWith(expect.objectContaining({ id: 555 }), "line_1");
    expect(ctx.api.editMessageText).toHaveBeenCalledTimes(1);
  });
});

/* ---------- /orders ---------- */

describe("/orders", () => {
  it("renders recent orders", async () => {
    const shop = fakeShop({
      listOrders: jest.fn(async () => [
        {
          id: "order_1",
          display_id: 1042,
          status: "completed",
          payment_status: "captured",
          fulfillment_status: "shipped",
          total: 1980,
          currency_code: "rub",
          created_at: "2026-09-01T10:00:00.000Z",
        },
      ]),
    });
    const ctx = fakeCtx({ shop });
    await handleUpdate(messageUpdate(privateMessage({ text: "/orders" })), ctx);
    expect(ctx.shop.listOrders).toHaveBeenCalledWith(expect.objectContaining({ id: 555 }), 5);
    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.text).toContain("№1042");
    expect(call.text).toContain("completed");
  });

  it("shows \"Заказов пока нет\" when there are none", async () => {
    const ctx = fakeCtx();
    await handleUpdate(messageUpdate(privateMessage({ text: "/orders" })), ctx);
    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.text).toBe("Заказов пока нет");
  });
});

/* ---------- /manager ---------- */

describe("/manager", () => {
  it("says the manager is not connected", async () => {
    const ctx = fakeCtx({ managerChatId: null });
    await handleUpdate(messageUpdate(privateMessage({ text: "/manager когда доставка?" })), ctx);
    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.text).toBe("Менеджер пока не подключён");
  });

  it("asks for text when the command has none", async () => {
    const ctx = fakeCtx({ managerChatId: 999 });
    await handleUpdate(messageUpdate(privateMessage({ text: "/manager" })), ctx);
    const call = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(call.text).toContain("/manager");
  });

  it("forwards the question to the manager chat and confirms to the buyer", async () => {
    const ctx = fakeCtx({ managerChatId: 999 });
    await handleUpdate(messageUpdate(privateMessage({ text: "/manager когда доставка?" })), ctx);
    expect(ctx.api.sendMessage).toHaveBeenCalledTimes(2);
    const toManager = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(toManager.chat_id).toBe(999);
    expect(toManager.text).toContain("#u555");
    expect(toManager.text).toContain("когда доставка?");
    expect(toManager.text).toContain("Иван");
    expect(toManager.text).toContain("@ivan99");
    const toBuyer = (ctx.api.sendMessage as jest.Mock).mock.calls[1][0];
    expect(toBuyer.chat_id).toBe(555);
  });

  it("a reply in the manager chat is relayed back to the buyer", async () => {
    const ctx = fakeCtx({ managerChatId: 999 });
    const managerReply = privateMessage({
      message_id: 2,
      from: { id: 999, first_name: "Менеджер" },
      chat: { id: 999, type: "private" },
      text: "Доставка завтра",
      reply_to_message: privateMessage({ text: "Вопрос от Иван #u555:\nкогда доставка?" }),
    });
    await handleUpdate(messageUpdate(managerReply), ctx);
    expect(ctx.api.sendMessage).toHaveBeenCalledTimes(2);
    const toBuyer = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(toBuyer.chat_id).toBe(555);
    expect(toBuyer.text).toBe("Ответ менеджера:\nДоставка завтра");
    const toManager = (ctx.api.sendMessage as jest.Mock).mock.calls[1][0];
    expect(toManager.chat_id).toBe(999);
  });
});

/* ---------- inline query ---------- */

describe("inline queries", () => {
  it("searches and returns article results with an \"Открыть\" deep link", async () => {
    const product = { id: "prod_01", title: "Кружка", handle: "mug", thumbnail: "https://olavka.ru/mug.jpg", price: { amount: 990, currency_code: "rub" } };
    const shop = fakeShop({ searchProducts: jest.fn(async () => [product]) });
    const ctx = fakeCtx({ shop });
    await handleUpdate({ update_id: 3, inline_query: { id: "iq1", from: buyer(), query: "кружка" } }, ctx);
    expect(ctx.shop.searchProducts).toHaveBeenCalledWith("кружка", 10);
    const call = (ctx.api.answerInlineQuery as jest.Mock).mock.calls[0][0];
    expect(call.cache_time).toBe(30);
    expect(call.is_personal).toBe(false);
    expect(call.results[0]).toMatchObject({
      type: "article",
      id: "prod_01",
      title: "Кружка",
      thumbnail_url: "https://olavka.ru/mug.jpg",
    });
    expect(call.results[0].reply_markup.inline_keyboard[0][0].url).toBe("https://t.me/olavka_bot?start=product_prod_01");
    expect(call.results[0].input_message_content.message_text).toContain("https://olavka.ru/ru/products/mug");
  });

  it("an empty query falls back to listProducts", async () => {
    const ctx = fakeCtx();
    await handleUpdate({ update_id: 4, inline_query: { id: "iq2", from: buyer(), query: "" } }, ctx);
    expect(ctx.shop.listProducts).toHaveBeenCalledWith({ categoryId: null, offset: 0, limit: 10 });
    expect(ctx.shop.searchProducts).not.toHaveBeenCalled();
  });
});

/* ---------- callback_data budget ---------- */

describe("callback_data length", () => {
  it("stays at or under 64 bytes even with long Medusa-style ULIDs", async () => {
    const longId = "01HZXQ7WJ3K9TFP6N8R2M4D0YV"; // 26 chars, like a real Medusa ULID
    const product = sampleProduct({
      id: `prod_${longId}`,
      variants: [
        { id: `variant_${longId}`, title: "S", price: { amount: 100, currency_code: "rub" } },
        { id: `variant_${longId}2`, title: "M", price: { amount: 200, currency_code: "rub" } },
      ],
    });
    const cart: ShopCart = {
      id: "cart_1",
      currency_code: "rub",
      total: 100,
      lines: [{ id: `line_${longId}`, title: "x", variant_title: "y", quantity: 1, unit_price: 100 }],
    };
    const shop = fakeShop({
      getProduct: jest.fn(async () => product),
      getCart: jest.fn(async () => cart),
      listCategories: jest.fn(async () => [{ id: `cat_${longId}`, name: "Категория" }]),
    });
    const ctx = fakeCtx({ shop });

    const collected: string[] = [];
    const collect = (params: any) => {
      for (const row of params.reply_markup?.inline_keyboard ?? []) {
        for (const button of row) {
          if (button.callback_data) collected.push(button.callback_data);
        }
      }
    };
    (ctx.api.sendMessage as jest.Mock).mockImplementation(async (p) => { collect(p); return {}; });
    (ctx.api.sendPhoto as jest.Mock).mockImplementation(async (p) => { collect(p); return {}; });
    (ctx.api.editMessageText as jest.Mock).mockImplementation(async (p) => { collect(p); return {}; });

    await handleUpdate(messageUpdate(privateMessage({ text: "/catalog" })), ctx);
    await handleUpdate(callbackUpdate({ data: `p:prod_${longId}` }), ctx);
    await handleUpdate(messageUpdate(privateMessage({ text: "/cart" })), ctx);

    expect(collected.length).toBeGreaterThan(0);
    for (const data of collected) {
      expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
    }
  });
});

/* ---------- en locale ---------- */

describe("en locale", () => {
  it("renders /start and empty /cart in English", async () => {
    const ctx = fakeCtx({ locale: "en" });
    await handleUpdate(messageUpdate(privateMessage({ text: "/start" })), ctx);
    const greeting = (ctx.api.sendMessage as jest.Mock).mock.calls[0][0];
    expect(greeting.text).toContain("Welcome to Олавка");
    expect(greeting.reply_markup.inline_keyboard[1]).toEqual([
      { text: "Catalog", callback_data: "catalog" },
      { text: "Cart", callback_data: "cart" },
      { text: "Orders", callback_data: "orders" },
    ]);

    await handleUpdate(messageUpdate(privateMessage({ text: "/cart" })), ctx);
    const cart = (ctx.api.sendMessage as jest.Mock).mock.calls[1][0];
    expect(cart.text).toBe("Your cart is empty");
  });
});

/* ---------- SHOP_BOT_COMMANDS ---------- */

describe("SHOP_BOT_COMMANDS", () => {
  it("lists start, catalog, cart, orders, manager, help", () => {
    expect(SHOP_BOT_COMMANDS("ru").map((c) => c.command)).toEqual([
      "start",
      "catalog",
      "cart",
      "orders",
      "manager",
      "help",
    ]);
    expect(SHOP_BOT_COMMANDS("ru")[0]!.description).toBeTruthy();
    expect(SHOP_BOT_COMMANDS("en")[0]!.description).toBeTruthy();
  });
});
