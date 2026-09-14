import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { assertHandleAvailable } from "../assert-handle-available";

export type AssertHandleAvailableStepInput = {
  handle: string;
};

/**
 * Refuses a handle another shop holds or once held, BEFORE anything is written
 * (`specs/tenant-address/CANONICAL.md` §1.2). A released handle keeps its inbound
 * links and its history in search, so it stays reserved for the shop that had it.
 *
 * First step of both creation workflows, so the rule cannot hold for the wizard
 * and not for staff (rule 20). It writes nothing and therefore compensates
 * nothing.
 */
const assertHandleAvailableStep = createStep(
  "assert-handle-available",
  async (input: AssertHandleAvailableStepInput, { container }) => {
    await assertHandleAvailable(container, input.handle);

    return new StepResponse(void 0);
  },
);

export default assertHandleAvailableStep;
