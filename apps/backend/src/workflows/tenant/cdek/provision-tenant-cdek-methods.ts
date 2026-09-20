import { createWorkflow, createStep, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { IFulfillmentModuleService } from "@medusajs/framework/types";

import { CDEK_METHOD_SCHEMA, type CdekDeliveryKind, type CdekMethodData } from "../../../cdek/method";
import { CDEK_PROVIDER_ID } from "../../../modules/cdek-fulfillment";
import ensureLocationProviderLinkStep from "../shipping-methods/steps/ensure-location-provider-link";

/** The delivery kinds a shop can switch on, with the copy the checkout shows. */
export const CDEK_KIND_COPY: Record<CdekDeliveryKind, { name: string; description: string }> = {
  courier: {
    name: "СДЭК — курьером до двери",
    description: "Курьер СДЭК привезёт заказ по вашему адресу.",
  },
  pickup: {
    name: "СДЭК — пункт выдачи",
    description: "Заберите заказ в удобном отделении СДЭК.",
  },
  postamat: {
    name: "СДЭК — постамат",
    description: "Заберите заказ из постамата СДЭК в любое время.",
  },
};

export type ProvisionCdekMethodsInput = {
  tenant_id: string;
  kinds: CdekDeliveryKind[];
  enabled: boolean;
  shipping_profile_id: string;
  base_service_zone_id: string;
  service_zone_ids: string[];
  stock_location_id: string;
  default_weight_g: number;
  markup_amount: number;
  markup_percent: number;
  free_above_total: number | null;
  sender_mode: CdekMethodData["sender_mode"];
};

type ExistingOption = { id: string; data: Record<string, unknown> | null; name: string };

/**
 * Reads the CDEK options the shop already has, so the caller creates only what is
 * missing. A `query.graph` filtered by provider cannot be done in a `transform`,
 * hence a step of its own.
 */
const readExistingCdekOptionsStep = createStep(
  "read-existing-cdek-options",
  async (input: { service_zone_ids: string[] }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: rows } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "data", "provider_id"],
      filters: { service_zone_id: input.service_zone_ids },
    });
    const mine = (rows as unknown as Array<ExistingOption & { provider_id: string }>).filter(
      (row) => row.provider_id === CDEK_PROVIDER_ID,
    );
    return new StepResponse(mine, null);
  },
);

/**
 * Rewrites the `data` and the store rule of the CDEK options that already exist.
 * Everything a shop can change afterwards (markup, weight, sender mode, the
 * on/off switch) lives in the option's `data`, so a settings save has to reach
 * every option rather than only the ones it creates.
 */
const updateExistingCdekOptionsStep = createStep(
  "update-existing-cdek-options",
  async (
    input: { options: Array<{ id: string; data: CdekMethodData }>; enabled: boolean },
    { container },
  ) => {
    if (!input.options.length) {
      return new StepResponse({ updated: 0 }, null);
    }
    const fulfillment = container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT);
    const previous: Array<{ id: string; data: Record<string, unknown> }> = [];

    for (const option of input.options) {
      const [current] = await fulfillment.listShippingOptions({ id: option.id }, { take: 1 });
      previous.push({ id: option.id, data: (current?.data ?? {}) as Record<string, unknown> });
      await fulfillment.updateShippingOptions(option.id, {
        data: option.data as unknown as Record<string, unknown>,
        rules: [
          { attribute: "enabled_in_store", value: input.enabled ? "true" : "false", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      });
    }
    return new StepResponse({ updated: input.options.length }, previous);
  },
  async (previous, { container }) => {
    if (!previous?.length) return;
    const fulfillment = container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT);
    for (const entry of previous) {
      await fulfillment.updateShippingOptions(entry.id, { data: entry.data });
    }
  },
);

const methodDataFor = (
  input: ProvisionCdekMethodsInput,
  kind: CdekDeliveryKind,
): CdekMethodData => ({
  schema: CDEK_METHOD_SCHEMA,
  tenant_id: input.tenant_id,
  kind,
  tariff_code: null,
  sender_mode: input.sender_mode,
  default_weight_g: input.default_weight_g,
  markup_amount: input.markup_amount,
  markup_percent: input.markup_percent,
  free_above_total: input.free_above_total,
});

/**
 * Brings the shop's CDEK shipping options in line with its delivery settings
 * (i02-apiship-cdek-shipping): one calculated option per delivery kind the owner
 * switched on, all of them on the warehouse's base zone.
 *
 * Idempotent on purpose — the owner saves the settings form repeatedly, and every
 * save runs this. An option that already exists is updated, never duplicated, and
 * a kind the owner switched off keeps its option with the store rule set to
 * false, so a cart that already chose it does not break.
 *
 * Why the base zone and not one per kind: a CDEK option serves wherever CDEK
 * serves, and the carrier itself answers «no tariff» for a route it does not
 * cover (`calculatePrice` throws and the option drops out of the list). A geo
 * zone would be a second, staler copy of that answer.
 */
const provisionTenantCdekMethodsWorkflow = createWorkflow(
  "provision-tenant-cdek-methods",
  (input: ProvisionCdekMethodsInput) => {
    const existing = readExistingCdekOptionsStep({ service_zone_ids: input.service_zone_ids });

    ensureLocationProviderLinkStep(
      transform({ input }, ({ input }) => ({
        location_id: input.stock_location_id,
        provider_id: CDEK_PROVIDER_ID,
      })),
    );

    const toUpdate = transform({ input, existing }, ({ input, existing }) => {
      const rows: Array<{ id: string; data: CdekMethodData }> = [];
      for (const option of existing) {
        const data = (option.data ?? {}) as Partial<CdekMethodData>;
        const kind = (data.kind ?? "courier") as CdekDeliveryKind;
        rows.push({ id: option.id, data: methodDataFor(input, kind) });
      }
      return { options: rows, enabled: input.enabled };
    });
    updateExistingCdekOptionsStep(toUpdate);

    const toCreate = transform({ input, existing }, ({ input, existing }) => {
      const present = new Set(
        existing.map((option) => ((option.data ?? {}) as Partial<CdekMethodData>).kind ?? "courier"),
      );
      return input.kinds
        .filter((kind) => !present.has(kind))
        .map((kind) => ({
          name: CDEK_KIND_COPY[kind].name,
          provider_id: CDEK_PROVIDER_ID,
          service_zone_id: input.base_service_zone_id,
          shipping_profile_id: input.shipping_profile_id,
          price_type: "calculated" as const,
          type: {
            label: CDEK_KIND_COPY[kind].name,
            description: CDEK_KIND_COPY[kind].description,
            code: `cdek-${kind}`,
          },
          data: methodDataFor(input, kind) as unknown as Record<string, unknown>,
          rules: [
            { attribute: "enabled_in_store", value: input.enabled ? "true" : "false", operator: "eq" as const },
            { attribute: "is_return", value: "false", operator: "eq" as const },
          ],
        }));
    });

    const created = createShippingOptionsWorkflow.runAsStep({ input: toCreate });

    return new WorkflowResponse(
      transform({ created, existing }, ({ created, existing }) => ({
        created_ids: (created ?? []).map((option: { id: string }) => option.id),
        existing_ids: existing.map((option) => option.id),
      })),
    );
  },
);

export default provisionTenantCdekMethodsWorkflow;
