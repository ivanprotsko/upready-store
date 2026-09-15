/**
 * The dry run. Reads the parsed file against the catalogue snapshot and decides,
 * per line, whether the row would create a product, update one, change nothing,
 * or cannot be applied at all.
 *
 * Two rules from the task shape everything here:
 *
 * - **Nothing is half applied.** A single row error rejects the WHOLE file, so
 *   this function never has to answer "what do we do with the good rows"; the
 *   caller either applies all of them or none.
 * - **A new product is a draft.** A row that matches nothing creates a product
 *   in `draft` whatever the `status` column says, so a mistyped price list
 *   cannot put a broken card in front of a customer. The row says so in its
 *   warnings rather than silently disagreeing with the file.
 *
 * The function is pure: everything it needs about the live catalogue arrives in
 * `snapshot`, `taken_handles` and `taken_skus`. That is what lets the confirm
 * step re-run it against a freshly read snapshot and notice that somebody edited
 * a product in the panel since the dry run.
 */

import {
  currenciesOf,
  mapHeader,
  METADATA_PREFIX,
  metadataKeysOf,
  PRICE_PREFIX,
  type ColumnMapping,
} from "./contract";
import type { ParsedCsv } from "./csv";
import { metadataCell } from "./export";
import { MAX_ROWS } from "./limits";
import {
  categoryPath,
  findCategoryByPath,
  type CatalogSnapshot,
  type SnapshotProduct,
  type SnapshotVariant,
} from "./snapshot";
import { uniqueSlug } from "./slug";
import type { ImportReport, PlannedRow } from "./types";
import {
  checkImageUrl,
  formatAmount,
  isBlank,
  parseAmount,
  parseCategoryPath,
  parseImageList,
  parseInteger,
  parseStatus,
} from "./values";

export type PriceWrite = { id?: string; currency_code: string; amount: number };

export type CreateAction = {
  line: number;
  handle: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category_path: string[] | null;
  image_urls: string[];
  thumbnail: string | null;
  metadata: Record<string, string>;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  variant_title: string;
  sku: string | null;
  prices: PriceWrite[];
  stock: number | null;
};

export type UpdateAction = {
  line: number;
  handle: string;
  product_id: string;
  variant_id: string | null;
  /** Product columns that differ, ready for `updateProductsWorkflow`. */
  product_fields: Record<string, unknown>;
  /** Set when the category column names a different category than the product sits in. */
  category_path: string[] | null;
  /** The whole ordered image list, when it differs. URLs not already on the product get downloaded. */
  image_urls: string[] | null;
  thumbnail: string | null | undefined;
  /** Variant columns that differ, ready for `updateProductVariantsWorkflow`. */
  variant_fields: Record<string, unknown>;
  /**
   * The COMPLETE price list to write, when a price changed: the changed ones,
   * every other unscoped price resent by id so the pricing module does not
   * delete it, and rule-scoped prices resent without their rules so the module
   * leaves those in place (measured in `@medusajs/pricing`'s `updatePriceSets_`).
   */
  prices: PriceWrite[] | null;
  stock: number | null;
  inventory_item_id: string | null;
};

export type PlanOutput = {
  report: ImportReport;
  creates: CreateAction[];
  updates: UpdateAction[];
  /** Category paths, root first, that have to exist before the writes run. */
  category_paths_to_create: string[][];
};

type RowValues = {
  line: number;
  get: (column: string) => string;
  has: (column: string) => boolean;
};

const buildRowReader = (mapping: ColumnMapping[], cells: string[], line: number): RowValues => {
  const byColumn = new Map<string, string>();

  mapping.forEach((entry, index) => {
    if (entry.column && !byColumn.has(entry.column)) {
      byColumn.set(entry.column, cells[index] ?? "");
    }
  });

  return {
    line,
    get: (column) => (byColumn.get(column) ?? "").trim(),
    has: (column) => byColumn.has(column),
  };
};

const sameNumber = (a: number | null, b: number | null): boolean =>
  a === null && b === null ? true : a !== null && b !== null && Math.abs(a - b) < 1e-9;

const PRODUCT_LEVEL_COLUMNS = [
  "title",
  "status",
  "category",
  "images",
  "thumbnail",
  "description",
  "subtitle",
] as const;

export const planImport = (input: {
  parsed: ParsedCsv;
  snapshot: CatalogSnapshot;
  filename: string;
  size_bytes: number;
  /** Every product handle on the backend, the tenant's own included. */
  taken_handles: Set<string>;
  /** Every variant SKU on the backend, the tenant's own included. */
  taken_skus: Set<string>;
  now: Date;
}): PlanOutput => {
  const { parsed, snapshot } = input;
  const mapping = mapHeader(parsed.header, snapshot.default_currency);
  const currencies = currenciesOf(mapping);
  const metadataKeys = metadataKeysOf(mapping);

  const fatal: string[] = [];
  const rows: PlannedRow[] = [];
  const creates: CreateAction[] = [];
  const updates: UpdateAction[] = [];
  const categoryPathsToCreate: string[][] = [];
  const imagesToFetch = new Set<string>();

  const understood = mapping.filter((entry) => entry.column !== null);

  if (parsed.header.length === 0) {
    fatal.push("В файле нет строки заголовков.");
  } else if (understood.length === 0) {
    fatal.push(
      "Ни один столбец не распознан. Первая строка файла должна содержать заголовки: " +
        "выгрузите каталог кнопкой «Выгрузить CSV» и правьте этот файл.",
    );
  } else if (!understood.some((entry) => entry.column === "handle" || entry.column === "sku")) {
    fatal.push(
      "Нужен столбец handle или sku: по нему товар из файла сопоставляется с товаром в магазине.",
    );
  }

  const duplicateColumns = new Set<string>();
  const seenColumns = new Set<string>();

  for (const entry of understood) {
    const column = entry.column as string;

    if (seenColumns.has(column)) {
      duplicateColumns.add(column);
    }

    seenColumns.add(column);
  }

  for (const column of duplicateColumns) {
    fatal.push(`Столбец «${column}» встречается в файле дважды, оставьте один.`);
  }

  for (const currency of currencies) {
    if (!snapshot.store_currencies.includes(currency)) {
      fatal.push(
        `Валюта «${currency}» (столбец ${PRICE_PREFIX}${currency}): в магазине нет региона с такой валютой. ` +
          `Есть: ${snapshot.store_currencies.join(", ") || "ни одной"}.`,
      );
    }
  }

  if (parsed.rows.length > MAX_ROWS) {
    fatal.push(`В файле ${parsed.rows.length} строк, больше ${MAX_ROWS} за один раз не принимаем.`);
  }

  const knownCurrencies = currencies.filter((currency) =>
    snapshot.store_currencies.includes(currency),
  );

  // ---- indexes over the live catalogue
  const productByHandle = new Map<string, SnapshotProduct>();
  const productBySku = new Map<string, { product: SnapshotProduct; variant: SnapshotVariant }>();

  for (const product of snapshot.products) {
    if (product.handle) {
      productByHandle.set(product.handle.toLowerCase(), product);
    }

    for (const variant of product.variants) {
      if (variant.sku) {
        productBySku.set(variant.sku.toLowerCase(), { product, variant });
      }
    }
  }

  const ownHandles = new Set([...productByHandle.keys()]);
  const ownSkus = new Set([...productBySku.keys()]);

  // ---- pass 1: read every row, check the shape of every cell
  type ReadRow = {
    values: RowValues;
    planned: PlannedRow;
    handleCell: string;
    skuCell: string;
    titleCell: string;
  };

  const read: ReadRow[] = [];

  for (const row of parsed.rows) {
    const values = buildRowReader(mapping, row.cells, row.line);
    const planned: PlannedRow = {
      line: row.line,
      handle: values.get("handle") || null,
      sku: values.get("sku") || null,
      title: values.get("title") || null,
      action: "unchanged",
      changes: [],
      errors: [],
      warnings: [],
    };

    if (row.cells.length !== parsed.header.length) {
      planned.warnings.push(
        `в строке ${row.cells.length} ячеек, а в заголовке ${parsed.header.length}`,
      );
    }

    read.push({
      values,
      planned,
      handleCell: values.get("handle"),
      skuCell: values.get("sku"),
      titleCell: values.get("title"),
    });
  }

  // ---- pass 2: resolve which product each row addresses
  const newHandles = new Set<string>();
  const groups = new Map<string, ReadRow[]>();
  const groupTarget = new Map<string, SnapshotProduct | null>();
  const derivedHandles = new Map<number, string>();

  for (const entry of read) {
    const { planned, handleCell, skuCell, titleCell } = entry;
    let handleKey: string | null = null;
    let target: SnapshotProduct | null = null;

    if (handleCell) {
      handleKey = handleCell.toLowerCase();
      target = productByHandle.get(handleKey) ?? null;

      if (!target && input.taken_handles.has(handleKey) && !ownHandles.has(handleKey)) {
        planned.errors.push(
          `handle «${handleCell}» уже занят другим товаром на платформе, выберите другой.`,
        );
      }
    } else if (skuCell) {
      const bySku = productBySku.get(skuCell.toLowerCase());

      if (bySku) {
        handleKey = (bySku.product.handle ?? "").toLowerCase();
        target = bySku.product;
      } else if (
        input.taken_skus.has(skuCell.toLowerCase()) &&
        !ownSkus.has(skuCell.toLowerCase())
      ) {
        planned.errors.push(
          `артикул «${skuCell}» уже занят другим товаром на платформе, выберите другой.`,
        );
      } else if (!titleCell) {
        planned.errors.push(
          "нет ни handle, ни известного артикула, ни названия: непонятно, какой товар создавать.",
        );
      } else {
        const derived = uniqueSlug(titleCell, new Set([...input.taken_handles, ...newHandles]));

        newHandles.add(derived);
        derivedHandles.set(planned.line, derived);
        handleKey = derived;
        planned.handle = derived;
        planned.warnings.push(`handle не указан, взят из названия: «${derived}»`);
      }
    } else {
      planned.errors.push("пустые handle и артикул: по чему сопоставлять товар, неизвестно.");
    }

    if (!handleKey) {
      planned.action = "error";
      rows.push(planned);
      continue;
    }

    const group = groups.get(handleKey) ?? [];

    group.push(entry);
    groups.set(handleKey, group);
    groupTarget.set(handleKey, target);
  }

  // ---- pass 3: decide, group by group
  for (const [handleKey, group] of groups) {
    const target = groupTarget.get(handleKey) ?? null;
    const first = group[0];
    const firstLine = first.planned.line;

    // Product-level cells are read from the group's FIRST row: a product has one
    // title, and two rows of the same handle disagreeing about it is a mistake,
    // not an instruction.
    const statusCell = first.values.get("status");
    const categoryCell = first.values.get("category");
    const imagesCell = first.values.get("images");
    const thumbnailCell = first.values.get("thumbnail");

    let statusValue: string | null = null;

    if (!isBlank(statusCell)) {
      const parsedStatus = parseStatus(statusCell);

      if (parsedStatus.ok) {
        statusValue = parsedStatus.value;
      } else {
        first.planned.errors.push(`статус: ${parsedStatus.message}`);
      }
    }

    const wantedCategory = isBlank(categoryCell) ? null : parseCategoryPath(categoryCell);

    if (wantedCategory && wantedCategory.length === 0) {
      first.planned.warnings.push("столбец категории заполнен только разделителями, пропущен");
    }

    const imageUrls: string[] = [];

    if (!isBlank(imagesCell)) {
      for (const url of parseImageList(imagesCell)) {
        const checked = checkImageUrl(url);

        if (checked.ok) {
          imageUrls.push(checked.value);
        } else {
          first.planned.errors.push(`картинка: ${checked.message}`);
        }
      }
    }

    let thumbnailUrl: string | null | undefined;

    if (first.values.has("thumbnail") && !isBlank(thumbnailCell)) {
      const checked = checkImageUrl(thumbnailCell);

      if (checked.ok) {
        thumbnailUrl = checked.value;
      } else {
        first.planned.errors.push(`обложка: ${checked.message}`);
      }
    }

    const productNumbers: Record<string, number | null> = {};

    for (const field of ["weight", "length", "width", "height"] as const) {
      const cell = first.values.get(field);

      if (isBlank(cell)) {
        productNumbers[field] = null;
        continue;
      }

      const parsedNumber = parseInteger(cell);

      if (parsedNumber.ok) {
        productNumbers[field] = parsedNumber.value;
      } else {
        productNumbers[field] = null;
        first.planned.errors.push(`${field}: ${parsedNumber.message}`);
      }
    }

    const metadataCells: Record<string, string> = {};

    for (const key of metadataKeys) {
      const cell = first.values.get(`${METADATA_PREFIX}${key}`);

      if (!isBlank(cell)) {
        metadataCells[key] = cell;
      }
    }

    for (const entry of group.slice(1)) {
      for (const column of PRODUCT_LEVEL_COLUMNS) {
        const own = entry.values.get(column);

        if (!isBlank(own) && own !== first.values.get(column)) {
          entry.planned.warnings.push(
            `столбец «${column}» относится к товару целиком, взято значение из строки ${firstLine}`,
          );
        }
      }
    }

    if (!target) {
      planCreate({
        group,
        handleKey,
        first,
        firstLine,
        statusValue,
        wantedCategory,
        imageUrls,
        thumbnailUrl,
        productNumbers,
        metadataCells,
        knownCurrencies,
        snapshot,
        derivedHandles,
        categoryPathsToCreate,
        imagesToFetch,
        creates,
        rows,
      });
      continue;
    }

    planUpdate({
      group,
      handleKey,
      first,
      target,
      statusValue,
      wantedCategory,
      imagesCell,
      imageUrls,
      thumbnailUrl,
      productNumbers,
      metadataCells,
      metadataKeys,
      knownCurrencies,
      snapshot,
      productBySku,
      takenSkus: input.taken_skus,
      categoryPathsToCreate,
      imagesToFetch,
      updates,
      rows,
    });
  }

  rows.sort((a, b) => a.line - b.line);

  const summary = {
    rows: rows.length,
    create: rows.filter((row) => row.action === "create").length,
    update: rows.filter((row) => row.action === "update").length,
    unchanged: rows.filter((row) => row.action === "unchanged").length,
    error: rows.filter((row) => row.action === "error").length,
    blank_skipped: parsed.blankLines.length,
  };

  const report: ImportReport = {
    filename: input.filename,
    size_bytes: input.size_bytes,
    separator: parsed.separator,
    bom: parsed.bom,
    columns: mapping,
    currencies: knownCurrencies,
    metadata_keys: metadataKeys,
    categories_to_create: categoryPathsToCreate.map((path) => path.join(" / ")),
    images_to_fetch: imagesToFetch.size,
    summary,
    rows,
    fatal,
    planned_at: input.now.toISOString(),
  };

  const rejected = summary.error > 0 || fatal.length > 0;

  return {
    report,
    creates: rejected ? [] : creates,
    updates: rejected ? [] : updates,
    category_paths_to_create: rejected ? [] : categoryPathsToCreate,
  };
};

type ReadRowLike = {
  values: RowValues;
  planned: PlannedRow;
  handleCell: string;
  skuCell: string;
  titleCell: string;
};

/** A handle nothing matched: one new draft product, one variant, from one row. */
const planCreate = (context: {
  group: ReadRowLike[];
  handleKey: string;
  first: ReadRowLike;
  firstLine: number;
  statusValue: string | null;
  wantedCategory: string[] | null;
  imageUrls: string[];
  thumbnailUrl: string | null | undefined;
  productNumbers: Record<string, number | null>;
  metadataCells: Record<string, string>;
  knownCurrencies: string[];
  snapshot: CatalogSnapshot;
  derivedHandles: Map<number, string>;
  categoryPathsToCreate: string[][];
  imagesToFetch: Set<string>;
  creates: CreateAction[];
  rows: PlannedRow[];
}): void => {
  const { group, first, firstLine, snapshot } = context;

  if (group.length > 1) {
    for (const entry of group) {
      entry.planned.errors.push(
        `товара «${context.handleKey}» в магазине нет, а импорт создаёт товар с одним вариантом, ` +
          `в файле их ${group.length}. Создайте товар в панели, затем импортируйте цены.`,
      );
      entry.planned.action = "error";
      context.rows.push(entry.planned);
    }

    return;
  }

  if (isBlank(first.titleCell)) {
    first.planned.errors.push("нового товара без названия не бывает, заполните title.");
  }

  if (context.statusValue && context.statusValue !== "draft") {
    first.planned.warnings.push(
      `новый товар создаётся черновиком (в файле «${context.statusValue}»), ` +
        "опубликуйте его в панели, когда проверите",
    );
  }

  const prices: PriceWrite[] = [];

  for (const currency of context.knownCurrencies) {
    const cell = first.values.get(`${PRICE_PREFIX}${currency}`);

    if (isBlank(cell)) {
      continue;
    }

    const amount = parseAmount(cell);

    if (amount.ok) {
      prices.push({ currency_code: currency, amount: amount.value });
    } else {
      first.planned.errors.push(`цена ${currency}: ${amount.message}`);
    }
  }

  if (prices.length === 0 && context.knownCurrencies.length > 0) {
    first.planned.errors.push(
      `нет ни одной цены (${context.knownCurrencies.map((code) => PRICE_PREFIX + code).join(", ")}): ` +
        "товар без цены нельзя купить.",
    );
  }

  const stockCell = first.values.get("stock");
  let stock: number | null = null;

  if (!isBlank(stockCell)) {
    const parsedStock = parseInteger(stockCell);

    if (!parsedStock.ok) {
      first.planned.errors.push(`остаток: ${parsedStock.message}`);
    } else if (!snapshot.stock_location_id) {
      first.planned.warnings.push(
        "остаток указан, но у магазина нет склада: остаток не записан, товар продаётся без учёта",
      );
    } else {
      stock = parsedStock.value;
    }
  }

  let categoryPathToUse: string[] | null = null;

  if (context.wantedCategory && context.wantedCategory.length > 0) {
    categoryPathToUse = context.wantedCategory;

    if (findCategoryByPath(snapshot.categories, context.wantedCategory) === null) {
      rememberCategoryPath(context.categoryPathsToCreate, snapshot, context.wantedCategory);
    }
  }

  for (const url of context.imageUrls) {
    context.imagesToFetch.add(url);
  }

  if (context.thumbnailUrl) {
    context.imagesToFetch.add(context.thumbnailUrl);
  }

  if (first.planned.errors.length > 0) {
    first.planned.action = "error";
    context.rows.push(first.planned);
    return;
  }

  const handle = context.derivedHandles.get(firstLine) ?? first.handleCell;

  first.planned.action = "create";
  first.planned.handle = handle;
  first.planned.changes.push("новый товар (черновик)");

  context.creates.push({
    line: firstLine,
    handle,
    title: first.titleCell,
    subtitle: first.values.get("subtitle") || null,
    description: first.values.get("description") || null,
    category_path: categoryPathToUse,
    image_urls: context.imageUrls,
    thumbnail: context.thumbnailUrl ?? null,
    metadata: context.metadataCells,
    weight: context.productNumbers.weight,
    length: context.productNumbers.length,
    width: context.productNumbers.width,
    height: context.productNumbers.height,
    variant_title: first.values.get("variant_title") || first.titleCell,
    sku: first.skuCell || null,
    prices,
    stock,
  });

  context.rows.push(first.planned);
};

/** A handle the tenant already owns: every row of the group addresses one of its variants. */
const planUpdate = (context: {
  group: ReadRowLike[];
  handleKey: string;
  first: ReadRowLike;
  target: SnapshotProduct;
  statusValue: string | null;
  wantedCategory: string[] | null;
  imagesCell: string;
  imageUrls: string[];
  thumbnailUrl: string | null | undefined;
  productNumbers: Record<string, number | null>;
  metadataCells: Record<string, string>;
  metadataKeys: string[];
  knownCurrencies: string[];
  snapshot: CatalogSnapshot;
  productBySku: Map<string, { product: SnapshotProduct; variant: SnapshotVariant }>;
  takenSkus: Set<string>;
  categoryPathsToCreate: string[][];
  imagesToFetch: Set<string>;
  updates: UpdateAction[];
  rows: PlannedRow[];
}): void => {
  const { first, target, snapshot } = context;

  const productFields: Record<string, unknown> = {};
  const productChanges: string[] = [];

  for (const [column, current] of [
    ["title", target.title],
    ["subtitle", target.subtitle],
    ["description", target.description],
  ] as const) {
    if (!first.values.has(column)) {
      continue;
    }

    const cell = first.values.get(column);

    if (isBlank(cell) || cell === (current ?? "")) {
      continue;
    }

    productFields[column] = cell;
    productChanges.push(`${column}: изменится`);
  }

  if (context.statusValue && context.statusValue !== target.status) {
    productFields.status = context.statusValue;
    productChanges.push(`статус: ${target.status} в ${context.statusValue}`);
  }

  const metadataWrite: Record<string, string> = {};

  for (const [key, cell] of Object.entries(context.metadataCells)) {
    if (metadataCell(target.metadata?.[key]) !== cell) {
      metadataWrite[key] = cell;
    }
  }

  if (Object.keys(metadataWrite).length > 0) {
    productFields.metadata = { ...target.metadata, ...metadataWrite };
    productChanges.push(`метаданные: ${Object.keys(metadataWrite).join(", ")}`);
  }

  let categoryPathToUse: string[] | null = null;

  if (context.wantedCategory && context.wantedCategory.length > 0) {
    const currentPath = target.category_ids[0]
      ? categoryPath(snapshot.categories, target.category_ids[0])
      : [];
    const wanted = context.wantedCategory;
    const samePath =
      currentPath.length === wanted.length &&
      currentPath.every(
        (level, index) => level.trim().toLowerCase() === wanted[index].trim().toLowerCase(),
      );

    if (!samePath) {
      categoryPathToUse = wanted;
      productChanges.push(
        `категория: ${currentPath.join(" / ") || "нет"} в ${wanted.join(" / ")}`,
      );

      if (findCategoryByPath(snapshot.categories, wanted) === null) {
        rememberCategoryPath(context.categoryPathsToCreate, snapshot, wanted);
      }
    }
  }

  let imageWrite: string[] | null = null;

  if (first.values.has("images") && !isBlank(context.imagesCell)) {
    const same =
      context.imageUrls.length === target.image_urls.length &&
      context.imageUrls.every((url, index) => url === target.image_urls[index]);

    if (!same) {
      imageWrite = context.imageUrls;
      productChanges.push(`картинки: ${target.image_urls.length} в ${context.imageUrls.length}`);

      for (const url of context.imageUrls) {
        if (!target.image_urls.includes(url)) {
          context.imagesToFetch.add(url);
        }
      }
    }
  }

  let thumbnailWrite: string | null | undefined;

  if (context.thumbnailUrl !== undefined && context.thumbnailUrl !== target.thumbnail) {
    thumbnailWrite = context.thumbnailUrl;
    productChanges.push("обложка: изменится");

    if (context.thumbnailUrl && !target.image_urls.includes(context.thumbnailUrl)) {
      context.imagesToFetch.add(context.thumbnailUrl);
    }
  }

  let productFieldsClaimed = false;

  for (const entry of context.group) {
    const { planned, values, skuCell } = entry;
    const variantTitleCell = values.get("variant_title");

    let variant: SnapshotVariant | undefined;

    if (skuCell) {
      variant = target.variants.find(
        (candidate) => (candidate.sku ?? "").toLowerCase() === skuCell.toLowerCase(),
      );

      if (!variant) {
        const elsewhere = context.productBySku.get(skuCell.toLowerCase());

        if (elsewhere) {
          planned.errors.push(
            `артикул «${skuCell}» принадлежит товару «${elsewhere.product.handle}», а не «${target.handle}».`,
          );
        } else if (context.takenSkus.has(skuCell.toLowerCase())) {
          planned.errors.push(`артикул «${skuCell}» уже занят на платформе.`);
        } else {
          planned.errors.push(
            `в товаре «${target.handle}» нет варианта с артикулом «${skuCell}». ` +
              "Импорт не создаёт новые варианты, добавьте вариант в панели.",
          );
        }
      }
    } else if (variantTitleCell) {
      variant = target.variants.find(
        (candidate) => (candidate.title ?? "").toLowerCase() === variantTitleCell.toLowerCase(),
      );

      if (!variant) {
        planned.errors.push(
          `в товаре «${target.handle}» нет варианта «${variantTitleCell}». ` +
            "Импорт не создаёт новые варианты, добавьте вариант в панели.",
        );
      }
    } else if (target.variants.length === 1) {
      variant = target.variants[0];
    } else {
      planned.errors.push(
        `у товара «${target.handle}» ${target.variants.length} вариантов, укажите артикул или вариант.`,
      );
    }

    const variantFields: Record<string, unknown> = {};
    const variantChanges: string[] = [];
    let priceWrites: PriceWrite[] | null = null;
    let stockWrite: number | null = null;

    if (variant) {
      planned.variant_id = variant.id;

      // Weight and the three dimensions are written to the VARIANT, where
      // shipping-price calculation reads them first (`shipping-tariffs/tariff.ts`
      // falls back to the product's value). The file shows that same effective
      // value, so a cell matching the product's value is no change at all: that
      // is what keeps an untouched round trip at zero updates.
      for (const field of ["weight", "length", "width", "height"] as const) {
        const cell = values.get(field);

        if (!values.has(field) || isBlank(cell)) {
          continue;
        }

        const parsedNumber = parseInteger(cell);

        if (!parsedNumber.ok) {
          planned.errors.push(`${field}: ${parsedNumber.message}`);
          continue;
        }

        const effective = variant[field] ?? target[field] ?? null;

        if (!sameNumber(effective, parsedNumber.value)) {
          variantFields[field] = parsedNumber.value;
          variantChanges.push(`${field}: ${effective ?? "нет"} в ${parsedNumber.value}`);
        }
      }

      const changedPrices: { currency: string; from: number | null; to: number }[] = [];

      for (const currency of context.knownCurrencies) {
        const cell = values.get(`${PRICE_PREFIX}${currency}`);

        if (isBlank(cell)) {
          continue;
        }

        const amount = parseAmount(cell);

        if (!amount.ok) {
          planned.errors.push(`цена ${currency}: ${amount.message}`);
          continue;
        }

        const existing = variant.prices.find(
          (price) =>
            price.currency_code === currency &&
            price.rules_count === 0 &&
            price.price_list_id === null,
        );

        if (!sameNumber(existing?.amount ?? null, amount.value)) {
          changedPrices.push({ currency, from: existing?.amount ?? null, to: amount.value });
        }
      }

      if (changedPrices.length > 0) {
        priceWrites = buildPriceWrites(variant, changedPrices);

        for (const change of changedPrices) {
          variantChanges.push(
            `цена ${change.currency}: ${change.from === null ? "нет" : formatAmount(change.from)} в ${formatAmount(change.to)}`,
          );
        }
      }

      const stockCell = values.get("stock");

      if (values.has("stock") && !isBlank(stockCell)) {
        const parsedStock = parseInteger(stockCell);

        if (!parsedStock.ok) {
          planned.errors.push(`остаток: ${parsedStock.message}`);
        } else if (!variant.manage_inventory || variant.inventory_item_ids.length === 0) {
          planned.warnings.push(
            "остаток указан, но этот вариант продаётся без учёта остатков: значение не записано " +
              "(включите учёт на экране товара)",
          );
        } else if (variant.inventory_item_ids.length > 1) {
          planned.warnings.push(
            "у варианта несколько складских позиций (комплект), остаток из файла не записан",
          );
        } else if (!snapshot.stock_location_id) {
          planned.warnings.push("у магазина нет склада, остаток не записан");
        } else if (variant.stock !== parsedStock.value) {
          stockWrite = parsedStock.value;
          variantChanges.push(`остаток: ${variant.stock ?? "нет"} в ${parsedStock.value}`);
        }
      }
    }

    if (planned.errors.length > 0) {
      planned.action = "error";
      context.rows.push(planned);
      continue;
    }

    planned.product_id = target.id;
    planned.handle = target.handle;

    const ownsProductFields = !productFieldsClaimed;
    const productPart = ownsProductFields
      ? {
          fields: productFields,
          category: categoryPathToUse,
          images: imageWrite,
          thumbnail: thumbnailWrite,
          changes: productChanges,
        }
      : {
          fields: {} as Record<string, unknown>,
          category: null,
          images: null,
          thumbnail: undefined,
          changes: [] as string[],
        };

    const touchesProduct =
      Object.keys(productPart.fields).length > 0 ||
      productPart.category !== null ||
      productPart.images !== null ||
      productPart.thumbnail !== undefined;

    const touchesVariant =
      Object.keys(variantFields).length > 0 || priceWrites !== null || stockWrite !== null;

    planned.changes = [...productPart.changes, ...variantChanges];

    if (!touchesProduct && !touchesVariant) {
      planned.action = "unchanged";
      context.rows.push(planned);
      continue;
    }

    if (ownsProductFields && touchesProduct) {
      productFieldsClaimed = true;
    }

    planned.action = "update";

    context.updates.push({
      line: planned.line,
      handle: target.handle ?? context.handleKey,
      product_id: target.id,
      variant_id: variant?.id ?? null,
      product_fields: productPart.fields,
      category_path: productPart.category,
      image_urls: productPart.images,
      thumbnail: productPart.thumbnail,
      variant_fields: variantFields,
      prices: priceWrites,
      stock: stockWrite,
      inventory_item_id: variant?.inventory_item_ids[0] ?? null,
    });

    context.rows.push(planned);
  }
};

/**
 * The full price list to send for one variant. Every price the variant already
 * has is resent BY ID, which is what stops `updatePriceSets_` from deleting it:
 * measured in `@medusajs/pricing`, a price whose id is absent from the incoming
 * list is deleted, `price_rules` left out of an update is left alone, and prices
 * belonging to a price list are never listed for the price set at all.
 */
const buildPriceWrites = (
  variant: SnapshotVariant,
  changed: { currency: string; to: number }[],
): PriceWrite[] => {
  const changedByCurrency = new Map(changed.map((change) => [change.currency, change.to]));
  const writes: PriceWrite[] = [];

  for (const price of variant.prices) {
    if (price.price_list_id !== null) {
      continue;
    }

    const replacement =
      price.rules_count === 0 ? changedByCurrency.get(price.currency_code) : undefined;

    writes.push({
      id: price.id,
      currency_code: price.currency_code,
      amount: replacement ?? price.amount ?? 0,
    });

    if (replacement !== undefined) {
      changedByCurrency.delete(price.currency_code);
    }
  }

  for (const [currency, amount] of changedByCurrency) {
    writes.push({ currency_code: currency, amount });
  }

  return writes;
};

/** Records a category path to create, level by level, without recording one twice. */
const rememberCategoryPath = (
  collected: string[][],
  snapshot: CatalogSnapshot,
  path: string[],
): void => {
  for (let depth = 1; depth <= path.length; depth += 1) {
    const prefix = path.slice(0, depth);

    if (findCategoryByPath(snapshot.categories, prefix) !== null) {
      continue;
    }

    const key = prefix.join(" ").toLowerCase();

    if (!collected.some((existing) => existing.join(" ").toLowerCase() === key)) {
      collected.push(prefix);
    }
  }
};
