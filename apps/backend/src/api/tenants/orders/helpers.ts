import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { listTenantOrderIds } from "../tenant-scope";

/**
 * Ownership checks for the order namespace. Both throw `NOT_FOUND`, never
 * `NOT_ALLOWED`: a tenant asking for another tenant's order gets the same
 * answer as a tenant asking for an id nobody has, so the response never
 * confirms a foreign row exists (the rule `tenant-scope.ts` states for the
 * whole `/tenants/*` namespace).
 *
 * Every write verb calls one of these BEFORE the workflow runs. The workflows
 * themselves (`createOrderFulfillmentWorkflow`, `cancelOrderWorkflow`,
 * `capturePaymentWorkflow`) know nothing about tenants and would happily
 * mutate any row in the database.
 */

const orderNotFound = (orderId: string) =>
  new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id "${orderId}" was not found`);

/** 404 unless the tenant-order link ties this order to the caller's tenant. */
export const assertOwnedOrder = async (
  req: AuthenticatedMedusaRequest,
  orderId: string,
): Promise<void> => {
  const ownedIds = await listTenantOrderIds(req);

  if (!ownedIds.includes(orderId)) {
    throw orderNotFound(orderId);
  }
};

/**
 * 404 unless the payment's collection hangs off one of the tenant's own
 * orders. The path is `payment -> payment_collection -> order`: the first hop
 * lives inside the payment module, the second is the core
 * `order_payment_collection` link, which exposes `order` on PaymentCollection
 * as a field alias (`@medusajs/link-modules/dist/definitions/order-payment-collection.js`).
 * Reading it from the payment side costs one query whatever the tenant's
 * order count; walking every owned order's `payment_collections.payments`
 * would grow with the catalog.
 */
export const assertOwnedPayment = async (
  req: AuthenticatedMedusaRequest,
  paymentId: string,
): Promise<void> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [payment],
  } = await query.graph({
    entity: "payment",
    fields: ["id", "payment_collection.order.id"],
    filters: { id: paymentId },
  });

  const orderId = (payment as { payment_collection?: { order?: { id?: string } } } | undefined)
    ?.payment_collection?.order?.id;

  if (!orderId) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Payment with id "${paymentId}" was not found`,
    );
  }

  const ownedIds = await listTenantOrderIds(req);

  if (!ownedIds.includes(orderId)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Payment with id "${paymentId}" was not found`,
    );
  }
};
