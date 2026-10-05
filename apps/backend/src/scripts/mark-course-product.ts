import type { ExecArgs, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { markProductAsCourseIn } from "../api/tenants/courses/course-helpers";
import { COURSE_MODULE } from "../modules/course";
import type CourseModuleService from "../modules/course/service";
import { isDigitalProduct } from "../workflows/tenant/release-course-shipping/digital";

/**
 * Marks a product that already sells a course as a course product: the two
 * writes `markProductAsCourse` makes when a course is created in the panel,
 * `metadata.digital = "true"` and no shipping, for a course that was sold
 * before that helper wrote the marker.
 *
 * pass 3b N6: on cherkashino the course product had its shipping profile
 * cleared by hand and carried no marker. The server's cart line said
 * `requires_shipping: false`, so the checkout was right, but everything that
 * reads the marker before a server line exists was wrong: the cart sidebar
 * drew a freshly added course as «Отправление № 1» for a second or three, the
 * product page offered a second copy, and the one-per-order rule
 * (`validate-cart-course-quantity.ts`) did not apply.
 *
 * `medusa exec` swallows a leading `--` before a flag, so the switches are
 * `key=value` words:
 *
 *   npx medusa exec ./src/scripts/mark-course-product.js product=<handle> dry-run
 *   npx medusa exec ./src/scripts/mark-course-product.js product=<handle>
 *
 * Refuses a product no course is sold under, so the marker cannot land on an
 * ordinary product by a mistyped handle. Idempotent: nothing is written when
 * the product is already marked and nothing of it requires shipping. The
 * marker goes through `updateProductsWorkflow`, so `product.updated`
 * revalidates the storefront.
 */
type ProductRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  shipping_profile?: { id?: string } | null;
  variants?: { inventory_items?: { inventory?: { requires_shipping?: boolean } | null }[] | null }[] | null;
};

const readArg = (args: string[], name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

export default async function markCourseProduct({ container, args = [] }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const dryRun = args.includes("dry-run");
  const handle = readArg(args, "product");

  if (!handle) {
    throw new Error("mark-course-product: pass product=<handle>");
  }

  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "status",
      "metadata",
      "shipping_profile.id",
      "variants.inventory_items.inventory.requires_shipping",
    ],
    filters: { handle },
  });
  const product = data[0] as ProductRow | undefined;

  if (!product?.id) {
    throw new Error(`mark-course-product: product "${handle}" was not found`);
  }

  const courseService: CourseModuleService = container.resolve(COURSE_MODULE);
  const courses = await courseService.listCourses({ product_id: product.id });

  if (!courses.length) {
    throw new Error(`mark-course-product: no course is sold under "${handle}", nothing is marked`);
  }

  const changes: string[] = [];
  if (!isDigitalProduct(product.metadata)) changes.push('metadata.digital = "true"');
  if (product.shipping_profile?.id) changes.push("shipping profile detached");
  if (
    (product.variants ?? []).some((variant) =>
      (variant.inventory_items ?? []).some((item) => item.inventory?.requires_shipping),
    )
  ) {
    changes.push("inventory items no longer require shipping");
  }

  logger.info(
    `mark-course-product: ${product.id} "${product.title}" (${product.status}), courses under it: ${courses.length}`,
  );

  if (!changes.length) {
    logger.info("mark-course-product: already a course product, nothing to write");
    return;
  }

  logger.info(`mark-course-product: would change: ${changes.join("; ")}`);
  if (dryRun) {
    logger.info("mark-course-product: dry-run, nothing written");
    return;
  }

  await markProductAsCourseIn(container, product.id);

  logger.info(`mark-course-product: wrote to ${product.id}: ${changes.join("; ")}`);
}
