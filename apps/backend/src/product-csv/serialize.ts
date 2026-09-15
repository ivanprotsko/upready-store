/**
 * Catalogue snapshot into the spreadsheet a shop owner opens (t14-product-import,
 * step 1). The export IS the import's contract: these columns, in this order,
 * are what the parser reads back, which is what makes a round trip with no
 * edits a no-op the acceptance test can check.
 *
 * Product-level values repeat on every row of a product with several variants.
 * In Excel that is what makes the file readable, and the import takes them from
 * the FIRST row of a handle (`plan.ts`).
 */

import { IMAGE_SEPARATOR, joinCategoryPath, metadataCell } from "./columns";
import type { CatalogProduct, CatalogSnapshot } from "./catalog";
import { toCsvFile, type Delimiter } from "./csv";
import { exportHeaderRow } from "./rows";

/** Numbers go out the way Excel in a Russian locale reads them back: comma. */
const numberCell = (value: number | null | undefined): string => {
  if (value === null || value === undefined) {
    return "";
  }

  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
};

export const snapshotRows = (snapshot: CatalogSnapshot): string[][] => {
  const rows: string[][] = [
    exportHeaderRow(
      snapshot.currencies.map((currency) => currency.toUpperCase()),
      snapshot.metadata_keys,
    ),
  ];

  const products = [...snapshot.products].sort((left, right) =>
    left.handle.localeCompare(right.handle, "ru"),
  );

  for (const product of products) {
    const variants = product.variants.length > 0 ? product.variants : [null];

    for (const variant of variants) {
      rows.push(productRow(product, variant, snapshot));
    }
  }

  return rows;
};

const productRow = (
  product: CatalogProduct,
  variant: CatalogProduct["variants"][number] | null,
  snapshot: CatalogSnapshot,
): string[] => [
  product.handle,
  product.title,
  product.subtitle ?? "",
  product.description ?? "",
  product.status,
  product.category_path ? joinCategoryPath(product.category_path) : "",
  variant?.title ?? "",
  variant?.sku ?? "",
  numberCell(variant?.stock ?? null),
  numberCell(variant?.weight ?? null),
  numberCell(variant?.length ?? null),
  numberCell(variant?.width ?? null),
  numberCell(variant?.height ?? null),
  ...snapshot.currencies.map((currency) => numberCell(variant?.prices?.[currency] ?? null)),
  ...snapshot.metadata_keys.map((key) => metadataCell(product.metadata?.[key])),
  product.image_urls.join(IMAGE_SEPARATOR),
];

/** The whole file: BOM, CRLF, `;` by default. See `toCsvFile` for why. */
export const snapshotToCsv = (snapshot: CatalogSnapshot, delimiter: Delimiter = ";"): string =>
  toCsvFile(snapshotRows(snapshot), delimiter);

/** `catalog-<handle>-2026-09-15T04-12-33-000Z.csv`, like the orders export. */
export const exportFilename = (handle: string, now: Date): string =>
  `catalog-${handle}-${now.toISOString().replace(/[:.]/g, "-")}.csv`;
