import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  coerceValue,
  type AttributeOptionRow,
} from "../api/tenants/product-attributes/helpers";
import { MARKETPLACE_LINK_MODULE } from "../modules/marketplace-link";
import type MarketplaceLinkModuleService from "../modules/marketplace-link/service";
import { PRODUCT_REVIEW_MODULE } from "../modules/product-review";
import type ProductReviewModuleService from "../modules/product-review/service";
import { TENANT_MODULE } from "../modules/tenant";
import type { AttributeType } from "../modules/tenant/models/tenant-product-attribute";
import type TenantModuleService from "../modules/tenant/service";
import { ensureChoice, ensureDefaultSchema } from "../product-attributes-fill/apply-default-schema";
import { DEFAULT_ATTRIBUTE_PRESET } from "../product-attributes-fill/default-schema";
import { parseCharacteristics } from "../product-attributes-fill/parse-characteristics";
import { pricePayload } from "../product-csv/apply";
import { readPrices, type CatalogPrice, type GraphPrice } from "../product-csv/catalog";
import { fetchImage } from "../product-csv/images";
import { tenantFilePrefix } from "../tenant-files";
import { attributeKeyFromName } from "./attributes";
import type { DatasetProduct, EnrichDataset } from "./dataset";
import { keyFromCatalogImage, planPhotos } from "./images";

/**
 * Writing one dataset into one shop's catalog (w07-tenant-catalog-enrich).
 *
 * Five sections, each independent and each idempotent: a second `--apply`
 * reports zeros. What the run must NEVER do is spelled out in Ivan's order of
 * 2026-09-16 04:44 WITA and enforced here rather than in a runbook:
 *
 *   - it creates no product and deletes nothing;
 *   - the shop's own first image stays first and stays the `thumbnail`;
 *   - it writes only to products the link table already ties to a card.
 */

export const SECTIONS = ["titles", "prices", "characteristics", "reviews", "images"] as const;
export type Section = (typeof SECTIONS)[number];

export type ApplyOptions = {
  dryRun: boolean;
  sections: Set<Section>;
  logger: Pick<Logger, "info" | "warn" | "error">;
};

export type SectionCounters = {
  titles_updated: number;
  titles_unchanged: number;
  titles_absent: number;
  prices_updated: number;
  prices_unchanged: number;
  prices_absent: number;
  characteristics_written: number;
  characteristics_unchanged: number;
  attributes_created: number;
  characteristics_dropped: number;
  reviews_imported: number;
  reviews_unchanged: number;
  images_added: number;
  images_already_there: number;
  images_failed: number;
};

export const emptyCounters = (): SectionCounters => ({
  titles_updated: 0,
  titles_unchanged: 0,
  titles_absent: 0,
  prices_updated: 0,
  prices_unchanged: 0,
  prices_absent: 0,
  characteristics_written: 0,
  characteristics_unchanged: 0,
  attributes_created: 0,
  characteristics_dropped: 0,
  reviews_imported: 0,
  reviews_unchanged: 0,
  images_added: 0,
  images_already_there: 0,
  images_failed: 0,
});

/** One product of the shop as every section below needs it. */
export type LiveProduct = {
  id: string;
  handle: string;
  title: string;
  thumbnail: string | null;
  metadata: Record<string, unknown> | null;
  images: { id: string; url: string; rank: number | null; metadata: Record<string, unknown> | null }[];
  variants: {
    id: string;
    sku: string | null;
    price_rows: CatalogPrice[];
  }[];
};

const PRODUCT_FIELDS = [
  "id",
  "handle",
  "title",
  "thumbnail",
  "metadata",
  "images.id",
  "images.url",
  "images.rank",
  "images.metadata",
  "variants.id",
  "variants.sku",
  "variants.created_at",
  "variants.price_set.prices.id",
  "variants.price_set.prices.amount",
  "variants.price_set.prices.currency_code",
  "variants.price_set.prices.price_list_id",
  "variants.price_set.prices.price_rules.attribute",
];

/**
 * The shop's products, keyed by handle.
 *
 * Reads the products the tenant link names and nothing else: a run must not be
 * able to touch a neighbour's catalog even when the dataset it was given
 * mentions one (rule 5k, and the same isolation `backfill-product-attributes`
 * keeps).
 */
export const loadLiveProducts = async (
  container: MedusaContainer,
  productIds: string[],
): Promise<Map<string, LiveProduct>> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  if (!productIds.length) {
    return new Map();
  }

  const { data: rows } = await query.graph({
    entity: "product",
    fields: PRODUCT_FIELDS,
    filters: { id: productIds },
    pagination: { take: null } as never,
  });

  const out = new Map<string, LiveProduct>();

  for (const row of rows) {
    const images = ((row.images ?? []) as Record<string, unknown>[])
      .map((image) => ({
        id: String(image.id),
        url: String(image.url ?? ""),
        rank: typeof image.rank === "number" ? image.rank : null,
        metadata: (image.metadata as Record<string, unknown> | null) ?? null,
      }))
      .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));

    const variants = ((row.variants ?? []) as Record<string, unknown>[])
      .slice()
      .sort((left, right) =>
        String(left?.created_at ?? "").localeCompare(String(right?.created_at ?? "")),
      )
      .map((variant) => ({
        id: String(variant.id),
        sku: ((variant.sku as string | null) ?? null) || null,
        price_rows: readPrices(
          (variant.price_set as { prices?: GraphPrice[] } | null | undefined)?.prices ?? [],
        ).rows,
      }));

    out.set(String(row.handle), {
      id: String(row.id),
      handle: String(row.handle),
      title: String(row.title ?? ""),
      thumbnail: (row.thumbnail as string | null) ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      images,
      variants,
    });
  }

  return out;
};

/**
 * The product's title from the WB card, with the shop's own title kept.
 *
 * `metadata.title_before_wb` is written ONCE, on the first run that changes the
 * title, and never overwritten: a second run must not record the WB title as
 * «what the shop called it», which is what a blind write would do the moment
 * the card is renamed.
 */
const applyTitle = async (
  container: MedusaContainer,
  product: LiveProduct,
  entry: DatasetProduct,
  options: ApplyOptions,
  counters: SectionCounters,
): Promise<void> => {
  const wanted = (entry.title ?? "").trim();

  if (!wanted) {
    counters.titles_absent += 1;
    return;
  }

  if (wanted === product.title) {
    counters.titles_unchanged += 1;
    return;
  }

  counters.titles_updated += 1;
  options.logger.info(
    `[enrich] ${product.handle}: заголовок «${product.title}» -> «${wanted}»`,
  );

  if (options.dryRun) {
    return;
  }

  const metadata = { ...(product.metadata ?? {}) };
  if (metadata.title_before_wb === undefined) {
    metadata.title_before_wb = product.title;
  }
  metadata.wb_nm_id = entry.nm_id;

  await updateProductsWorkflow(container).run({
    input: { selector: { id: product.id }, update: { title: wanted, metadata } },
  });

  product.title = wanted;
  product.metadata = metadata;
};

/**
 * The variant price in the currency the WB card quotes.
 *
 * The payload is built by `pricePayload`, the catalog's own answer to a trap
 * measured in t14: `updatePriceSets` deletes every unscoped price whose id is
 * absent from the update, so sending the one currency that changed wipes the
 * other hundred-odd a seeded stand carries. Region-scoped rows and rows
 * belonging to a price list are carried through untouched.
 */
const applyPrice = async (
  container: MedusaContainer,
  product: LiveProduct,
  entry: DatasetProduct,
  options: ApplyOptions,
  counters: SectionCounters,
): Promise<void> => {
  if (!entry.price) {
    counters.prices_absent += 1;
    return;
  }

  const currency = entry.price.currency.toLowerCase();
  const variant =
    product.variants.find((candidate) => candidate.sku === entry.variant_sku) ??
    product.variants[0];

  if (!variant) {
    counters.prices_absent += 1;
    return;
  }

  const current = variant.price_rows.find(
    (row) => row.currency_code === currency && !row.has_rules && !row.in_price_list,
  );

  if (current && current.amount === entry.price.amount) {
    counters.prices_unchanged += 1;
    return;
  }

  counters.prices_updated += 1;
  options.logger.info(
    `[enrich] ${product.handle}: цена ${currency.toUpperCase()} ` +
      `${current ? current.amount : "нет"} -> ${entry.price.amount}`,
  );

  if (options.dryRun) {
    return;
  }

  await updateProductVariantsWorkflow(container).run({
    input: {
      selector: { id: variant.id },
      update: {
        prices: pricePayload(
          { price_rows: variant.price_rows } as never,
          { [currency]: entry.price.amount },
        ) as never,
      },
    },
  });

  if (current) {
    current.amount = entry.price.amount;
  }
};

type AttributeRecord = { id: string; key: string; type: AttributeType; name: string };

/** The shop's characteristic schema, indexed by key, refreshed as rows are added. */
export type SchemaCache = {
  byKey: Map<string, AttributeRecord>;
  optionsByAttribute: Map<string, AttributeOptionRow[]>;
  nextPosition: number;
};

export const loadSchema = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<SchemaCache> => {
  const service = container.resolve<TenantModuleService>(TENANT_MODULE);
  const rows = (await service.listTenantProductAttributes({
    tenant_id: tenantId,
  })) as unknown as (AttributeRecord & { position: number })[];

  const options = (await service.listTenantProductAttributeOptions({
    attribute_id: rows.map((row) => row.id),
  })) as unknown as (AttributeOptionRow & { attribute_id: string })[];

  const optionsByAttribute = new Map<string, AttributeOptionRow[]>();
  for (const option of options) {
    const list = optionsByAttribute.get(option.attribute_id) ?? [];
    list.push(option);
    optionsByAttribute.set(option.attribute_id, list);
  }

  return {
    byKey: new Map(rows.map((row) => [row.key, row])),
    optionsByAttribute,
    nextPosition: rows.reduce((max, row) => Math.max(max, (row.position ?? 0) + 1), 0),
  };
};

/**
 * The characteristic a WB name belongs to, creating the shop's own row for a
 * name the preset has no place for.
 *
 * The preset keys (`country`, `composition`, `volume`, …) are matched first by
 * `parseCharacteristics`, so «Страна производства» fills the shop's existing
 * «Страна производства» rather than a second one beside it. Everything the
 * preset does not know — «Форма выпуска», «Упаковка», «Объем чаши» — becomes a
 * characteristic of this shop with WB's own Russian name, a transliterated key
 * and the `text` type, shown on the product page and left out of the filter
 * bar: a free-text value would put one chip per product in the catalogue.
 */
const ensureOwnAttribute = async (
  container: MedusaContainer,
  tenantId: string,
  schema: SchemaCache,
  name: string,
  options: ApplyOptions,
  counters: SectionCounters,
): Promise<AttributeRecord | null> => {
  const key = attributeKeyFromName(name);

  if (!key) {
    counters.characteristics_dropped += 1;
    options.logger.warn(`[enrich] характеристика «${name}»: из названия не выходит ключ, пропущена`);
    return null;
  }

  const known = schema.byKey.get(key);
  if (known) {
    return known;
  }

  counters.attributes_created += 1;
  options.logger.info(`[enrich] новая характеристика магазина: «${name}» (${key})`);

  if (options.dryRun) {
    const pending: AttributeRecord = { id: "(ещё не создана)", key, type: "text", name };
    schema.byKey.set(key, pending);
    return pending;
  }

  const service = container.resolve<TenantModuleService>(TENANT_MODULE);
  const created = await service.createTenantProductAttributes({
    tenant_id: tenantId,
    key,
    name,
    type: "text" as AttributeType,
    unit: null,
    position: schema.nextPosition,
    category_id: null,
    show_on_product: true,
    use_as_filter: false,
  });

  const row = (Array.isArray(created) ? created[0] : created) as AttributeRecord;
  schema.nextPosition += 1;
  schema.byKey.set(key, row);
  return row;
};

const sameTypedValue = (
  stored: { value_text: string | null; value_number: number | null; value_boolean: boolean | null },
  typed: { value_text: string | null; value_number: number | null; value_boolean: boolean | null },
): boolean =>
  (stored.value_text ?? null) === typed.value_text &&
  (stored.value_number ?? null) === typed.value_number &&
  (stored.value_boolean ?? null) === typed.value_boolean;

const applyCharacteristics = async (
  container: MedusaContainer,
  tenantId: string,
  schema: SchemaCache,
  product: LiveProduct,
  entry: DatasetProduct,
  options: ApplyOptions,
  counters: SectionCounters,
): Promise<void> => {
  if (!entry.characteristics.length) {
    return;
  }

  const service = container.resolve<TenantModuleService>(TENANT_MODULE);

  // The preset's own reader, so a WB «Страна производства» lands in the shop's
  // `country` and not in a second characteristic of the same meaning.
  const parsed = parseCharacteristics(
    entry.characteristics.map((one) => ({ name: one.name, value: one.value })),
  );

  const wanted: { key: string; raw: string | number }[] = [];

  for (const [key, value] of Object.entries(parsed.values)) {
    if (value !== undefined && value !== null && value !== "") {
      wanted.push({ key, raw: value });
    }
  }

  for (const one of parsed.unrecognised) {
    const attribute = await ensureOwnAttribute(container, tenantId, schema, one.name, options, counters);
    if (attribute) {
      wanted.push({ key: attribute.key, raw: one.value });
    }
  }

  const existing = (await service.listTenantProductAttributeValues({
    product_id: product.id,
  })) as unknown as {
    id: string;
    attribute_id: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
  }[];
  const byAttribute = new Map(existing.map((row) => [row.attribute_id, row]));

  for (const item of wanted) {
    const attribute = schema.byKey.get(item.key);
    if (!attribute) {
      counters.characteristics_dropped += 1;
      continue;
    }

    let choices = schema.optionsByAttribute.get(attribute.id) ?? [];
    let raw: string | number | boolean = item.raw;

    if (attribute.type === "select") {
      // A `select` refuses a value it has not declared, so a country the
      // preset never listed is declared from the label the card carries.
      if (options.dryRun) {
        counters.characteristics_written += 1;
        continue;
      }
      const choice = await ensureChoice(container, attribute.id, String(item.raw));
      if (!choice) {
        counters.characteristics_dropped += 1;
        continue;
      }
      if (choice.created) {
        choices = (await container
          .resolve<TenantModuleService>(TENANT_MODULE)
          .listTenantProductAttributeOptions({
            attribute_id: attribute.id,
          })) as unknown as AttributeOptionRow[];
        schema.optionsByAttribute.set(attribute.id, choices);
      }
      raw = choice.value;
    }

    let typed: { value_text: string | null; value_number: number | null; value_boolean: boolean | null } | null;
    try {
      typed = coerceValue(attribute, choices, raw);
    } catch (error) {
      counters.characteristics_dropped += 1;
      options.logger.warn(
        `[enrich] ${product.handle}: «${attribute.name}» = «${String(raw)}» не принято: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      continue;
    }

    if (!typed) {
      counters.characteristics_dropped += 1;
      continue;
    }

    const stored = byAttribute.get(attribute.id);

    if (stored && sameTypedValue(stored, typed)) {
      counters.characteristics_unchanged += 1;
      continue;
    }

    counters.characteristics_written += 1;

    if (options.dryRun) {
      continue;
    }

    if (stored) {
      await service.updateTenantProductAttributeValues({ id: stored.id, ...typed });
    } else {
      await service.createTenantProductAttributeValues({
        tenant_id: tenantId,
        product_id: product.id,
        attribute_id: attribute.id,
        ...typed,
      });
    }
  }
};

/** The language every WB review is written in; the cabinet is a Russian one. */
export const WB_REVIEW_LANGUAGE = "ru";

/**
 * The reviews of a card the shop does not hold yet.
 *
 * The key is WB's own feedback id plus the language, the pair
 * `product_review` already makes unique per product while the row is alive. A
 * review the owner later edited on the panel therefore keeps its edit: the
 * import fills an ABSENCE and never overwrites a row. Pure, so the dedupe can
 * be argued about without a database.
 */
export const reviewsToCreate = <T extends { source_key: string }>(
  existing: { source_key: string | null; language: string }[],
  reviews: T[],
): T[] => {
  const held = new Set(
    existing
      .filter((row) => row.source_key)
      .map((row) => `${row.source_key}:${row.language}`),
  );

  const out: T[] = [];
  for (const review of reviews) {
    const key = `${review.source_key}:${WB_REVIEW_LANGUAGE}`;
    // A card that lists the same feedback twice must still produce one row:
    // the unique index would refuse the second and take the batch with it.
    if (held.has(key)) {
      continue;
    }
    held.add(key);
    out.push(review);
  }

  return out;
};

/**
 * The card's reviews, as reviews of the shop.
 *
 * Idempotent on `source_key` — WB's own feedback id — which is the column
 * `product_review` already makes unique per (tenant, product, source_key,
 * language). A review whose text the owner edited on the panel is NOT
 * overwritten: only the absence of a row is filled. Status is `published`,
 * because these already stand published on the WB card.
 */
const applyReviews = async (
  container: MedusaContainer,
  tenantId: string,
  product: LiveProduct,
  entry: DatasetProduct,
  options: ApplyOptions,
  counters: SectionCounters,
): Promise<void> => {
  if (!entry.reviews.length) {
    return;
  }

  const service = container.resolve<ProductReviewModuleService>(PRODUCT_REVIEW_MODULE);
  const existing = (await service.listProductReviews({
    tenant_id: tenantId,
    product_id: product.id,
  })) as unknown as { source_key: string | null; language: string }[];

  const toCreate = reviewsToCreate(existing, entry.reviews);
  counters.reviews_unchanged += entry.reviews.length - toCreate.length;

  if (!toCreate.length) {
    return;
  }

  counters.reviews_imported += toCreate.length;
  options.logger.info(`[enrich] ${product.handle}: ${toCreate.length} отзывов с карточки WB`);

  if (options.dryRun) {
    return;
  }

  await service.createProductReviews(
    toCreate.map((review) => ({
      tenant_id: tenantId,
      product_id: product.id,
      author_name: review.author_name,
      rating: review.rating,
      body: review.body,
      language: WB_REVIEW_LANGUAGE,
      status: "published" as const,
      source: "wb" as const,
      reply: review.reply,
      replied_at: review.reply ? new Date() : null,
      review_date: review.review_date ? new Date(review.review_date) : null,
      source_key: review.source_key,
    })),
  );
};

/**
 * The card's photos, appended after everything the shop already has.
 *
 * `updateProductsWorkflow` replaces the image list wholesale, so the payload is
 * the existing URLs IN THEIR CURRENT ORDER followed by the new ones; the first
 * image therefore keeps both its place and its rank. `thumbnail` is not in the
 * update at all, so the cover the owner chose cannot move (Ivan, 2026-09-16
 * 04:44 WITA).
 */
const applyImages = async (
  container: MedusaContainer,
  tenantId: string,
  product: LiveProduct,
  entry: DatasetProduct,
  options: ApplyOptions,
  counters: SectionCounters,
): Promise<void> => {
  if (!entry.images.length) {
    return;
  }

  const plan = planPhotos(product.images, entry.images);
  counters.images_already_there += plan.skipped.length;

  if (!plan.append.length) {
    return;
  }

  if (options.dryRun) {
    counters.images_added += plan.append.length;
    options.logger.info(
      `[enrich] ${product.handle}: добавилось бы ${plan.append.length} фото WB ` +
        `(уже есть ${plan.skipped.length})`,
    );
    return;
  }

  const added: { url: string; metadata: Record<string, unknown> }[] = [];

  for (const photo of plan.append) {
    const fetched = await fetchImage(photo.url, photo.index);

    if (!fetched.ok) {
      counters.images_failed += 1;
      options.logger.warn(`[enrich] ${product.handle}: фото ${photo.url} — ${fetched.error}`);
      continue;
    }

    const { result } = await uploadFilesWorkflow(container).run({
      input: {
        files: [
          {
            // The migration's own naming: the card and the photo's position are
            // IN the file name, which is what lets `keyFromCatalogImage` still
            // recognise the photo if its metadata is ever lost.
            filename: `${tenantFilePrefix(tenantId)}${entry.nm_id}__${photo.index}.webp`,
            mimeType: fetched.mime_type,
            content: fetched.content.toString("base64"),
            access: "public" as const,
          },
        ],
      },
    });

    const stored = result[0]?.url;

    if (!stored) {
      counters.images_failed += 1;
      options.logger.warn(`[enrich] ${product.handle}: фото ${photo.url} не сохранилось в магазине`);
      continue;
    }

    added.push({
      url: stored,
      metadata: { wb_source_url: photo.url, wb_photo_key: photo.key },
    });
  }

  if (!added.length) {
    return;
  }

  counters.images_added += added.length;
  options.logger.info(
    `[enrich] ${product.handle}: ${added.length} фото WB добавлено после ${product.images.length} своих`,
  );

  await updateProductsWorkflow(container).run({
    input: {
      selector: { id: product.id },
      update: {
        images: [
          ...product.images.map((image) => ({
            url: image.url,
            ...(image.metadata ? { metadata: image.metadata } : {}),
          })),
          ...added,
        ],
      } as never,
    },
  });

  product.images = [
    ...product.images,
    ...added.map((image, index) => ({
      id: `pending-${index}`,
      url: image.url,
      rank: product.images.length + index,
      metadata: image.metadata,
    })),
  ];
};

export type LinkCounters = { created: number; updated: number; unchanged: number };

/**
 * The link table after this run: one live row per (tenant, marketplace,
 * product), so a re-run updates instead of doubling.
 */
export const writeLinks = async (
  container: MedusaContainer,
  tenantId: string,
  entries: { product_id: string; entry: DatasetProduct }[],
  options: ApplyOptions,
): Promise<LinkCounters> => {
  const service = container.resolve<MarketplaceLinkModuleService>(MARKETPLACE_LINK_MODULE);
  const counters: LinkCounters = { created: 0, updated: 0, unchanged: 0 };

  const existing = (await service.listProductMarketplaceLinks({
    tenant_id: tenantId,
    marketplace: "wb",
  })) as unknown as {
    id: string;
    product_id: string;
    external_id: string;
    vendor_code: string | null;
    matched_by: string;
  }[];
  const byProduct = new Map(existing.map((row) => [row.product_id, row]));

  for (const { product_id, entry } of entries) {
    const stored = byProduct.get(product_id);

    if (
      stored &&
      stored.external_id === entry.nm_id &&
      (stored.vendor_code ?? null) === (entry.vendor_code ?? null) &&
      stored.matched_by === entry.matched_by
    ) {
      counters.unchanged += 1;
      continue;
    }

    if (stored) {
      counters.updated += 1;
      if (!options.dryRun) {
        await service.updateProductMarketplaceLinks({
          id: stored.id,
          external_id: entry.nm_id,
          vendor_code: entry.vendor_code,
          matched_by: entry.matched_by,
          linked_at: new Date(),
        });
      }
      continue;
    }

    counters.created += 1;
    if (!options.dryRun) {
      await service.createProductMarketplaceLinks({
        tenant_id: tenantId,
        product_id,
        variant_id: null,
        marketplace: "wb" as const,
        external_id: entry.nm_id,
        vendor_code: entry.vendor_code,
        matched_by: entry.matched_by,
        linked_at: new Date(),
      });
    }
  }

  return counters;
};

export type ApplyResult = {
  counters: SectionCounters;
  links: LinkCounters;
  /** Handles the dataset names and this catalog does not hold. */
  missing_handles: string[];
};

/**
 * The whole enrichment of one shop from one dataset.
 *
 * The order of the sections is the order a person reads a product page in, and
 * they do not depend on each other: `--only images` on a catalog whose titles
 * were never touched does exactly the image step.
 */
export const applyDataset = async (
  container: MedusaContainer,
  tenant: { id: string; handle: string },
  dataset: EnrichDataset,
  options: ApplyOptions,
): Promise<ApplyResult> => {
  const counters = emptyCounters();
  const missing: string[] = [];

  const live = await loadLiveProducts(
    container,
    await tenantProductIds(container, tenant.id),
  );

  const pairs: { product: LiveProduct; entry: DatasetProduct }[] = [];
  for (const entry of dataset.products) {
    const product = live.get(entry.product_handle);
    if (!product) {
      missing.push(entry.product_handle);
      continue;
    }
    pairs.push({ product, entry });
  }

  const links = await writeLinks(
    container,
    tenant.id,
    pairs.map(({ product, entry }) => ({ product_id: product.id, entry })),
    options,
  );

  if (options.sections.has("characteristics") && !options.dryRun) {
    await ensureDefaultSchema(container, tenant.id);
  }
  const schema = options.sections.has("characteristics")
    ? await loadSchema(container, tenant.id)
    : { byKey: new Map(), optionsByAttribute: new Map(), nextPosition: 0 };

  // A dry run on a shop whose schema is still empty has to say what the run
  // WOULD fill. Without this stub every preset value is reported as «не
  // принято», which reads as a broken card rather than as a schema the apply
  // creates a second later (measured 2026-09-16: 39 of 102 characteristics on
  // the first dry run of the stand). The ids are never dereferenced: every
  // write below exits early under `--dry-run`.
  if (options.sections.has("characteristics") && options.dryRun) {
    for (const preset of DEFAULT_ATTRIBUTE_PRESET) {
      if (!schema.byKey.has(preset.key)) {
        schema.byKey.set(preset.key, {
          id: "(ещё не создана)",
          key: preset.key,
          type: preset.type,
          name: preset.name,
        });
      }
    }
  }

  for (const { product, entry } of pairs) {
    if (options.sections.has("titles")) {
      await applyTitle(container, product, entry, options, counters);
    }
    if (options.sections.has("prices")) {
      await applyPrice(container, product, entry, options, counters);
    }
    if (options.sections.has("characteristics")) {
      await applyCharacteristics(container, tenant.id, schema, product, entry, options, counters);
    }
    if (options.sections.has("reviews")) {
      await applyReviews(container, tenant.id, product, entry, options, counters);
    }
    if (options.sections.has("images")) {
      await applyImages(container, tenant.id, product, entry, options, counters);
    }
  }

  return { counters, links, missing_handles: missing };
};

/** The ids of the products the tenant link ties to this shop, and no others. */
export const tenantProductIds = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<string[]> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "tenant",
    fields: ["id", "products.id"],
    filters: { id: tenantId },
  });

  return ((data[0]?.products ?? []) as ({ id?: string | null } | null)[])
    .map((product) => product?.id ?? null)
    .filter((id): id is string => Boolean(id));
};

/** Re-exported so the script can report what the dedupe recognised. */
export { keyFromCatalogImage };
