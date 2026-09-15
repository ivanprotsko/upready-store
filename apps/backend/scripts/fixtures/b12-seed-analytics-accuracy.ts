import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import {
  beginOrderEditOrderWorkflow,
  confirmOrderEditRequestWorkflow,
  orderEditUpdateItemQuantityWorkflow,
} from "@medusajs/core-flows";
import linkOrderToTenantWorkflow from "../../src/workflows/tenant/link-order-to-tenant";

/**
 * b12-analytics-accuracy — acceptance fixture ONLY, and it sits outside `src/`
 * on purpose (`scripts/fixtures` is the one path `apps/backend/tsconfig.json`
 * excludes; the gate is `src/scripts/__tests__/fixtures-outside-src.unit.spec.ts`).
 *
 * Two fixtures the task names, both on the tenant `cherkashino`, both dated
 * "now" so every period of the Обзор screen (today / 7 дней / 30 дней) sees
 * them:
 *
 * А — MIXED CURRENCIES. Three orders in `rub` and two in `usd`. Before the
 *     fix `GET /tenants/analytics/summary` summed `total` across all five and
 *     labelled the sum with `orders[0].currency_code`.
 *
 * Б — VERSIONED ORDER LINES. One `rub` order whose single line is edited from
 *     2 to 3 pieces through the REAL Medusa order-edit workflows
 *     (`beginOrderEditOrderWorkflow` → `orderEditUpdateItemQuantityWorkflow` →
 *     `confirmOrderEditRequestWorkflow`), which is what bumps `order.version`
 *     to 2 and appends a second `order_item` row. A join on `order_id` alone
 *     then reports 2 + 3 = 5 pieces where the shop sold 3.
 *
 * Run: `npx medusa exec ./scripts/fixtures/b12-seed-analytics-accuracy.ts`
 * Type-check: `pnpm check:backend-fixtures`. Never against a real database.
 */

const rawAmount = (value: number) => JSON.stringify({ value: String(value), precision: 20 });
const suffix = () => Math.random().toString(36).slice(2, 8);

type SeedOrderInput = {
  tag: string;
  currency: string;
  /** `[title, unitPrice, quantity]` per line. */
  lines: { productId: string | null; title: string; unitPrice: number; quantity: number }[];
};

export default async function seedB12AnalyticsAccuracy({ container }: { container: MedusaContainer }) {
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
    throw new Error("b12-seed: tenant 'cherkashino' not found in this database.");
  }

  const salesChannelId = tenant.sales_channel?.id as string | undefined;
  if (!salesChannelId) {
    throw new Error("b12-seed: tenant has no sales channel link.");
  }

  const products = ((tenant.products ?? []) as { id?: string; title?: string }[])
    .filter((entry) => Boolean(entry?.id))
    .slice(0, 5);

  if (products.length < 3) {
    throw new Error(`b12-seed: tenant has ${products.length} products, need at least 3.`);
  }

  const product = (index: number) => ({
    productId: (products[index % products.length].id as string) ?? null,
    title: (products[index % products.length].title as string) ?? `Товар ${index + 1}`,
  });

  const now = new Date();

  /** Raw inserts mirroring `scripts/fixtures/f12-seed-test-order.ts`'s working shape. */
  const seedOrder = async (input: SeedOrderInput): Promise<{ orderId: string; lineItemIds: string[] }> => {
    const orderId = `order_b12${input.tag}${suffix()}`;
    const addressId = `ordaddr_b12${suffix()}`;
    const total = input.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

    await pg("order_address").insert({
      id: addressId,
      first_name: "Покупатель",
      last_name: input.tag.toUpperCase(),
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
      currency_code: input.currency,
      status: "completed",
      is_draft_order: false,
      email: `buyer-b12-${input.tag}@example.test`,
      shipping_address_id: addressId,
      billing_address_id: addressId,
      created_at: now,
      updated_at: now,
    });

    await pg("order_summary").insert({
      id: `ordsum_b12${suffix()}`,
      order_id: orderId,
      version: 1,
      totals: JSON.stringify({ current_order_total: total }),
      created_at: now,
      updated_at: now,
    });

    const lineItemIds: string[] = [];

    for (const line of input.lines) {
      const lineItemId = `ordli_b12${suffix()}`;
      lineItemIds.push(lineItemId);

      await pg("order_line_item").insert({
        id: lineItemId,
        title: line.title,
        product_id: line.productId,
        unit_price: line.unitPrice,
        raw_unit_price: rawAmount(line.unitPrice),
        requires_shipping: true,
        is_discountable: true,
        is_tax_inclusive: false,
        created_at: now,
        updated_at: now,
      });

      await pg("order_item").insert({
        id: `oritem_b12${suffix()}`,
        order_id: orderId,
        version: 1,
        item_id: lineItemId,
        quantity: line.quantity,
        raw_quantity: rawAmount(line.quantity),
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
        unit_price: line.unitPrice,
        raw_unit_price: rawAmount(line.unitPrice),
        created_at: now,
        updated_at: now,
      });
    }

    await linkOrderToTenantWorkflow(container).run({ input: { order_id: orderId } });

    return { orderId, lineItemIds };
  };

  // Fixture А — three rub orders and two usd ones, same period.
  const fixtureA: SeedOrderInput[] = [
    {
      tag: "a1",
      currency: "rub",
      lines: [{ ...product(0), unitPrice: 600, quantity: 2 }],
    },
    {
      tag: "a2",
      currency: "rub",
      lines: [{ ...product(1), unitPrice: 2400, quantity: 1 }],
    },
    {
      tag: "a3",
      currency: "rub",
      lines: [{ ...product(0), unitPrice: 600, quantity: 1 }],
    },
    {
      tag: "a4",
      currency: "usd",
      lines: [{ ...product(2), unitPrice: 50, quantity: 1 }],
    },
    {
      tag: "a5",
      currency: "usd",
      lines: [{ ...product(2), unitPrice: 50, quantity: 3 }],
    },
  ];

  const createdA: string[] = [];
  for (const input of fixtureA) {
    const { orderId } = await seedOrder(input);
    createdA.push(`${input.tag}=${orderId} (${input.currency})`);
  }
  logger.info(`b12-seed: fixture А — ${createdA.join(", ")}`);

  // Fixture Б — one rub order, then a REAL order edit that bumps the version.
  const { orderId: editedOrderId, lineItemIds } = await seedOrder({
    tag: "b1",
    currency: "rub",
    lines: [{ ...product(3), unitPrice: 500, quantity: 2 }],
  });

  await beginOrderEditOrderWorkflow(container).run({ input: { order_id: editedOrderId } });
  await orderEditUpdateItemQuantityWorkflow(container).run({
    input: { order_id: editedOrderId, items: [{ id: lineItemIds[0], quantity: 3 }] },
  });
  await confirmOrderEditRequestWorkflow(container).run({ input: { order_id: editedOrderId } });

  const versions: { version: number; quantity: string }[] = await pg("order_item")
    .where({ order_id: editedOrderId })
    .orderBy("version")
    .select("version", "quantity");
  const [orderRow]: { version: number }[] = await pg("order").where({ id: editedOrderId }).select("version");

  logger.info(
    `b12-seed: fixture Б — ${editedOrderId}, order.version=${orderRow?.version}, order_item rows: ` +
      versions.map((row) => `v${row.version}×${row.quantity}`).join(", "),
  );
}
