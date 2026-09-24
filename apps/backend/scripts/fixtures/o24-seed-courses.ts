import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COURSE_MODULE } from "../../src/modules/course";
import type CourseModuleService from "../../src/modules/course/service";
import createTenantProductWorkflow from "../../src/workflows/tenant/create-tenant-product";

/**
 * o24-courses: seeds the two Cherkashina pilot courses («Очищение печени»,
 * «Очищение почек») for tenant `cherkashino`, with their lessons imported from
 * `chrxnasdmds` (`packages/course-core/src/data/*.ts`, converted once to the
 * JSON beside this file — see `data/o24-courses/README` at the bottom of this
 * comment). Not wired into any pnpm script — run once with
 * `npx medusa exec ./scripts/fixtures/o24-seed-courses.ts`, against
 * `upready_store_e2e` first and the stand database only after the lead's ok
 * (brief `2026-09-24-night-w4-courses-then-rest.md`).
 *
 * Idempotent: a course already on file for the tenant (matched by slug) is
 * left untouched, lessons included, so re-running after a partial failure or
 * a schema change never duplicates rows. A course product is likewise looked
 * up by handle before a new one is created.
 *
 * Video content is NOT migrated here: the source videos are 2.1 GB of local
 * files in `chrxnasdmds/apps/backend/static/courses/`, no CDN or media host
 * for them exists in upready-store yet, and copying 2GB into this repository
 * or this fixture is out of scope for the backend module. Every lesson that
 * had a video in the source keeps a `Видео: «…»` line naming it in the
 * lesson body; `lesson.video_url` is left null. Hosting the real videos is a
 * separate decision for the lead/Ivan.
 *
 * `metadata.digital = "true"` on the product is the marker the storefront
 * checkout (o24-courses part c, a later PR) reads to skip the delivery step
 * for a cart holding only digital items — there is no `requires_shipping`
 * concept in Medusa v2's product model, so this is the seed's own contract
 * with that PR, not a framework field.
 *
 * Prices (4990 RUB / 4990 sits with cherkashino's own products' price band,
 * 55 USD) are PLACEHOLDERS: Ivan has not set real course pricing, and this
 * fixture needs a non-zero price to satisfy product creation. Edit them in
 * the panel before a real sale.
 */
const TENANT_HANDLE = "cherkashino";
const DEFAULT_OPTION_TITLE = "Опция по умолчанию";
const DEFAULT_OPTION_VALUE = "Значение по умолчанию";

type SeedLesson = { title: string; order: number; body: string; video_url: string | null };
type SeedCourse = {
  title: string;
  slug: string;
  description: string;
  product_handle: string;
  lessons: SeedLesson[];
};

const PLACEHOLDER_PRICE_RUB: Record<string, number> = {
  "ochishchenie-pecheni": 4990,
  "ochishchenie-pochek": 3990,
};
const PLACEHOLDER_PRICE_USD: Record<string, number> = {
  "ochishchenie-pecheni": 55,
  "ochishchenie-pochek": 45,
};

const loadCourseData = (fileName: string): SeedCourse =>
  JSON.parse(readFileSync(join(__dirname, "data/o24-courses", fileName), "utf8")) as SeedCourse;

const COURSES_TO_SEED = [
  loadCourseData("ochishchenie-pecheni.json"),
  loadCourseData("ochishchenie-pochek.json"),
];

export default async function seedO24Courses({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const courseService: CourseModuleService = container.resolve(COURSE_MODULE);

  const { data: tenantAdmins } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "tenant.id", "tenant.handle"],
    filters: {},
  });
  const tenantAdmin = tenantAdmins.find((row) => row.tenant?.handle === TENANT_HANDLE);

  if (!tenantAdmin?.tenant?.id) {
    throw new Error(`o24-seed-courses: tenant "${TENANT_HANDLE}" was not found (or has no admin).`);
  }

  const tenantId = tenantAdmin.tenant.id as string;

  for (const data of COURSES_TO_SEED) {
    const [existingCourse] = await courseService.listCourses({
      tenant_id: tenantId,
      slug: data.slug,
    });

    if (existingCourse) {
      logger.info(`o24-seed-courses: "${data.slug}" already exists for ${TENANT_HANDLE}, skipping`);
      continue;
    }

    const {
      data: [existingProduct],
    } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: { handle: data.product_handle },
    });

    let productId = existingProduct?.id as string | undefined;

    if (!productId) {
      const { result } = await createTenantProductWorkflow(container).run({
        input: {
          tenant_admin_id: tenantAdmin.id,
          product: {
            title: data.title,
            handle: data.product_handle,
            description: data.description,
            status: ProductStatus.PUBLISHED,
            weight: 0,
            metadata: { digital: "true" },
            options: [{ title: DEFAULT_OPTION_TITLE, values: [DEFAULT_OPTION_VALUE] }],
            variants: [
              {
                title: data.title,
                options: { [DEFAULT_OPTION_TITLE]: DEFAULT_OPTION_VALUE },
                // A course is not a physical good; there is no stock to run out of.
                // Left at the framework default (`manage_inventory: true`) with no
                // stock level ever set, the variant reads "Нет в наличии" and the
                // add-to-cart button stays disabled forever — found live by
                // `e2e/courses/course-purchase.spec.ts`'s first run (o24-courses
                // part (e)).
                manage_inventory: false,
                prices: [
                  { currency_code: "rub", amount: PLACEHOLDER_PRICE_RUB[data.slug] ?? 4990 },
                  { currency_code: "usd", amount: PLACEHOLDER_PRICE_USD[data.slug] ?? 50 },
                ],
              },
            ],
          },
        },
      });
      productId = result.product.id;
      logger.info(`o24-seed-courses: created product ${productId} (${data.product_handle})`);
    }

    const course = await courseService.createCourses({
      tenant_id: tenantId,
      product_id: productId,
      title: data.title,
      slug: data.slug,
      description: data.description,
      status: "published",
    });
    const courseRow = Array.isArray(course) ? course[0] : course;

    for (const lesson of data.lessons) {
      await courseService.createLessons({
        tenant_id: tenantId,
        course_id: courseRow.id,
        title: lesson.title,
        order: lesson.order,
        body: lesson.body,
        video_url: lesson.video_url,
      });
    }

    logger.info(
      `o24-seed-courses: seeded "${data.slug}" (${courseRow.id}) with ${data.lessons.length} lessons`,
    );
  }
}
