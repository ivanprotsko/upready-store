import type { MedusaContainer } from "@medusajs/framework";
import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import {
  addShippingMethodToCartWorkflow,
  completeCartWorkflow,
  createCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  listShippingOptionsForCartWorkflow,
} from "@medusajs/medusa/core-flows";

import { cryptoPaymentsAvailable } from "../../../../btcpay/availability";
import { readX402SecretPublic, x402Ready, effectiveX402Networks } from "../../../../tenant-secrets/x402";
import { cartNeedsShipping, type ShippingNeedItem } from "../../../../workflows/hooks/cart-needs-shipping";
import { fromAtomicUnits, toAtomicUnits } from "../../../../x402/amount";
import {
  buildX402PaymentRequired,
  buildX402Requirements,
  decodeX402Header,
  encodeX402Header,
  matchX402Requirement,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  readX402PaymentPayload,
  type X402PaymentPayload,
  type X402PaymentRequired,
} from "../../../../x402/protocol";
import {
  createKeyedMutex,
  pickShippingOption,
  purchaseQuoteKey,
  type ShippingOptionChoice,
} from "../../../../x402/purchase";
import {
  findX402SessionsByAuthorization,
  paymentResponseHeaderOf,
  settledX402Session,
  settledX402SessionOfCollection,
  X402_PROVIDER_ID,
  type X402SessionData,
} from "../../../../x402/session";
import { backendPublicOrigin } from "../../../tenants/payment-settings/helpers";
import { tenantOrNull } from "../../tenant/robokassa";
import type { StoreTenant } from "../../tenant/resolve-tenant";
import type { PostStoreX402PurchaseBody } from "../validators";

/**
 * `POST /store/x402/purchase` — an AI agent buys from the shop with x402
 * (t-2026-10-03-33). The shop is the one behind the publishable key
 * (`x-publishable-api-key`), as on every `/store` route.
 *
 * 1. Without `PAYMENT-SIGNATURE` the answer is 402. `PAYMENT-REQUIRED` carries
 *    the x402 requirements for the cart's total in USDC, one per network the
 *    shop takes, and the body repeats them with a `quote` of what the money
 *    buys. Behind the quote is a real cart (items, address, shipping), so the
 *    price includes everything Medusa adds.
 * 2. The same request with `PAYMENT-SIGNATURE` places the order: the payment
 *    goes into a payment session of that same cart, the cart is completed, and
 *    the provider settles it through the facilitator while doing so
 *    (`modules/payment-x402`). 200 carries the order and `PAYMENT-RESPONSE`
 *    with the transaction hash.
 * 3. The same signed payment again answers with the same order and creates
 *    nothing: the order is found by the (payer, nonce) the payment already
 *    settled under. A payment that is refused answers 402 again, with the
 *    reason in `error` and fresh requirements to sign.
 *
 * A course needs no address; a parcel needs `shipping_address`, and gets the
 * cheapest shipping option unless the body names one. x402 takes USD only, so
 * the region (from the address, else `country_code`, else `us`) must be priced
 * in USD.
 *
 * A shop whose x402 is not ready, and every shop on an instance that takes no
 * cryptocurrency, answers 404, the same as for a route that does not exist.
 */

const QUOTE_TTL_MINUTES = 60;

const runExclusive = createKeyedMutex();

type QuotedCart = {
  id: string;
  email: string | null;
  currency_code: string;
  total: unknown;
  subtotal: unknown;
  shipping_total: unknown;
  tax_total: unknown;
  completed_at: string | Date | null;
  items: Array<
    ShippingNeedItem & { id: string; title: string | null; quantity: number; unit_price: unknown; variant_id: string | null }
  > | null;
  shipping_methods: Array<{ id: string; name: string | null; amount: unknown }> | null;
  payment_collection: { id: string } | null;
};

const CART_FIELDS = [
  "id",
  "email",
  "currency_code",
  "total",
  "subtotal",
  "shipping_total",
  "tax_total",
  "completed_at",
  "items.id",
  "items.title",
  "items.quantity",
  "items.unit_price",
  "items.variant_id",
  "items.product_id",
  "items.requires_shipping",
  "items.product.metadata",
  "shipping_methods.id",
  "shipping_methods.name",
  "shipping_methods.amount",
  "payment_collection.id",
];

const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "currency_code",
  "total",
  "created_at",
  "items.title",
  "items.quantity",
  "items.unit_price",
];

const money = (amount: unknown): string => {
  const atomic = toAtomicUnits(amount, 6);
  return atomic ? fromAtomicUnits(atomic, 6) : "0.00";
};

/** A refusal that is not about the payment: the request itself cannot be quoted. */
class PurchaseRefusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const readCart = async (container: MedusaContainer, cartId: string): Promise<QuotedCart | null> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "cart", fields: CART_FIELDS, filters: { id: cartId } });
  return (data[0] as unknown as QuotedCart) ?? null;
};

/** The cart an earlier request of the same body was quoted on, still open and recent. */
const findQuotedCart = async (pg: Knex, tenant: StoreTenant, key: string): Promise<string | null> => {
  const row = (await pg("cart")
    .select("id")
    .whereRaw("metadata->>'x402_quote_key' = ?", [key])
    .where({ sales_channel_id: tenant.sales_channel_id })
    .whereNull("completed_at")
    .whereNull("deleted_at")
    .whereRaw(`created_at > now() - interval '${QUOTE_TTL_MINUTES} minutes'`)
    .orderBy("created_at", "desc")
    .first()) as { id: string } | undefined;
  return row?.id ?? null;
};

const regionFor = async (container: MedusaContainer, countryCode: string): Promise<string> => {
  const [country] = await container.resolve(Modules.REGION).listCountries({ iso_2: countryCode }, { select: ["iso_2", "region_id"] });
  const regionId = (country as { region_id?: string | null } | undefined)?.region_id;
  if (!regionId) {
    throw new PurchaseRefusal(422, "region_not_found", `The shop sells to no region with the country ${countryCode}.`);
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code", "payment_providers.id"],
    filters: { id: regionId },
  });
  const region = data[0] as { id: string; currency_code: string; payment_providers?: Array<{ id: string } | null> | null };
  if (region.currency_code !== "usd") {
    throw new PurchaseRefusal(
      422,
      "currency_not_usd",
      `x402 takes USD only, and the region of ${countryCode} is priced in ${region.currency_code.toUpperCase()}.`,
    );
  }
  if (!(region.payment_providers ?? []).some((provider) => provider?.id === X402_PROVIDER_ID)) {
    throw new PurchaseRefusal(422, "x402_not_in_region", `x402 is not offered in the region of ${countryCode}.`);
  }
  return region.id;
};

/** Creates the cart a request is quoted on: items, address, and the shipping it needs. */
const createQuotedCart = async (
  container: MedusaContainer,
  tenant: StoreTenant,
  body: PostStoreX402PurchaseBody,
  key: string,
): Promise<string> => {
  const countryCode = body.shipping_address?.country_code ?? body.country_code ?? "us";
  const regionId = await regionFor(container, countryCode);

  const { result: created } = await createCartWorkflow(container).run({
    input: {
      region_id: regionId,
      sales_channel_id: tenant.sales_channel_id,
      email: body.email,
      items: body.items.map((item) => ({ variant_id: item.variant_id, quantity: item.quantity })),
      ...(body.shipping_address ? { shipping_address: body.shipping_address } : {}),
      metadata: { x402_quote_key: key, x402_agent: true },
    },
  });
  const cartId = (created as { id: string }).id;

  const cart = await readCart(container, cartId);
  const items = cart?.items ?? [];
  const needsShipping = await cartNeedsShipping(container, items);
  const anyShippable = items.some((item) => item.requires_shipping !== false);

  if (needsShipping && !body.shipping_address) {
    await container.resolve(Modules.CART).softDeleteCarts([cartId]);
    throw new PurchaseRefusal(
      400,
      "shipping_address_required",
      "These items are posted, so the request needs a shipping_address.",
    );
  }

  if (needsShipping || anyShippable) {
    const { result: options } = await listShippingOptionsForCartWorkflow(container).run({
      input: { cart_id: cartId, is_return: false },
    });
    const pick = pickShippingOption(options as unknown as ShippingOptionChoice[], {
      requested: body.shipping_option_id,
      needsShipping,
    });
    if (!pick.option) {
      await container.resolve(Modules.CART).softDeleteCarts([cartId]);
      throw new PurchaseRefusal(422, pick.error, "No shipping option can carry this order.", {
        shipping_options: (options as unknown as ShippingOptionChoice[]).map((option) => ({
          id: option.id,
          name: option.name ?? null,
          amount: typeof option.amount === "number" ? money(option.amount) : null,
        })),
      });
    }
    await addShippingMethodToCartWorkflow(container).run({
      input: { cart_id: cartId, options: [{ id: pick.option.id }] },
    });
  }
  return cartId;
};

const quoteOf = (cart: QuotedCart) => ({
  cart_id: cart.id,
  currency_code: cart.currency_code,
  items: (cart.items ?? []).map((item) => ({
    variant_id: item.variant_id,
    title: item.title,
    quantity: item.quantity,
    unit_price: money(item.unit_price),
  })),
  shipping: (cart.shipping_methods ?? []).map((method) => ({ name: method.name, amount: money(method.amount) })),
  subtotal: money(cart.subtotal),
  shipping_total: money(cart.shipping_total),
  tax_total: money(cart.tax_total),
  total: money(cart.total),
});

const orderSummary = async (container: MedusaContainer, orderId: string) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id: orderId } });
  const order = data[0] as
    | {
        id: string;
        display_id: number;
        email: string | null;
        currency_code: string;
        total: unknown;
        created_at: string | Date;
        items?: Array<{ title: string | null; quantity: number; unit_price: unknown } | null> | null;
      }
    | undefined;
  if (!order) {
    return null;
  }
  return {
    id: order.id,
    display_id: order.display_id,
    email: order.email,
    currency_code: order.currency_code,
    total: money(order.total),
    created_at: order.created_at,
    items: (order.items ?? []).filter(Boolean).map((item) => ({
      title: item?.title ?? null,
      quantity: item?.quantity ?? 0,
      unit_price: money(item?.unit_price),
    })),
  };
};

/** The order a payment collection's cart became, if it did. */
const orderOfPaymentCollection = async (container: MedusaContainer, paymentCollectionId: string) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: carts } = await query.graph({
    entity: "cart_payment_collection",
    fields: ["cart_id"],
    filters: { payment_collection_id: paymentCollectionId },
  });
  const cartId = (carts[0] as { cart_id?: string } | undefined)?.cart_id;
  if (!cartId) {
    return { cartId: null, orderId: null };
  }
  const { data: orders } = await query.graph({ entity: "order_cart", fields: ["order_id"], filters: { cart_id: cartId } });
  return { cartId, orderId: (orders[0] as { order_id?: string } | undefined)?.order_id ?? null };
};

const settlementOf = (data: Partial<X402SessionData>) => ({
  transaction: data.transaction ?? null,
  network: data.network ?? null,
  payer: data.payer ?? null,
  explorer_url: data.explorer_url ?? null,
  testnet: data.testnet ?? null,
});

const sendPaymentRequired = (res: MedusaResponse, required: X402PaymentRequired, extra: Record<string, unknown> = {}) => {
  res.setHeader(PAYMENT_REQUIRED_HEADER, encodeX402Header(required));
  res.status(402).json({ ...required, ...extra });
};

export const POST = async (req: MedusaStoreRequest<PostStoreX402PurchaseBody>, res: MedusaResponse) => {
  res.setHeader("Access-Control-Expose-Headers", `${PAYMENT_REQUIRED_HEADER}, ${PAYMENT_RESPONSE_HEADER}`);

  const tenant = cryptoPaymentsAvailable() ? await tenantOrNull(req) : null;
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const secret = tenant ? await readX402SecretPublic(pg, tenant.id, logger) : null;
  if (!tenant || !secret || !x402Ready(secret)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "x402 purchases are not available for this shop.");
  }

  const body = req.validatedBody;
  const rawSignature = req.get(PAYMENT_SIGNATURE_HEADER);
  let payload: X402PaymentPayload | null = null;
  if (rawSignature) {
    const read = readX402PaymentPayload(decodeX402Header(rawSignature));
    if (!read.payload) {
      res.status(400).json({ type: "invalid_payment", error: read.error });
      return;
    }
    payload = read.payload;
  }

  const container = req.scope as unknown as MedusaContainer;
  const key = purchaseQuoteKey(tenant.id, body);
  const lockKeys = [`quote:${key}`];
  if (payload) {
    const auth = payload.payload.authorization;
    lockKeys.push(`payment:${auth.from.toLowerCase()}:${auth.nonce.toLowerCase()}`);
  }

  await runExclusive(lockKeys, async () => {
    // A payment that already settled answers with its order, whatever the body says now.
    if (payload) {
      const auth = payload.payload.authorization;
      const settled = settledX402Session(await findX402SessionsByAuthorization(pg, auth.from, auth.nonce));
      if (settled) {
        const { orderId } = await orderOfPaymentCollection(container, settled.payment_collection_id);
        const order = orderId ? await orderSummary(container, orderId) : null;
        if (order) {
          const header = paymentResponseHeaderOf(settled.data);
          if (header) res.setHeader(PAYMENT_RESPONSE_HEADER, header);
          res.status(200).json({ type: "order", replayed: true, order, payment: settlementOf(settled.data) });
          return;
        }
        // Settled, but the order was not placed: complete THAT cart again. Its
        // session is already settled, so nothing is charged twice, and no new
        // session may replace it (that would delete the settlement).
        const { cartId } = await orderOfPaymentCollection(container, settled.payment_collection_id);
        logger.error(
          `[x402] payment of ${auth.from} nonce ${auth.nonce} settled in session ${settled.id} without an order; completing cart ${cartId} again`,
        );
        if (cartId) {
          await completeAndAnswer(container, res, cartId, settled.payment_collection_id, payload, logger, null);
          return;
        }
      }
    }

    let cart: QuotedCart | null;
    try {
      const existing = await findQuotedCart(pg, tenant, key);
      cart = await readCart(container, existing ?? (await createQuotedCart(container, tenant, body, key)));
    } catch (error) {
      if (error instanceof PurchaseRefusal) {
        res.status(error.status).json({ type: error.code, message: error.message, ...(error.details ?? {}) });
        return;
      }
      throw error;
    }
    if (!cart || cart.currency_code !== "usd") {
      res.status(422).json({ type: "currency_not_usd", message: "x402 takes USD carts only." });
      return;
    }

    const amount = toAtomicUnits(cart.total, 6);
    if (!amount) {
      res.status(422).json({ type: "nothing_to_pay", message: "The order total is zero; x402 has nothing to collect." });
      return;
    }
    const resourceUrl = `${backendPublicOrigin(req)}/store/x402/purchase`;
    const quote = quoteOf(cart);
    const required = (error?: string) =>
      buildX402PaymentRequired({
        error,
        resource: {
          url: resourceUrl,
          description: `Order at ${tenant.name}: ${quote.items.length} line(s), ${quote.total} USD`,
          mimeType: "application/json",
        },
        accepts: buildX402Requirements({
          amount,
          payTo: secret.credentials.pay_to,
          networks: effectiveX402Networks(secret.credentials),
        }),
      });

    if (!payload) {
      sendPaymentRequired(res, required("PAYMENT-SIGNATURE header is required"), { quote });
      return;
    }
    const match = matchX402Requirement(payload, required().accepts);
    if (!match.requirement) {
      sendPaymentRequired(res, required(match.error), { quote });
      return;
    }

    // A cart whose earlier payment settled is completed as it is (see
    // `settledX402SessionOfCollection`); this payment is not taken.
    if (cart.payment_collection?.id) {
      const earlier = await settledX402SessionOfCollection(pg, cart.payment_collection.id);
      if (earlier) {
        await completeAndAnswer(container, res, cart.id, cart.payment_collection.id, earlier.data.payment_payload ?? payload, logger, null);
        return;
      }
    }

    // The payment opens a session of its own on the quoted cart; the provider
    // checks it again against requirements it builds from the session amount.
    let collectionId = cart.payment_collection?.id ?? null;
    if (!collectionId) {
      await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cart.id } });
      collectionId = (await readCart(container, cart.id))?.payment_collection?.id ?? null;
    }
    if (!collectionId) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Cart ${cart.id} has no payment collection.`);
    }
    try {
      await createPaymentSessionsWorkflow(container).run({
        input: {
          payment_collection_id: collectionId,
          provider_id: X402_PROVIDER_ID,
          data: {
            tenant_id: tenant.id,
            payment_signature: rawSignature,
            resource_url: resourceUrl,
            resource_description: `Order at ${tenant.name}`,
          },
        },
      });
    } catch (error) {
      const reason = /x402 payment refused: (\S+)/.exec((error as Error).message)?.[1] ?? "invalid_payload";
      sendPaymentRequired(res, required(reason), { quote });
      return;
    }

    await completeAndAnswer(container, res, cart.id, collectionId, payload, logger, {
      required,
      quote,
      network: match.requirement.network,
    });
  });
};

/**
 * Completes the cart, whose x402 session settles on the way, and answers:
 * 200 with the order, 409 when the payment settled but the order did not
 * follow (the same request completes it later), or 402 with the reason the
 * payment was refused. `retry` is null when the session settled before, and
 * there is nothing to sign again.
 */
const completeAndAnswer = async (
  container: MedusaContainer,
  res: MedusaResponse,
  cartId: string,
  collectionId: string,
  payload: X402PaymentPayload,
  logger: Logger,
  retry: { required: (error?: string) => X402PaymentRequired; quote: unknown; network: string } | null,
) => {
  const { errors, result } = await completeCartWorkflow(container).run({
    input: { id: cartId },
    throwOnError: false,
  });
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const auth = payload.payload.authorization;
  const sessions = await findX402SessionsByAuthorization(pg, auth.from, auth.nonce);
  const session = sessions.find((row) => row.payment_collection_id === collectionId) ?? sessions[0];

  if (errors?.length || !result?.id) {
    const settled = session ? paymentResponseHeaderOf(session.data) : null;
    if (settled || !retry) {
      // Settled, then the order failed: the money is at pay_to. Say so plainly.
      logger.error(`[x402] cart ${cartId}: payment settled but the order failed (${errors?.[0]?.error?.message})`);
      if (settled) res.setHeader(PAYMENT_RESPONSE_HEADER, settled);
      res.status(409).json({
        type: "order_not_placed",
        message: "The payment settled but the order could not be placed. Retry the same request to place it.",
        payment: session ? settlementOf(session.data) : null,
      });
      return;
    }
    const reason = session?.data?.last_error ?? "order_not_placed";
    res.setHeader(
      PAYMENT_RESPONSE_HEADER,
      encodeX402Header({ success: false, errorReason: reason, transaction: "", network: retry.network }),
    );
    sendPaymentRequired(res, retry.required(reason), { quote: retry.quote });
    return;
  }

  const order = await orderSummary(container, result.id);
  if (session) {
    const header = paymentResponseHeaderOf(session.data);
    if (header) res.setHeader(PAYMENT_RESPONSE_HEADER, header);
  }
  res.status(200).json({ type: "order", replayed: !retry, order, payment: session ? settlementOf(session.data) : null });
};
