import type { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { batchProductVariantsWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import type { CatalogProduct, CatalogVariant } from "../catalog";
import { matchMetadataKey } from "../columns";
import type { PlannedRow } from "../plan";
import type { RowDraft } from "../rows";
import { IMPORT_DEFAULT_OPTION_VALUE, type CategoryLookup, pathKey } from "./create";

/**
 * The updates of an import: a product's own fields, and its variants with their
 * prices.
 *
 * `../apply.ts` runs these steps and re-exports what callers use from here
 * (t-2026-10-14-55).
 */

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

export const updateProductFields = async ({
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
    //
    // Each key is written under the spelling the PRODUCT already uses
    // (`matchMetadataKey`): a header the export wrote as
    // «Метаданные: pricelistPositions» must update that key and not add a
    // lowercase twin beside it (b01-owner-numbers).
    const metadata: Record<string, unknown> = { ...product.metadata };

    for (const [key, value] of Object.entries(draft.metadata)) {
      metadata[matchMetadataKey(product.metadata, key)] = value;
    }

    update.metadata = metadata;
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
export const upsertVariant = async ({
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
