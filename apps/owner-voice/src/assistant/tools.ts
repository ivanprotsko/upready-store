/**
 * The buyer assistant's tools: what a shop visitor may ask. Ported from the
 * chrxnasdmds storefront agent (`apps/storefront/src/lib/agent/tools.ts`,
 * product search, product facts, categories, info pages), cut to this
 * engine's public Store API.
 *
 * Only `/store/*` is reachable: the context holds a `store` reader and
 * nothing else, so no tool can ask `/tenants/*`, an order or a customer. The
 * only data is the public catalog and the shop's own pages.
 */
import { fold, matchesQuery } from "../shop/fixtures.ts";
import type { Query } from "../shop/api.ts";
import { type Card, money, searchStem, type ToolOutcome, type ToolSpec } from "../tools.ts";

export interface StoreContext {
  /** `GET /store/...`; the assistant has no other way to the shop. */
  store(path: string, query?: Query): Promise<unknown>;
  regionId(): Promise<string | null>;
  storefrontUrl: string;
  locale: string;
}

export interface StoreTool extends ToolSpec {
  run(input: Record<string, unknown>, ctx: StoreContext): Promise<ToolOutcome>;
}

type Row = Record<string, unknown>;

const str = (input: Record<string, unknown>, key: string): string | null => {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

/** Descriptions and categories come with every product: the fixture keys its richer recording on them. */
const FIELDS = "id,title,handle,subtitle,description,*categories,*variants.calculated_price,variants.title,variants.sku,variants.manage_inventory,variants.allow_backorder,+variants.inventory_quantity";

interface Product {
  id: string;
  title: string;
  handle: string;
  subtitle?: string | null;
  description?: string | null;
  categories?: { id: string; name: string; handle: string }[];
  variants?: {
    title?: string;
    manage_inventory?: boolean;
    allow_backorder?: boolean;
    inventory_quantity?: number | null;
    calculated_price?: { calculated_amount?: number | null; currency_code?: string | null } | null;
  }[];
}

async function products(ctx: StoreContext, query: Query): Promise<Product[]> {
  const regionId = await ctx.regionId();
  const body = (await ctx.store("/store/products", { fields: FIELDS, region_id: regionId ?? undefined, ...query })) as { products?: Row[] };
  return (body.products ?? []) as unknown as Product[];
}

async function findProducts(ctx: StoreContext, words: string, limit: number): Promise<Product[]> {
  const keep = (p: Product) => matchesQuery(`${p.title} ${p.handle}`, words);
  let found = (await products(ctx, { q: searchStem(words), limit: 20 })).filter(keep);
  if (!found.length) found = (await products(ctx, { limit: 100 })).filter(keep);
  return found.slice(0, limit);
}

const price = (p: Product): string => {
  const prices = (p.variants ?? []).map((v) => {
    const amount = v.calculated_price?.calculated_amount;
    return typeof amount === "number" ? money(amount, v.calculated_price?.currency_code ?? "usd") : "цена по запросу";
  });
  return [...new Set(prices)].join(" / ") || "цена по запросу";
};

/** In stock, from the variant's own flags: an untracked variant is always for sale. */
function availability(p: Product): string {
  const variants = p.variants ?? [];
  if (!variants.length) return "нет в продаже";
  const sellable = variants.some((v) => !v.manage_inventory || v.allow_backorder || Number(v.inventory_quantity ?? 0) > 0);
  return sellable ? "в наличии" : "нет в наличии";
}

const productUrl = (ctx: StoreContext, p: Product) => `${ctx.storefrontUrl}/${ctx.locale}/products/${p.handle}`;

/** A description to a few sentences of plain text. */
const short = (text: string | null | undefined, max = 420): string => {
  const plain = (text ?? "").replace(/[#*_`>|]/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max).replace(/\s+\S*$/, "")}…` : plain;
};

const searchProductsTool: StoreTool = {
  name: "search_products",
  description: "Найти товары магазина по словам и назвать цены и наличие.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Что ищет покупатель, например «свечи от варикоза»" } },
    required: ["query"],
  },
  async run(input, ctx) {
    const query = str(input, "query");
    if (!query) return { text: "Не понял, что искать." };
    const found = await findProducts(ctx, query, 5);
    if (!found.length) return { text: `По запросу «${query}» товаров не нашлось.` };
    const rows = found.map((p) => `${p.title} — ${price(p)}, ${availability(p)}`);
    return {
      text: `Нашлось ${found.length}:\n${rows.join("\n")}`,
      card: { title: `Товары: «${query}»`, rows, link: { label: `Открыть «${found[0]!.title}»`, href: productUrl(ctx, found[0]!) } },
    };
  },
};

const productInfoTool: StoreTool = {
  name: "product_info",
  description: "Факты об одном товаре: описание, цена, наличие, категория.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Название товара" } },
    required: ["query"],
  },
  async run(input, ctx) {
    const query = str(input, "query");
    if (!query) return { text: "Не понял, о каком товаре речь." };
    const [p] = await findProducts(ctx, query, 1);
    if (!p) return { text: `Товара «${query}» не нашлось.` };
    const rows = [
      `Цена: ${price(p)}`,
      `Наличие: ${availability(p)}`,
      ...(p.categories?.length ? [`Категория: ${p.categories.map((c) => c.name).join(", ")}`] : []),
      ...(p.description ? [short(p.description)] : []),
    ];
    return { text: `${p.title}.\n${rows.join("\n")}`, card: { title: p.title, rows, link: { label: "Открыть товар", href: productUrl(ctx, p) } } };
  },
};

async function categories(ctx: StoreContext): Promise<Row[]> {
  const body = (await ctx.store("/store/tenant/product-categories", { limit: 100, fields: "id,name,handle,parent_category_id" })) as {
    product_categories?: Row[];
  };
  return body.product_categories ?? [];
}

/** The category a phrase names, by its first five letters: «свечи», «мёд», «книги». */
export async function categoryFor(ctx: StoreContext, phrase: string): Promise<Row | null> {
  const said = fold(phrase).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  for (const c of await categories(ctx)) {
    const name = fold(String(c.name)).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
    if (name.length && name.every((n) => said.some((s) => s.slice(0, 5) === n.slice(0, 5) || (n.length < 5 && s.startsWith(n))))) return c;
  }
  return null;
}

const listCategoriesTool: StoreTool = {
  name: "list_categories",
  description: "Разделы каталога магазина.",
  inputSchema: { type: "object", properties: {} },
  async run(_input, ctx) {
    const rows = (await categories(ctx)).map((c) => String(c.name));
    if (!rows.length) return { text: "Разделов в каталоге нет." };
    return { text: `Разделы каталога: ${rows.join(", ")}.`, card: { title: "Каталог", rows } };
  },
};

const categoryProductsTool: StoreTool = {
  name: "category_products",
  description: "Товары одного раздела каталога с ценами.",
  inputSchema: {
    type: "object",
    properties: { category: { type: "string", description: "Название раздела, например «Мёд»" } },
    required: ["category"],
  },
  async run(input, ctx) {
    const name = str(input, "category");
    if (!name) return { text: "Не понял, какой раздел." };
    const category = await categoryFor(ctx, name);
    if (!category) return { text: `Раздела «${name}» нет.` };
    const found = await products(ctx, { category_id: String(category.id), limit: 8 });
    if (!found.length) return { text: `В разделе «${category.name}» пока пусто.` };
    const rows = found.map((p) => `${p.title} — ${price(p)}`);
    return {
      text: `В разделе «${category.name}»:\n${rows.join("\n")}`,
      card: { title: String(category.name), rows, link: { label: "Открыть раздел", href: `${ctx.storefrontUrl}/${ctx.locale}/categories/${category.handle}` } },
    };
  },
};

/** The shop's pages by the words a buyer uses for them. */
export const PAGE_WORDS: [RegExp, string][] = [
  [/возврат|вернуть|обмен/, "returns"],
  [/контакт|связат|телеграм|написать|позвонить/, "contacts"],
  [/доставк|оплат|услови|оферт|договор|заказать как|как заказать/, "offer"],
  [/конфиденц|персональн|данные/, "privacy"],
  [/о магазин|кто вы|о вас|о себе|кто продав/, "about"],
];

const infoPageTool: StoreTool = {
  name: "info_page",
  description: "Страница магазина: контакты, о магазине, условия продажи (доставка и оплата), возврат, конфиденциальность.",
  inputSchema: {
    type: "object",
    properties: { key: { type: "string", enum: ["contacts", "about", "offer", "returns", "privacy", "consent"], description: "Какая страница" } },
    required: ["key"],
  },
  async run(input, ctx) {
    const key = str(input, "key");
    if (!key || !/^[a-z-]{2,30}$/.test(key)) return { text: "Не понял, какая страница нужна." };
    const body = (await ctx.store(`/store/tenant/pages/${key}`)) as { page?: Row };
    const page = body.page;
    if (!page) return { text: "Такой страницы у магазина нет." };
    const rows = [short(String(page.body ?? ""), 600)];
    // The answer is the gist; the card holds the longer extract and the link.
    return {
      text: `${page.title}: ${short(String(page.body ?? ""), 200)}`,
      card: { title: String(page.title), rows, link: { label: "Открыть страницу", href: `${ctx.storefrontUrl}/${ctx.locale}/${key}` } },
    };
  },
};

export const STORE_TOOLS: StoreTool[] = [searchProductsTool, productInfoTool, listCategoriesTool, categoryProductsTool, infoPageTool];

export const storeToolSpecs = (): ToolSpec[] => STORE_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

export async function runStoreTool(name: string, input: Record<string, unknown>, ctx: StoreContext): Promise<ToolOutcome & { card?: Card }> {
  const tool = STORE_TOOLS.find((t) => t.name === name);
  if (!tool) return { text: `Инструмента ${name} нет.` };
  try {
    return await tool.run(input, ctx);
  } catch (err) {
    console.error(`[owner-voice] assistant tool ${name} failed:`, err instanceof Error ? err.message : err);
    return { text: "Не удалось прочитать каталог, попробуйте чуть позже." };
  }
}
