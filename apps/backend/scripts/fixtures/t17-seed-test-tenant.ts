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
 * t17-analytics: throwaway fixtures for measuring the analytics counters and
 * sales summary on a local stand. Not wired into any pnpm script — run once
 * with `npx medusa exec ./scripts/fixtures/t17-seed-test-tenant.ts` against a
 * scratch database, never against a real one. Same shape as
 * `t13-seed-test-tenant.ts`.
 *
 * Two tenants:
 *   - "t17shopa": has a Yandex Metrica id AND a GA4 id saved, three orders
 *     today and two three days ago, with line items, for the panel's sales
 *     summary and the storefront's "loads the script" check.
 *   - "t17shopb": neither counter set, zero orders — the "loads nothing" and
 *     "заказов пока нет" checks.
 */
const PROVIDER = "emailpass";

export default async function seedT17TestTenant({ container }: { container: MedusaContainer }) {
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
        tenant.metadata = markTestShopMetadata(tenant.metadata as Record<string, unknown> | null);
        await tenantModuleService.updateTenants({ id: tenant.id, metadata: tenant.metadata });
      }
      logger.info(`t17-seed: ${handle} already exists (${tenant.id})`);
      return tenant;
    }

    const registered = await authModuleService.register(PROVIDER, {
      body: { email: adminEmail, password },
    });

    if (!registered.success || !registered.authIdentity) {
      throw new Error(`t17-seed: could not register ${adminEmail}: ${registered.error}`);
    }

    const { result } = await createTenantWorkflow(container).run({
      input: {
        name,
        handle,
        admin: { email: adminEmail, first_name: "Test", last_name: "Owner" },
        authIdentityId: registered.authIdentity.id,
      },
    });

    result.tenant.metadata = markTestShopMetadata(result.tenant.metadata as Record<string, unknown> | null);
    await tenantModuleService.updateTenants({ id: result.tenant.id, metadata: result.tenant.metadata });

    logger.info(`t17-seed: created ${handle} (${result.tenant.id}), key ${result.tenant.api_key.token}`);
    return result.tenant as typeof tenant;
  };

  const shopA = await ensureTenant("t17shopa", "T17 Shop A", "admin@t17shopa.example");
  const shopB = await ensureTenant("t17shopb", "T17 Shop B", "admin@t17shopb.example");

  await tenantModuleService.updateTenants({
    id: shopA.id,
    metadata: {
      ...(shopA.metadata as Record<string, unknown> | null),
      analytics: { yandex_metrica_id: "12345678", ga4_measurement_id: "G-TESTID1234" },
    },
  });
  logger.info("t17-seed: shopA analytics saved (yandex 12345678, ga4 G-TESTID1234)");

  const {
    data: [withChannel],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "sales_channel.id"],
    filters: { id: [shopA.id] },
  });
  const salesChannelId = withChannel?.sales_channel?.id as string | undefined;

  if (!salesChannelId) {
    throw new Error("t17-seed: shopA has no sales channel link.");
  }

  const [existingCustomer] = await pg("customer").where({ email: "buyer@t17shopa.example" }).select("id");
  let customerId = existingCustomer?.id as string | undefined;

  if (!customerId) {
    customerId = `cus_t17${Math.random().toString(36).slice(2, 10)}`;
    await pg("customer").insert({
      id: customerId,
      first_name: "Тест",
      last_name: "Покупатель",
      email: "buyer@t17shopa.example",
      has_account: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  const {
    data: [existingProduct],
  } = await query.graph({
    entity: "product",
    fields: ["id", "title"],
    filters: {},
    pagination: { take: 1 },
  });

  const productId = (existingProduct?.id as string | undefined) ?? null;
  const productTitle = (existingProduct?.title as string | undefined) ?? "Test product";

  const [existingOrders] = await pg("order").where({ email: "buyer@t17shopa.example" }).count("id as c");

  if (Number(existingOrders?.c ?? 0) === 0) {
    const plan = [
      { daysAgo: 0, total: 2500 },
      { daysAgo: 0, total: 1800 },
      { daysAgo: 0, total: 3200 },
      { daysAgo: 3, total: 1200 },
      { daysAgo: 3, total: 900 },
    ];

    for (const [index, entry] of plan.entries()) {
      const orderId = `order_t17${index}${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = new Date(Date.now() - entry.daysAgo * 86400000);

      await pg("order").insert({
        id: orderId,
        customer_id: customerId,
        sales_channel_id: salesChannelId,
        currency_code: "rub",
        status: "completed",
        is_draft_order: false,
        email: "buyer@t17shopa.example",
        created_at: createdAt,
        updated_at: createdAt,
      });

      await pg("order_summary").insert({
        id: `ordsum_t17${index}${Math.random().toString(36).slice(2, 8)}`,
        order_id: orderId,
        totals: JSON.stringify({ current_order_total: entry.total }),
        created_at: createdAt,
        updated_at: createdAt,
      });

      if (productId) {
        // `raw_*` mirrors the numeric column as the BigNumber JSON shape
        // Medusa's own writers use (`{ value, precision }`) — NOT NULL on
        // both tables, measured against the live schema after the first
        // insert attempt here failed on it.
        const rawAmount = (value: number) => JSON.stringify({ value: String(value), precision: 20 });
        const lineItemId = `orli_t17${index}${Math.random().toString(36).slice(2, 8)}`;
        await pg("order_line_item").insert({
          id: lineItemId,
          title: productTitle,
          product_id: productId,
          unit_price: entry.total,
          raw_unit_price: rawAmount(entry.total),
          requires_shipping: true,
          is_discountable: true,
          is_tax_inclusive: false,
          created_at: createdAt,
          updated_at: createdAt,
        });
        await pg("order_item").insert({
          id: `oritem_t17${index}${Math.random().toString(36).slice(2, 8)}`,
          order_id: orderId,
          version: 1,
          item_id: lineItemId,
          quantity: 1,
          raw_quantity: rawAmount(1),
          fulfilled_quantity: 0,
          raw_fulfilled_quantity: rawAmount(0),
          shipped_quantity: 0,
          raw_shipped_quantity: rawAmount(0),
          return_requested_quantity: 0,
          raw_return_requested_quantity: rawAmount(0),
          return_received_quantity: 0,
          raw_return_received_quantity: rawAmount(0),
          return_dismissed_quantity: 0,
          raw_return_dismissed_quantity: rawAmount(0),
          written_off_quantity: 0,
          raw_written_off_quantity: rawAmount(0),
          delivered_quantity: 0,
          raw_delivered_quantity: rawAmount(0),
          unit_price: entry.total,
          raw_unit_price: rawAmount(entry.total),
          created_at: createdAt,
          updated_at: createdAt,
        });
      }

      await linkOrderToTenantWorkflow(container).run({ input: { order_id: orderId } });
    }

    logger.info(`t17-seed: shopA got ${plan.length} orders`);
  } else {
    logger.info("t17-seed: shopA already has orders, skipping");
  }

  logger.info(`t17-seed: shopB (${shopB.id}) has no analytics and no orders — control fixture`);
}
