import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import linkOrderToTenantWorkflow from "../../src/workflows/tenant/link-order-to-tenant";

/**
 * f12-owner-raw-keys — round-1 acceptance fixture ONLY, and it sits outside
 * `src/` on purpose. `medusa build` type-checks and emits every file
 * `tsconfig.json` includes, not only the Medusa primitives, so a fixture in
 * the compiled tree fails the build of the PRODUCTION image: that is what
 * `ba126e8` did (TS2322 on the product filter below). The gate that keeps
 * this class closed is
 * `src/scripts/__tests__/fixtures-outside-src.unit.spec.ts`.
 *
 * Run it with `npx medusa exec ./scripts/fixtures/f12-seed-test-order.ts`,
 * type-check the directory with `pnpm check:backend-fixtures`.
 *
 * Why the fixture exists at all: `upready_store_f12` (cloned from
 * `upready_store_cherkashina`) carries the real migrated catalog but zero
 * orders for the "Оксана Черкашина" tenant (all 16 orders
 * in the source snapshot belong to the "Acme" e2e fixture tenant). The
 * order-detail screen (payment date/provider/status, credit lines, RU
 * address, currency format) cannot be measured live without one. Never run
 * against a real database — throwaway, one order, raw inserts mirroring
 * `t17-seed-test-tenant.ts`'s working shape.
 */
export default async function seedF12TestOrder({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const {
    data: [tenant],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "handle", "sales_channel.id", "products.id", "products.title"],
    filters: { handle: "cherkashino" },
  });

  if (!tenant) {
    throw new Error("f12-seed: tenant 'cherkashino' not found in this database.");
  }
  const salesChannelId = tenant.sales_channel?.id as string | undefined;
  if (!salesChannelId) {
    throw new Error("f12-seed: tenant has no sales channel link.");
  }

  const {
    data: [existingOrder],
  } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { sales_channel_id: [salesChannelId] },
  });
  if (existingOrder) {
    logger.info(`f12-seed: order already exists for cherkashino (${existingOrder.id}), skipping`);
    return;
  }

  // The product the line item hangs off is the tenant's own first one, read
  // through the tenant-product link (`src/links/tenant-product.ts`) that
  // `GET /tenants/products` already scopes by. Do not reach for the product
  // entity filtered by its channel instead: the generated query entry points
  // give `Product.sales_channels` no filter shape at all, and
  // `filters: { sales_channels: { id: [...] } }` is exactly the TS2322 that
  // failed the mt-backend image build on `ba126e8`.
  const firstProduct = (tenant.products ?? []).find((entry) => Boolean(entry?.id));
  const productId = (firstProduct?.id as string | undefined) ?? null;
  const productTitle = (firstProduct?.title as string | undefined) ?? "Тестовый товар";

  const now = new Date();
  const orderId = `order_f12test${Math.random().toString(36).slice(2, 8)}`;
  const addressId = `ordaddr_f12${Math.random().toString(36).slice(2, 8)}`;
  const paymentCollectionId = `pcol_f12${Math.random().toString(36).slice(2, 8)}`;
  const paymentSessionId = `payses_f12${Math.random().toString(36).slice(2, 8)}`;
  const paymentId = `pay_f12${Math.random().toString(36).slice(2, 8)}`;
  const rawAmount = (value: number) => JSON.stringify({ value: String(value), precision: 20 });
  const TOTAL = 1084;

  await pg("order_address").insert({
    id: addressId,
    first_name: "Оксана",
    last_name: "Тестовая",
    address_1: "ул. Ленина, 1",
    city: "Черкашино",
    country_code: "ru",
    postal_code: "123456",
    phone: "+79990000000",
    created_at: now,
    updated_at: now,
  });

  await pg("order").insert({
    id: orderId,
    sales_channel_id: salesChannelId,
    currency_code: "rub",
    status: "completed",
    is_draft_order: false,
    email: "buyer-f12@example.test",
    shipping_address_id: addressId,
    billing_address_id: addressId,
    created_at: now,
    updated_at: now,
  });

  await pg("order_summary").insert({
    id: `ordsum_f12${Math.random().toString(36).slice(2, 8)}`,
    order_id: orderId,
    totals: JSON.stringify({ current_order_total: TOTAL }),
    created_at: now,
    updated_at: now,
  });

  if (productId) {
    const lineItemId = `orli_f12${Math.random().toString(36).slice(2, 8)}`;
    await pg("order_line_item").insert({
      id: lineItemId,
      title: productTitle,
      product_id: productId,
      unit_price: TOTAL,
      raw_unit_price: rawAmount(TOTAL),
      requires_shipping: true,
      is_discountable: true,
      is_tax_inclusive: false,
      created_at: now,
      updated_at: now,
    });
    await pg("order_item").insert({
      id: `oritem_f12${Math.random().toString(36).slice(2, 8)}`,
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
      unit_price: TOTAL,
      raw_unit_price: rawAmount(TOTAL),
      created_at: now,
      updated_at: now,
    });
  }

  // Manual payment ("pp_system_default"), captured — exercises the payment
  // section's provider label, status badge and date formatting.
  await pg("payment_collection").insert({
    id: paymentCollectionId,
    currency_code: "rub",
    amount: TOTAL,
    raw_amount: rawAmount(TOTAL),
    captured_amount: TOTAL,
    raw_captured_amount: rawAmount(TOTAL),
    status: "completed",
    completed_at: now,
    created_at: now,
    updated_at: now,
  });
  await pg("order_payment_collection").insert({
    id: `ordpcol_f12${Math.random().toString(36).slice(2, 8)}`,
    order_id: orderId,
    payment_collection_id: paymentCollectionId,
    created_at: now,
    updated_at: now,
  });
  await pg("payment_session").insert({
    id: paymentSessionId,
    currency_code: "rub",
    amount: TOTAL,
    raw_amount: rawAmount(TOTAL),
    provider_id: "pp_system_default",
    data: "{}",
    status: "authorized",
    authorized_at: now,
    payment_collection_id: paymentCollectionId,
    created_at: now,
    updated_at: now,
  });
  await pg("payment").insert({
    id: paymentId,
    amount: TOTAL,
    raw_amount: rawAmount(TOTAL),
    currency_code: "rub",
    provider_id: "pp_system_default",
    captured_at: now,
    payment_collection_id: paymentCollectionId,
    payment_session_id: paymentSessionId,
    created_at: now,
    updated_at: now,
  });

  await linkOrderToTenantWorkflow(container).run({ input: { order_id: orderId } });

  logger.info(`f12-seed: created order ${orderId} for cherkashino (product ${productId ?? "none"})`);
}
