import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { createCollectionsWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import type { HomeBanner, TenantHomeDocument } from "../api/tenants/home/validators";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { COURSE_PAGES } from "../scripts/course-content/course-pages";
import createTenantProductWorkflow from "../workflows/tenant/create-tenant-product";
import upsertTenantHomeWorkflow from "../workflows/tenant/upsert-tenant-home";
import {
  COURSE_PAGES_HOST,
  KIDNEYS,
  LYMPH_DESCRIPTION_BEFORE,
  LYMPH_HANDLE,
  VARICOSE,
  collectionEdit,
  pageContentEdit,
  varicoseBannerEdit,
} from "./data/course-pages-cherkashino";

/**
 * The three course pages of cherkashino.ru and its third home banner, once (t-2026-10-13-26).
 * Ivan 13.10: «у нас 3 курса, на каждый я давал ссылки для заполнения страницы
 * https://cherkashinaoks.ru/limfa https://cherkashinaoks.ru/ochishenie https://cherkashinaoks.ru/pochki
 * … 1.1. на сайте всего 2 страницы есть … 1.1.2. страница с курсом по лимфе не заполнена …
 * 1.1.3. третий баннер ведет на страницу каталога, хотя там написано "товары от варикоза"».
 *
 * `medusa db:migrate` runs each file of this folder once per database (RU and INTL alike), so
 * the script first finds the shop by its host and does nothing where there is none. Then:
 *
 * 1. The lymph set gets its landing laid out like the liver course's (`course-pages.ts`,
 *    `limfa`): the description without the list the first section repeats, the two days under
 *    «Что включает курс?». Only over the text `fill-course-page.ts` wrote on 2026-10-02, or none.
 *    The storefront draws these sections on a product without a course since the same release.
 * 2. The kidneys course, which existed in no status, is created as a DRAFT the way the liver
 *    course is defined, filled from https://cherkashinaoks.ru/pochki. Its price, its picture and
 *    publishing it are Ivan's (`data/course-pages-cherkashino.ts`, `KIDNEYS`). A product found
 *    under its handle is filled instead, its status kept.
 * 3. The collection «Товары от варикоза» is created with the shop's four products named so (a
 *    product already in another collection is logged and kept there), and the third home
 *    banner, still pointing at the catalogue, is pointed at the collection's page.
 *
 * The liver course is not touched: every text on it was found on its landing (the evidence
 * report holds the block table). Each step logs and swallows its own failure: the entrypoint
 * runs `db:migrate` before the server starts, and a page's content is not worth a backend that
 * does not come up. The release's live check shows it.
 */
export default async function coursePagesCherkashinoRu({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const say = (message: string) => logger.info(`course-pages-cherkashino-ru: ${message}`);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const domain = (await pg("tenant_domain")
    .select("tenant_id")
    .where({ host: COURSE_PAGES_HOST })
    .whereNull("deleted_at")
    .first()) as { tenant_id: string } | undefined;
  if (!domain) {
    say(`no shop answers on ${COURSE_PAGES_HOST} in this database, nothing to do.`);
    return;
  }

  const steps: Array<[string, (tenantId: string) => Promise<void>]> = [
    ["lymph page", (tenantId) => fillLymph(container, tenantId, say)],
    ["kidneys course", (tenantId) => draftKidneys(container, pg, tenantId, say)],
    ["varicose banner", (tenantId) => pointVaricoseBanner(container, tenantId, say)],
  ];
  for (const [name, run] of steps) {
    try {
      await run(domain.tenant_id);
    } catch (error) {
      logger.error(
        `course-pages-cherkashino-ru: ${name} failed, left as it was: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

type ProductRow = {
  id: string;
  handle: string;
  status?: string | null;
  description?: string | null;
  collection_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** The shop's own products, by handle: `tenant_product` says which shop a product belongs to. */
async function tenantProducts(container: MedusaContainer, tenantId: string): Promise<Map<string, ProductRow>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "tenant",
    fields: [
      "id",
      "products.id",
      "products.handle",
      "products.status",
      "products.description",
      "products.collection_id",
      "products.metadata",
    ],
    filters: { id: tenantId },
  });
  const products = ((data[0]?.products ?? []) as Array<ProductRow | null>).filter(
    (product): product is ProductRow => Boolean(product?.id && product.handle),
  );
  return new Map(products.map((product) => [product.handle, product]));
}

/** Writes a landing's description and sections onto a product unless someone wrote their own. */
async function fillPage(
  container: MedusaContainer,
  product: ProductRow,
  key: "limfa" | "pochki",
  replaceable: readonly string[],
  say: (message: string) => void,
) {
  const content = COURSE_PAGES[key];
  const metadata = product.metadata ?? {};
  const edit = pageContentEdit({ description: product.description, course_page: metadata.course_page }, content, replaceable);
  const where = `${product.handle} (${product.id}, ${product.status})`;
  if (edit === "already") {
    say(`${where} already holds the ${key} landing.`);
    return;
  }
  if (edit === "different") {
    say(`${where} has a description of its own since, left for the owner.`);
    return;
  }
  await updateProductsWorkflow(container).run({
    input: {
      selector: { id: product.id },
      update: { description: content.description, metadata: { ...metadata, course_page: content.course_page } },
    },
  });
  say(`${where} filled from ${content.source_url}.`);
}

async function fillLymph(container: MedusaContainer, tenantId: string, say: (message: string) => void) {
  const lymph = (await tenantProducts(container, tenantId)).get(LYMPH_HANDLE);
  if (!lymph) {
    say(`${tenantId} has no product ${LYMPH_HANDLE}, nothing to fill.`);
    return;
  }
  await fillPage(container, lymph, "limfa", [LYMPH_DESCRIPTION_BEFORE], say);
}

async function draftKidneys(container: MedusaContainer, pg: Knex, tenantId: string, say: (message: string) => void) {
  const existing = (await tenantProducts(container, tenantId)).get(KIDNEYS.handle);
  if (existing) {
    await fillPage(container, existing, "pochki", [], say);
    return;
  }

  // The panel creates a product as one of the shop's admins; the oldest one stands in here.
  const admin = (await pg("tenant_admin")
    .select("id")
    .where({ tenant_id: tenantId })
    .whereNull("deleted_at")
    .orderBy("created_at", "asc")
    .first()) as { id: string } | undefined;
  if (!admin) {
    say(`${tenantId} has no admin to create the kidneys course as, nothing created.`);
    return;
  }

  const content = COURSE_PAGES.pochki;
  const { result } = await createTenantProductWorkflow(container).run({
    input: {
      tenant_admin_id: admin.id,
      product: {
        title: KIDNEYS.title,
        handle: KIDNEYS.handle,
        status: ProductStatus.DRAFT,
        description: content.description,
        discountable: true,
        metadata: { digital: "true", course_page: content.course_page },
        options: [{ title: KIDNEYS.option_title, values: [KIDNEYS.option_value] }],
        variants: [
          {
            title: KIDNEYS.option_value,
            sku: KIDNEYS.sku,
            manage_inventory: false,
            allow_backorder: false,
            options: { [KIDNEYS.option_title]: KIDNEYS.option_value },
            prices: [{ currency_code: "rub", amount: KIDNEYS.price_rub }],
          },
        ],
      },
    },
  });
  say(
    `kidneys course created as a draft ${KIDNEYS.handle} (${result.product?.id}), ${KIDNEYS.price_rub} RUB from ${content.source_url}; price, picture and publishing are the owner's.`,
  );
}

async function pointVaricoseBanner(container: MedusaContainer, tenantId: string, say: (message: string) => void) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);
  const products = await tenantProducts(container, tenantId);
  const varicose = VARICOSE.product_handles
    .map((handle) => products.get(handle))
    .filter((product): product is ProductRow => Boolean(product));
  if (!varicose.length) {
    say(`${tenantId} has none of the varicose products, the banner is left as it is.`);
    return;
  }

  const {
    data: [found],
  } = await query.graph({
    entity: "product_collection",
    fields: ["id"],
    filters: { handle: VARICOSE.collection_handle },
  });
  let collectionId = (found as { id?: string } | undefined)?.id;
  if (!collectionId) {
    const { result } = await createCollectionsWorkflow(container).run({
      input: { collections: [{ title: VARICOSE.collection_title, handle: VARICOSE.collection_handle }] },
    });
    collectionId = result[0].id;
    say(`collection «${VARICOSE.collection_title}» created (${collectionId}).`);
  }

  let inCollection = 0;
  for (const product of varicose) {
    const edit = collectionEdit(product.collection_id, collectionId);
    if (edit === "other") {
      say(`${product.handle} sits in collection ${product.collection_id}, left there.`);
      continue;
    }
    inCollection += 1;
    if (edit === "set") {
      await updateProductsWorkflow(container).run({
        input: { selector: { id: product.id }, update: { collection_id: collectionId } },
      });
      say(`${product.handle} put into «${VARICOSE.collection_title}».`);
    }
  }
  if (!inCollection) {
    say("no varicose product is in the collection, the banner is left as it is.");
    return;
  }

  const [row] = await tenantModule.listTenantHomeConfigs({ tenant_id: tenantId });
  if (!row) {
    say(`${tenantId} has no home document, no banner to point.`);
    return;
  }
  const document = row.config as unknown as TenantHomeDocument;
  const edit = varicoseBannerEdit<HomeBanner>(document.content?.banners ?? []);
  if (edit.outcome !== "changed") {
    say(
      {
        already: "the varicose banner already leads to the collection.",
        different: "the varicose banner leads somewhere the owner chose, left as it is.",
        missing: "the home page has no varicose banner, nothing to point.",
      }[edit.outcome],
    );
    return;
  }
  await upsertTenantHomeWorkflow(container).run({
    input: {
      tenant_id: tenantId,
      config: {
        ...document,
        content: { ...document.content, banners: edit.banners },
        updatedAt: new Date().toISOString(),
      },
    },
  });
  say(`the varicose banner now leads to /collections/${VARICOSE.collection_handle}.`);
}
