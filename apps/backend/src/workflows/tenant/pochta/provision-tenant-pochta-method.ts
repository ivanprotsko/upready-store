import { createWorkflow, createStep, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { IFulfillmentModuleService } from "@medusajs/framework/types";

import { POCHTA_METHOD_SCHEMA, type PochtaMethodData } from "../../../pochta/method";
import { planPochtaOptionNames, POCHTA_METHOD_NAMES } from "../../../pochta/method-name";
import { POCHTA_PROVIDER_ID } from "../../../modules/pochta-fulfillment";
import ensureLocationProviderLinkStep from "../shipping-methods/steps/ensure-location-provider-link";

/**
 * The copy the checkout shows for the method. `name` is the usual name; the
 * option gets the first name no other option of the shop carries
 * (`planPochtaOptionNames`), so a manual «Почта России — до отделения» never
 * stands next to an identical card.
 */
export const POCHTA_METHOD_COPY = {
  name: POCHTA_METHOD_NAMES[0],
  description: "Заберите заказ в пункте выдачи Почты России.",
};

export type ProvisionPochtaMethodInput = {
  tenant_id: string;
  enabled: boolean;
  shipping_profile_id: string;
  base_service_zone_id: string;
  service_zone_ids: string[];
  stock_location_id: string;
  default_weight_g: number;
};

type ExistingOption = { id: string; data: Record<string, unknown> | null; name: string };

/** The shop's Russian Post options, and the names of all its other options. */
const readExistingPochtaOptionsStep = createStep(
  "read-existing-pochta-options",
  async (input: { service_zone_ids: string[] }, { container }) => {
    if (!input.service_zone_ids.length) {
      return new StepResponse({ mine: [] as ExistingOption[], other_names: [] as string[] }, null);
    }
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: rows } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "data", "provider_id"],
      filters: { service_zone_id: input.service_zone_ids },
    });
    const all = rows as unknown as Array<ExistingOption & { provider_id: string }>;
    return new StepResponse(
      {
        mine: all.filter((row) => row.provider_id === POCHTA_PROVIDER_ID) as ExistingOption[],
        other_names: all.filter((row) => row.provider_id !== POCHTA_PROVIDER_ID).map((row) => row.name),
      },
      null,
    );
  },
);

/**
 * Rewrites the `data` and the store rule of the options that already exist, so
 * a settings save (the default weight, the on/off switch) reaches them. An
 * option that shares its name with another option of the shop is renamed to a
 * free one on the way.
 */
const updateExistingPochtaOptionsStep = createStep(
  "update-existing-pochta-options",
  async (
    input: { ids: string[]; data: PochtaMethodData; enabled: boolean; renames: Record<string, string> },
    { container },
  ) => {
    if (!input.ids.length) return new StepResponse({ updated: 0 }, null);
    const fulfillment = container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT);
    const previous: Array<{ id: string; data: Record<string, unknown>; name?: string }> = [];
    for (const id of input.ids) {
      const [current] = await fulfillment.listShippingOptions({ id }, { take: 1 });
      const rename = input.renames[id];
      previous.push({
        id,
        data: (current?.data ?? {}) as Record<string, unknown>,
        ...(rename && current ? { name: current.name } : {}),
      });
      await fulfillment.updateShippingOptions(id, {
        ...(rename ? { name: rename } : {}),
        data: input.data as unknown as Record<string, unknown>,
        rules: [
          { attribute: "enabled_in_store", value: input.enabled ? "true" : "false", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      });
    }
    return new StepResponse({ updated: input.ids.length }, previous);
  },
  async (previous, { container }) => {
    if (!previous?.length) return;
    const fulfillment = container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT);
    for (const entry of previous) {
      await fulfillment.updateShippingOptions(entry.id, {
        data: entry.data,
        ...(entry.name ? { name: entry.name } : {}),
      });
    }
  },
);

/**
 * Brings the shop's «Почта России — до отделения» option in line with its
 * Russian Post settings (46df-pochta), the way
 * `provision-tenant-cdek-methods` does for CDEK: one calculated option on the
 * warehouse's base zone, created once, then only updated. Switching the
 * integration off keeps the option with the store rule set to false, so a cart
 * that already chose it does not break.
 */
const provisionTenantPochtaMethodWorkflow = createWorkflow(
  "provision-tenant-pochta-method",
  (input: ProvisionPochtaMethodInput) => {
    const read = readExistingPochtaOptionsStep({ service_zone_ids: input.service_zone_ids });
    const existing = transform({ read }, ({ read }) => read.mine);
    const names = transform({ read }, ({ read }) => planPochtaOptionNames(read.mine, read.other_names));

    ensureLocationProviderLinkStep(
      transform({ input }, ({ input }) => ({
        location_id: input.stock_location_id,
        provider_id: POCHTA_PROVIDER_ID,
      })),
    );

    const methodData = transform({ input }, ({ input }): PochtaMethodData => ({
      schema: POCHTA_METHOD_SCHEMA,
      tenant_id: input.tenant_id,
      kind: "pickup",
      default_weight_g: input.default_weight_g,
    }));

    updateExistingPochtaOptionsStep(
      transform({ input, existing, methodData, names }, ({ input, existing, methodData, names }) => ({
        ids: existing.map((option) => option.id),
        data: methodData,
        enabled: input.enabled,
        renames: names.renames,
      })),
    );

    const toCreate = transform({ input, existing, methodData, names }, ({ input, existing, methodData, names }) =>
      existing.length || !input.enabled
        ? []
        : [
            {
              name: names.create_name,
              provider_id: POCHTA_PROVIDER_ID,
              service_zone_id: input.base_service_zone_id,
              shipping_profile_id: input.shipping_profile_id,
              price_type: "calculated" as const,
              type: {
                label: names.create_name,
                description: POCHTA_METHOD_COPY.description,
                code: "pochta-pickup",
              },
              data: methodData as unknown as Record<string, unknown>,
              rules: [
                { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
                { attribute: "is_return", value: "false", operator: "eq" as const },
              ],
            },
          ],
    );

    const created = createShippingOptionsWorkflow.runAsStep({ input: toCreate });

    return new WorkflowResponse(
      transform({ created, existing }, ({ created, existing }) => ({
        created_ids: (created ?? []).map((option: { id: string }) => option.id),
        existing_ids: existing.map((option) => option.id),
      })),
    );
  },
);

export default provisionTenantPochtaMethodWorkflow;
