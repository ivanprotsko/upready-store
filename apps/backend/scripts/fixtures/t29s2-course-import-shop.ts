import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { COURSE_MODULE } from "../../src/modules/course";
import type CourseModuleService from "../../src/modules/course/service";
import { TENANT_MODULE } from "../../src/modules/tenant";
import TenantModuleService from "../../src/modules/tenant/service";
import { markTestShopMetadata } from "../../src/modules/tenant/test-shop";
import createTenantWorkflow from "../../src/workflows/tenant/create-tenant";
import createTenantDomainWorkflow from "../../src/workflows/tenant/create-tenant-domain";
import createTenantProductWorkflow from "../../src/workflows/tenant/create-tenant-product";

/**
 * t-2026-10-13-29 stage 2: a scratch shop to run `src/scripts/course-import-export.ts`
 * against on a local database, never a real one.
 *
 *   npx medusa exec ./scripts/fixtures/t29s2-course-import-shop.ts
 *
 * The shop `t29s2shop` answers on the host `t29s2.localhost` and sells the two
 * products the import targets on cherkashino.ru, under the same handles: the
 * liver course and the lymph set. Run `src/scripts/seed-course-lessons.ts` on
 * the liver product afterwards to give it the course and lessons production
 * has. A buyer `buyer@t29s2.example` (password `supersecret`) holds a grant to
 * every course of the shop, written today, so the Store API can be read as
 * them. Idempotent.
 */
const HANDLE = "t29s2shop";
const HOST = "t29s2.localhost";
const PRODUCTS = [
  { handle: "course-ochishchenie-pecheni-cherkashino", title: "Очищение печени" },
  { handle: "nabor-dlya-ochischeniya-limfy-cherkashino", title: "Набор для очищения лимфы" },
];

export default async function t29s2CourseImportShop({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const say = (message: string) => logger.info(`t29s2-shop: ${message}`);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const auth: IAuthModuleService = container.resolve(Modules.AUTH);
  const tenants: TenantModuleService = container.resolve(TENANT_MODULE);
  const courses: CourseModuleService = container.resolve(COURSE_MODULE);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  let [tenant] = await tenants.listTenants({ handle: HANDLE });
  if (!tenant) {
    const registered = await auth.register("emailpass", {
      body: { email: "owner@t29s2.example", password: "supersecret" },
    });
    if (!registered.success || !registered.authIdentity) {
      throw new Error(`t29s2-shop: could not register the owner: ${registered.error}`);
    }
    const { result } = await createTenantWorkflow(container).run({
      input: {
        name: "T29s2 Shop",
        handle: HANDLE,
        admin: { email: "owner@t29s2.example", first_name: "Test", last_name: "Owner" },
        authIdentityId: registered.authIdentity.id,
      },
    });
    tenant = result.tenant as typeof tenant;
    await tenants.updateTenants({
      id: tenant.id,
      metadata: markTestShopMetadata(tenant.metadata as Record<string, unknown> | null),
    });
    say(`created ${HANDLE} (${tenant.id}), publishable key ${result.tenant.api_key.token}`);
  }

  const domain = await pg("tenant_domain").where({ host: HOST }).whereNull("deleted_at").first();
  if (!domain) {
    await createTenantDomainWorkflow(container).run({ input: { tenant_id: tenant.id, host: HOST } });
    say(`host ${HOST} added`);
  }

  const admin = (await pg("tenant_admin")
    .select("id")
    .where({ tenant_id: tenant.id })
    .whereNull("deleted_at")
    .orderBy("created_at", "asc")
    .first()) as { id: string };

  for (const wanted of PRODUCTS) {
    const { data } = await query.graph({ entity: "product", fields: ["id"], filters: { handle: wanted.handle } });
    if (data[0]?.id) {
      continue;
    }
    const { result } = await createTenantProductWorkflow(container).run({
      input: {
        tenant_admin_id: admin.id,
        product: {
          title: wanted.title,
          handle: wanted.handle,
          status: ProductStatus.PUBLISHED,
          metadata: { digital: "true" },
          options: [{ title: "Доступ", values: ["Полный курс"] }],
          variants: [
            {
              title: "Полный курс",
              manage_inventory: false,
              options: { Доступ: "Полный курс" },
              prices: [{ currency_code: "rub", amount: 10000 }],
            },
          ],
        },
      },
    });
    say(`product ${wanted.handle} (${result.product?.id}) created`);
  }

  let [buyer] = (await pg("customer").where({ email: "buyer@t29s2.example" }).whereNull("deleted_at").select("id")) as {
    id: string;
  }[];
  if (!buyer) {
    const registered = await auth.register("emailpass", {
      body: { email: "buyer@t29s2.example", password: "supersecret" },
    });
    const customerId = `cus_t29s2${Math.random().toString(36).slice(2, 10)}`;
    await pg("customer").insert({
      id: customerId,
      email: "buyer@t29s2.example",
      first_name: "Тест",
      last_name: "Покупатель",
      has_account: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    if (registered.authIdentity) {
      await auth.updateAuthIdentities({
        id: registered.authIdentity.id,
        app_metadata: { customer_id: customerId },
      });
    }
    buyer = { id: customerId };
    say(`buyer buyer@t29s2.example (${customerId}) created`);
  }

  for (const course of await courses.listCourses({ tenant_id: tenant.id })) {
    const [grant] = await courses.listCourseEntitlements({
      tenant_id: tenant.id,
      customer_id: buyer.id,
      course_id: course.id,
    });
    if (!grant) {
      await courses.createCourseEntitlements({
        tenant_id: tenant.id,
        customer_id: buyer.id,
        course_id: course.id,
        granted_at: new Date(),
        status: "active",
      });
      say(`buyer granted ${course.slug}`);
    }
  }

  say(`ready: tenant ${tenant.id} on ${HOST}`);
}
