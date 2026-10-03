import { updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows";
import { assertCourseQuantityOnUpdate } from "./validate-cart-course-quantity";

/**
 * The one handler of `updateLineItemInCartWorkflow`'s `validate` hook (Medusa
 * accepts a single handler per hook, see `complete-cart-validate.ts`): a new
 * quantity above one on an online course line is refused
 * (t-cherk-com-hotfix batch 5).
 */
updateLineItemInCartWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  await assertCourseQuantityOnUpdate(
    container,
    cart as unknown as Parameters<typeof assertCourseQuantityOnUpdate>[1],
    input.item_id,
    input.update?.quantity,
  );
});
