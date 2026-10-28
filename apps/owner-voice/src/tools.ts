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
import { CHANGE_TOOLS } from "./changes.ts";
import { COMMAND_TOOLS } from "./commands/tools.ts";
import { IMAGE_TOOLS } from "./images/tools.ts";
import type { ProposalStore } from "./commands/run.ts";
import type { ChangeFlow } from "./changes.ts";
import type { FileStore } from "./files/index.ts";
import type { ImageService } from "./images/index.ts";
import type { Lookup } from "./images/net.ts";
import type { FetchFn } from "./shop/api.ts";
import type { Query, ShopApi } from "./shop/api.ts";
import { fold, matchesQuery } from "./shop/fixtures.ts";

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** What the screen shows next to the spoken answer. */
export interface Card {
  title: string;
  rows: string[];
  link?: { label: string; href: string } | undefined;
  /**
   * A result (the default), a write waiting for the owner, the dry-run of a
   * confirmed one; stage 3: a changeset, a refusal, a publish or rollback to
   * confirm, a rollback stopped by drift, a generated image, a file read, a
   * voice message's transcript, a notice (a cap, a flag).
   */
  kind?: "result" | "proposal" | "dryrun" | "changeset" | "denied" | "confirm" | "drift" | "image" | "file" | "voice-note" | "notice";
  /** For a proposal: the id the owner confirms it by. */
  proposalId?: string;
  /** For a proposal or a dry-run: the exact request (a dry-run never sends it). */
  request?: { method: string; url: string; body: unknown };
  /** For a changeset card: which one and where it stands. */
  changeset?: { id: string; status: string };
  /** Buttons: `publish`, `rollback`, `prepare-publish`, `prepare-rollback`, `place-product`, `place-banner`, `edit-bg`, `edit-light`, `redo`, `cancel`, `pick-photo`. */
  actions?: { label: string; action: string; id: string }[];
  /** For drift: what publishing left against what the live site holds now. */
  diff?: { field: string; before: string; after: string }[];
  /** For an image: the preview the stand serves. */
  image?: { src: string; alt: string };
  /** The same card with several pictures: before and after, or the pictures found on a page. */
  images?: { src: string; alt: string; label: string }[];
  /** A file to save, e.g. a transcript as .txt. */
  download?: { label: string; href: string };
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
  /** The engine's base URL, for the request a proposal shows. */
  apiUrl?: string;
  /** Where proposed writes wait for the owner's confirm. */
  proposals?: ProposalStore;
  /** Stage 3, `CHANGESETS=1`: changesets on stage, publish and rollback. Absent: off. */
  changes?: ChangeFlow;
  /** Stage 3: image generation; absent when off (RU, `IMAGES=0`). */
  images?: ImageService;
  /** Why images are off, said to the owner when absent. */
  imagesOff?: string;
  /** The owner's uploads, for a photo sent in the chat. */
  files?: FileStore;
  /** What the photo flow remembers between messages: the working photo, the pictures found on a page, the operation asked. */
  photos?: PhotoState;
  /** The outgoing-request door for a page link and its pictures; tests put a fake in. */
  net?: { fetch?: FetchFn; lookup?: Lookup };
}

export interface PhotoState {
  /** A file id (sent in the chat) or an image id (picked from a page). */
  lastFile: string | null;
  /** The pictures found on the last page, as image ids, in the order shown. */
  candidates: string[];
  /** «убери фон» said with a link: it runs on the picture the owner picks. */
  pendingOp: "remove-bg" | "even-light" | null;
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
  return fold(longest).slice(0, 5);
}

/** Pages read when the API's own search finds nothing: up to this many rows of the list. */
const SCAN_PAGE = 100;
const SCAN_MAX = 500;

/**
 * The API's `q` is a plain substring that does not fold ё, so «мумие» misses
 * «Мумиё». When the search finds nothing, read the list itself page by page and
 * match locally with folded text.
 */
async function scanList(
  read: (query: Query) => Promise<unknown>,
  key: string,
  base: Query,
  keep: (row: Row) => boolean,
): Promise<Row[]> {
  const found: Row[] = [];
  for (let offset = 0; offset < SCAN_MAX; offset += SCAN_PAGE) {
    const body = (await read({ ...base, limit: SCAN_PAGE, offset })) as Record<string, unknown>;
    const rows = (body[key] as Row[] | undefined) ?? [];
    found.push(...rows.filter(keep));
    const count = typeof body.count === "number" ? body.count : null;
    if (rows.length < SCAN_PAGE || (count !== null && offset + SCAN_PAGE >= count)) break;
  }
  return found;
}

interface StoreProduct {
  id: string;
  title: string;
  handle: string;
  variants?: { title?: string; sku?: string | null; calculated_price?: { calculated_amount?: number | null; currency_code?: string | null } | null }[];
}

async function searchProducts(ctx: ToolContext, query: string, limit: number): Promise<StoreProduct[]> {
  const regionId = await ctx.shop.regionId();
  const base: Query = {
    region_id: regionId ?? undefined,
    fields: "id,title,handle,*variants.calculated_price,variants.title,variants.sku",
  };
  const keep = (p: Row) => matchesQuery(`${p.title} ${p.handle}`, query);
  const read = (q: Query) => ctx.shop.store("/store/products", q);
  const body = (await read({ ...base, q: searchStem(query), limit: 20 })) as { products?: Row[] };
  let found = (body.products ?? []).filter(keep);
  if (!found.length) found = await scanList(read, "products", base, keep);
  return (found as unknown as StoreProduct[]).slice(0, limit);
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
    const base: Query = { fields: "id,sku,title,stocked_quantity,reserved_quantity" };
    const keep = (i: Row) => matchesQuery(`${i.title} ${i.sku}`, query);
    const read = (q: Query) => ctx.shop.owner("/tenants/inventory-items", q);
    const body = (await read({ ...base, q: searchStem(query), limit: 50 })) as { inventory_items?: Row[] };
    let items = (body.inventory_items ?? []).filter(keep);
    if (!items.length) items = await scanList(read, "inventory_items", base, keep);
    items = items.slice(0, 8);
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

/** The stage 1 read tools, the command-map tools and stage 3's changes and images; read at call time, after the modules load. */
const allTools = (): Tool[] => [...TOOLS, ...COMMAND_TOOLS, ...CHANGE_TOOLS, ...IMAGE_TOOLS];

export const toolSpecs = (): ToolSpec[] =>
  allTools().map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const tool = allTools().find((t) => t.name === name);
  if (!tool) return { text: `Инструмента ${name} нет.` };
  try {
    return await tool.run(input, ctx);
  } catch (err) {
    // The cause (path, HTTP status) goes to the log; the owner hears a plain sentence.
    console.error(`[owner-voice] tool ${name} failed:`, err instanceof Error ? err.message : err);
    return { text: "Не удалось прочитать данные магазина, попробуйте чуть позже." };
  }
}
