import type { ExecArgs, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import { COURSE_PAGES } from "./course-content/course-pages";

/**
 * Fills one product page with the content of a cherkashinaoks.ru landing:
 * `description` and `metadata.course_page` (about sections, FAQ,
 * testimonials), which the storefront renders under the course's centre card.
 * The same content `scripts/fixtures/o26-seed-course-page-content.ts` writes
 * on a stand, without the cover, so it runs inside the built image.
 *
 * `medusa exec` swallows a leading `--` before a flag, so the switches are
 * `key=value` words:
 *
 *   npx medusa exec ./src/scripts/fill-course-page.js product=<handle> page=<ochishenie|limfa|pochki> dry-run
 *   npx medusa exec ./src/scripts/fill-course-page.js product=<handle> page=<ochishenie|limfa|pochki>
 *
 * Idempotent: nothing is written when the product already holds this
 * content. Other metadata keys are kept. The write goes through
 * `updateProductsWorkflow`, so `product.updated` revalidates the storefront.
 */
const canonical = (value: unknown): string =>
  JSON.stringify(value ?? null, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );

const readArg = (args: string[], name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

export default async function fillCoursePage({ container, args = [] }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const dryRun = args.includes("dry-run");
  const handle = readArg(args, "product");
  const pageKey = readArg(args, "page");
  const content = pageKey ? COURSE_PAGES[pageKey] : undefined;

  if (!handle || !content) {
    throw new Error(
      `fill-course-page: pass product=<handle> page=<${Object.keys(COURSE_PAGES).join("|")}>`,
    );
  }

  const {
    data: [product],
  } = await query.graph({
    entity: "product",
    fields: ["id", "title", "status", "description", "metadata"],
    filters: { handle },
  });

  if (!product?.id) {
    throw new Error(`fill-course-page: product "${handle}" was not found`);
  }

  const metadata = (product.metadata as Record<string, unknown> | null) ?? {};
  const changes: string[] = [];
  if ((product.description ?? "") !== content.description) changes.push("description");
  if (canonical(metadata.course_page) !== canonical(content.course_page)) changes.push("metadata.course_page");

  logger.info(`fill-course-page: ${product.id} "${product.title}" (${product.status}) <- ${content.source_url}`);

  if (!changes.length) {
    logger.info("fill-course-page: already holds this content, nothing to write");
    return;
  }

  logger.info(`fill-course-page: would change ${changes.join(", ")}`);
  if (dryRun) {
    logger.info("fill-course-page: dry-run, nothing written");
    return;
  }

  await updateProductsWorkflow(container).run({
    input: {
      selector: { id: product.id },
      update: {
        description: content.description,
        metadata: { ...metadata, course_page: content.course_page },
      },
    },
  });

  logger.info(`fill-course-page: wrote ${changes.join(", ")} to ${product.id}`);
}
