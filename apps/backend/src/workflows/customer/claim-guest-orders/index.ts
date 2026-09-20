import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import claimGuestOrdersStep, {
  type ClaimGuestOrdersStepInput,
  type ClaimGuestOrdersStepOutput,
} from "./steps/claim-guest-orders";

export type ClaimGuestOrdersWorkflowInput = ClaimGuestOrdersStepInput;
export type ClaimGuestOrdersWorkflowOutput = ClaimGuestOrdersStepOutput;

/**
 * Attaches the guest orders of an address to the account registered on that
 * address, inside one shop.
 *
 * Run by `POST /store/customers/me/claim-orders`, which the storefront calls
 * right after a registration and right after a login. It is a workflow rather
 * than a bare route body so the seam test and any later backfill call the same
 * unit, and so the move is compensated if a later step of a bigger flow fails.
 *
 * Why not Medusa's own order transfer: `requestOrderTransferWorkflow` mints a
 * token and emails it to the address ON THE ORDER, and the buyer has to click
 * the link. That round trip proves the buyer owns the mailbox, which is the
 * right gate when the order was placed under a DIFFERENT address than the
 * account. When the two addresses are the same string there is nothing for the
 * letter to establish that the claim itself does not, and on this deployment
 * the letter is what makes the flow a dead end: the shop's notification
 * provider is what task f02 is fixing, and until then the buyer is told to
 * open an email nobody sent.
 */
const claimGuestOrdersWorkflow = createWorkflow(
  "claim-guest-orders",
  (input: ClaimGuestOrdersWorkflowInput) => {
    return new WorkflowResponse(claimGuestOrdersStep(input));
  },
);

export default claimGuestOrdersWorkflow;
