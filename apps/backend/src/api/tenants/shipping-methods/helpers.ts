import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import type { IFulfillmentModuleService, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { TARIFF_PROVIDER_ID } from "../../../modules/tariff-fulfillment";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import {
  isTenantMethodData,
  TENANT_METHOD_SCHEMA,
  type MethodTextTranslations,
  type MethodZone,
  type ShippingTariff,
  type TariffSource,
  type TenantMethodData,
} from "../../../shipping-tariffs/tariff";
import { homeCountryForLocale, storeDefaultLocale } from "../../../shipping-tariffs/default-method-names";
import { zoneLabelFor } from "../../../shipping-tariffs/ru-zone-presets";
import { getTenantScope } from "../tenant-scope";

/**
 * Scoping for `/tenants/shipping-methods`. A tenant owns no shipping option
 * directly; the ownership road is the one `provisionTenantWarehouseWorkflow`
 * paved: tenant → sales channel → (link) stock location → fulfillment set →
 * service zones → shipping options. Everything a route here reads or writes
 * is narrowed to the service zones of THAT warehouse, so an option id from
 * another tenant is a 404, never a write (memory: «ловушка справочников»,
 * 2026-09-11 — the existing `GET /tenants/shipping-options` re-export is
 * unscoped reference data and stays as it is).
 */

export type TenantWarehouse = {
  tenant_id: string;
  stock_location_id: string;
  fulfillment_set_id: string;
  /** The zone provisioning created with the set (same name), where the two defaults live. */
  base_service_zone_id: string;
  service_zone_ids: string[];
  /** Currencies a flat price is written in: those of the store's regions. */
  currency_codes: string[];
  default_weight_g: number;
  /** The first currency, what the panel shows amounts in. */
  currency_code: string;
};

/** A zone the way it is stored: the owner's country and regions plus the name everyone displays. */
export const labelledZone = (countryCode: string, provinces: string[]): MethodZone => {
  const zone = { country_code: countryCode.toLowerCase(), provinces };
  return { ...zone, label: zoneLabelFor(zone) };
};

export const DEFAULT_ITEM_WEIGHT_G = 500;
export const WEIGHT_METADATA_KEY = "shipping_default_weight_g";

/** The tenant's warehouse and zones; throws 404 when provisioning never ran for it. */
export const getTenantWarehouse = async (req: AuthenticatedMedusaRequest): Promise<TenantWarehouse> => {
  const scope = await getTenantScope(req);
  return warehouseOf(req.scope, { id: scope.id, sales_channel_id: scope.sales_channel_id });
};

/**
 * `getTenantWarehouse` for a tenant named by id rather than by the token:
 * `clone-tenant` (t-2026-09-24-n12) writes delivery methods into a site the
 * caller is not logged into yet.
 */
export const warehouseOf = async (
  container: MedusaContainer,
  scope: { id: string; sales_channel_id: string | null },
): Promise<TenantWarehouse> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  if (!scope.sales_channel_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "The shop has no sales channel; delivery cannot be configured.");
  }

  const {
    data: [channel],
  } = await query.graph({
    entity: "sales_channels",
    fields: [
      "id",
      "stock_locations.id",
      "stock_locations.fulfillment_sets.id",
      "stock_locations.fulfillment_sets.name",
      "stock_locations.fulfillment_sets.type",
      "stock_locations.fulfillment_sets.service_zones.id",
      "stock_locations.fulfillment_sets.service_zones.name",
      "stock_locations.fulfillment_sets.service_zones.created_at",
    ],
    filters: { id: scope.sales_channel_id },
  });

  type Zone = { id: string; name: string; created_at: string | Date };
  type Set = { id: string; name: string; type: string; service_zones?: Zone[] };
  type Location = { id: string; fulfillment_sets?: Set[] };

  // The generated query types (`.medusa/types`) mark every linked row as
  // `Maybe<>`; the shape below is what the fields list above actually reads.
  const locations = ((channel?.stock_locations ?? []) as unknown as (Location | null)[]).filter(
    (location): location is Location => location !== null,
  );
  let found: { location: Location; set: Set } | null = null;
  for (const location of locations) {
    const set = (location.fulfillment_sets ?? []).find((candidate) => candidate.type === "shipping");
    if (set) {
      found = { location, set };
      break;
    }
  }

  if (!found) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "The shop has no warehouse with a shipping fulfillment set; run the warehouse provisioning first.",
    );
  }

  const zones = [...(found.set.service_zones ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const baseZone = zones.find((zone) => zone.name === found!.set.name) ?? zones[0];

  if (!baseZone) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "The shop warehouse has no service zone.");
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["currency_code", "countries.iso_2"],
  });
  const currency_codes = Array.from(
    new Set(regions.map((region) => region.currency_code as string).filter(Boolean)),
  );
  // The store has one region per country (241 on the stands), so «the shop's
  // currency» is the currency of the region covering the store's home
  // country — read from the default locale (ru → ru → rub, en → us → usd) —
  // not whichever region sorts first (`aoa` did, measured 2026-09-15).
  const homeCountry = homeCountryForLocale(storeDefaultLocale());
  const homeRegion = regions.find((region) =>
    (region.countries ?? []).some((country) => country?.iso_2 === homeCountry),
  );
  const currency_code = (homeRegion?.currency_code as string | undefined) ?? currency_codes[0] ?? "usd";

  const {
    data: [tenant],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "metadata"],
    filters: { id: scope.id },
  });
  const storedWeight = Number((tenant?.metadata as Record<string, unknown> | null)?.[WEIGHT_METADATA_KEY]);

  return {
    tenant_id: scope.id,
    stock_location_id: found.location.id,
    fulfillment_set_id: found.set.id,
    base_service_zone_id: baseZone.id,
    service_zone_ids: zones.map((zone) => zone.id),
    currency_codes,
    currency_code,
    default_weight_g: Number.isFinite(storedWeight) && storedWeight > 0 ? storedWeight : DEFAULT_ITEM_WEIGHT_G,
  };
};

/** What the panel reads and writes. */
export type TenantShippingMethod = {
  id: string;
  name: string;
  description: string | null;
  delivery_hint: string | null;
  enabled: boolean;
  tariff: ShippingTariff;
  /** `"provisioned-default"` while the tariff is still the provisioned starting price the owner has not confirmed. */
  tariff_source: TariffSource | null;
  /** `null` = every country the store ships to (the base zone). */
  zone: MethodZone | null;
  /** The zone's human name, computed here so a method saved before zones had names shows one too. */
  zone_label: string;
  /** `carriers.ts` key the owner picked, or null when she named the method herself. */
  carrier: string | null;
  /** The description and hint in the shop's other languages (`TenantMethodData.i18n`), carried over on every save. */
  i18n: MethodTextTranslations | null;
  sort_order: number;
  price_type: "flat" | "calculated";
  provider_id: string;
  service_zone_id: string;
  own_zone: boolean;
  currency_code: string;
  created_at: string;
};

type OptionRow = {
  id: string;
  name: string;
  price_type: "flat" | "calculated";
  provider_id: string;
  service_zone_id: string;
  data: unknown;
  created_at: string | Date;
  rules?: { attribute: string; value: string | string[]; operator: string }[] | null;
  prices?: { currency_code?: string | null; amount?: number | null }[] | null;
};

const isEnabled = (row: OptionRow): boolean => {
  const rule = (row.rules ?? []).find((r) => r.attribute === "enabled_in_store");
  return rule ? rule.value !== "false" : true;
};

/**
 * Turns a shipping option row into a method. An option provisioned before
 * tariffs existed (no `data.schema`) reads as a flat method in the base zone
 * priced by its first price row, so the panel lists and edits it like the rest.
 */
export const toMethod = (row: OptionRow, warehouse: TenantWarehouse, index: number): TenantShippingMethod => {
  const data: TenantMethodData = isTenantMethodData(row.data)
    ? row.data
    : {
        schema: TENANT_METHOD_SCHEMA,
        tariff: {
          kind: "flat",
          amount: Number(
            (row.prices ?? []).find((price) => price.currency_code === warehouse.currency_code)?.amount ??
              row.prices?.[0]?.amount ??
              0,
          ),
        },
        description: null,
        delivery_hint: null,
        sort_order: index,
        default_weight_g: warehouse.default_weight_g,
        own_zone: false,
        zone: null,
      };
  return {
    id: row.id,
    name: row.name,
    description: data.description ?? null,
    delivery_hint: data.delivery_hint ?? null,
    enabled: isEnabled(row),
    tariff: data.tariff,
    tariff_source: data.tariff_source ?? null,
    zone: data.zone ?? null,
    zone_label: data.zone?.label || zoneLabelFor(data.zone ?? null),
    carrier: data.carrier ?? null,
    i18n: data.i18n ?? null,
    sort_order: typeof data.sort_order === "number" ? data.sort_order : index,
    price_type: row.price_type,
    provider_id: row.provider_id,
    service_zone_id: row.service_zone_id,
    own_zone: Boolean(data.own_zone) && row.service_zone_id !== warehouse.base_service_zone_id,
    currency_code: warehouse.currency_code,
    created_at: new Date(row.created_at).toISOString(),
  };
};

const OPTION_FIELDS = [
  "id",
  "name",
  "price_type",
  "provider_id",
  "service_zone_id",
  "data",
  "created_at",
  "rules.attribute",
  "rules.value",
  "rules.operator",
  "prices.currency_code",
  "prices.amount",
];

/** Every method of the warehouse, ordered the way the owner arranged them. */
export const listTenantMethods = async (
  req: AuthenticatedMedusaRequest,
  warehouse: TenantWarehouse,
): Promise<TenantShippingMethod[]> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: rows } = await query.graph({
    entity: "shipping_option",
    fields: OPTION_FIELDS,
    filters: { service_zone_id: warehouse.service_zone_ids },
  });
  const sorted = [...(rows as unknown as OptionRow[])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return sorted
    .map((row, index) => toMethod(row, warehouse, index))
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
};

/** 404 for an option outside the tenant's zones, worded like Medusa's own miss. */
export const assertOwnedMethod = async (
  req: AuthenticatedMedusaRequest,
  warehouse: TenantWarehouse,
  id: string,
): Promise<TenantShippingMethod> => {
  const methods = await listTenantMethods(req, warehouse);
  const method = methods.find((candidate) => candidate.id === id);
  if (!method) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Shipping option with id: ${id} was not found`);
  }
  return method;
};

/** The store's default shipping profile, the one every product carries. */
export const resolveShippingProfileId = async (req: AuthenticatedMedusaRequest): Promise<string> => {
  const fulfillment: IFulfillmentModuleService = req.scope.resolve(Modules.FULFILLMENT);
  const [profile] = await fulfillment.listShippingProfiles({}, { take: 1, order: { created_at: "ASC" } });
  if (!profile) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "The store has no shipping profile yet.");
  }
  return profile.id;
};

/** The provider a method runs on: the tariff provider for anything the provider must price, `manual_manual` may stay on a plain flat default. */
export const providerFor = (data: TenantMethodData, current?: string): string =>
  data.tariff.kind === "flat" && current ? current : TARIFF_PROVIDER_ID;

/** Writes the tenant's default item weight (grams) into its metadata. */
export const saveDefaultWeight = async (
  req: AuthenticatedMedusaRequest,
  tenantId: string,
  defaultWeightG: number,
): Promise<void> => {
  const tenants: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const tenant = await tenants.retrieveTenant(tenantId);
  await tenants.updateTenants({
    id: tenantId,
    metadata: { ...(tenant.metadata ?? {}), [WEIGHT_METADATA_KEY]: defaultWeightG },
  });
};
