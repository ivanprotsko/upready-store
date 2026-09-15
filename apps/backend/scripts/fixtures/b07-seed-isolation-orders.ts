import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import linkOrderToTenantWorkflow from "../../src/workflows/tenant/link-order-to-tenant";

/**
 * b07-store-api-isolation — acceptance fixture ONLY, and it sits outside
 * `src/` for the reason `scripts/fixtures/README.md` and
 * `src/scripts/__tests__/fixtures-outside-src.unit.spec.ts` spell out: every
 * file `tsconfig.json` includes is compiled into the production image.
 *
 * It seeds the three orders the isolation measurement needs, each with a real
 * RU shipping address and phone so the leak is visible as personal data and
 * not as an empty object:
 *
 *   1. `cherkashino` + the account customer given in `B07_OWNER_CUSTOMER_ID`
 *      — the order its owner must keep seeing after the fix.
 *   2. `cherkashino` + a guest customer (`has_account = false`) — the order
 *      a stranger must stop seeing.
 *   3. `acme` + the SAME account customer — the order that must disappear
 *      from `GET /store/orders` when the call carries cherkashino's key.
 *
 * Run: `B07_OWNER_CUSTOMER_ID=cus_… npx medusa exec ./scripts/fixtures/b07-seed-isolation-orders.ts`
 * Never against a real database.
 */

const rawAmount = (value: number) => JSON.stringify({ value: String(value), precision: 20 });
const rid = (prefix: string) => `${prefix}_b07${Math.random().toString(36).slice(2, 10)}`;

type SeedInput = {
  pg: Knex;
  salesChannelId: string;
  customerId: string | null;
  email: string;
  firstName: string;
  phone: string;
  city: string;
  total: number;
  productId: string | null;
  productTitle: string;
};

async function seedOrder(input: SeedInput): Promise<string> {
  const { pg } = input;
  const now = new Date();
  const orderId = rid("order");
  const addressId = rid("ordaddr");

  await pg("order_address").insert({
    id: addressId,
    first_name: input.firstName,
    last_name: "Покупатель",
    address_1: "ул. Тестовая, д. 7, кв. 42",
    city: input.city,
    country_code: "ru",
    province: "г Москва",
    postal_code: "101000",
    phone: input.phone,
    created_at: now,
    updated_at: now,
  });

  await pg("order").insert({
    id: orderId,
    sales_channel_id: input.salesChannelId,
    customer_id: input.customerId,
    currency_code: "rub",
    status: "pending",
    is_draft_order: false,
    email: input.email,
    shipping_address_id: addressId,
    billing_address_id: addressId,
    created_at: now,
    updated_at: now,
  });

  await pg("order_summary").insert({
    id: rid("ordsum"),
    order_id: orderId,
    totals: JSON.stringify({ current_order_total: input.total }),
    created_at: now,
    updated_at: now,
  });

  if (input.productId) {
    const lineItemId = rid("orli");
    await pg("order_line_item").insert({
      id: lineItemId,
      title: input.productTitle,
      product_id: input.productId,
      unit_price: input.total,
      raw_unit_price: rawAmount(input.total),
      requires_shipping: true,
      is_discountable: true,
      is_tax_inclusive: false,
      created_at: now,
      updated_at: now,
    });
    await pg("order_item").insert({
      id: rid("oritem"),
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
      unit_price: input.total,
      raw_unit_price: rawAmount(input.total),
      created_at: now,
      updated_at: now,
    });
  }

  return orderId;
}

export default async function seedB07IsolationOrders({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const ownerCustomerId = process.env.B07_OWNER_CUSTOMER_ID ?? null;
  if (!ownerCustomerId) {
    throw new Error("b07-seed: B07_OWNER_CUSTOMER_ID is required (the registered account customer).");
  }

  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "handle", "sales_channel.id", "products.id", "products.title"],
    filters: { handle: ["cherkashino", "acme"] },
  });

  const byHandle = new Map(tenants.map((t) => [t.handle as string, t]));
  const cherkashino = byHandle.get("cherkashino");
  const acme = byHandle.get("acme");
  if (!cherkashino?.sales_channel?.id || !acme?.sales_channel?.id) {
    throw new Error("b07-seed: both 'cherkashino' and 'acme' tenants with a sales channel are required.");
  }

  const firstProduct = (t: { products?: unknown }) => {
    const products = (t.products ?? []) as Array<{ id?: string; title?: string } | null>;
    return products.find((entry) => Boolean(entry?.id)) ?? null;
  };

  // The guest buyer is an account-less customer row, which is exactly what a
  // guest checkout produces (see `claim-guest-orders`).
  const guestCustomerId = rid("cus");
  const now = new Date();
  await pg("customer").insert({
    id: guestCustomerId,
    email: "b07-guest@upready.test",
    first_name: "Гость",
    last_name: "Покупатель",
    has_account: false,
    created_at: now,
    updated_at: now,
  });

  const cherkProduct = firstProduct(cherkashino);
  const acmeProduct = firstProduct(acme);

  const ownerOrderId = await seedOrder({
    pg,
    salesChannelId: cherkashino.sales_channel.id as string,
    customerId: ownerCustomerId,
    email: "b07-owner@upready.test",
    firstName: "Владелец",
    phone: "+79990000007",
    city: "Москва",
    total: 1355,
    productId: (cherkProduct?.id as string) ?? null,
    productTitle: (cherkProduct?.title as string) ?? "Товар Черкашино",
  });

  const guestOrderId = await seedOrder({
    pg,
    salesChannelId: cherkashino.sales_channel.id as string,
    customerId: guestCustomerId,
    email: "b07-guest@upready.test",
    firstName: "Гость",
    phone: "+79990000077",
    city: "Санкт-Петербург",
    total: 990,
    productId: (cherkProduct?.id as string) ?? null,
    productTitle: (cherkProduct?.title as string) ?? "Товар Черкашино",
  });

  const otherShopOrderId = await seedOrder({
    pg,
    salesChannelId: acme.sales_channel.id as string,
    customerId: ownerCustomerId,
    email: "b07-owner@upready.test",
    firstName: "Владелец",
    phone: "+79990000007",
    city: "Казань",
    total: 4200,
    productId: (acmeProduct?.id as string) ?? null,
    productTitle: (acmeProduct?.title as string) ?? "Товар Acme",
  });

  await linkOrderToTenantWorkflow(container).run({ input: { order_id: ownerOrderId } });
  await linkOrderToTenantWorkflow(container).run({ input: { order_id: guestOrderId } });
  await linkOrderToTenantWorkflow(container).run({ input: { order_id: otherShopOrderId } });

  logger.info(
    `b07-seed: owner=${ownerOrderId} guest=${guestOrderId} other_shop=${otherShopOrderId} guest_customer=${guestCustomerId}`,
  );
}
