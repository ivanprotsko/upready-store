import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import claimGuestOrdersWorkflow from "../../../../../workflows/customer/claim-guest-orders";

/**
 * `POST /store/customers/me/claim-orders` — the logged-in customer takes over
 * the orders this shop holds under their own email address.
 *
 * It is the answer to the loop a guest buyer falls into: they order without an
 * account, register afterwards with the same address, and the account is
 * empty, because a guest checkout hangs the order on a second, account-less
 * customer row (`has_account: false`) and `GET /store/orders` filters by
 * `customer_id`.
 *
 * Nothing about the claim is taken from the request body, and there is no body
 * to send. The address comes from the account row behind the session token,
 * and the shop comes from the publishable key the storefront already has to
 * send, so this route cannot be pointed at another address or another shop.
 *
 * It is idempotent: the second call finds nothing left to move and answers
 * `{ claimed: 0 }`.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const customerId = req.auth_context?.actor_id;

  if (!customerId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "You must be logged in to claim your orders.",
    );
  }

  const salesChannelIds =
    (req as unknown as MedusaStoreRequest).publishable_key_context?.sales_channel_ids ?? [];

  if (!salesChannelIds.length) {
    // A key with no sales channel is not a shop. Answering "0 claimed" here
    // would read as "you have no orders" when the truth is that the request
    // never named a shop to look in (rule 20a: zero is not empty).
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "This publishable key is not bound to a sales channel.",
    );
  }

  const { result } = await claimGuestOrdersWorkflow(req.scope).run({
    input: { customer_id: customerId, sales_channel_ids: salesChannelIds },
  });

  res.json({ claimed: result.claimed.length, orders: result.claimed });
};
