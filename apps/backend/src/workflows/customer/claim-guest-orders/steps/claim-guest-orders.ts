import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { IOrderModuleService, Logger, UpdateOrderDTO } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  normalizeEmail,
  selectClaimableOrders,
  type ClaimableOrderRow,
} from "../../../../guest-order-claim/select-claimable-orders";

export type ClaimGuestOrdersStepInput = {
  /** The account doing the claiming, taken from the session and never from the body. */
  customer_id: string;
  /** The sales channels of the storefront the call came from. */
  sales_channel_ids: string[];
};

export type ClaimedOrder = { id: string; display_id: number | null };

export type ClaimGuestOrdersStepOutput = {
  claimed: ClaimedOrder[];
  /** The address the claim was made on, echoed so a caller can log what matched. */
  email: string | null;
};

type PreviousOwner = { id: string; customer_id: string | null };

const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "customer_id",
  "sales_channel_id",
  "status",
  "canceled_at",
  "is_draft_order",
  "customer.id",
  "customer.has_account",
];

/**
 * Moves the guest orders of an address onto the account that owns that
 * address. The decision of WHICH orders move lives in
 * `src/guest-order-claim/select-claimable-orders.ts`; this step is the part
 * that talks to the database.
 *
 * The email is read off the account row, never off the request: the customer
 * id comes from the authenticated session, so the address it carries is the
 * one the account was registered with and nothing a caller sends can widen it.
 *
 * The SQL filter is a prefilter, not the gate. `$ilike` treats `_` and `%` in
 * an address as wildcards, so it can return more rows than it should; every
 * row is then matched exactly in JavaScript before anything is written.
 */
const claimGuestOrdersStep = createStep(
  "claim-guest-orders",
  async ({ customer_id, sales_channel_ids }: ClaimGuestOrdersStepInput, { container }) => {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    // The lint rule `@medusajs/step-must-return-step-response` wants the
    // wrapper written out at every exit, so each early return builds its own.
    if (!customer_id || !sales_channel_ids.length) {
      return new StepResponse<ClaimGuestOrdersStepOutput, PreviousOwner[]>(
        { claimed: [], email: null },
        [],
      );
    }

    const { data: accounts } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "has_account"],
      filters: { id: customer_id },
    });

    const account = accounts[0];
    const email = normalizeEmail(account?.email);

    // A guest customer cannot claim anything: `has_account` is exactly the
    // difference between somebody who proved a password and somebody whose row
    // a checkout created.
    if (!account || !account.has_account || !email) {
      return new StepResponse<ClaimGuestOrdersStepOutput, PreviousOwner[]>(
        { claimed: [], email: null },
        [],
      );
    }

    const { data: candidates } = await query.graph({
      entity: "order",
      fields: ORDER_FIELDS,
      filters: {
        sales_channel_id: sales_channel_ids,
        email: { $ilike: email },
      },
    });

    const claimable = selectClaimableOrders({
      orders: candidates as ClaimableOrderRow[],
      accountEmail: email,
      accountCustomerId: account.id as string,
      salesChannelIds: sales_channel_ids,
    });

    if (!claimable.length) {
      return new StepResponse<ClaimGuestOrdersStepOutput, PreviousOwner[]>(
        { claimed: [], email },
        [],
      );
    }

    const previous: PreviousOwner[] = claimable.map((order) => ({
      id: order.id,
      customer_id: order.customer_id ?? null,
    }));

    const orderService = container.resolve<IOrderModuleService>(Modules.ORDER);
    await orderService.updateOrders(
      claimable.map((order) => ({ id: order.id, customer_id: account.id as string })),
    );

    logger.info(
      `[claim-guest-orders] ${claimable.length} order(s) moved to customer ${account.id}: ${claimable
        .map((order) => order.id)
        .join(", ")}`,
    );

    return new StepResponse<ClaimGuestOrdersStepOutput, PreviousOwner[]>(
      {
        claimed: claimable.map((order) => ({
          id: order.id,
          display_id: (order.display_id as number | null) ?? null,
        })),
        email,
      },
      previous,
    );
  },
  async (previous, { container }) => {
    if (!previous?.length) {
      return;
    }

    const orderService = container.resolve<IOrderModuleService>(Modules.ORDER);
    // `customer_id` is typed as an optional string, but an order that had no
    // customer must go back to having none, so the null is deliberate and the
    // cast is what lets it through.
    await orderService.updateOrders(
      previous.map((order) => ({
        id: order.id,
        customer_id: order.customer_id,
      })) as unknown as UpdateOrderDTO[],
    );
  },
);

export default claimGuestOrdersStep;
