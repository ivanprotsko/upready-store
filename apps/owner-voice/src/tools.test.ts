import { test } from "node:test";
import assert from "node:assert/strict";

import type { Query, ShopApi } from "./shop/api.ts";
import { matchesQuery } from "./shop/fixtures.ts";
import { money, runTool, searchStem, TOOLS, type ToolContext } from "./tools.ts";

interface Seen {
  surface: "store" | "owner";
  path: string;
  query: Query;
}

/** A mocked shop: HTTP answers keyed by path, every call recorded. */
function mockShop(answers: Record<string, unknown>) {
  const seen: Seen[] = [];
  const answer = (surface: Seen["surface"]) => async (path: string, query: Query = {}) => {
    seen.push({ surface, path, query });
    if (!(path in answers)) throw new Error(`answered 500 for ${path}`);
    return answers[path];
  };
  const shop: ShopApi = { store: answer("store"), owner: answer("owner"), regionId: async () => "reg_ru" };
  const ctx: ToolContext = {
    shop,
    panelUrl: "https://panel.cherkashino.com",
    storefrontUrl: "https://cherkashino.com",
    locale: "ru",
  };
  return { ctx, seen };
}

const PRODUCTS = {
  products: [
    {
      id: "prod_1",
      title: "Каштан капсулы от варикоза 60 шт",
      handle: "kapsuly-ot-varikoza-s-kashtanom-cherkashino",
      variants: [{ title: "60 шт", calculated_price: { calculated_amount: 19, currency_code: "usd" } }],
    },
    {
      id: "prod_2",
      title: "Мазь Каштан от варикоза, 100 мл",
      handle: "maz-ot-varikoza-s-kashtanom-cherkashino",
      variants: [{ title: "100 мл", calculated_price: { calculated_amount: 21.5, currency_code: "usd" } }],
    },
    { id: "prod_3", title: "Тройчатка плюс", handle: "troychatka", variants: [] },
  ],
};

test("every tool is read only and names the map rows it ports", () => {
  assert.deepEqual(
    TOOLS.map((t) => t.name),
    ["find_products", "product_stock", "sales_summary", "recent_orders", "product_reviews", "open_product"],
  );
  for (const tool of TOOLS) assert.match(tool.description, /Только чтение/, tool.name);
});

test("searchStem cuts the longest word so an inflected name still matches", () => {
  assert.equal(searchStem("печень"), "печен");
  assert.equal(searchStem("мазь каштана"), "кашта");
});

test("money reads like Russian speech", () => {
  assert.equal(money(1284, "usd"), "1 284 $");
  assert.equal(money(55.83, "rub"), "55,83 ₽");
});

test("find_products: Store API search with the region, prices per product, panel link", async () => {
  const { ctx, seen } = mockShop({ "/store/products": PRODUCTS });
  const out = await runTool("find_products", { query: "каштан" }, ctx);

  assert.deepEqual(seen[0], {
    surface: "store",
    path: "/store/products",
    query: {
      q: "кашта",
      limit: 20,
      region_id: "reg_ru",
      fields: "id,title,handle,*variants.calculated_price,variants.title,variants.sku",
    },
  });
  assert.match(out.text, /Нашлось 2/);
  assert.match(out.text, /Каштан капсулы от варикоза 60 шт — 19 \$/);
  assert.match(out.text, /Мазь Каштан от варикоза, 100 мл — 21,5 \$/);
  assert.doesNotMatch(out.text, /Тройчатка/);
  assert.equal(out.card?.link?.href, "https://panel.cherkashino.com/products/prod_1");
});

test("product_stock: on hand minus reserved", async () => {
  const { ctx, seen } = mockShop({
    "/tenants/inventory-items": {
      inventory_items: [
        { sku: "M-1", title: "Мазь Каштан от варикоза, 100 мл", stocked_quantity: 22, reserved_quantity: 4 },
        { sku: "T-1", title: "Тройчатка плюс", stocked_quantity: 5, reserved_quantity: 0 },
      ],
    },
  });
  const out = await runTool("product_stock", { query: "мазь каштан" }, ctx);
  assert.equal(seen[0]!.surface, "owner");
  assert.equal(seen[0]!.path, "/tenants/inventory-items");
  assert.equal(out.text, "Мазь Каштан от варикоза, 100 мл: на складе 22, в резерве 4, можно продать 18");
});

test("sales_summary: the server's numbers, the change, cancellations and other currencies", async () => {
  const { ctx, seen } = mockShop({
    "/tenants/analytics/summary": {
      has_orders: true,
      currency_code: "usd",
      current: { revenue: 1284, order_count: 23, aov: 55.83 },
      change: { revenue_pct: 15.99, order_count_pct: -4.2, aov_pct: null },
      canceled: { order_count: 1, revenue: 30 },
      currency_breakdown: [{ currency_code: "usd", revenue: 1284 }, { currency_code: "rub", revenue: 5000 }],
      top_products: [{ title: "Очищение печени", quantity: 3 }],
    },
  });
  const out = await runTool("sales_summary", { period: "30d" }, ctx);
  assert.deepEqual(seen[0]!.query, { period: "30d", from: undefined, to: undefined });
  assert.match(out.text, /^Продажи за 30 дней:/);
  assert.match(out.text, /Выручка: 1 284 \$ \(\+16% к прошлому периоду\)/);
  assert.match(out.text, /Заказов: 23 \(-4% к прошлому периоду\)/);
  assert.match(out.text, /Отменено: 1 на 30 \$/);
  assert.match(out.text, /Лидеры: Очищение печени \(3 шт\.\)/);
  assert.match(out.text, /Ещё в других валютах: 5 000 ₽/);
});

test("sales_summary: a shop with no orders says so instead of zeroes", async () => {
  const { ctx } = mockShop({ "/tenants/analytics/summary": { has_orders: false } });
  assert.equal((await runTool("sales_summary", {}, ctx)).text, "У магазина пока нет ни одного заказа.");
});

test("recent_orders: newest first, no customer fields asked for, statuses in Russian", async () => {
  const { ctx, seen } = mockShop({
    "/tenants/orders": {
      count: 12,
      orders: [
        {
          display_id: 1041,
          total: 214,
          currency_code: "usd",
          created_at: "2026-10-20T06:00:00Z",
          status: "pending",
          payment_status: "captured",
          fulfillment_status: "not_fulfilled",
        },
      ],
    },
  });
  const out = await runTool("recent_orders", { days: 7, limit: 3 }, ctx);
  const query = seen[0]!.query;
  assert.equal(query.order, "-created_at");
  assert.equal(query.limit, 3);
  assert.ok(typeof query["created_at[$gte]"] === "string");
  assert.doesNotMatch(String(query.fields), /email|customer|address|name/);
  assert.match(out.text, /^Заказов за 7 дн\.: 12\. Последние:/);
  assert.match(out.text, /№1041, 214 \$, 20\.10: в работе, оплачен, не собран/);
});

test("product_reviews: by product, low ratings only, never the author's name", async () => {
  const { ctx, seen } = mockShop({
    "/store/products": PRODUCTS,
    "/tenants/reviews": {
      reviews: [
        { rating: 2, title: "Долго", body: "Шёл три недели.", author_name: "Мария Петрова", written_at: "2026-10-12T07:03:00Z", reply: null, product: { title: "Мазь" } },
        { rating: 5, body: "Отлично", author_name: "Анна К.", written_at: "2026-10-18T09:12:00Z", reply: "Спасибо" },
      ],
    },
  });
  const out = await runTool("product_reviews", { query: "каштан", max_rating: 3 }, ctx);
  assert.deepEqual(seen[1]!.query.product_id, ["prod_1", "prod_2"]);
  assert.match(out.text, /Отзывов: 1, средняя оценка 2\.0/);
  assert.match(out.text, /2★ 12\.10, Мазь: Долго\. Шёл три недели\. Без ответа\./);
  assert.doesNotMatch(JSON.stringify(out), /Мария|Петрова|Анна/);
});

test("open_product: links to the panel and the storefront", async () => {
  const { ctx } = mockShop({ "/store/products": PRODUCTS });
  const out = await runTool("open_product", { query: "тройчатка" }, ctx);
  assert.equal(out.card?.link?.href, "https://panel.cherkashino.com/products/prod_3");
  assert.ok(out.card?.rows.includes("На витрине: https://cherkashino.com/ru/products/troychatka"));
});

test("an API failure becomes a plain sentence, the cause only in the log", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const { ctx } = mockShop({});
  const out = await runTool("recent_orders", {}, ctx);
  assert.equal(out.text, "Не удалось прочитать данные магазина, попробуйте чуть позже.");
  assert.match(String(logged.mock.calls[0]?.arguments.join(" ")), /recent_orders failed: answered 500/);
  assert.equal((await runTool("delete_everything", {}, ctx)).text, "Инструмента delete_everything нет.");
});

/**
 * A shop whose `q` is a plain substring with no ё folding, like Medusa's:
 * «мумие» finds nothing there, the full list still holds «Мумиё».
 */
function strictShop() {
  const seen: Query[] = [];
  const rows = {
    products: [
      { id: "prod_m", title: "Мумиё алтайское очищенное натуральное 100%", handle: "mumie", variants: [{ title: "1", calculated_price: { calculated_amount: 30, currency_code: "usd" } }] },
      ...PRODUCTS.products,
    ],
    inventory_items: [{ id: "inv_m", sku: "MUM-1", title: "Мумиё алтайское", stocked_quantity: 7, reserved_quantity: 2 }],
  };
  const list = (key: "products" | "inventory_items") => async (_path: string, query: Query = {}) => {
    seen.push(query);
    const q = typeof query.q === "string" ? query.q : null;
    const all = rows[key] as { title: string }[];
    const hits = q ? all.filter((r) => r.title.toLowerCase().includes(q)) : all;
    return { [key]: hits, count: hits.length };
  };
  const shop: ShopApi = { store: list("products"), owner: list("inventory_items"), regionId: async () => "reg_ru" };
  const ctx: ToolContext = { shop, panelUrl: "https://panel.cherkashino.com", storefrontUrl: "https://cherkashino.com", locale: "ru" };
  return { ctx, seen };
}

test("ё and е: «мумие» finds «Мумиё» when the API search does not fold ё", async () => {
  const { ctx, seen } = strictShop();
  const out = await runTool("find_products", { query: "мумие" }, ctx);
  assert.match(out.text, /Мумиё алтайское очищенное натуральное 100% — 30 \$/);
  assert.equal(seen[0]?.q, "мумие", "the API is asked first");
  assert.equal(seen[1]?.q, undefined, "then the list is read and matched locally");
  assert.equal(seen[1]?.offset, 0);

  const typed = await runTool("find_products", { query: "мумиё" }, strictShop().ctx);
  assert.match(typed.text, /Мумиё алтайское/, "a typed ё still finds it");

  const stock = await runTool("product_stock", { query: "мумие" }, ctx);
  assert.match(stock.text, /Мумиё алтайское: на складе 7, в резерве 2, можно продать 5/);
});

test("ё and е fold on both sides of a match", () => {
  assert.equal(matchesQuery("Мумиё алтайское", "мумие"), true);
  assert.equal(matchesQuery("Мумие алтайское", "МУМИЁ"), true);
  assert.equal(matchesQuery("Иван-чай", "мумие"), false);
  assert.equal(searchStem("мумиё"), "мумие");
});
