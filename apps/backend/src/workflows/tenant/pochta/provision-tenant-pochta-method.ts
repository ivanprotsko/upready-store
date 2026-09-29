import { createWorkflow, createStep, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { IFulfillmentModuleService } from "@medusajs/framework/types";

import { POCHTA_METHOD_SCHEMA, type PochtaMethodData } from "../../../pochta/method";
import { POCHTA_PROVIDER_ID } from "../../../modules/pochta-fulfillment";
import ensureLocationProviderLinkStep from "../shipping-methods/steps/ensure-location-provider-link";

/** The copy the checkout shows for the method. */
export const POCHTA_METHOD_COPY = {
  name: "Почта России — до отделения",
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

const readExistingPochtaOptionsStep = createStep(
  "read-existing-pochta-options",
  async (input: { service_zone_ids: string[] }, { container }) => {
    if (!input.service_zone_ids.length) return new StepResponse([] as ExistingOption[], null);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: rows } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "data", "provider_id"],
      filters: { service_zone_id: input.service_zone_ids },
    });
    const mine = (rows as unknown as Array<ExistingOption & { provider_id: string }>).filter(
      (row) => row.provider_id === POCHTA_PROVIDER_ID,
    );
    return new StepResponse(mine as ExistingOption[], null);
  },
);

/**
 * Rewrites the `data` and the store rule of the options that already exist, so
 * a settings save (the default weight, the on/off switch) reaches them.
 */
const updateExistingPochtaOptionsStep = createStep(
  "update-existing-pochta-options",
  async (input: { ids: string[]; data: PochtaMethodData; enabled: boolean }, { container }) => {
    if (!input.ids.length) return new StepResponse({ updated: 0 }, null);
    const fulfillment = container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT);
    const previous: Array<{ id: string; data: Record<string, unknown> }> = [];
    for (const id of input.ids) {
      const [current] = await fulfillment.listShippingOptions({ id }, { take: 1 });
      previous.push({ id, data: (current?.data ?? {}) as Record<string, unknown> });
      await fulfillment.updateShippingOptions(id, {
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
      await fulfillment.updateShippingOptions(entry.id, { data: entry.data });
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
    const existing = readExistingPochtaOptionsStep({ service_zone_ids: input.service_zone_ids });

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
      transform({ input, existing, methodData }, ({ input, existing, methodData }) => ({
        ids: existing.map((option) => option.id),
        data: methodData,
        enabled: input.enabled,
      })),
    );

    const toCreate = transform({ input, existing, methodData }, ({ input, existing, methodData }) =>
      existing.length || !input.enabled
        ? []
        : [
            {
              name: POCHTA_METHOD_COPY.name,
              provider_id: POCHTA_PROVIDER_ID,
              service_zone_id: input.base_service_zone_id,
              shipping_profile_id: input.shipping_profile_id,
              price_type: "calculated" as const,
              type: {
                label: POCHTA_METHOD_COPY.name,
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
