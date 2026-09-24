import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildCoursePageUpdate, type CoursePageData, type ProductOnFile } from "./o26-course-page-payload";

/**
 * t-2026-09-24-n23: fills the product page of the course «Очищение печени»
 * (tenant `cherkashino`, handle `course-ochishchenie-pecheni`) from the
 * landing https://cherkashinaoks.ru/ochishenie: Ivan's description text, the
 * cover (thumbnail, first image, `metadata.cover` with every variant), and
 * `metadata.course_page` (about sections, FAQ, testimonials) that the
 * storefront renders under the course's centre card.
 *
 * Run order (from `apps/backend`):
 *
 *   node scripts/media/make-image-variants.mjs <liver.png> static/courses/course-ochishchenie-pecheni
 *   npx medusa exec ./scripts/fixtures/o26-seed-course-page-content.ts
 *
 * The first command writes the WebP variants the URLs below point at; the
 * files are not in git (`static/` is ignored), so every stand makes them
 * itself. URLs are built from `LOCAL_FILE_BACKEND_URL` (the same base the
 * local file provider answers with), falling back to
 * `BACKEND_PUBLIC_URL/static`.
 *
 * Idempotent: the product is compared with the payload first and nothing is
 * written when nothing differs. `DRY_RUN=1` prints the fields that would
 * change and writes nothing. The write goes through `updateProductsWorkflow`,
 * so `product.updated` fires and the storefront cache is revalidated.
 */
const DATA_FILE = join(__dirname, "data/course-ochishchenie-pecheni.json");

const fileBaseUrl = (): string => {
  const local = process.env.LOCAL_FILE_BACKEND_URL;
  if (local) return local;
  const backend = process.env.BACKEND_PUBLIC_URL;
  if (backend) return `${backend.replace(/\/+$/, "")}/static`;
  throw new Error("o26-seed-course-page-content: set LOCAL_FILE_BACKEND_URL or BACKEND_PUBLIC_URL");
};

export default async function seedO26CoursePageContent({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const dryRun = process.env.DRY_RUN === "1";
  const data = JSON.parse(readFileSync(DATA_FILE, "utf8")) as CoursePageData;

  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "handle", "products.id", "products.handle"],
    filters: { handle: data.tenant_handle },
  });
  const tenant = tenants[0];
  const owned = (tenant?.products ?? []).find((product) => product?.handle === data.product_handle);

  if (!owned?.id) {
    throw new Error(
      `o26-seed-course-page-content: product "${data.product_handle}" of tenant "${data.tenant_handle}" was not found`,
    );
  }

  const {
    data: [product],
  } = await query.graph({
    entity: "product",
    fields: ["id", "description", "thumbnail", "metadata", "images.url", "images.rank"],
    filters: { id: owned.id },
  });

  const images = [...(product.images ?? [])]
    .filter((image): image is NonNullable<typeof image> => Boolean(image?.url))
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((image) => ({ url: image.url as string }));

  const onFile: ProductOnFile = {
    id: product.id as string,
    description: (product.description as string | null) ?? null,
    thumbnail: (product.thumbnail as string | null) ?? null,
    images,
    metadata: (product.metadata as Record<string, unknown> | null) ?? null,
  };

  const { update, changes } = buildCoursePageUpdate(onFile, data, fileBaseUrl());

  if (changes.length === 0) {
    logger.info(`o26-seed-course-page-content: ${onFile.id} already holds this content, nothing to write`);
    return;
  }

  logger.info(`o26-seed-course-page-content: ${onFile.id} would change: ${changes.join(", ")}`);
  if (changes.includes("thumbnail")) {
    logger.info(`  thumbnail: ${onFile.thumbnail ?? "(none)"} -> ${update.thumbnail}`);
  }
  if (changes.includes("images")) {
    logger.info(`  images: ${images.length} -> ${update.images.map((image) => image.url).join(", ")}`);
  }
  if (changes.includes("description")) {
    logger.info(`  description: ${(onFile.description ?? "").length} -> ${update.description.length} chars`);
  }

  if (dryRun) {
    logger.info("o26-seed-course-page-content: DRY_RUN=1, nothing written");
    return;
  }

  await updateProductsWorkflow(container).run({
    input: {
      selector: { id: onFile.id },
      update: {
        description: update.description,
        thumbnail: update.thumbnail,
        images: update.images,
        metadata: update.metadata,
      },
    },
  });

  logger.info(`o26-seed-course-page-content: wrote ${changes.join(", ")} to ${onFile.id}`);
}
