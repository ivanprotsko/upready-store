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
 *
 * The write steps live in `apply/`, one file per kind of write (t-2026-10-14-55).
 */

import type { MedusaContainer } from "@medusajs/framework/types";
import type { CatalogSnapshot } from "./catalog";
import type { ImportReport } from "./plan";
import { missingCategoryPaths } from "./plan";
import type { ReadFileResult } from "./rows";
import { groupCreates, createMissingCategories, createProduct } from "./apply/create";
import { resolveImages } from "./apply/images";
import { writeStock } from "./apply/stock";
import { updateProductFields, upsertVariant } from "./apply/update";

export { IMPORT_OPTION_TITLE, IMPORT_DEFAULT_OPTION_VALUE } from "./apply/create";
export { pricePayload } from "./apply/update";

export type ApplyInput = {
  container: MedusaContainer;
  tenantId: string;
  tenantAdminId: string;
  /** The FRESH plan, made against the catalogue as it stands now. */
  report: ImportReport;
  file: ReadFileResult;
  snapshot: CatalogSnapshot;
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
