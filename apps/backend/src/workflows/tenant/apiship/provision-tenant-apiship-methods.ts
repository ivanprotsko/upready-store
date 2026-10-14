import { createWorkflow, createStep, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { IFulfillmentModuleService } from "@medusajs/framework/types";

import { apishipMethodCopy } from "../../../apiship/carriers";
import { APISHIP_METHOD_SCHEMA, type ApishipDeliveryKind, type ApishipMethodData } from "../../../apiship/method";
import { APISHIP_PROVIDER_ID } from "../../../modules/apiship-fulfillment";
import ensureLocationProviderLinkStep from "../shipping-methods/steps/ensure-location-provider-link";

/** One carrier the owner switched on, with the kinds it offers. */
export type ApishipCarrierSetting = {
  provider_key: string;
  /** ApiShip's own name, for a carrier this product has no label for. */
  provider_name?: string | null;
  kinds: ApishipDeliveryKind[];
  tariff_id?: number | null;
  connection_id?: string | null;
};

export type ProvisionApishipMethodsInput = {
  tenant_id: string;
  /** The owner's choice: every (carrier, kind) named here is written as `data.offered` and kept across saves. */
  carriers: ApishipCarrierSetting[];
  /**
   * The other half of the store rule: false while ApiShip is off or the shop
   * cannot quote yet (no sender). An option is on at the checkout when this
   * is true AND the owner offers it; the choice itself survives a false here.
   */
  enabled: boolean;
  shipping_profile_id: string;
  base_service_zone_id: string;
  service_zone_ids: string[];
  stock_location_id: string;
  default_weight_g: number;
  markup_amount: number;
  markup_percent: number;
  free_above_total: number | null;
};

type ExistingOption = { id: string; data: Record<string, unknown> | null; name: string };

const keyOf = (providerKey: string, kind: ApishipDeliveryKind) => `${providerKey}:${kind}`;

/**
 * Reads the ApiShip options the shop already has, so the caller creates only
 * what is missing. A `query.graph` filtered by provider cannot be done in a
 * `transform`, hence a step of its own.
 */
const readExistingApishipOptionsStep = createStep(
  "read-existing-apiship-options",
  async (input: { service_zone_ids: string[] }, { container }) => {
    if (!input.service_zone_ids.length) {
      return new StepResponse([] as ExistingOption[], null);
    }
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: rows } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "data", "provider_id"],
      filters: { service_zone_id: input.service_zone_ids },
    });
    const mine = (rows as unknown as Array<ExistingOption & { provider_id: string }>).filter(
      (row) => row.provider_id === APISHIP_PROVIDER_ID,
    );
    return new StepResponse(mine as ExistingOption[], null);
  },
);

/**
 * Rewrites the `data` and the store rule of the ApiShip options that already
 * exist. Everything a shop can change afterwards (markup, weight, the pinned
 * tariff, the on/off switch per carrier and kind) lives in the option's
 * `data` and its rule, so a settings save has to reach every option rather
 * than only the ones it creates. An option of a (carrier, kind) the owner
 * switched off keeps its data, records `offered: false` and gets the store
 * rule set to false, so a cart that already chose it does not break. One the
 * owner offers while the shop cannot quote yet records `offered: true` under
 * a false rule, and the next save with a sender switches it on.
 */
const updateExistingApishipOptionsStep = createStep(
  "update-existing-apiship-options",
  async (
    input: { options: Array<{ id: string; data: ApishipMethodData; enabled: boolean }> },
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
          { attribute: "enabled_in_store", value: option.enabled ? "true" : "false", operator: "eq" },
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
  input: ProvisionApishipMethodsInput,
  carrier: ApishipCarrierSetting,
  kind: ApishipDeliveryKind,
  offered: boolean,
): ApishipMethodData => ({
  schema: APISHIP_METHOD_SCHEMA,
  tenant_id: input.tenant_id,
  provider_key: carrier.provider_key,
  kind,
  tariff_id: carrier.tariff_id ?? null,
  connection_id: carrier.connection_id ?? null,
  default_weight_g: input.default_weight_g,
  markup_amount: input.markup_amount,
  markup_percent: input.markup_percent,
  free_above_total: input.free_above_total,
  offered,
});

/**
 * Brings the shop's ApiShip shipping options in line with its ApiShip settings
 * (t-2026-10-14-58): one calculated option per (carrier, kind) the owner
 * switched on, all of them on the warehouse's base zone, the way
 * `provision-tenant-cdek-methods` does for direct СДЭК.
 *
 * Idempotent on purpose — the owner saves the settings form repeatedly, and every
 * save runs this. An option that already exists is updated, never duplicated.
 *
 * Why the base zone and not one per kind: an ApiShip option serves wherever its
 * carrier serves, and the calculator itself answers «no tariff» for a route it
 * does not cover (`calculatePrice` throws and the option drops out of the list).
 */
const provisionTenantApishipMethodsWorkflow = createWorkflow(
  "provision-tenant-apiship-methods",
  (input: ProvisionApishipMethodsInput) => {
    const existing = readExistingApishipOptionsStep({ service_zone_ids: input.service_zone_ids });

    ensureLocationProviderLinkStep(
      transform({ input }, ({ input }) => ({
        location_id: input.stock_location_id,
        provider_id: APISHIP_PROVIDER_ID,
      })),
    );

    const wanted = transform({ input }, ({ input }) => {
      const map: Record<string, { carrier: ApishipCarrierSetting; kind: ApishipDeliveryKind }> = {};
      for (const carrier of input.carriers) {
        for (const kind of carrier.kinds) {
          map[keyOf(carrier.provider_key, kind)] = { carrier, kind };
        }
      }
      return map;
    });

    const toUpdate = transform({ input, existing, wanted }, ({ input, existing, wanted }) => {
      const rows: Array<{ id: string; data: ApishipMethodData; enabled: boolean }> = [];
      for (const option of existing) {
        const data = (option.data ?? {}) as Partial<ApishipMethodData>;
        const providerKey = data.provider_key ?? "";
        const kind = (data.kind ?? "courier") as ApishipDeliveryKind;
        const want = wanted[keyOf(providerKey, kind)];
        const carrier: ApishipCarrierSetting = want?.carrier ?? {
          provider_key: providerKey,
          kinds: [kind],
          tariff_id: data.tariff_id ?? null,
          connection_id: data.connection_id ?? null,
        };
        rows.push({
          id: option.id,
          data: methodDataFor(input, carrier, kind, Boolean(want)),
          enabled: input.enabled && Boolean(want),
        });
      }
      return { options: rows };
    });
    updateExistingApishipOptionsStep(toUpdate);

    const toCreate = transform({ input, existing, wanted }, ({ input, existing, wanted }) => {
      const present = new Set(
        existing.map((option) => {
          const data = (option.data ?? {}) as Partial<ApishipMethodData>;
          return keyOf(data.provider_key ?? "", (data.kind ?? "courier") as ApishipDeliveryKind);
        }),
      );
      return Object.entries(wanted)
        .filter(([key]) => !present.has(key))
        .map(([, { carrier, kind }]) => {
          const copy = apishipMethodCopy(carrier.provider_key, kind, carrier.provider_name);
          return {
            name: copy.name,
            provider_id: APISHIP_PROVIDER_ID,
            service_zone_id: input.base_service_zone_id,
            shipping_profile_id: input.shipping_profile_id,
            price_type: "calculated" as const,
            type: {
              label: copy.name,
              description: copy.description,
              code: `apiship-${carrier.provider_key}-${kind}`,
            },
            data: methodDataFor(input, carrier, kind, true) as unknown as Record<string, unknown>,
            rules: [
              { attribute: "enabled_in_store", value: input.enabled ? "true" : "false", operator: "eq" as const },
              { attribute: "is_return", value: "false", operator: "eq" as const },
            ],
          };
        });
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

export default provisionTenantApishipMethodsWorkflow;
