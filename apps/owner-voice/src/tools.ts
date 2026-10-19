/**
 * The owner's read-only tools: what the model may ask the shop.
 *
 * Each tool is one row of the chrxnasdmds admin-actions map
 * (`packages/admin-actions/src/admin-actions-map.json`, scope `read`), moved
 * from the platform Admin API to this engine's Store API and shop panel API.
 * The row id it ports is in `ports`. Every number is read back from the API,
 * the model never sums money itself (the rule of chrxnasdmds
 * `get-sales-summary.ts`), and no buyer's name, email or address reaches the
 * model: reviews drop the author, orders ask for no customer fields at all.
 */
import type { ShopApi } from "./shop/api.ts";
import { matchesQuery } from "./shop/fixtures.ts";

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** What the screen shows next to the spoken answer. */
export interface Card {
  title: string;
  rows: string[];
  link?: { label: string; href: string };
}

export interface ToolOutcome {
  /** What the model reads back. Plain Russian, already computed. */
  text: string;
  card?: Card;
}

export interface ToolContext {
  shop: ShopApi;
  panelUrl: string;
  storefrontUrl: string;
  locale: string;
}

export interface Tool extends ToolSpec {
  /** The admin-actions map rows this tool ports. */
  ports: string[];
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome>;
}

type Row = Record<string, unknown>;

const str = (input: Record<string, unknown>, key: string): string | null => {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const int = (input: Record<string, unknown>, key: string, fallback: number, max: number): number => {
  const value = Number(input[key]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback;
};

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
      .format(amount)
      .replace(/ /g, " ");
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" });

/**
 * The search word sent to the API. Medusa's `q` is one substring, so «печень»
 * would miss «Очищение печени»: the longest word, cut to five letters, finds
 * both, and `matchesQuery` then keeps only what matches every word.
 */
export function searchStem(query: string): string {
  const words = query.split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length > 2);
  const longest = words.sort((a, b) => b.length - a.length)[0] ?? query;
  return longest.toLowerCase().slice(0, 5);
}

interface StoreProduct {
  id: string;
  title: string;
  handle: string;
  variants?: { title?: string; sku?: string | null; calculated_price?: { calculated_amount?: number | null; currency_code?: string | null } | null }[];
}

async function searchProducts(ctx: ToolContext, query: string, limit: number): Promise<StoreProduct[]> {
  const regionId = await ctx.shop.regionId();
  const body = (await ctx.shop.store("/store/products", {
    q: searchStem(query),
    limit: 20,
    region_id: regionId ?? undefined,
    fields: "id,title,handle,*variants.calculated_price,variants.title,variants.sku",
  })) as { products?: StoreProduct[] };
  return (body.products ?? []).filter((p) => matchesQuery(`${p.title} ${p.handle}`, query)).slice(0, limit);
}

const panelLink = (ctx: ToolContext, product: StoreProduct) => ({
  label: `Открыть «${product.title}» в панели`,
  href: `${ctx.panelUrl}/products/${product.id}`,
});

function priceLine(product: StoreProduct): string {
  const prices = (product.variants ?? []).map((v) => {
    const amount = v.calculated_price?.calculated_amount;
    const price = typeof amount === "number" ? money(amount, v.calculated_price?.currency_code ?? "usd") : "цена не задана";
    return (product.variants?.length ?? 0) > 1 ? `${v.title}: ${price}` : price;
  });
  return `${product.title} — ${prices.join("; ") || "нет вариантов"}`;
}

const findProducts: Tool = {
  name: "find_products",
  ports: ["products.list", "products.get"],
  description: "Найти товары магазина по названию и назвать их цены. Только чтение.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Название товара или его часть, например «тройчатка»" },
      limit: { type: "number", description: "Сколько товаров показать, до 10 (по умолчанию 5)" },
    },
    required: ["query"],
  },
  async run(input, ctx) {
    const query = str(input, "query");
    if (!query) return { text: "Не понял, какой товар искать." };
    const found = await searchProducts(ctx, query, int(input, "limit", 5, 10));
    if (!found.length) return { text: `Товаров по запросу «${query}» не нашлось.` };
    const rows = found.map(priceLine);
    return {
      text: `Нашлось ${found.length}:\n${rows.join("\n")}`,
      card: { title: `Товары: «${query}»`, rows, link: panelLink(ctx, found[0]!) },
    };
  },
};

const productStock: Tool = {
  name: "product_stock",
  ports: ["inventory.list"],
  description: "Остатки товара на складе: сколько лежит, сколько в резерве под заказы, сколько можно продать. Только чтение.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Название или артикул товара" } },
    required: ["query"],
  },
  async run(input, ctx) {
    const query = str(input, "query");
    if (!query) return { text: "Не понял, остаток какого товара нужен." };
    const body = (await ctx.shop.owner("/tenants/inventory-items", {
      q: searchStem(query),
      limit: 50,
      fields: "id,sku,title,stocked_quantity,reserved_quantity",
    })) as { inventory_items?: Row[] };
    const items = (body.inventory_items ?? []).filter((i) => matchesQuery(`${i.title} ${i.sku}`, query)).slice(0, 8);
    if (!items.length) return { text: `Складских позиций по запросу «${query}» не нашлось.` };
    const rows = items.map((i) => {
      const stocked = Number(i.stocked_quantity ?? 0);
      const reserved = Number(i.reserved_quantity ?? 0);
      return `${i.title ?? i.sku}: на складе ${stocked}, в резерве ${reserved}, можно продать ${stocked - reserved}`;
    });
    return { text: rows.join("\n"), card: { title: `Остатки: «${query}»`, rows } };
  },
};

const PERIODS: Record<string, string> = { today: "сегодня", "7d": "за 7 дней", "30d": "за 30 дней", custom: "за выбранные дни" };

const pct = (value: unknown): string =>
  typeof value === "number" ? ` (${value > 0 ? "+" : ""}${Math.round(value)}% к прошлому периоду)` : "";

const salesSummary: Tool = {
  name: "sales_summary",
  ports: ["orders.list"],
  description:
    "Продажи за период: выручка, число заказов, средний чек, отмены, сравнение с прошлым таким же периодом и самые продаваемые товары. Считает сервер магазина. Только чтение.",
  inputSchema: {
    type: "object",
    properties: {
      period: { type: "string", enum: ["today", "7d", "30d", "custom"], description: "Период; по умолчанию 7d" },
      from: { type: "string", description: "Для custom: первый день, YYYY-MM-DD" },
      to: { type: "string", description: "Для custom: последний день, YYYY-MM-DD" },
    },
  },
  async run(input, ctx) {
    const requested = str(input, "period") ?? "7d";
    const period = requested in PERIODS ? requested : "7d";
    const body = (await ctx.shop.owner("/tenants/analytics/summary", {
      period,
      from: period === "custom" ? (str(input, "from") ?? undefined) : undefined,
      to: period === "custom" ? (str(input, "to") ?? undefined) : undefined,
    })) as Row;
    if (body.has_orders === false) return { text: "У магазина пока нет ни одного заказа." };
    const currency = String(body.currency_code ?? "usd");
    const current = (body.current ?? {}) as Row;
    const change = (body.change ?? {}) as Row;
    const canceled = (body.canceled ?? {}) as Row;
    const top = ((body.top_products ?? []) as Row[]).slice(0, 3);
    const rows = [
      `Выручка: ${money(Number(current.revenue ?? 0), currency)}${pct(change.revenue_pct)}`,
      `Заказов: ${Number(current.order_count ?? 0)}${pct(change.order_count_pct)}`,
      `Средний чек: ${money(Number(current.aov ?? 0), currency)}`,
    ];
    if (Number(canceled.order_count ?? 0) > 0) {
      rows.push(`Отменено: ${canceled.order_count} на ${money(Number(canceled.revenue ?? 0), currency)}`);
    }
    if (top.length) {
      rows.push(`Лидеры: ${top.map((p) => `${p.title} (${p.quantity} шт.)`).join(", ")}`);
    }
    const others = ((body.currency_breakdown ?? []) as Row[]).filter((b) => b.currency_code !== currency);
    if (others.length) {
      rows.push(`Ещё в других валютах: ${others.map((b) => money(Number(b.revenue), String(b.currency_code))).join(", ")}`);
    }
    const title = `Продажи ${PERIODS[period]}`;
    return { text: `${title}:\n${rows.join("\n")}`, card: { title, rows } };
  },
};

const ORDER_STATUS: Record<string, string> = {
  pending: "в работе",
  completed: "выполнен",
  canceled: "отменён",
  archived: "в архиве",
  requires_action: "ждёт действия",
  draft: "черновик",
};
const FULFILLMENT: Record<string, string> = {
  not_fulfilled: "не собран",
  partially_fulfilled: "собран частично",
  fulfilled: "собран",
  partially_shipped: "отправлен частично",
  shipped: "отправлен",
  partially_delivered: "доставлен частично",
  delivered: "доставлен",
  canceled: "отгрузка отменена",
};
const PAYMENT: Record<string, string> = {
  not_paid: "не оплачен",
  awaiting: "ждёт оплаты",
  authorized: "оплата авторизована",
  captured: "оплачен",
  partially_refunded: "частично возвращён",
  refunded: "деньги возвращены",
  canceled: "оплата отменена",
  requires_action: "оплата ждёт действия",
};

const recentOrders: Tool = {
  name: "recent_orders",
  ports: ["orders.list"],
  description:
    "Последние заказы: номер, сумма, дата, статус заказа, оплаты и отгрузки, и сколько заказов всего за период. Без имён и контактов покупателей. Только чтение.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Сколько последних заказов назвать, до 10 (по умолчанию 5)" },
      days: { type: "number", description: "Только заказы за последние N дней (необязательно)" },
    },
  },
  async run(input, ctx) {
    const limit = int(input, "limit", 5, 10);
    const days = int(input, "days", 0, 366);
    const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;
    const body = (await ctx.shop.owner("/tenants/orders", {
      limit,
      order: "-created_at",
      fields: "id,display_id,created_at,total,currency_code,status,payment_status,fulfillment_status",
      "created_at[$gte]": since,
    })) as { orders?: Row[]; count?: number };
    const orders = body.orders ?? [];
    if (!orders.length) return { text: days ? `За ${days} дн. заказов нет.` : "Заказов пока нет." };
    const rows = orders.map((o) => {
      const status = [
        ORDER_STATUS[String(o.status)] ?? o.status,
        PAYMENT[String(o.payment_status)] ?? o.payment_status,
        FULFILLMENT[String(o.fulfillment_status)] ?? o.fulfillment_status,
      ].filter(Boolean);
      return `№${o.display_id}, ${money(Number(o.total ?? 0), String(o.currency_code ?? "usd"))}, ${day(String(o.created_at))}: ${status.join(", ")}`;
    });
    const total = typeof body.count === "number" ? body.count : orders.length;
    const head = days ? `Заказов за ${days} дн.: ${total}` : `Всего заказов: ${total}`;
    return {
      text: `${head}. Последние:\n${rows.join("\n")}`,
      card: { title: head, rows, link: { label: "Все заказы в панели", href: `${ctx.panelUrl}/orders` } },
    };
  },
};

const productReviews: Tool = {
  name: "product_reviews",
  ports: [],
  description:
    "Отзывы покупателей: оценка, текст, дата, есть ли ответ магазина. Без имён авторов. Можно по товару и по оценке. Только чтение.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Название товара (необязательно; без него — все отзывы)" },
      max_rating: { type: "number", description: "Только оценки не выше этой, например 3 для плохих" },
      min_rating: { type: "number", description: "Только оценки не ниже этой" },
      limit: { type: "number", description: "Сколько отзывов, до 10 (по умолчанию 5)" },
    },
  },
  async run(input, ctx) {
    const query = str(input, "query");
    let productIds: string[] | undefined;
    if (query) {
      productIds = (await searchProducts(ctx, query, 10)).map((p) => p.id);
      if (!productIds.length) return { text: `Товара «${query}» не нашлось, отзывы показать не к чему.` };
    }
    const min = int(input, "min_rating", 1, 5);
    const max = int(input, "max_rating", 5, 5);
    const body = (await ctx.shop.owner("/tenants/reviews", {
      product_id: productIds,
      limit: 50,
      order: "-written_at",
    })) as { reviews?: Row[]; count?: number };
    const reviews = (body.reviews ?? [])
      .filter((r) => Number(r.rating) >= min && Number(r.rating) <= max)
      .slice(0, int(input, "limit", 5, 10));
    if (!reviews.length) return { text: "Подходящих отзывов нет." };
    // The author's name stays in the shop: it is personal data and the answer does not need it.
    const rows = reviews.map((r) => {
      const product = (r.product as Row | null)?.title;
      const text = [r.title, r.body].filter(Boolean).join(". ");
      const reply = r.reply ? " Магазин ответил." : " Без ответа.";
      return `${r.rating}★ ${day(String(r.written_at ?? r.created_at))}${product ? `, ${product}` : ""}: ${text}${reply}`;
    });
    const avg = reviews.reduce((sum, r) => sum + Number(r.rating), 0) / reviews.length;
    return {
      text: `Отзывов: ${reviews.length}, средняя оценка ${avg.toFixed(1)}.\n${rows.join("\n")}`,
      card: { title: query ? `Отзывы: «${query}»` : "Отзывы", rows, link: { label: "Отзывы в панели", href: `${ctx.panelUrl}/reviews` } },
    };
  },
};

const openProduct: Tool = {
  name: "open_product",
  ports: ["products.get"],
  description: "Дать ссылку, чтобы открыть товар в панели магазина и на витрине. Только чтение.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Название товара" } },
    required: ["query"],
  },
  async run(input, ctx) {
    const query = str(input, "query");
    if (!query) return { text: "Не понял, какой товар открыть." };
    const [product] = await searchProducts(ctx, query, 1);
    if (!product) return { text: `Товара «${query}» не нашлось.` };
    const storefront = `${ctx.storefrontUrl}/${ctx.locale}/products/${product.handle}`;
    return {
      text: `Открываю «${product.title}». Ссылка на панель на экране.`,
      card: { title: product.title, rows: [priceLine(product), `На витрине: ${storefront}`], link: panelLink(ctx, product) },
    };
  },
};

export const TOOLS: Tool[] = [findProducts, productStock, salesSummary, recentOrders, productReviews, openProduct];

export const toolSpecs = (): ToolSpec[] =>
  TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { text: `Инструмента ${name} нет.` };
  try {
    return await tool.run(input, ctx);
  } catch (err) {
    return { text: `Не удалось прочитать данные магазина: ${err instanceof Error ? err.message : "ошибка запроса"}.` };
  }
}
