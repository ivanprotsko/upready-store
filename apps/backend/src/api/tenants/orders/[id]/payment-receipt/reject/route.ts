import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import type { IOrderModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { assertOwnedOrder } from "../../../helpers";
import type { PostTenantRejectPaymentReceiptBody } from "../../../validators";

type ReceiptOrder = {
  id: string;
  metadata: Record<string, unknown> | null;
  payment_collections: { payments: { captured_at: Date | string | null }[] | null }[] | null;
};

/**
 * `POST /tenants/orders/:id/payment-receipt/reject` — the owner does not
 * accept the buyer's receipt for a card transfer (t-cherk-com-hotfix batch 5),
 * the counterpart of `POST /tenants/payments/:id/capture`. Body
 * `{ reason }`; the answer is the order in the Admin's retrieve shape, as
 * `/cancel` answers.
 *
 * The receipt keeps its file and gets the rejection on top, which is the
 * contract the storefront order page reads:
 * `order.metadata.payment_receipt = { url, uploaded_at, status: "rejected",
 * rejected_reason, rejected_at }`. No `status` means sent and waiting. The
 * buyer's next upload (`POST /store/tenant/orders/:id/payment-receipt`)
 * writes a fresh `{ url, uploaded_at }`, which clears the rejection.
 *
 * Refused for an order with no receipt and for one already paid: there is
 * nothing to reject then. A second rejection of the same receipt replaces the
 * reason.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantRejectPaymentReceiptBody>,
  res: MedusaResponse,
) => {
  const orderId = req.params.id;

  await assertOwnedOrder(req, orderId);

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "metadata", "payment_collections.payments.captured_at"],
    filters: { id: orderId },
  });
  const order = data[0] as ReceiptOrder | undefined;

  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id "${orderId}" was not found`);
  }

  const receipt = order.metadata?.payment_receipt as Record<string, unknown> | null | undefined;
  if (!receipt || typeof receipt.url !== "string") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The buyer has not sent a receipt for this order");
  }

  const payments = (order.payment_collections ?? []).flatMap((collection) => collection.payments ?? []);
  if (payments.some((payment) => payment.captured_at)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This order is already paid");
  }

  const rejected = {
    ...receipt,
    status: "rejected",
    rejected_reason: req.validatedBody.reason,
    rejected_at: new Date().toISOString(),
  };

  const orderService = req.scope.resolve<IOrderModuleService>(Modules.ORDER);
  await orderService.updateOrders([
    { id: order.id, metadata: { ...(order.metadata ?? {}), payment_receipt: rejected } },
  ]);

  const updated = await refetchEntity({
    entity: "order",
    idOrFilter: orderId,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  res.status(200).json({ order: updated });
};
