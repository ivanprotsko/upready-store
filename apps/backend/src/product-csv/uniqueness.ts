/**
 * Product codes and SKUs are unique ACROSS THE PLATFORM, not per shop
 * (t14-product-import).
 *
 * `IDX_product_handle_unique` on `product` and `IDX_product_variant_sku_unique`
 * on `product_variant` are both plain unique indexes with `WHERE deleted_at IS
 * NULL` — there is no tenant column in either. So "no product with this code in
 * MY shop" is not enough to create one: the insert dies on a neighbour's row,
 * mid-file, with a database error the owner cannot act on.
 *
 * This is the step that turns that into a dry-run verdict. It runs after the
 * plan and before any write, on both the upload and the confirm, and it is the
 * only part of the planner that has to look OUTSIDE the tenant's own catalogue.
 *
 * Two different answers, on purpose:
 *
 * - a code the owner TYPED and somebody else holds is a rejected row with the
 *   sentence «код занят». Renaming what they wrote would put their product on a
 *   URL they did not choose.
 * - a code this importer GENERATED from the name gets a `-2` suffix and says so
 *   in the report. Nobody chose it, so there is nothing to betray.
 */

import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { CatalogSnapshot } from "./catalog";
import { normalizeHeader } from "./columns";
import type { ImportReport } from "./plan";
import type { ReadFileResult } from "./rows";
import { firstFreeSlug, toSlug } from "./slugify";

export type ResolveIdentitiesInput = {
  container: MedusaContainer;
  report: ImportReport;
  file: ReadFileResult;
  snapshot: CatalogSnapshot;
};

/**
 * Fills in `planned_handle` for every row that creates a product, and rejects
 * the rows whose code or SKU somebody else already holds. Returns a NEW report;
 * the input is not mutated.
 */
export const resolveNewIdentities = async ({
  container,
  report,
  file,
  snapshot,
}: ResolveIdentitiesInput): Promise<ImportReport> => {
  const rows = report.rows.map((row) => ({ ...row }));
  const draftByLine = new Map(file.rows.map((draft) => [draft.line, draft]));

  const creates = rows.filter((row) => row.action === "create");
  const newSkuRows = rows.filter(
    (row) => row.action === "create" || row.action === "create_variant",
  );

  if (creates.length === 0 && newSkuRows.length === 0) {
    return { ...report, rows };
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  // ---- product codes
  const wantedHandles = new Set<string>();

  for (const row of creates) {
    const draft = draftByLine.get(row.line);
    const typed = draft?.handle ? normalizeHeader(draft.handle) : null;
    const generated = typed ?? toSlug(draft?.title ?? "") ?? "";

    if (generated) {
      wantedHandles.add(generated);
      // Every suffix the generator could reach has to be checked too.
      for (let suffix = 2; suffix <= 5; suffix += 1) {
        wantedHandles.add(`${generated}-${suffix}`);
      }
    }
  }

  const takenHandles = new Set<string>();

  if (wantedHandles.size > 0) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle"],
      filters: { handle: [...wantedHandles] },
      pagination: { take: null } as never,
    });

    for (const product of products) {
      if (product?.handle) {
        takenHandles.add(normalizeHeader(String(product.handle)));
      }
    }
  }

  const claimed = new Set(takenHandles);

  for (const row of creates) {
    const draft = draftByLine.get(row.line);
    const typed = draft?.handle ? normalizeHeader(draft.handle) : null;

    if (typed) {
      if (claimed.has(typed)) {
        row.action = "reject";
        row.errors = [
          ...row.errors,
          {
            code: "handle_taken",
            column: "Код товара",
            message: `Код товара «${draft?.handle}» уже занят на платформе (он должен быть уникальным для всех магазинов). Придумайте другой — например «${firstFreeSlug(typed, claimed)}».`,
          },
        ];
        continue;
      }

      row.planned_handle = typed;
      claimed.add(typed);
      continue;
    }

    const base = toSlug(draft?.title ?? "");

    if (!base) {
      row.action = "reject";
      row.errors = [
        ...row.errors,
        {
          code: "handle_taken",
          column: "Код товара",
          message:
            "Из названия не получается код товара для адреса на витрине. Заполните колонку «Код товара» латиницей, например «asd-15».",
        },
      ];
      continue;
    }

    const free = firstFreeSlug(base, claimed);
    row.planned_handle = free;
    claimed.add(free);

    if (free !== base) {
      row.notes = [...row.notes, `Код товара «${base}» занят, товар получит код «${free}».`];
    } else {
      row.notes = [...row.notes, `Код товара для витрины: «${free}».`];
    }
  }

  // ---- SKUs
  const wantedSkus = new Map<string, string>();

  for (const row of newSkuRows) {
    if (row.action === "reject") {
      continue;
    }
    const draft = draftByLine.get(row.line);
    if (draft?.sku) {
      wantedSkus.set(normalizeHeader(draft.sku), draft.sku);
    }
  }

  if (wantedSkus.size === 0) {
    return { ...report, rows };
  }

  const ownVariantIds = new Set(
    snapshot.products.flatMap((product) => product.variants.map((variant) => variant.id)),
  );

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku"],
    filters: { sku: [...wantedSkus.values()] },
    pagination: { take: null } as never,
  });

  const takenSkus = new Set(
    variants
      .filter((variant) => !ownVariantIds.has(String(variant?.id)))
      .map((variant) => normalizeHeader(String(variant?.sku ?? "")))
      .filter(Boolean),
  );

  for (const row of newSkuRows) {
    if (row.action === "reject") {
      continue;
    }

    const draft = draftByLine.get(row.line);
    const sku = draft?.sku ? normalizeHeader(draft.sku) : null;

    if (sku && takenSkus.has(sku)) {
      row.action = "reject";
      row.errors = [
        ...row.errors,
        {
          code: "sku_taken",
          column: "SKU",
          message: `SKU «${draft?.sku}» уже занят другим товаром на платформе (SKU должен быть уникальным для всех магазинов). Задайте другой.`,
        },
      ];
    }
  }

  return { ...report, rows };
};

/** The summary, recounted after rows were downgraded to `reject`. */
export const recountSummary = (report: ImportReport): ImportReport => ({
  ...report,
  summary: {
    ...report.summary,
    create: report.rows.filter((row) => row.action === "create").length,
    create_variant: report.rows.filter((row) => row.action === "create_variant").length,
    update: report.rows.filter((row) => row.action === "update").length,
    unchanged: report.rows.filter((row) => row.action === "unchanged").length,
    reject: report.rows.filter((row) => row.action === "reject").length,
    images: report.rows.reduce((total, row) => total + row.image_urls.length, 0),
  },
});
