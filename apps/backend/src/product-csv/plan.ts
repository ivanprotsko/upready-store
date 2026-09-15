/**
 * The dry run (t14-product-import, step 2): the uploaded file measured against
 * the catalogue as it stands right now, row by row, with nothing written.
 *
 * Three decisions live here.
 *
 * MATCHING. A row finds its product by `Код товара` (the Medusa handle), and by
 * SKU when the handle cell is empty. Inside a product it finds its variant by
 * SKU, then by the variant's name, then — only when the product has exactly one
 * variant and the row named neither — by being the only candidate. A row that
 * names a SKU the product does not have adds a variant; a row that can match
 * several variants is rejected rather than guessed at.
 *
 * NEW PRODUCTS ARE DRAFTS. Always, even when the file says «опубликован». A
 * price list with a typo in it must not put a broken card in front of a
 * customer; publishing stays a decision made in the panel, per product.
 *
 * A FATAL ERROR REJECTS THE WHOLE FILE. Duplicate rows, a duplicate column, an
 * unknown currency, a file over the limits: the owner gets the list and nothing
 * is written. Half a catalogue is worse than none.
 */

import { metadataCell, normalizeHeader } from "./columns";
import type { SpreadsheetEncoding } from "./csv";
import type { CatalogCategory, CatalogSnapshot } from "./catalog";
import type { FatalError, ReadFileResult, RowDraft, RowError } from "./rows";

/** A file bigger than this is refused before it is parsed. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Rows (excluding the header) one file may carry. */
export const MAX_ROWS = 5_000;

export type RowAction = "create" | "create_variant" | "update" | "unchanged" | "reject";

export type FieldChange = {
  field: string;
  from: string;
  to: string;
};

export type ImageOutcome = {
  url: string;
  ok: boolean;
  error?: string;
};

export type PlannedRow = {
  line: number;
  action: RowAction;
  handle: string | null;
  sku: string | null;
  title: string | null;
  product_id: string | null;
  variant_id: string | null;
  /**
   * The product code a `create` row will get: what the file typed, or one
   * generated from the name. Filled in by `uniqueness.ts`, which is the only
   * step that can know whether a code is free platform-wide.
   */
  planned_handle?: string;
  changes: FieldChange[];
  /** Things the owner should know about a row that is otherwise fine. */
  notes: string[];
  errors: RowError[];
  /** Image URLs this row will download on confirm. */
  image_urls: string[];
  /** Filled in by `apply.ts`, one entry per URL it tried. */
  images?: ImageOutcome[];
  applied?: boolean;
  apply_error?: string;
};

export type ImportSummary = {
  rows: number;
  create: number;
  create_variant: number;
  update: number;
  unchanged: number;
  reject: number;
  images: number;
  images_failed?: number;
};

export type ImportStatus =
  | "pending"
  | "rejected"
  | "applied"
  | "partially_applied"
  | "cancelled";

export type ImportReport = {
  status: ImportStatus;
  filename: string;
  bytes: number;
  delimiter: string;
  /** Whether the uploaded bytes started with a BOM, which is what Excel writes. */
  bom: boolean;
  /** How the bytes were read: UTF-8, UTF-8 with a BOM, or Windows-1251. */
  encoding: SpreadsheetEncoding;
  summary: ImportSummary;
  fatal: FatalError[];
  /** Headers the importer does not know; they were ignored, not an error. */
  unknown_columns: string[];
  /** Category paths that do not exist yet and will be created on confirm. */
  categories_to_create: string[];
  currencies: string[];
  limits: { max_bytes: number; max_rows: number };
  rows: PlannedRow[];
  /** Set by `apply.ts` when a row failed mid-write; names the line it stopped on. */
  stopped_at_line?: number;
};

export type PlanInput = {
  file: ReadFileResult;
  snapshot: CatalogSnapshot;
  /** Currencies the store prices in; anything else in the header is fatal. */
  allowedCurrencies: string[];
  filename: string;
  bytes: number;
  bom: boolean;
  encoding: SpreadsheetEncoding;
  delimiter: string;
};

const sameNumber = (left: number | null, right: number | null): boolean => {
  if (left === null || right === null) {
    return left === right;
  }
  return Math.abs(left - right) < 1e-6;
};

const asText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

const pathKey = (path: string[]): string => path.map((part) => normalizeHeader(part)).join(" / ");

type CategoryIndex = {
  byPath: Map<string, CatalogCategory>;
};

const indexCategories = (categories: CatalogCategory[]): CategoryIndex => ({
  byPath: new Map(categories.map((category) => [pathKey(category.path), category])),
});

/**
 * Every level of the path that does not exist yet, longest last. Creating them
 * is the chosen behaviour (over refusing the row): a shop owner adding «АСД»
 * under «Добавки» in a spreadsheet means the category, and making them open the
 * panel to create it first would defeat the point of importing a price list.
 * Whatever gets created is named in the report before anything is written.
 */
export const missingCategoryLevels = (path: string[], index: CategoryIndex): string[][] => {
  const missing: string[][] = [];

  for (let depth = 1; depth <= path.length; depth += 1) {
    const prefix = path.slice(0, depth);
    if (!index.byPath.has(pathKey(prefix))) {
      missing.push(prefix);
    }
  }

  return missing;
};

/**
 * Every category level the file asks for that does not exist yet, for the
 * apply step. Computed from the same function the dry run reports with, so the
 * owner is never told about one set of categories and given another.
 */
export const missingCategoryPaths = (
  file: ReadFileResult,
  snapshot: CatalogSnapshot,
): string[][] => {
  const index = indexCategories(snapshot.categories);
  const missing = new Map<string, string[]>();

  for (const row of file.rows) {
    if (row.errors.length > 0 || !row.category_path) {
      continue;
    }

    for (const level of missingCategoryLevels(row.category_path, index)) {
      missing.set(pathKey(level), level);
    }
  }

  return [...missing.values()];
};

type Located = {
  product: CatalogSnapshot["products"][number] | null;
  variant: CatalogSnapshot["products"][number]["variants"][number] | null;
  ambiguous: boolean;
};

export const locateRow = (draft: RowDraft, snapshot: CatalogSnapshot): Located => {
  const handle = draft.handle ? normalizeHeader(draft.handle) : null;
  const sku = draft.sku ? normalizeHeader(draft.sku) : null;
  const variantTitle = draft.variant_title ? normalizeHeader(draft.variant_title) : null;

  let product = handle
    ? (snapshot.products.find((candidate) => normalizeHeader(candidate.handle) === handle) ?? null)
    : null;

  if (!product && !handle && sku) {
    product =
      snapshot.products.find((candidate) =>
        candidate.variants.some((variant) => variant.sku && normalizeHeader(variant.sku) === sku),
      ) ?? null;
  }

  if (!product) {
    return { product: null, variant: null, ambiguous: false };
  }

  if (sku) {
    const bySku =
      product.variants.find((variant) => variant.sku && normalizeHeader(variant.sku) === sku) ??
      null;
    return { product, variant: bySku, ambiguous: false };
  }

  if (variantTitle) {
    const byTitle =
      product.variants.find(
        (variant) => variant.title && normalizeHeader(variant.title) === variantTitle,
      ) ?? null;
    return { product, variant: byTitle, ambiguous: false };
  }

  if (product.variants.length === 1) {
    return { product, variant: product.variants[0], ambiguous: false };
  }

  if (product.variants.length === 0) {
    return { product, variant: null, ambiguous: false };
  }

  return { product, variant: null, ambiguous: true };
};

/**
 * The product-level cells of a handle come from its FIRST row, the way the
 * export writes them (they repeat on every row of a multi-variant product).
 */
const firstRowByHandle = (rows: RowDraft[]): Map<string, RowDraft> => {
  const first = new Map<string, RowDraft>();

  for (const row of rows) {
    if (!row.handle) {
      continue;
    }
    const key = normalizeHeader(row.handle);
    if (!first.has(key)) {
      first.set(key, row);
    }
  }

  return first;
};

export const planImport = ({
  file,
  snapshot,
  allowedCurrencies,
  filename,
  bytes,
  bom,
  encoding,
  delimiter,
}: PlanInput): ImportReport => {
  const fatal: FatalError[] = [...file.fatal];
  const allowed = new Set(allowedCurrencies.map((currency) => currency.toLowerCase()));

  for (const currency of file.header.currencies) {
    if (!allowed.has(currency)) {
      fatal.push({
        code: "unknown_currency",
        message: `Валюта ${currency.toUpperCase()} в магазине не настроена. Валюты магазина: ${[...allowed]
          .map((code) => code.toUpperCase())
          .join(", ")}.`,
      });
    }
  }

  if (file.rows.length > MAX_ROWS) {
    fatal.push({
      code: "too_many_rows",
      message: `В файле ${file.rows.length} строк, предел — ${MAX_ROWS}. Разделите файл на части.`,
    });
  }

  if (bytes > MAX_FILE_BYTES) {
    fatal.push({
      code: "too_large",
      message: `Файл весит ${Math.round(bytes / 1024)} КБ, предел — ${Math.round(
        MAX_FILE_BYTES / 1024 / 1024,
      )} МБ.`,
    });
  }

  const index = indexCategories(snapshot.categories);
  const categoriesToCreate = new Map<string, string[]>();
  const productLead = firstRowByHandle(file.rows);
  const planned: PlannedRow[] = [];

  for (const draft of file.rows) {
    planned.push(planRow(draft, snapshot, index, categoriesToCreate, productLead));
  }

  const summary: ImportSummary = {
    rows: planned.length,
    create: planned.filter((row) => row.action === "create").length,
    create_variant: planned.filter((row) => row.action === "create_variant").length,
    update: planned.filter((row) => row.action === "update").length,
    unchanged: planned.filter((row) => row.action === "unchanged").length,
    reject: planned.filter((row) => row.action === "reject").length,
    images: planned.reduce((total, row) => total + row.image_urls.length, 0),
  };

  return {
    status: fatal.length > 0 ? "rejected" : "pending",
    filename,
    bytes,
    delimiter,
    bom,
    encoding,
    summary,
    fatal,
    unknown_columns: file.header.unknown,
    categories_to_create: [...categoriesToCreate.values()].map((path) => path.join(" / ")),
    currencies: file.header.currencies,
    limits: { max_bytes: MAX_FILE_BYTES, max_rows: MAX_ROWS },
    rows: planned,
  };
};

const planRow = (
  draft: RowDraft,
  snapshot: CatalogSnapshot,
  index: CategoryIndex,
  categoriesToCreate: Map<string, string[]>,
  productLead: Map<string, RowDraft>,
): PlannedRow => {
  const base: PlannedRow = {
    line: draft.line,
    action: "reject",
    handle: draft.handle,
    sku: draft.sku,
    title: draft.title,
    product_id: null,
    variant_id: null,
    changes: [],
    notes: [],
    errors: [...draft.errors],
    image_urls: draft.image_urls ?? [],
  };

  if (draft.errors.length > 0) {
    return base;
  }

  const located = locateRow(draft, snapshot);

  if (located.ambiguous) {
    base.errors.push({
      code: "ambiguous_variant",
      message: `У товара «${draft.handle}» несколько вариантов. Укажите SKU или название варианта, чтобы понять, какой правится.`,
    });
    return base;
  }

  // The category the row asks for, whether or not it exists yet.
  const categoryNote = (path: string[] | null): CatalogCategory | null => {
    if (!path || path.length === 0) {
      return null;
    }

    const existing = index.byPath.get(pathKey(path));

    if (existing) {
      return existing;
    }

    for (const level of missingCategoryLevels(path, index)) {
      categoriesToCreate.set(pathKey(level), level);
    }

    base.notes.push(`Категория «${path.join(" / ")}» будет создана.`);

    return null;
  };

  if (!located.product) {
    if (!draft.title) {
      base.errors.push({
        code: "missing_title",
        message: draft.handle
          ? `Товара «${draft.handle}» в каталоге нет, а колонка «Название» пуста — создать его нечем.`
          : "Товара с таким SKU в каталоге нет, а колонка «Название» пуста — создать его нечем.",
      });
      return base;
    }

    categoryNote(draft.category_path);

    base.action = "create";
    base.notes.push("Новый товар создаётся черновиком — опубликуете его сами, проверив карточку.");

    if (draft.status === "published") {
      base.notes.push("Статус «опубликован» из файла не применяется к новым товарам.");
    }

    if (Object.keys(draft.prices).length === 0) {
      base.notes.push("Цена не указана — товар будет создан без цены.");
    }

    return base;
  }

  base.product_id = located.product.id;
  base.handle = located.product.handle;

  // A row of an existing product whose SKU is new to it adds a variant.
  if (!located.variant) {
    categoryNote(draft.category_path);
    base.action = "create_variant";
    base.notes.push(
      draft.sku
        ? `У товара «${located.product.handle}» появится вариант с SKU «${draft.sku}».`
        : `У товара «${located.product.handle}» появится новый вариант.`,
    );
    return base;
  }

  base.variant_id = located.variant.id;

  const changes: FieldChange[] = [];
  const lead = draft.handle ? productLead.get(normalizeHeader(draft.handle)) : undefined;
  const isLead = !lead || lead.line === draft.line;
  const product = located.product;
  const variant = located.variant;

  const textChange = (field: string, from: string | null, to: string | null) => {
    if (to === null) {
      return;
    }
    if (asText(from) === asText(to)) {
      return;
    }
    changes.push({ field, from: asText(from), to: asText(to) });
  };

  if (isLead) {
    textChange("Название", product.title, draft.title);
    textChange("Подзаголовок", product.subtitle, draft.subtitle);
    textChange("Описание", product.description, draft.description);

    if (draft.status && draft.status !== product.status) {
      changes.push({ field: "Статус", from: product.status, to: draft.status });
    }

    categoryNote(draft.category_path);
    const currentPath = product.category_path ? product.category_path.join(" / ") : "";

    if (draft.category_path) {
      // A path equal to the current one is necessarily a category that exists,
      // since the current one was read off the product; so "differs in words"
      // and "needs a write" are the same question here.
      const wantedPath = draft.category_path.join(" / ");
      if (normalizeHeader(wantedPath) !== normalizeHeader(currentPath)) {
        changes.push({ field: "Категория", from: currentPath, to: wantedPath });
      }
    }

    for (const [key, value] of Object.entries(draft.metadata)) {
      // `metadataCell`, not `String(...)`: a JSON metadata value coerces to
      // "[object Object]" and would never equal the cell the export wrote.
      const current = metadataCell(product.metadata?.[key]);
      if (current !== value) {
        changes.push({ field: `Метаданные: ${key}`, from: current, to: value });
      }
    }

    if (draft.image_urls && draft.image_urls.length > 0) {
      const same =
        draft.image_urls.length === product.image_urls.length &&
        draft.image_urls.every((url, position) => url === product.image_urls[position]);

      if (!same) {
        changes.push({
          field: "Картинки",
          from: String(product.image_urls.length),
          to: String(draft.image_urls.length),
        });
      } else {
        // Nothing to download: the row carries the URLs the export wrote out.
        base.image_urls = [];
      }
    }
  } else {
    base.image_urls = [];
  }

  textChange("Вариант", variant.title, draft.variant_title);
  textChange("SKU", variant.sku, draft.sku);

  for (const [currency, amount] of Object.entries(draft.prices)) {
    const current = variant.prices[currency] ?? null;
    if (!sameNumber(current, amount)) {
      changes.push({
        field: `Цена, ${currency.toUpperCase()}`,
        from: current === null ? "" : String(current),
        to: String(amount),
      });
    }
  }

  const numeric: [string, number | null, number | null][] = [
    ["Остаток", variant.stock, draft.stock],
    ["Вес, г", variant.weight, draft.weight],
    ["Длина, мм", variant.length, draft.length],
    ["Ширина, мм", variant.width, draft.width],
    ["Высота, мм", variant.height, draft.height],
  ];

  for (const [field, current, wanted] of numeric) {
    if (wanted === null) {
      continue;
    }
    if (!sameNumber(current, wanted)) {
      changes.push({
        field,
        from: current === null ? "" : String(current),
        to: String(wanted),
      });
    }
  }

  if (draft.stock !== null && snapshot.stock_location_id === null) {
    base.notes.push(
      "Остаток записать некуда: у магазина не настроен склад. Остальные поля строки применятся.",
    );
  }

  base.changes = changes;
  base.action = changes.length === 0 ? "unchanged" : "update";

  return base;
};
