import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { IFulfillmentModuleService } from "@medusajs/framework/types";
import { syncShippingOptionType, type OptionTypeCopy } from "../../../../shipping-tariffs/option-type";

export type SyncOptionTypeInput = {
  option_id: string;
  copy: OptionTypeCopy;
};

/**
 * Keeps the option's `type` row in step with the name and description the
 * owner just saved. `updateShippingOptionsWorkflow` accepts a nested `type`
 * and writes none of it (measured on 2.19.0), so a method renamed in the panel
 * kept the label it was created with until this step ran.
 */
const syncOptionTypeStep = createStep(
  "sync-option-type",
  async (input: SyncOptionTypeInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const fulfillment: IFulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
    const {
      data: [option],
    } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "type.id", "type.label", "type.description", "type.code"],
      filters: { id: input.option_id },
    });
    const type = (option as unknown as { type?: OptionTypeCopy & { id?: string } } | undefined)?.type;
    if (!(await syncShippingOptionType(fulfillment, type?.id, input.copy))) {
      return new StepResponse(false, null);
    }
    return new StepResponse(true, {
      type_id: type!.id!,
      previous: { label: type!.label, description: type!.description, code: type!.code },
    });
  },
  async (restore, { container }) => {
    if (!restore) {
      return;
    }
    const fulfillment: IFulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
    await syncShippingOptionType(fulfillment, restore.type_id, restore.previous);
  },
);

export default syncOptionTypeStep;
