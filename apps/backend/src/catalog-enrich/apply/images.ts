import type { MedusaContainer } from "@medusajs/framework";
import { updateProductsWorkflow, uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import { fetchImage } from "../../product-csv/images";
import { tenantFilePrefix } from "../../tenant-files";
import type { DatasetProduct } from "../dataset";
import { planPhotos } from "../images";
import type { ApplyOptions, SectionCounters, LiveProduct } from "./live";

/**
 * The images section.
 *
 * `../apply.ts` runs the sections in order and re-exports what callers use
 * from here (t-2026-10-14-55).
 */

/**
 * The card's photos, appended after everything the shop already has.
 *
 * `updateProductsWorkflow` replaces the image list wholesale, so the payload is
 * the existing URLs IN THEIR CURRENT ORDER followed by the new ones; the first
 * image therefore keeps both its place and its rank. `thumbnail` is not in the
 * update at all, so the cover the owner chose cannot move (Ivan, 2026-09-16
 * 04:44 WITA).
 */
export const applyImages = async (
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
