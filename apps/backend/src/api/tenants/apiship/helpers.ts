import { randomBytes } from "node:crypto";
import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";

import { getTenantScope } from "../tenant-scope";
import { backendPublicOrigin } from "../payment-settings/helpers";
import { APISHIP_BASE_URL } from "../../../apiship/client";
import { carrierLabel, DIRECT_PROVIDER_OF_CARRIER } from "../../../apiship/carriers";
import type { ApishipDeliveryKind, ApishipMethodData } from "../../../apiship/method";
import { APISHIP_PROVIDER_ID } from "../../../modules/apiship-fulfillment";
import {
  apishipSenderComplete,
  maskApishipSettings,
  readApishipSecret,
  type MaskedApishipSettings,
  type ResolvedApishipSecret,
} from "../../../tenant-secrets/apiship";
import {
  tryReadTenantSecret,
  type TriedTenantSecret,
  type UnreadableTenantSecret,
} from "../../../tenant-secrets/unreadable";

export type ApishipMethodSummary = {
  id: string;
  name: string;
  provider_key: string;
  kind: ApishipDeliveryKind;
  enabled: boolean;
};

export type ApishipCarrierSummary = {
  provider_key: string;
  label: string;
  /**
   * The kinds the owner switched on (`data.offered` of the options). A card
   * shows at the checkout once the shop can also quote: `methods[].enabled`.
   */
  kinds: ApishipDeliveryKind[];
  tariff_id: number | null;
  connection_id: string | null;
  methods: ApishipMethodSummary[];
};

export type ApishipSettingsResponse = {
  provider: "apiship";
  label: "ApiShip";
  /** `null` while the shop has no ApiShip row yet, or while its row does not decrypt. */
  settings: MaskedApishipSettings | null;
  /** The row exists but does not decrypt with this deployment's key (46df D1). */
  unreadable: UnreadableTenantSecret | null;
  /** Which fields an ApiShip order still needs; empty when a shipment can be created. */
  missing: string[];
  /** The URL ApiShip posts statuses to; shown so the owner can see it was registered. */
  webhook_url: string | null;
  /** True when the stand points at ApiShip's test contour (`api.dev.apiship.ru`). */
  test_contour: boolean;
  carriers: ApishipCarrierSummary[];
  /** Copied out of the options' `data`, because that is where the provider reads it. */
  pricing: { markup_amount: number; markup_percent: number; free_above_total: number | null };
  /** The shop's direct methods of the same carriers that are on: a buyer would see two cards. */
  duplicates: Array<{ id: string; name: string; provider_id: string; provider_key: string }>;
};

/** A per-shop token for the unsigned ApiShip callback. 32 hex characters. */
export const newApishipWebhookToken = (): string => randomBytes(16).toString("hex");

export const apishipWebhookUrl = (req: AuthenticatedMedusaRequest, tenantId: string, token: string): string =>
  `${backendPublicOrigin(req)}/apiship/webhook?tenant=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(token)}`;

export const isApishipTestContour = (): boolean => /\bdev\.apiship\.ru\b/.test(APISHIP_BASE_URL);

/** The caller's ApiShip row, disabled included; an undecryptable row comes back as `unreadable`. */
export const readOwnApishipSecret = (
  req: AuthenticatedMedusaRequest,
  tenantId: string,
): Promise<TriedTenantSecret<ResolvedApishipSecret>> => {
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  return tryReadTenantSecret(
    pg,
    tenantId,
    "apiship",
    () => readApishipSecret(pg, tenantId, { includeDisabled: true }),
    req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER),
  );
};

type OptionRow = {
  id: string;
  name: string;
  provider_id: string;
  data: Record<string, unknown> | null;
  rules?: Array<{ attribute: string; value: string }>;
};

const storeRule = (option: OptionRow): boolean =>
  (option.rules ?? []).find((rule) => rule.attribute === "enabled_in_store")?.value !== "false";

/** Every shipping option of the shop's warehouse, with its store rule. */
export const listWarehouseOptions = async (
  req: AuthenticatedMedusaRequest,
  serviceZoneIds: string[],
): Promise<OptionRow[]> => {
  if (!serviceZoneIds.length) return [];
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: rows } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "data", "provider_id", "rules.attribute", "rules.value"],
    filters: { service_zone_id: serviceZoneIds },
  });
  return rows as unknown as OptionRow[];
};

/**
 * The ApiShip options grouped by carrier, as the settings screen shows them.
 * `kinds` is the owner's choice (`data.offered`), `methods[].enabled` the store
 * rule: the two differ while the shop has a token but no sender yet. A row
 * written before the choice was kept in `data` carries only the rule, which
 * then stands for both.
 */
export const carriersOf = (options: OptionRow[]): ApishipCarrierSummary[] => {
  const byKey = new Map<string, ApishipCarrierSummary>();
  for (const option of options) {
    if (option.provider_id !== APISHIP_PROVIDER_ID) continue;
    const data = (option.data ?? {}) as Partial<ApishipMethodData>;
    const providerKey = data.provider_key ?? "";
    if (!providerKey) continue;
    const kind = (data.kind ?? "courier") as ApishipDeliveryKind;
    const enabled = (option.rules ?? []).find((rule) => rule.attribute === "enabled_in_store")?.value === "true";
    const offered = typeof data.offered === "boolean" ? data.offered : enabled;
    const entry = byKey.get(providerKey) ?? {
      provider_key: providerKey,
      label: carrierLabel(providerKey),
      kinds: [],
      tariff_id: data.tariff_id ?? null,
      connection_id: data.connection_id ?? null,
      methods: [],
    };
    if (offered && !entry.kinds.includes(kind)) entry.kinds.push(kind);
    entry.methods.push({ id: option.id, name: option.name, provider_key: providerKey, kind, enabled });
    byKey.set(providerKey, entry);
  }
  return [...byKey.values()];
};

export const pricingOf = (options: OptionRow[]): ApishipSettingsResponse["pricing"] => {
  const data = (options.find((option) => option.provider_id === APISHIP_PROVIDER_ID && option.data)?.data ??
    {}) as Partial<ApishipMethodData>;
  return {
    markup_amount: typeof data.markup_amount === "number" ? data.markup_amount : 0,
    markup_percent: typeof data.markup_percent === "number" ? data.markup_percent : 0,
    free_above_total: typeof data.free_above_total === "number" ? data.free_above_total : null,
  };
};

/** The direct methods (СДЭК, Почта) switched on for a carrier ApiShip also serves. */
export const duplicatesOf = (
  options: OptionRow[],
  carriers: ApishipCarrierSummary[],
): ApishipSettingsResponse["duplicates"] => {
  const active = carriers.filter((carrier) => carrier.kinds.length);
  const out: ApishipSettingsResponse["duplicates"] = [];
  for (const carrier of active) {
    const direct = DIRECT_PROVIDER_OF_CARRIER[carrier.provider_key];
    if (!direct) continue;
    for (const option of options) {
      if (option.provider_id === direct && storeRule(option)) {
        out.push({ id: option.id, name: option.name, provider_id: option.provider_id, provider_key: carrier.provider_key });
      }
    }
  }
  return out;
};

/** The sender fields a shipment still needs, by name. */
export const missingSenderFields = (secret: ResolvedApishipSecret | null): string[] => {
  if (!secret) return ["token"];
  const credentials = secret.credentials;
  const missing: string[] = [];
  if (!credentials.token) missing.push("token");
  if (!credentials.sender_name) missing.push("sender_name");
  if (!credentials.sender_phone) missing.push("sender_phone");
  if (!credentials.sender_address) missing.push("sender_address");
  if (credentials.sender_mode === "point" && !credentials.sender_point_id) missing.push("sender_point_id");
  return apishipSenderComplete(credentials) && credentials.token ? [] : missing;
};

export const readOwnApishipSettings = async (
  req: AuthenticatedMedusaRequest,
  serviceZoneIds: string[],
): Promise<ApishipSettingsResponse> => {
  const tenant = await getTenantScope(req);
  const { secret, unreadable } = await readOwnApishipSecret(req, tenant.id);
  const options = await listWarehouseOptions(req, serviceZoneIds);
  const carriers = carriersOf(options);

  return {
    provider: "apiship",
    label: "ApiShip",
    settings: secret ? maskApishipSettings(secret) : null,
    unreadable,
    missing: missingSenderFields(secret),
    webhook_url: secret?.credentials.webhook_token
      ? apishipWebhookUrl(req, tenant.id, secret.credentials.webhook_token)
      : null,
    test_contour: isApishipTestContour(),
    carriers,
    pricing: pricingOf(options),
    duplicates: duplicatesOf(options, carriers),
  };
};
