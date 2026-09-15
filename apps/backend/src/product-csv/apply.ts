/**
 * The write half of the catalogue import (t14-product-import): the plan the
 * owner confirmed, applied to the catalogue.
 *
 * NOT transactional, and deliberately so rather than by omission. Medusa has no
 * one workflow that creates products, upserts variants, writes prices, links
 * categories and sets inventory levels under a single compensation boundary, so
 * the guarantee this code offers instead is the one the task allows: EVERYTHING
 * IS VALIDATED FIRST, and the first write happens only after the whole file has
 * been planned against the live catalogue. On an unexpected failure mid-way it
 * STOPS, names the line it stopped on, and reports every row it had already
 * written. A file that fails validation writes nothing at all.
 *
 * Re-planned, not replayed. `confirm` parses the stored file again and plans it
 * against the catalogue as it stands at that moment, so a catalogue edited
 * between the dry run and the confirmation cannot be written over by a stale
 * plan.
 */

import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import {
  batchInventoryItemLevelsWorkflow,
  batchLinksWorkflow,
  batchProductVariantsWorkflow,
  createInventoryItemsWorkflow,
  updateProductsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows";
import { buildBatchVariantInventoryData } from "@medusajs/medusa/api/admin/products/helpers";
import createTenantProductWorkflow from "../workflows/tenant/create-tenant-product";
import createTenantProductCategoryWorkflow from "../workflows/tenant/create-tenant-product-category";
import { tenantFilePrefix } from "../tenant-files";
import type { CatalogProduct, CatalogSnapshot, CatalogVariant } from "./catalog";
import { normalizeHeader } from "./columns";
import { fetchImage } from "./images";
import type { ImageOutcome, ImportReport, PlannedRow } from "./plan";
import { missingCategoryPaths } from "./plan";
import type { ReadFileResult, RowDraft } from "./rows";

/** The option every imported product gets when the file names variants. */
export const IMPORT_OPTION_TITLE = "Вариант";

/** The single option value a product with no variants of its own carries. */
export const IMPORT_DEFAULT_OPTION_VALUE = "Стандарт";

export type ApplyInput = {
  container: MedusaContainer;
  tenantId: string;
  tenantAdminId: string;
  /** The FRESH plan, made against the catalogue as it stands now. */
  report: ImportReport;
  file: ReadFileResult;
  snapshot: CatalogSnapshot;
};

type ImageResolution = {
  /** URLs to put on the product, in row order, after uploading. */
  urls: string[];
  outcomes: ImageOutcome[];
};

export const applyImport = async ({
  container,
  tenantId,
  tenantAdminId,
  report,
  file,
  snapshot,
}: ApplyInput): Promise<ImportReport> => {
  const draftByLine = new Map(file.rows.map((row) => [row.line, row]));
  const rows = report.rows.map((row) => ({ ...row }));

  const categories = await createMissingCategories({
    container,
    tenantId,
    paths: missingCategoryPaths(file, snapshot),
    snapshot,
  });

  let imagesFailed = 0;
  let stoppedAt: number | undefined;

  const actionable = rows.filter(
    (row) => row.action === "create" || row.action === "create_variant" || row.action === "update",
  );

  /** Create groups are applied per handle: one product, all of its rows. */
  const createGroups = groupCreates(actionable, draftByLine);

  try {
    for (const group of createGroups) {
      const images = await resolveImages({
        container,
        tenantId,
        urls: group.lead.image_urls,
        existing: [],
      });

      imagesFailed += images.outcomes.filter((outcome) => !outcome.ok).length;

      const created = await createProduct({
        container,
        tenantAdminId,
        group,
        draftByLine,
        categories,
        imageUrls: images.urls,
      });

      for (const row of group.rows) {
        row.applied = true;
        row.product_id = created.id;
        row.handle = created.handle;
        if (row.line === group.lead.line) {
          row.images = images.outcomes;
        }
      }

      const createProblems = await writeStock({
        container,
        productId: created.id,
        locationId: snapshot.stock_location_id,
        wanted: group.rows
          .map((row) => {
            const draft = draftByLine.get(row.line);
            return draft?.stock === null || draft?.stock === undefined
              ? null
              : { sku: draft.sku, title: draft.variant_title, stock: draft.stock };
          })
          .filter((entry): entry is { sku: string | null; title: string | null; stock: number } =>
            Boolean(entry),
          ),
      });

      if (createProblems.length > 0) {
        group.lead.notes = [...group.lead.notes, ...createProblems];
      }
    }

    for (const row of actionable) {
      if (row.applied) {
        continue;
      }

      const draft = draftByLine.get(row.line);

      if (!draft || !row.product_id) {
        continue;
      }

      const product = snapshot.products.find((candidate) => candidate.id === row.product_id);

      if (!product) {
        continue;
      }

      const isLead = row.changes.some((change) => LEAD_FIELDS.has(change.field));

      let imageUrls: string[] | null = null;

      if (row.image_urls.length > 0) {
        const images = await resolveImages({
          container,
          tenantId,
          urls: row.image_urls,
          existing: product.image_urls,
        });

        row.images = images.outcomes;
        imagesFailed += images.outcomes.filter((outcome) => !outcome.ok).length;
        imageUrls = images.urls;
      }

      if (isLead || imageUrls) {
        await updateProductFields({
          container,
          product,
          draft,
          categories,
          imageUrls,
        });
      }

      await upsertVariant({
        container,
        product,
        row,
        draft,
      });

      if (draft.stock !== null) {
        // A write that did not happen has to SAY so on the row: the report is
        // the only place the owner looks after confirming (rule 20a).
        const problems = await writeStock({
          container,
          productId: product.id,
          locationId: snapshot.stock_location_id,
          wanted: [{ sku: draft.sku, title: draft.variant_title, stock: draft.stock }],
        });

        if (problems.length > 0) {
          row.notes = [...row.notes, ...problems];
        }
      }

      row.applied = true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = rows.find((row) => row.action !== "reject" && row.action !== "unchanged" && !row.applied);

    if (failed) {
      failed.apply_error = message;
      stoppedAt = failed.line;
    }

    return {
      ...report,
      rows,
      status: "partially_applied",
      stopped_at_line: stoppedAt,
      summary: { ...report.summary, images_failed: imagesFailed },
    };
  }

  return {
    ...report,
    rows,
    status: "applied",
    summary: { ...report.summary, images_failed: imagesFailed },
  };
};

/** Product-level field names, as `plan.ts` writes them into `changes`. */
const LEAD_FIELDS = new Set([
  "Название",
  "Подзаголовок",
  "Описание",
  "Статус",
  "Категория",
  "Картинки",
]);

type CreateGroup = {
  handle: string;
  lead: PlannedRow;
  rows: PlannedRow[];
};

/**
 * Rows that create a product, grouped by handle: a product with three variants
 * arrives as three rows and has to be created once, with three variants, or
 * Medusa would refuse the second row's handle as a duplicate.
 */
const groupCreates = (rows: PlannedRow[], draftByLine: Map<number, RowDraft>): CreateGroup[] => {
  const groups = new Map<string, CreateGroup>();

  for (const row of rows) {
    if (row.action !== "create") {
      continue;
    }

    const draft = draftByLine.get(row.line);
    const key = normalizeHeader(row.handle ?? draft?.title ?? `line-${row.line}`);
    const group = groups.get(key);

    if (group) {
      group.rows.push(row);
      continue;
    }

    groups.set(key, { handle: key, lead: row, rows: [row] });
  }

  return [...groups.values()];
};

type CategoryLookup = Map<string, string>;

const pathKey = (path: string[]): string => path.map((part) => normalizeHeader(part)).join(" / ");

/**
 * Creates the category levels the plan announced, shallowest first, so a child
 * always finds its parent. Every one goes through
 * `createTenantProductCategoryWorkflow`, which writes the tenant link in the
 * same transaction: a category with no link is invisible to the panel and
 * belongs to nobody.
 */
const createMissingCategories = async ({
  container,
  tenantId,
  paths,
  snapshot,
}: {
  container: MedusaContainer;
  tenantId: string;
  paths: string[][];
  snapshot: CatalogSnapshot;
}): Promise<CategoryLookup> => {
  const lookup: CategoryLookup = new Map(
    snapshot.categories.map((category) => [pathKey(category.path), category.id]),
  );

  const ordered = [...paths].sort((left, right) => left.length - right.length);

  for (const path of ordered) {
    const key = pathKey(path);

    if (lookup.has(key)) {
      continue;
    }

    const parentKey = path.length > 1 ? pathKey(path.slice(0, -1)) : null;
    const parentId = parentKey ? (lookup.get(parentKey) ?? null) : null;

    const { result } = await createTenantProductCategoryWorkflow(container).run({
      input: {
        tenant_id: tenantId,
        product_category: {
          name: path[path.length - 1],
          is_active: true,
          ...(parentId ? { parent_category_id: parentId } : {}),
        },
      },
    });

    lookup.set(key, result.product_category.id);
  }

  return lookup;
};

/**
 * Image URLs turned into images the shop owns. A URL already on the product is
 * kept as it is: a round trip of the export must not re-download the shop's own
 * files, and the export writes the stored URLs out.
 */
const resolveImages = async ({
  container,
  tenantId,
  urls,
  existing,
}: {
  container: MedusaContainer;
  tenantId: string;
  urls: string[];
  existing: string[];
}): Promise<ImageResolution> => {
  const outcomes: ImageOutcome[] = [];
  const resolved: string[] = [];

  for (const [index, url] of urls.entries()) {
    if (existing.includes(url)) {
      resolved.push(url);
      outcomes.push({ ok: true, url });
      continue;
    }

    const fetched = await fetchImage(url, index);

    if (!fetched.ok) {
      outcomes.push({ ok: false, url, error: fetched.error });
      continue;
    }

    const { result } = await uploadFilesWorkflow(container).run({
      input: {
        files: [
          {
            filename: `${tenantFilePrefix(tenantId)}${fetched.filename}`,
            mimeType: fetched.mime_type,
            content: fetched.content.toString("base64"),
            access: "public" as const,
          },
        ],
      },
    });

    const stored = result[0]?.url;

    if (!stored) {
      outcomes.push({ ok: false, url, error: "файл не удалось сохранить в магазине" });
      continue;
    }

    resolved.push(stored);
    outcomes.push({ ok: true, url });
  }

  return { urls: resolved, outcomes };
};

/**
 * The price list to send when a variant's price changes: EVERY unscoped price
 * the variant already has, by id, with the amounts from the file written over
 * the currencies it named, plus a new row for a currency it priced for the
 * first time.
 *
 * Sending only the edited currency deletes the rest. `updatePriceSets` lists
 * the set's prices with `price_list_id: null` and deletes every one whose id is
 * absent from the update (`@medusajs/pricing`, `updatePriceSets_`), so an
 * import of a one-column price list would wipe a variant's other 117
 * currencies. Prices belonging to a PRICE LIST are left out on purpose: they
 * are outside that listing and cannot be deleted by this call.
 */
export const pricePayload = (
  variant: CatalogVariant,
  wanted: Record<string, number>,
): Record<string, unknown>[] => {
  const payload: Record<string, unknown>[] = [];
  const carried = new Set<string>();

  for (const row of variant.price_rows) {
    if (row.in_price_list) {
      continue;
    }

    const edited = !row.has_rules && wanted[row.currency_code] !== undefined;

    if (!row.has_rules) {
      carried.add(row.currency_code);
    }

    payload.push({
      id: row.id,
      currency_code: row.currency_code,
      amount: edited ? wanted[row.currency_code] : row.amount,
    });
  }

  for (const [currency, amount] of Object.entries(wanted)) {
    if (!carried.has(currency)) {
      payload.push({ currency_code: currency, amount });
    }
  }

  return payload;
};

const variantPayload = (draft: RowDraft, optionValue: string) => ({
  title: draft.variant_title ?? draft.title ?? optionValue,
  ...(draft.sku ? { sku: draft.sku } : {}),
  ...(draft.weight !== null ? { weight: draft.weight } : {}),
  ...(draft.length !== null ? { length: draft.length } : {}),
  ...(draft.width !== null ? { width: draft.width } : {}),
  ...(draft.height !== null ? { height: draft.height } : {}),
  manage_inventory: draft.stock !== null,
  prices: Object.entries(draft.prices).map(([currency_code, amount]) => ({
    currency_code,
    amount,
  })),
  options: { [IMPORT_OPTION_TITLE]: optionValue },
});

const optionValueFor = (draft: RowDraft, position: number): string =>
  draft.variant_title ?? draft.sku ?? (position === 0 ? IMPORT_DEFAULT_OPTION_VALUE : `${position + 1}`);

const createProduct = async ({
  container,
  tenantAdminId,
  group,
  draftByLine,
  categories,
  imageUrls,
}: {
  container: MedusaContainer;
  tenantAdminId: string;
  group: CreateGroup;
  draftByLine: Map<number, RowDraft>;
  categories: CategoryLookup;
  imageUrls: string[];
}): Promise<{ id: string; handle: string }> => {
  const leadDraft = draftByLine.get(group.lead.line)!;
  const drafts = group.rows
    .map((row) => draftByLine.get(row.line))
    .filter((draft): draft is RowDraft => Boolean(draft));

  const optionValues = drafts.map((draft, position) => optionValueFor(draft, position));
  const categoryId = leadDraft.category_path
    ? (categories.get(pathKey(leadDraft.category_path)) ?? null)
    : null;

  const { result } = await createTenantProductWorkflow(container).run({
    input: {
      tenant_admin_id: tenantAdminId,
      product: {
        title: leadDraft.title!,
        // `planned_handle` rather than the raw cell: the plan already proved
        // this code is free across the whole platform (`uniqueness.ts`) and
        // generated one when the file left the column empty.
        ...(group.lead.planned_handle ? { handle: group.lead.planned_handle } : {}),
        ...(leadDraft.subtitle ? { subtitle: leadDraft.subtitle } : {}),
        ...(leadDraft.description ? { description: leadDraft.description } : {}),
        // Never `published`, whatever the file says: a bad import must not put
        // a broken card in front of a customer.
        status: "draft",
        ...(Object.keys(leadDraft.metadata).length > 0 ? { metadata: leadDraft.metadata } : {}),
        ...(categoryId ? { categories: [{ id: categoryId }] } : {}),
        ...(imageUrls.length > 0 ? { images: imageUrls.map((url) => ({ url })) } : {}),
        options: [
          {
            title: IMPORT_OPTION_TITLE,
            values: [...new Set(optionValues)],
          },
        ],
        variants: drafts.map((draft, position) => variantPayload(draft, optionValues[position])),
      } as never,
    },
  });

  return {
    id: result.product.id as string,
    handle: (result.product.handle as string) ?? group.handle,
  };
};

const updateProductFields = async ({
  container,
  product,
  draft,
  categories,
  imageUrls,
}: {
  container: MedusaContainer;
  product: CatalogProduct;
  draft: RowDraft;
  categories: CategoryLookup;
  imageUrls: string[] | null;
}): Promise<void> => {
  const categoryId = draft.category_path
    ? (categories.get(pathKey(draft.category_path)) ?? null)
    : null;

  const update: Record<string, unknown> = {};

  if (draft.title !== null && draft.title !== product.title) {
    update.title = draft.title;
  }
  if (draft.subtitle !== null && draft.subtitle !== product.subtitle) {
    update.subtitle = draft.subtitle;
  }
  if (draft.description !== null && draft.description !== product.description) {
    update.description = draft.description;
  }
  if (draft.status !== null && draft.status !== product.status) {
    update.status = draft.status;
  }
  if (categoryId && categoryId !== product.category_id) {
    update.categories = [{ id: categoryId }];
  }
  if (Object.keys(draft.metadata).length > 0) {
    // Merged, never replaced: the file carries the keys the owner edited, and
    // `updateProductsWorkflow` writes the whole metadata object as given.
    update.metadata = { ...product.metadata, ...draft.metadata };
  }
  if (imageUrls && imageUrls.length > 0) {
    update.images = imageUrls.map((url) => ({ url }));
  }

  if (Object.keys(update).length === 0) {
    return;
  }

  await updateProductsWorkflow(container).run({
    input: {
      selector: { id: product.id },
      update: update as never,
    },
  });
};

/**
 * The row's variant, created or updated through the same batch workflow
 * `POST /tenants/products/:id/variants/batch` uses. Variants are never deleted
 * here: a file that does not mention a variant leaves it alone.
 */
const upsertVariant = async ({
  container,
  product,
  row,
  draft,
}: {
  container: MedusaContainer;
  product: CatalogProduct;
  row: PlannedRow;
  draft: RowDraft;
}): Promise<void> => {
  const variantFields: Record<string, unknown> = {};

  if (draft.variant_title !== null) {
    variantFields.title = draft.variant_title;
  }
  if (draft.sku !== null) {
    variantFields.sku = draft.sku;
  }
  if (draft.weight !== null) {
    variantFields.weight = draft.weight;
  }
  if (draft.length !== null) {
    variantFields.length = draft.length;
  }
  if (draft.width !== null) {
    variantFields.width = draft.width;
  }
  if (draft.height !== null) {
    variantFields.height = draft.height;
  }
  if (draft.stock !== null) {
    variantFields.manage_inventory = true;
  }
  if (Object.keys(draft.prices).length > 0) {
    const existing = product.variants.find((candidate) => candidate.id === row.variant_id);

    variantFields.prices = existing
      ? pricePayload(existing, draft.prices)
      : Object.entries(draft.prices).map(([currency_code, amount]) => ({
          currency_code,
          amount,
        }));
  }

  if (row.action === "create_variant") {
    const option = product.options[0];

    if (!option) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `У товара «${product.handle}» нет опций — новый вариант через файл добавить нельзя, добавьте его в панели.`,
      );
    }

    if (product.options.length > 1) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `У товара «${product.handle}» несколько опций (${product.options
          .map((entry) => entry.title)
          .join(", ")}) — новый вариант через файл добавить нельзя, добавьте его в панели.`,
      );
    }

    const value = draft.variant_title ?? draft.sku ?? IMPORT_DEFAULT_OPTION_VALUE;

    await batchProductVariantsWorkflow(container).run({
      input: {
        create: [
          {
            product_id: product.id,
            title: draft.variant_title ?? draft.sku ?? product.title,
            ...variantFields,
            options: { [option.title]: value },
          } as never,
        ],
      },
    });

    return;
  }

  if (!row.variant_id || Object.keys(variantFields).length === 0) {
    return;
  }

  await batchProductVariantsWorkflow(container).run({
    input: {
      update: [
        {
          id: row.variant_id,
          product_id: product.id,
          ...variantFields,
        } as never,
      ],
    },
  });
};

/**
 * Stocked quantities at the shop's own warehouse. A level that exists is
 * updated, one that does not is created; a shop with no warehouse gets nothing
 * written and the plan already said so on the row.
 */
const writeStock = async ({
  container,
  productId,
  locationId,
  wanted,
}: {
  container: MedusaContainer;
  productId: string;
  locationId: string | null;
  wanted: { sku: string | null; title: string | null; stock: number }[];
}): Promise<string[]> => {
  const problems: string[] = [];

  if (wanted.length === 0) {
    return problems;
  }

  if (!locationId) {
    problems.push("Остаток записать некуда: у магазина нет склада.");
    return problems;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "title", "inventory_items.inventory_item_id"],
    filters: { product_id: [productId] },
  });

  const variantFor = (entry: { sku: string | null; title: string | null }) =>
    variants.find((variant) => {
      if (entry.sku) {
        return normalizeHeader(String(variant?.sku ?? "")) === normalizeHeader(entry.sku);
      }
      if (entry.title) {
        return normalizeHeader(String(variant?.title ?? "")) === normalizeHeader(entry.title);
      }
      return true;
    });

  const itemOf = (variant: Record<string, unknown> | undefined): string | null =>
    ((variant?.inventory_items ?? []) as { inventory_item_id?: string | null }[])
      .map((link) => link?.inventory_item_id)
      .find((id): id is string => Boolean(id)) ?? null;

  const targets: { item: string; stock: number }[] = [];

  for (const entry of wanted) {
    const variant = variantFor(entry);

    if (!variant?.id) {
      problems.push(
        `Остаток ${entry.stock} записать некуда: варианта ${entry.sku ? `с SKU «${entry.sku}»` : `«${entry.title ?? ""}»`} у товара уже нет.`,
      );
      continue;
    }

    const existingItem = itemOf(variant);

    if (existingItem) {
      targets.push({ item: existingItem, stock: entry.stock });
      continue;
    }

    // A variant that was not stock-managed has NO inventory item, and turning
    // `manage_inventory` on does not create one: `updateProductVariantsWorkflow`
    // only ever DISMISSES inventory (`dismissProductVariantsInventoryStep`),
    // items are created at variant-creation time. So a stock number on a
    // previously unmanaged variant needs the item and the link made here, the
    // way the Admin's inventory kit makes them — measured on the stand
    // 2026-09-15: without this the report said «Остаток "" → 77» and the
    // database kept no level at all (rule 20a: a write nobody made must not
    // read as a write).
    const { result: created } = await createInventoryItemsWorkflow(container).run({
      input: {
        items: [
          {
            sku: (variant.sku as string | null) ?? undefined,
            title: (variant.title as string | null) ?? undefined,
          },
        ],
      },
    });

    const itemId = created[0]?.id;

    if (!itemId) {
      problems.push(`Остаток ${entry.stock} не записан: не удалось создать складскую позицию.`);
      continue;
    }

    await batchLinksWorkflow(container).run({
      input: {
        create: buildBatchVariantInventoryData([
          {
            variant_id: String(variant.id),
            inventory_item_id: itemId,
            required_quantity: 1,
          },
        ]),
      },
    });

    targets.push({ item: itemId, stock: entry.stock });
  }


  if (targets.length === 0) {
    return problems;
  }

  const { data: levels } = await query.graph({
    entity: "inventory_level",
    fields: ["id", "inventory_item_id", "location_id"],
    filters: {
      inventory_item_id: targets.map((entry) => entry.item),
      location_id: [locationId],
    },
  });

  const existing = new Set(
    levels.map((level) => String(level?.inventory_item_id ?? "")).filter(Boolean),
  );

  const create = targets
    .filter((entry) => !existing.has(entry.item))
    .map((entry) => ({
      inventory_item_id: entry.item,
      location_id: locationId,
      stocked_quantity: entry.stock,
    }));

  const update = targets
    .filter((entry) => existing.has(entry.item))
    .map((entry) => ({
      inventory_item_id: entry.item,
      location_id: locationId,
      stocked_quantity: entry.stock,
    }));

  await batchInventoryItemLevelsWorkflow(container).run({
    input: { create, update, delete: [] } as never,
  });

  return problems;
};
