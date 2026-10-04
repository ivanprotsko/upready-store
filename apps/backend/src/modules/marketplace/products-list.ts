import { MedusaError } from "@medusajs/framework/utils";
import { articleKey } from "./catalog";

/**
 * «Wildberries → Товары» (task-02 of mp-section-design, Ivan 2026-10-05): the
 * cards of ONE marketplace as the import stored them in `mp_product`, with
 * their price and stock from `mp_offer` and their tie to the shop from
 * `mp_link`. The screen is «Товары» of the shop with the marketplace's
 * columns, so the list is paged, filtered, searched and sorted by the server
 * the way `/tenants/products` is.
 *
 * PURE. The rows come from the loader (`api/tenants/marketplaces/[marketplace]/
 * products/products-data.ts`), the decisions come from here: what the query
 * string means, which state a card's link is in, what the price and the stock
 * of a card are, and which page of which order the owner sees.
 *
 * READ-ONLY toward the marketplaces, with nothing to enforce: nothing here
 * sends anything anywhere. Opening the screen reads our own database and
 * nothing else (`__tests__/products-read-only.unit.spec.ts`).
 */

export const PRODUCT_ORDER_FIELDS = ["title", "vendor_code", "price", "stock", "synced_at"] as const;
export type ProductOrderField = (typeof PRODUCT_ORDER_FIELDS)[number];

/** The newest import first, so «Обновлено» reads top-down like a log. */
export const DEFAULT_PRODUCT_ORDER = "-synced_at";

export const PRODUCT_LINK_STATES = ["linked", "not_found", "needs_choice"] as const;
export type ProductLinkState = (typeof PRODUCT_LINK_STATES)[number];

export const DEFAULT_PRODUCTS_LIMIT = 20;
const MAX_PRODUCTS_LIMIT = 200;

/** `{ "$gte": iso, "$lte": iso }`, the shape the panel's date filter writes (`created_at` of the shop's products). */
export type DateRange = { $gte?: string; $lte?: string; $gt?: string; $lt?: string };

export type ProductsListQuery = {
  limit: number;
  offset: number;
  q: string | null;
  order: { field: ProductOrderField; desc: boolean };
  link_state: ProductLinkState[] | null;
  category: string[] | null;
  brand: string[] | null;
  synced_at: DateRange | null;
};

/* ----------------------------------------------------------------------------
 * The query string
 * ------------------------------------------------------------------------- */

const invalid = (message: string) => new MedusaError(MedusaError.Types.INVALID_DATA, message);

/**
 * A list parameter, either `a,b,c` (what the panel's filter row writes) or a
 * repeated key (`?brand=a&brand=b`, which the query parser hands over as an
 * array). Empty items are dropped: `?brand=` filters nothing rather than
 * filtering for a brand called "".
 *
 * A value that itself holds a comma cannot be expressed in the first form. No
 * category or brand on the stand has one (measured 2026-10-05: 58 categories,
 * one brand); the repeated form is there for the day one does.
 */
const listOf = (raw: unknown): string[] | null => {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return parts.length ? [...new Set(parts)] : null;
};

const integer = (raw: unknown, name: string, fallback: number, min: number, max: number): number => {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw invalid(`${name} должен быть целым числом не меньше ${min}, пришло «${String(raw)}».`);
  }
  return Math.min(parsed, max);
};

const DATE_KEYS = ["$gte", "$lte", "$gt", "$lt"] as const;

const dateRange = (raw: unknown, name: string): DateRange | null => {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw invalid(`${name}: ожидается JSON вида {"$gte": "…", "$lte": "…"}.`);
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalid(`${name}: ожидается объект с $gte, $lte, $gt или $lt.`);
  }
  const range: DateRange = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!(DATE_KEYS as readonly string[]).includes(key)) {
      throw invalid(`${name}: неизвестный оператор ${key}. Есть: ${DATE_KEYS.join(", ")}.`);
    }
    const time = new Date(String(value)).getTime();
    if (Number.isNaN(time)) {
      throw invalid(`${name}.${key}: «${String(value)}» не дата.`);
    }
    range[key as keyof DateRange] = new Date(time).toISOString();
  }
  return Object.keys(range).length ? range : null;
};

/**
 * The query string of `GET /tenants/marketplaces/:marketplace/products`.
 *
 * An unknown `order` field or `link_state` value is a 400 that names what
 * exists, not a quiet fallback to the default: a list sorted by something
 * other than what the address says looks right and is not (rule 20a).
 */
export const parseProductsQuery = (query: Record<string, unknown>): ProductsListQuery => {
  const rawOrder = query.order === undefined || query.order === "" ? DEFAULT_PRODUCT_ORDER : String(query.order);
  const desc = rawOrder.startsWith("-");
  const field = desc ? rawOrder.slice(1) : rawOrder;
  if (!(PRODUCT_ORDER_FIELDS as readonly string[]).includes(field)) {
    throw invalid(`order: поля «${field}» нет. Есть: ${PRODUCT_ORDER_FIELDS.join(", ")} (с «-» по убыванию).`);
  }

  const linkState = listOf(query.link_state);
  const unknownState = linkState?.find((state) => !(PRODUCT_LINK_STATES as readonly string[]).includes(state));
  if (unknownState) {
    throw invalid(`link_state: значения «${unknownState}» нет. Есть: ${PRODUCT_LINK_STATES.join(", ")}.`);
  }

  const q = query.q === undefined || query.q === null ? "" : String(query.q).trim();

  return {
    limit: integer(query.limit, "limit", DEFAULT_PRODUCTS_LIMIT, 1, MAX_PRODUCTS_LIMIT),
    offset: integer(query.offset, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
    q: q || null,
    order: { field: field as ProductOrderField, desc },
    link_state: linkState as ProductLinkState[] | null,
    category: listOf(query.category),
    brand: listOf(query.brand),
    synced_at: dateRange(query.synced_at, "synced_at"),
  };
};

/* ----------------------------------------------------------------------------
 * The rows
 * ------------------------------------------------------------------------- */

/** One `mp_product` row, as much of it as the screen needs. */
export type ProductCard = {
  id: string;
  marketplace: string;
  external_id: string;
  vendor_code: string | null;
  /** Ozon `sku`; `null` on WB. */
  sku_external: string | null;
  title: string | null;
  brand: string | null;
  category_name: string | null;
  /** `mp_product.photos` exactly as stored: WB an array of size variants per photo. */
  photos: unknown;
  mp_updated_at: string | null;
  synced_at: string;
};

/**
 * The `mp_offer` lines of one card, aggregated by the database
 * (`min`, `min`, `sum`, `count`). The loader reads them this way so a list
 * request does not carry every line of every card into the process.
 *
 * `stock_sum` is the database's `sum(stock)`, which is `NULL` when no line
 * reported a stock, and stays `null` here: the marketplace said nothing, which
 * is not «0 шт» (rule 20a).
 */
export type OfferAggregate = {
  external_id: string;
  min_price: number | null;
  min_discount_price: number | null;
  currency: string | null;
  stock_sum: number | null;
  lines: number;
};

/** One line of `mp_offer`, for the card page and for the aggregate's reference implementation. */
export type OfferLine = {
  size_external: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  price: number | null;
  discount_price: number | null;
  currency: string | null;
  stock: number | null;
  reserved: number | null;
  measured_at: string | null;
};

/** One live `mp_link` row. */
export type StoredProductLink = {
  id: string;
  external_id: string;
  product_id: string;
  variant_id: string | null;
  matched_by: string;
};

/** One variant of the shop, as much of it as matching needs (`tenantVariants`). */
export type ShopVariantRef = { id: string; product_id: string; sku: string | null };

export type ProductLink = {
  /** The `mp_link.id`, for «Отвязать». `null` when there is no link. */
  id: string | null;
  state: ProductLinkState;
  product_id: string | null;
  product_title: string | null;
  variant_id: string | null;
  matched_by: "vendor_code" | "manual" | null;
  /** Variants of the shop whose SKU is this card's article. */
  candidates: number;
};

/** One row of the list: `MpProductRow` of the panel's contract (`hooks/api/marketplace-section.tsx`). */
export type ProductRow = {
  id: string;
  marketplace: string;
  external_id: string;
  vendor_code: string | null;
  title: string | null;
  brand: string | null;
  category_name: string | null;
  thumbnail: string | null;
  photos_count: number;
  price: number | null;
  discount_price: number | null;
  currency: string | null;
  stock: number | null;
  offers: number;
  link: ProductLink;
  mp_updated_at: string | null;
  synced_at: string;
  url: string | null;
};

/* ---- the price and the stock of a card */

const known = (values: readonly (number | null)[]): number[] =>
  values.filter((value): value is number => value !== null && Number.isFinite(value));

/**
 * The card's numbers from its lines, by the rule «Цены и остатки» uses for the
 * same card (`aggregateLines` in `price-stock.ts`): the LOWEST price and the
 * LOWEST discounted price over the lines, and the stock summed over the lines
 * that reported one. A card with sizes has a price per size, so one number is
 * a choice; the lowest is the one both screens make.
 *
 * This is the reference the loader's SQL (`min`, `min`, `sum`) is held to; the
 * card page aggregates its own lines through it, and the HTTP suite checks the
 * list row against the card page for the same card.
 */
export const aggregateOfferLines = (external_id: string, lines: readonly OfferLine[]): OfferAggregate => {
  const prices = known(lines.map((line) => line.price));
  const discounts = known(lines.map((line) => line.discount_price));
  const stocks = known(lines.map((line) => line.stock));
  return {
    external_id,
    min_price: prices.length ? Math.min(...prices) : null,
    min_discount_price: discounts.length ? Math.min(...discounts) : null,
    currency: lines.find((line) => line.currency)?.currency ?? null,
    stock_sum: stocks.length ? stocks.reduce((sum, value) => sum + value, 0) : null,
    lines: lines.length,
  };
};

/* ---- photos */

/** The sizes of a WB photo, small to large; an Ozon photo is a bare URL. */
const THUMB_KEYS = ["tm", "c246x328", "square", "c516x688", "big", "hq"];
const LARGE_KEYS = ["c516x688", "big", "hq", "c246x328", "tm", "square"];

const photoUrl = (photo: unknown, keys: readonly string[]): string | null => {
  if (typeof photo === "string") {
    return photo || null;
  }
  if (photo && typeof photo === "object") {
    const sizes = photo as Record<string, unknown>;
    for (const key of keys) {
      if (typeof sizes[key] === "string" && sizes[key]) {
        return sizes[key] as string;
      }
    }
  }
  return null;
};

/** Every photo of the card as one URL each, in the card's order. */
export const photoUrls = (photos: unknown, size: "thumb" | "large" = "large"): string[] =>
  Array.isArray(photos)
    ? photos
        .map((photo) => photoUrl(photo, size === "thumb" ? THUMB_KEYS : LARGE_KEYS))
        .filter((url): url is string => Boolean(url))
    : [];

/* ---- the card on the marketplace's site */

/**
 * «Открыть на Wildberries»: the buyer's page of the card. WB's is addressed by
 * `nmID` alone. Ozon's buyer page is addressed by its `sku`, which this layer
 * holds, but the address is not traced to Ozon's documentation here and the
 * Ozon screens are a stub, so it is `null` until that adapter ships (rule 17a).
 */
export const cardUrl = (card: Pick<ProductCard, "marketplace" | "external_id">): string | null =>
  card.marketplace === "wb" && /^\d+$/.test(card.external_id)
    ? `https://www.wildberries.ru/catalog/${card.external_id}/detail.aspx`
    : null;

/* ---- the link to the shop */

/**
 * The link state of one card, the way the catalog screen decides it
 * (`buildCatalogRows`, w14) so that two screens of one panel cannot disagree:
 *
 *   a live `mp_link` row          -> linked (by the article or by a person)
 *   no row, no variant has the SKU -> not_found («Нет в магазине»)
 *   no row, one or more variants   -> needs_choice («Требует выбора»)
 *
 * The last line covers two facts. Several variants carry the article and no
 * rule may choose (`link.ts`, the matcher's third outcome); or exactly one does
 * and the auto-link has not written it yet. Neither is linked — `mp_link` is
 * empty — and neither is «нет в магазине», because the shop does carry the
 * article. `candidates` tells them apart for whoever needs to.
 */
export const productLink = (
  card: Pick<ProductCard, "external_id" | "vendor_code">,
  link: StoredProductLink | undefined,
  candidatesBySku: ReadonlyMap<string, number>,
  productTitles: ReadonlyMap<string, string | null>,
): ProductLink => {
  const sku = articleKey(card.vendor_code);
  const candidates = sku ? (candidatesBySku.get(sku) ?? 0) : 0;

  if (link) {
    return {
      id: link.id,
      state: "linked",
      product_id: link.product_id,
      product_title: productTitles.get(link.product_id) ?? null,
      variant_id: link.variant_id,
      matched_by: link.matched_by === "manual" ? "manual" : "vendor_code",
      candidates,
    };
  }

  return {
    id: null,
    state: candidates > 0 ? "needs_choice" : "not_found",
    product_id: null,
    product_title: null,
    variant_id: null,
    matched_by: null,
    candidates,
  };
};

/** How many variants of the shop carry each article, keyed the way `link.ts` compares them. */
export const candidatesBySku = (variants: readonly ShopVariantRef[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const variant of variants) {
    const sku = articleKey(variant.sku);
    if (sku) {
      counts.set(sku, (counts.get(sku) ?? 0) + 1);
    }
  }
  return counts;
};

/* ---- one row */

export const buildProductRow = (
  card: ProductCard,
  offers: OfferAggregate | undefined,
  link: ProductLink,
): ProductRow => {
  const photos = photoUrls(card.photos, "thumb");
  return {
    id: card.id,
    marketplace: card.marketplace,
    external_id: card.external_id,
    vendor_code: card.vendor_code,
    title: card.title,
    brand: card.brand,
    category_name: card.category_name,
    thumbnail: photos[0] ?? null,
    photos_count: photos.length,
    price: offers?.min_price ?? null,
    discount_price: offers?.min_discount_price ?? null,
    currency: offers?.currency ?? null,
    stock: offers?.stock_sum ?? null,
    offers: offers?.lines ?? 0,
    link,
    mp_updated_at: card.mp_updated_at,
    synced_at: card.synced_at,
    url: cardUrl(card),
  };
};

/* ----------------------------------------------------------------------------
 * Filter, search, order, page
 * ------------------------------------------------------------------------- */

const inRange = (iso: string | null, range: DateRange | null): boolean => {
  if (!range) {
    return true;
  }
  if (!iso) {
    return false;
  }
  const time = new Date(iso).getTime();
  if (range.$gte && time < new Date(range.$gte).getTime()) {
    return false;
  }
  if (range.$gt && time <= new Date(range.$gt).getTime()) {
    return false;
  }
  if (range.$lte && time > new Date(range.$lte).getTime()) {
    return false;
  }
  if (range.$lt && time >= new Date(range.$lt).getTime()) {
    return false;
  }
  return true;
};

const contains = (value: string | null, needle: string): boolean =>
  value !== null && value.toLocaleLowerCase("ru").includes(needle);

/**
 * Search and filters. `q` matches the title, the article and the marketplace's
 * own id as a case-insensitive substring (ILIKE `%q%`), so «1239» finds an
 * `nmID` and «мумиё» a title. Lists are OR inside one filter and AND across
 * filters, the way the shop's product filters combine.
 */
export const filterProducts = (rows: readonly ProductRow[], query: ProductsListQuery): ProductRow[] => {
  const needle = query.q?.toLocaleLowerCase("ru") ?? null;
  return rows.filter(
    (row) =>
      (!needle ||
        contains(row.title, needle) ||
        contains(row.vendor_code, needle) ||
        contains(row.external_id, needle)) &&
      (!query.link_state || query.link_state.includes(row.link.state)) &&
      (!query.category || (row.category_name !== null && query.category.includes(row.category_name))) &&
      (!query.brand || (row.brand !== null && query.brand.includes(row.brand))) &&
      inRange(row.synced_at, query.synced_at),
  );
};

const sortValue = (row: ProductRow, field: ProductOrderField): string | number | null => {
  switch (field) {
    case "title":
      return row.title;
    case "vendor_code":
      return row.vendor_code;
    case "price":
      /** What the owner sees in the column: the discounted price where there is one. */
      return row.discount_price ?? row.price;
    case "stock":
      return row.stock;
    case "synced_at":
      return row.synced_at ? new Date(row.synced_at).getTime() : null;
  }
};

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

/**
 * One order, applied by the server so page 2 continues page 1.
 *
 * A card with no value in the sorted column goes LAST in both directions: a
 * card whose stock nobody reported is not «меньше всех», and putting it first
 * on an ascending sort would fill page 1 with dashes. Ties are broken by the
 * marketplace's id, so the same query gives the same pages every time (the
 * stand's 423 cards share five `synced_at` values).
 */
export const sortProducts = (
  rows: readonly ProductRow[],
  order: ProductsListQuery["order"],
): ProductRow[] =>
  [...rows].sort((a, b) => {
    const va = sortValue(a, order.field);
    const vb = sortValue(b, order.field);
    if (va === null && vb !== null) {
      return 1;
    }
    if (vb === null && va !== null) {
      return -1;
    }
    if (va !== null && vb !== null && va !== vb) {
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : collator.compare(String(va), String(vb));
      if (cmp !== 0) {
        return order.desc ? -cmp : cmp;
      }
    }
    return collator.compare(a.external_id, b.external_id);
  });

export type Facet = { value: string; label: string; count: number };

/**
 * The values a filter offers, with how many cards carry each, over ALL the
 * cards of the marketplace and not over the current page: an option that
 * vanished whenever another filter was on would make the filter row change
 * under the owner's hand. A card without a brand is in no option; the count
 * of such cards is what is left of the total.
 */
export const facetOf = (rows: readonly ProductRow[], pick: (row: ProductRow) => string | null): Facet[] => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = pick(row);
    if (value) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || collator.compare(a.label, b.label));
};

export type ProductsPage = {
  products: ProductRow[];
  count: number;
  limit: number;
  offset: number;
  categories: Facet[];
  brands: Facet[];
};

/** Everything the list answers, from every row of the marketplace and the query. */
export const productsPage = (rows: readonly ProductRow[], query: ProductsListQuery): ProductsPage => {
  const matched = sortProducts(filterProducts(rows, query), query.order);
  return {
    products: matched.slice(query.offset, query.offset + query.limit),
    count: matched.length,
    limit: query.limit,
    offset: query.offset,
    categories: facetOf(rows, (row) => row.category_name),
    brands: facetOf(rows, (row) => row.brand),
  };
};

/* ----------------------------------------------------------------------------
 * The card page
 * ------------------------------------------------------------------------- */

/** One line of the card page: `MpOfferLine` of the panel's contract. */
export type ProductOfferLine = {
  size: string | null;
  warehouse: string | null;
  price: number | null;
  discount_price: number | null;
  stock: number | null;
  reserved: number | null;
  measured_at: string | null;
};

type Row = Record<string, unknown>;

const asText = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
};

/**
 * WB's size names by `chrtID`, from the card's own `sizes` (`mp_product.
 * attributes.sizes`). `techSize` «0» is WB's word for a one-size item, which
 * the page shows as «без размера» rather than as a size called «0».
 */
export const sizeNames = (attributes: unknown): Map<string, string | null> => {
  const names = new Map<string, string | null>();
  const sizes = attributes && typeof attributes === "object" ? (attributes as Row).sizes : null;
  if (!Array.isArray(sizes)) {
    return names;
  }
  for (const size of sizes as Row[]) {
    const id = asText(size?.chrtID);
    if (!id) {
      continue;
    }
    const name = asText(size.techSize) ?? asText(size.wbSize);
    names.set(id, name === "0" ? null : name);
  }
  return names;
};

/**
 * The lines of one card, sizes together and warehouses by name inside a size.
 * A line with no warehouse is a size that is priced and stocked nowhere
 * (`normalize.offers` of WB): it stays on the page, with a dash for the stock.
 */
export const offerLinesOf = (lines: readonly OfferLine[], attributes: unknown): ProductOfferLine[] => {
  const names = sizeNames(attributes);
  return lines
    .map((line) => ({
      size: line.size_external
        ? names.has(line.size_external)
          ? (names.get(line.size_external) ?? null)
          : line.size_external
        : null,
      warehouse: line.warehouse_name ?? line.warehouse_id ?? null,
      price: line.price,
      discount_price: line.discount_price,
      stock: line.stock,
      reserved: line.reserved,
      measured_at: line.measured_at,
    }))
    .sort(
      (a, b) =>
        collator.compare(a.size ?? "", b.size ?? "") ||
        (a.warehouse === null ? 1 : 0) - (b.warehouse === null ? 1 : 0) ||
        collator.compare(a.warehouse ?? "", b.warehouse ?? ""),
    );
};

const characteristicValue = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    const parts = value.map(asText).filter((part): part is string => Boolean(part));
    return parts.length ? parts.join(", ") : null;
  }
  return asText(value);
};

/**
 * «Характеристики» of the card page, as `name → value`.
 *
 * Two sources, in this order. The marketplace's own characteristics, under the
 * names the marketplace gives them («Страна производства», «Объем товара»):
 * WB keeps them on the card (`characteristics[]` of `content/v2/get/cards/list`),
 * and the loader passes them from the card's raw row, because the normalized
 * `mp_product.attributes` does not carry them yet. Then the structural fields
 * that `mp_product.attributes` does carry, under fixed keys the panel
 * translates: `imt_id`, `subject_id`, `sizes`, and the four `dimensions`.
 *
 * A characteristic with no value is left out rather than shown empty.
 */
export const attributesOf = (attributes: unknown, characteristics: unknown): Record<string, string> => {
  const out: Record<string, string> = {};

  if (Array.isArray(characteristics)) {
    for (const entry of characteristics as Row[]) {
      const name = asText(entry?.name);
      const value = characteristicValue(entry?.value);
      if (name && value) {
        out[name] = value;
      }
    }
  }

  const source = attributes && typeof attributes === "object" ? (attributes as Row) : {};
  const imt = asText(source.imt_id);
  if (imt) {
    out.imt_id = imt;
  }
  const subject = asText(source.subject_id);
  if (subject) {
    out.subject_id = subject;
  }
  const sizes = [...sizeNames(source).values()].filter((name): name is string => Boolean(name));
  if (sizes.length) {
    out.sizes = sizes.join(", ");
  }
  const dimensions = source.dimensions && typeof source.dimensions === "object" ? (source.dimensions as Row) : {};
  for (const [key, out_key] of [
    ["length", "dimensions_length"],
    ["width", "dimensions_width"],
    ["height", "dimensions_height"],
    ["weightBrutto", "dimensions_weight"],
  ] as const) {
    const value = asText(dimensions[key]);
    if (value) {
      out[out_key] = value;
    }
  }

  return out;
};
