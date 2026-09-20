import { randomBytes } from "node:crypto";
import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { getTenantScope } from "../tenant-scope";
import { backendPublicOrigin } from "../payment-settings/helpers";
import {
  maskCdekSettings,
  readCdekSecret,
  type MaskedCdekSettings,
  type ResolvedCdekSecret,
} from "../../../tenant-secrets/cdek";
import { CDEK_PROVIDER_ID } from "../../../modules/cdek-fulfillment";
import type { CdekDeliveryKind, CdekMethodData } from "../../../cdek/method";

export type CdekMethodSummary = {
  id: string;
  name: string;
  kind: CdekDeliveryKind;
  enabled: boolean;
};

export type DeliverySettingsResponse = {
  /** `null` while the shop has no CDEK row yet. */
  settings: MaskedCdekSettings | null;
  /** The URL CDEK posts statuses to; shown so the owner can see it was registered. */
  webhook_url: string | null;
  /** The CDEK options that exist right now, with their store rule. */
  methods: CdekMethodSummary[];
  /** Copied out of the options' `data`, because that is where the provider reads it. */
  pricing: {
    markup_amount: number;
    markup_percent: number;
    free_above_total: number | null;
  };
};

/** A per-shop token for the unsigned CDEK callback. 32 hex characters. */
export const newWebhookToken = (): string => randomBytes(16).toString("hex");

export const cdekWebhookUrl = (
  req: AuthenticatedMedusaRequest,
  tenantId: string,
  token: string,
): string =>
  `${backendPublicOrigin(req)}/cdek/webhook?tenant=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(token)}`;

/**
 * The shop's CDEK shipping options. Read through the raw shipping option rows
 * rather than `listTenantMethods`, which shapes a row into the tariff-method
 * view the /shipping screen wants and would need a second schema to describe a
 * CDEK option.
 */
export const listCdekMethods = async (
  req: AuthenticatedMedusaRequest,
  serviceZoneIds: string[],
): Promise<CdekMethodSummary[]> => {
  if (!serviceZoneIds.length) return [];
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: rows } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "data", "provider_id", "rules.attribute", "rules.value"],
    filters: { service_zone_id: serviceZoneIds },
  });
  return (rows as unknown as Array<{
    id: string;
    name: string;
    provider_id: string;
    data: Record<string, unknown> | null;
    rules?: Array<{ attribute: string; value: string }>;
  }>)
    .filter((row) => row.provider_id === CDEK_PROVIDER_ID)
    .map((row) => ({
      id: row.id,
      name: row.name,
      kind: (((row.data ?? {}) as Partial<CdekMethodData>).kind ?? "courier") as CdekDeliveryKind,
      enabled:
        (row.rules ?? []).find((rule) => rule.attribute === "enabled_in_store")?.value === "true",
    }));
};

/**
 * Pricing the owner set, taken from the first CDEK option's `data`. The options
 * are always written together, so any of them answers; the defaults are what a
 * shop with no options yet sees in the form.
 */
export const pricingFromMethods = (
  rows: Array<{ data?: Record<string, unknown> | null }>,
): DeliverySettingsResponse["pricing"] => {
  const data = (rows.find((row) => row.data)?.data ?? {}) as Partial<CdekMethodData>;
  return {
    markup_amount: typeof data.markup_amount === "number" ? data.markup_amount : 0,
    markup_percent: typeof data.markup_percent === "number" ? data.markup_percent : 0,
    free_above_total: typeof data.free_above_total === "number" ? data.free_above_total : null,
  };
};

export const readOwnDeliverySettings = async (
  req: AuthenticatedMedusaRequest,
  serviceZoneIds: string[],
): Promise<DeliverySettingsResponse> => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret: ResolvedCdekSecret | null = await readCdekSecret(pg, tenant.id, {
    includeDisabled: true,
  });

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: rows } = serviceZoneIds.length
    ? await query.graph({
        entity: "shipping_option",
        fields: ["id", "data", "provider_id"],
        filters: { service_zone_id: serviceZoneIds },
      })
    : { data: [] as Array<{ provider_id: string; data: Record<string, unknown> | null }> };

  const mine = (rows as unknown as Array<{ provider_id: string; data: Record<string, unknown> | null }>)
    .filter((row) => row.provider_id === CDEK_PROVIDER_ID);

  return {
    settings: secret ? maskCdekSettings(secret) : null,
    webhook_url:
      secret?.credentials.webhook_token
        ? cdekWebhookUrl(req, tenant.id, secret.credentials.webhook_token)
        : null,
    methods: await listCdekMethods(req, serviceZoneIds),
    pricing: pricingFromMethods(mine),
  };
};
