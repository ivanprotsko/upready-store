import type { IFulfillmentModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { deleteShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { warehouseOf } from "../../../../api/tenants/shipping-methods/helpers";
import { isTenantMethodData, TENANT_METHOD_SCHEMA, type TenantMethodData } from "../../../../shipping-tariffs/tariff";
import createTenantShippingMethodWorkflow from "../../shipping-methods/create-tenant-shipping-method";

type SourceOption = {
  id?: string;
  name?: string;
  provider_id?: string;
  shipping_profile_id?: string;
  data?: unknown;
  created_at?: string | Date;
  rules?: { attribute?: string; value?: unknown }[] | null;
  prices?: { currency_code?: string | null; amount?: number | null }[] | null;
};

type SourceLocation = {
  fulfillment_sets?: { type?: string; service_zones?: { shipping_options?: SourceOption[] | null }[] | null }[] | null;
};

/** One delivery method of the source, ready to be created again elsewhere. */
export type MethodCopy = {
  name: string;
  data: TenantMethodData;
  enabled: boolean;
  provider_id: string;
  shipping_profile_id: string;
};

/**
 * The source's delivery methods, in the order they were made, read off the
 * export bundle's `warehouse.stock_locations`. An option provisioned before
 * tariffs existed (no `data.schema`) becomes a flat method at its first price,
 * the same reading `toMethod` gives it in the panel.
 */
export const methodsToCopy = (stockLocations: unknown[]): MethodCopy[] => {
  const options = (stockLocations as SourceLocation[])
    .flatMap((location) => location.fulfillment_sets ?? [])
    .filter((set) => set.type === "shipping")
    .flatMap((set) => set.service_zones ?? [])
    .flatMap((zone) => zone.shipping_options ?? [])
    .filter((option): option is SourceOption => Boolean(option?.id))
    .filter((option) => !(option.rules ?? []).some((rule) => rule.attribute === "is_return" && rule.value === "true"))
    .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());

  return options.map((option, index) => {
    const data: TenantMethodData = isTenantMethodData(option.data)
      ? { ...option.data, own_zone: false }
      : {
          schema: TENANT_METHOD_SCHEMA,
          tariff: { kind: "flat", amount: Number(option.prices?.[0]?.amount ?? 0) },
          description: null,
          delivery_hint: null,
          sort_order: index,
          default_weight_g: 500,
          own_zone: false,
          zone: null,
        };
    const enabledRule = (option.rules ?? []).find((rule) => rule.attribute === "enabled_in_store");
    return {
      name: option.name as string,
      data,
      enabled: enabledRule ? enabledRule.value !== "false" : true,
      provider_id: option.provider_id as string,
      shipping_profile_id: option.shipping_profile_id as string,
    };
  });
};

/**
 * Replaces the two methods `provisionTenantWarehouseWorkflow` gave the new
 * site with copies of the source's methods and tariffs («скопировать
 * доставку»). Integration secrets (СДЭК, ApiShip) are not part of a method and
 * are not copied: a carrier method that needs its own account asks for it on
 * the new site. The compensation deletes the copies; the provisioned defaults
 * go with the whole warehouse when `create-tenant` compensates.
 */
const copyShippingStep = createStep(
  "copy-shipping-methods",
  async (
    input: { tenant_id: string; sales_channel_id: string; stock_locations: unknown[] },
    { container },
  ) => {
    const warehouse = await warehouseOf(container, { id: input.tenant_id, sales_channel_id: input.sales_channel_id });
    const copies = methodsToCopy(input.stock_locations);

    if (!copies.length) {
      return new StepResponse({ created: [] as string[] }, [] as string[]);
    }

    const fulfillment: IFulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
    const provisioned = await fulfillment.listShippingOptions({ service_zone: { id: warehouse.service_zone_ids } });
    if (provisioned.length) {
      await deleteShippingOptionsWorkflow(container).run({ input: { ids: provisioned.map((option) => option.id) } });
    }

    const created: string[] = [];
    for (const copy of copies) {
      const { result } = await createTenantShippingMethodWorkflow(container).run({
        input: {
          ...copy,
          fulfillment_set_id: warehouse.fulfillment_set_id,
          base_service_zone_id: warehouse.base_service_zone_id,
          stock_location_id: warehouse.stock_location_id,
          currency_codes: warehouse.currency_codes,
        },
      });
      created.push(result.id);
    }

    return new StepResponse({ created }, created);
  },
  async (created: string[] | undefined, { container }) => {
    if (created?.length) {
      await deleteShippingOptionsWorkflow(container).run({ input: { ids: created } });
    }
  },
);

export default copyShippingStep;
