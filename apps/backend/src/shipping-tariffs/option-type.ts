import type { IFulfillmentModuleService } from "@medusajs/framework/types";

/** The label, sentence and code a shipping option's `type` row carries. */
export type OptionTypeCopy = { label: string; description: string; code: string };

/**
 * Rewrites the `shipping_option_type` row of an option.
 *
 * `updateShippingOptionsWorkflow` takes a nested `type` in its input and never
 * writes it — measured 2026-09-15 on 2.19.0: renaming «Оксана Черкашина
 * courier» to «Курьером» through that workflow left the type at
 * `{label: "Courier", description: "Courier delivery."}`, the English copy the
 * provisioning wrote. The type is what a client other than our checkout would
 * read, so every rename updates the row itself, through the module service.
 *
 * Returns false when the option has no type row at all (nothing to rewrite).
 */
export const syncShippingOptionType = async (
  fulfillment: IFulfillmentModuleService,
  typeId: string | null | undefined,
  copy: OptionTypeCopy,
): Promise<boolean> => {
  if (!typeId) {
    return false;
  }
  await fulfillment.updateShippingOptionTypes(typeId, copy);
  return true;
};
