/**
 * The export half of the contract: the snapshot in, the file's header and cells
 * out. Pure, so the round trip is a unit test and not only a stand measurement
 * (`__tests__/round-trip.unit.spec.ts`).
 */

import { exportHeader, IMAGE_SEPARATOR, METADATA_PREFIX, PRICE_PREFIX } from "./contract";
import type { CatalogSnapshot, SnapshotProduct, SnapshotVariant } from "./snapshot";
import { categoryPath } from "./snapshot";
import { formatAmount } from "./values";

/**
 * Metadata keys worth a column: every key any product carries whose value is a
 * scalar. A key holding an object or an array (the migrated shop keeps an
 * `i18n` document in one) has no spreadsheet cell, so it gets no column and is
 * therefore never touched by an import either.
 */
export const exportableMetadataKeys = (products: SnapshotProduct[]): string[] => {
  const scalar = new Set<string>();
  const nested = new Set<string>();

  for (const product of products) {
    for (const [key, value] of Object.entries(product.metadata ?? {})) {
      if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
        scalar.add(key);
      } else {
        nested.add(key);
      }
    }
  }

  return [...scalar].filter((key) => !nested.has(key)).sort();
};

/** The cell a metadata value becomes, and the string an import compares against. */
export const metadataCell = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

/**
 * The price the file shows for one currency: the variant's own price, not a
 * price-list entry and not a rule-scoped one. Those two are invisible in the
 * file by design — a spreadsheet has no column for "€12 for wholesale
 * customers in Germany" — and the import leaves them alone for the same reason.
 */
export const defaultPriceOf = (variant: SnapshotVariant, currency: string): number | null => {
  const price = variant.prices.find(
    (candidate) =>
      candidate.currency_code === currency &&
      candidate.rules_count === 0 &&
      candidate.price_list_id === null,
  );

  return price?.amount ?? null;
};

/** The currency codes the tenant's own variants carry an unscoped price in. */
export const currenciesInUse = (products: SnapshotProduct[]): string[] => {
  const codes = new Set<string>();

  for (const product of products) {
    for (const variant of product.variants) {
      for (const price of variant.prices) {
        if (price.rules_count === 0 && price.price_list_id === null) {
          codes.add(price.currency_code);
        }
      }
    }
  }

  return [...codes].sort();
};

/** The effective value of a field the variant may override and the product may supply. */
export const effectiveNumber = (
  variant: SnapshotVariant,
  product: SnapshotProduct,
  field: "weight" | "length" | "width" | "height",
): number | null => variant[field] ?? product[field] ?? null;

export type ExportTable = { header: string[]; rows: string[][] };

/**
 * One row per variant, product columns repeated on every row of the same
 * handle. A shop whose products have a single variant each — which is every
 * shop this starter has migrated so far — gets one row per product.
 */
export const buildExportTable = (
  snapshot: CatalogSnapshot,
  currencies: string[],
  metadataKeys: string[],
): ExportTable => {
  const header = exportHeader(currencies, metadataKeys);
  const rows: string[][] = [];

  for (const product of snapshot.products) {
    const path = product.category_ids[0]
      ? categoryPath(snapshot.categories, product.category_ids[0]).join(" / ")
      : "";

    const variants = product.variants.length > 0 ? product.variants : [null];

    for (const variant of variants) {
      const cells: Record<string, string> = {
        handle: product.handle ?? "",
        title: product.title ?? "",
        subtitle: product.subtitle ?? "",
        description: product.description ?? "",
        status: product.status,
        category: path,
        variant_title: variant?.title ?? "",
        sku: variant?.sku ?? "",
        stock: variant && variant.stock !== null ? String(variant.stock) : "",
        weight: variant ? numberCell(effectiveNumber(variant, product, "weight")) : numberCell(product.weight),
        length: variant ? numberCell(effectiveNumber(variant, product, "length")) : numberCell(product.length),
        width: variant ? numberCell(effectiveNumber(variant, product, "width")) : numberCell(product.width),
        height: variant ? numberCell(effectiveNumber(variant, product, "height")) : numberCell(product.height),
        images: product.image_urls.join(IMAGE_SEPARATOR),
        thumbnail: product.thumbnail ?? "",
      };

      for (const currency of currencies) {
        const amount = variant ? defaultPriceOf(variant, currency) : null;
        cells[`${PRICE_PREFIX}${currency}`] = amount === null ? "" : formatAmount(amount);
      }

      for (const key of metadataKeys) {
        cells[`${METADATA_PREFIX}${key}`] = metadataCell(product.metadata?.[key]);
      }

      rows.push(header.map((column) => cells[column] ?? ""));
    }
  }

  return { header, rows };
};

const numberCell = (value: number | null): string => (value === null ? "" : String(value));

/** `catalog-<shop handle>-<date>.csv`, the name the browser saves the file under. */
export const exportFilename = (handle: string, now: Date): string =>
  `catalog-${handle}-${now.toISOString().slice(0, 10)}.csv`;
