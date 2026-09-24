import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { TENANT_MODULE } from "../../src/modules/tenant";
import TenantModuleService from "../../src/modules/tenant/service";
import { isTestShop, markTestShopMetadata } from "../../src/modules/tenant/test-shop";
import createTenantWorkflow from "../../src/workflows/tenant/create-tenant";
import linkOrderToTenantWorkflow from "../../src/workflows/tenant/link-order-to-tenant";

/**
 * t13-customers-screen: throwaway data for measuring `GET /tenants/customers`
 * against 200 customers on a local stand. Not wired into any pnpm script —
 * run once with `npx medusa exec ./scripts/fixtures/t13-seed-test-tenant.ts`
 * against a scratch database, never against a real one.
 *
 * Creates one tenant ("t13test"), a second tenant ("t13other") to prove
 * isolation, one FULLY REAL order (through the ordinary create-order path
 * customers/[id] and the order-detail screen exercise) and then 200 synthetic
 * customers with one order each, inserted directly against the order/
 * order_summary/customer tables. A synthetic order carries only the columns
 * the aggregate query and the list route read (`helpers.ts`,
 * `customers/route.ts`): this is a measurement fixture, not a production
 * order, and it is never fully valid (no line items, no addresses).
 */
const PROVIDER = "emailpass";
const TENANT_HANDLE = "t13test";
const OTHER_HANDLE = "t13other";
const SYNTHETIC_COUNT = 200;

export default async function seedT13TestTenant({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const password = "supersecret";

  const ensureTenant = async (handle: string, name: string, adminEmail: string) => {
    let [tenant] = await tenantModuleService.listTenants({ handle });

    if (tenant) {
      if (!isTestShop(tenant.metadata as Record<string, unknown> | null)) {
        await tenantModuleService.updateTenants({
          id: tenant.id,
          metadata: markTestShopMetadata(tenant.metadata as Record<string, unknown> | null),
        });
      }
      logger.info(`t13-seed: ${handle} already exists (${tenant.id})`);
      return tenant;
    }

    const registered = await authModuleService.register(PROVIDER, {
      body: { email: adminEmail, password },
    });

    if (!registered.success || !registered.authIdentity) {
      throw new Error(`t13-seed: could not register ${adminEmail}: ${registered.error}`);
    }

    const { result } = await createTenantWorkflow(container).run({
      input: {
        name,
        handle,
        admin: { email: adminEmail, first_name: "Test", last_name: "Owner" },
        authIdentityId: registered.authIdentity.id,
      },
    });

    await tenantModuleService.updateTenants({
      id: result.tenant.id,
      metadata: markTestShopMetadata(result.tenant.metadata as Record<string, unknown> | null),
    });

    logger.info(`t13-seed: created ${handle} (${result.tenant.id}), key ${result.tenant.api_key.token}`);
    return result.tenant as typeof tenant;
  };

  const tenant = await ensureTenant(TENANT_HANDLE, "T13 Test Store", "admin@t13test.example");
  const otherTenant = await ensureTenant(OTHER_HANDLE, "T13 Other Store", "admin@t13other.example");

  const {
    data: [withChannel],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "sales_channel.id"],
    filters: { id: [tenant.id] },
  });
  const salesChannelId = withChannel?.sales_channel?.id as string | undefined;

  if (!salesChannelId) {
    throw new Error(`t13-seed: tenant ${TENANT_HANDLE} has no sales channel link.`);
  }

  const {
    data: [otherWithChannel],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "sales_channel.id"],
    filters: { id: [otherTenant.id] },
  });
  const otherSalesChannelId = otherWithChannel?.sales_channel?.id as string | undefined;

  if (!otherSalesChannelId) {
    throw new Error(`t13-seed: tenant ${OTHER_HANDLE} has no sales channel link.`);
  }

  // One real, registered customer with two orders through the ordinary
  // order/order_summary rows a checkout would leave, for the customer card
  // screenshot — inserted the same synthetic way as the 200 below (a full
  // cart checkout is out of scope for a data fixture), but through the
  // normal id shape (`cus_`, `order_`) rather than a `t13-synthetic-` prefix,
  // so it reads like a real row in the panel.
  const [existingCard] = await pg("customer").where({ email: "anna.karenina@t13test.example" }).select("id");
  let cardCustomerId = existingCard?.id as string | undefined;

  if (!cardCustomerId) {
    cardCustomerId = `cus_t13card${Math.random().toString(36).slice(2, 10)}`;
    await pg("customer").insert({
      id: cardCustomerId,
      first_name: "Анна",
      last_name: "Каренина",
      email: "anna.karenina@t13test.example",
      phone: "+79261234567",
      has_account: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    for (let i = 0; i < 2; i += 1) {
      const orderId = `order_t13card${i}${Math.random().toString(36).slice(2, 8)}`;
      await pg("order").insert({
        id: orderId,
        customer_id: cardCustomerId,
        sales_channel_id: salesChannelId,
        currency_code: "rub",
        status: "completed",
        is_draft_order: false,
        email: "anna.karenina@t13test.example",
        created_at: new Date(Date.now() - i * 86400000),
        updated_at: new Date(),
      });
      await pg("order_summary").insert({
        id: `ordsum_t13card${i}${Math.random().toString(36).slice(2, 8)}`,
        order_id: orderId,
        totals: JSON.stringify({ current_order_total: 1500 + i * 500 }),
        created_at: new Date(),
        updated_at: new Date(),
      });
      await linkOrderToTenantWorkflow(container).run({ input: { order_id: orderId } });
    }

    logger.info(`t13-seed: card customer ${cardCustomerId} with 2 orders`);
  }

  // A guest order (no account) on the same tenant, for the guest-marker check.
  const [existingGuest] = await pg("customer").where({ email: "guest.buyer@t13test.example" }).select("id");
  if (!existingGuest) {
    const guestId = `cus_t13guest${Math.random().toString(36).slice(2, 8)}`;
    await pg("customer").insert({
      id: guestId,
      first_name: "Гость",
      last_name: "Покупатель",
      email: "guest.buyer@t13test.example",
      phone: "+79267654321",
      has_account: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const orderId = `order_t13guest${Math.random().toString(36).slice(2, 8)}`;
    await pg("order").insert({
      id: orderId,
      customer_id: guestId,
      sales_channel_id: salesChannelId,
      currency_code: "rub",
      status: "completed",
      is_draft_order: false,
      email: "guest.buyer@t13test.example",
      created_at: new Date(),
      updated_at: new Date(),
    });
    await pg("order_summary").insert({
      id: `ordsum_t13guest${Math.random().toString(36).slice(2, 8)}`,
      order_id: orderId,
      totals: JSON.stringify({ current_order_total: 990 }),
      created_at: new Date(),
      updated_at: new Date(),
    });
    await linkOrderToTenantWorkflow(container).run({ input: { order_id: orderId } });
    logger.info(`t13-seed: guest customer ${guestId} with 1 order`);
  }

  // A customer + order on the OTHER tenant, to measure/prove isolation.
  const [existingForeign] = await pg("customer").where({ email: "foreign.buyer@t13other.example" }).select("id");
  if (!existingForeign) {
    const foreignId = `cus_t13foreign${Math.random().toString(36).slice(2, 8)}`;
    await pg("customer").insert({
      id: foreignId,
      first_name: "Foreign",
      last_name: "Buyer",
      email: "foreign.buyer@t13other.example",
      phone: "+15550000000",
      has_account: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const orderId = `order_t13foreign${Math.random().toString(36).slice(2, 8)}`;
    await pg("order").insert({
      id: orderId,
      customer_id: foreignId,
      sales_channel_id: otherSalesChannelId,
      currency_code: "usd",
      status: "completed",
      is_draft_order: false,
      email: "foreign.buyer@t13other.example",
      created_at: new Date(),
      updated_at: new Date(),
    });
    await pg("order_summary").insert({
      id: `ordsum_t13foreign${Math.random().toString(36).slice(2, 8)}`,
      order_id: orderId,
      totals: JSON.stringify({ current_order_total: 42 }),
      created_at: new Date(),
      updated_at: new Date(),
    });
    await linkOrderToTenantWorkflow(container).run({ input: { order_id: orderId } });
    logger.info(`t13-seed: foreign customer ${foreignId} on ${OTHER_HANDLE}`);
  }

  // 200 synthetic customers, one order each, for the perf measurement.
  const existingSynthetic = await pg("customer")
    .where("email", "like", "t13-synthetic-%@t13test.example")
    .count<{ count: string }[]>("id as count");
  const alreadySeeded = Number(existingSynthetic[0]?.count ?? 0);

  if (alreadySeeded >= SYNTHETIC_COUNT) {
    logger.info(`t13-seed: ${alreadySeeded} synthetic customers already present, skipping`);
  } else {
    const toCreate = SYNTHETIC_COUNT - alreadySeeded;
    const now = Date.now();

    for (let batch = 0; batch < toCreate; batch += 1) {
      const n = alreadySeeded + batch;
      const customerId = `cus_t13synth${n.toString().padStart(4, "0")}`;
      const orderId = `order_t13synth${n.toString().padStart(4, "0")}`;
      const summaryId = `ordsum_t13synth${n.toString().padStart(4, "0")}`;

      await pg("customer").insert({
        id: customerId,
        first_name: `Synthetic${n}`,
        last_name: "Buyer",
        email: `t13-synthetic-${n}@t13test.example`,
        phone: `+7900${(1000000 + n).toString().slice(0, 7)}`,
        has_account: n % 5 !== 0,
        created_at: new Date(now - n * 3600000),
        updated_at: new Date(),
      });
      await pg("order").insert({
        id: orderId,
        customer_id: customerId,
        sales_channel_id: salesChannelId,
        currency_code: "rub",
        status: "completed",
        is_draft_order: false,
        email: `t13-synthetic-${n}@t13test.example`,
        created_at: new Date(now - n * 3600000),
        updated_at: new Date(),
      });
      await pg("order_summary").insert({
        id: summaryId,
        order_id: orderId,
        totals: JSON.stringify({ current_order_total: 500 + (n % 50) * 37 }),
        created_at: new Date(),
        updated_at: new Date(),
      });
      await linkOrderToTenantWorkflow(container).run({ input: { order_id: orderId } });
    }

    logger.info(`t13-seed: created ${toCreate} synthetic customers (total ${SYNTHETIC_COUNT})`);
  }
}
