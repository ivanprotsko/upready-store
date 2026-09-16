import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { CredentialField, MarketplaceAdapter } from "../../modules/marketplace/contract";
import { requireAdapter } from "../../modules/marketplace/registry";
import { TENANT_MODULE } from "../../modules/tenant";
import type TenantModuleService from "../../modules/tenant/service";
import {
  TENANT_INTEGRATION_PROVIDERS,
  type TenantIntegrationProvider,
} from "../../modules/tenant/models/tenant-integration-secret";
import { maskSecret } from "../../tenant-secrets/crypto";
import {
  deleteTenantSecretSlot,
  readTenantSecretSlot,
  writeTenantSecretSlot,
} from "../../tenant-secrets/slot";
import { getTenantScope } from "./tenant-scope";

/**
 * THE OWNER STORES HER OWN MARKETPLACE KEY (w24-integration-keys-self-service).
 *
 * Ivan's order of 2026-09-16 11:37 WITA: «мы делаем SaaS-продукт, пользователи
 * должны иметь возможность указать свои ключи для всех сервисов». Until this
 * task a Wildberries or Ozon key reached a shop only through a seed script run
 * by us, and the panel printed that command at the owner — a shop owner never
 * opens a terminal, so the product simply could not be connected by the person
 * who owns it.
 *
 * ONE HANDLER FOR EVERY MARKETPLACE. The fields, the slot and the labels come
 * from the adapter (`credentialFields`, `credentialSlot`), so registering a
 * third marketplace gives it a working form with nothing added here and
 * nothing added in the panel (rule 20). `/tenants/wb/key` and
 * `/tenants/ozon/key` are the same two functions under the names the task
 * names; `/tenants/marketplaces/:marketplace/key` is the general one.
 *
 * WHAT NEVER LEAVES THIS FILE: the value. The response is the read-back state
 * — `{ set, last4 }` per secret field plus what the key says about itself —
 * and an error message names the FIELD, never its content, so a key cannot
 * reach a log, `mp_api_call`, `wb_api_call` or an exception through a message
 * this route wrote. `integration-tests/http/tenants-marketplace-keys.spec.ts`
 * greps the captured stdout and every response body for the literal.
 *
 * THE READ-ONLY INVARIANT (Ivan, 2026-09-16 02:46 WITA) holds structurally: a
 * write slot is not an adapter member at all, `guards.ts` refuses one in
 * `credentialSlot`, and this handler writes `adapter.credentialSlot` and
 * nothing else. A key that happens to carry write rights is stored and USED
 * FOR READS; the panel says so rather than refusing the key, because refusing
 * it would send the owner back to Wildberries to mint a second token for no
 * gain.
 */

/** The body: one string per declared field. Unknown keys are refused by the validator. */
export type MarketplaceKeyBody = Record<string, string>;

type FieldView = {
  name: string;
  label: string;
  secret: boolean;
  hint: string;
  doc_url: string;
  /** The stored value of a NON-secret field (Ozon's Client-Id). `null` for a secret. */
  value: string | null;
  /** `{ set, last4 }` of a secret field. `null` for a non-secret one. */
  masked: { set: boolean; last4: string | null } | null;
};

export type MarketplaceKeyResponse = {
  marketplace: string;
  label: string;
  connection: {
    key: { set: boolean; last4: string | null };
    is_enabled: boolean;
    how_to_store: string;
  };
  fields: FieldView[];
  /** What the key says about itself, asked on every read. `null` when no key is stored. */
  credentials: {
    expires_at: string | null;
    expired: boolean | null;
    expires_in_days: number | null;
    expiring_soon: boolean;
    read_only: boolean | "unknown";
    read_only_source: string | null;
    scopes: Array<{ name: string; granted: boolean }>;
    error: string | null;
  } | null;
};

/**
 * The field whose value IS the key: the first secret one. `{ set, last4 }` of
 * the card comes from it, the same value `readCredentials` reports, so the
 * card and this route can never disagree about whether a shop is connected.
 */
const keyFieldOf = (adapter: MarketplaceAdapter): CredentialField =>
  adapter.credentialFields.find((field) => field.secret) ?? adapter.credentialFields[0];

/**
 * The adapter's slot, checked against the column's own CHECK constraint before
 * anything is written.
 *
 * `credentialSlot` is a `string` in the contract because the marketplace core
 * does not import the tenant model. The constraint is real, though: the model
 * renders `TENANT_INTEGRATION_PROVIDERS` as a CHECK, and a slot missing from
 * it fails at INSERT with every typecheck and test green — measured on the
 * local stand on 2026-09-16 for `wildberries_write`. So the narrowing happens
 * here, loudly, and `adapters-conform.unit.spec.ts` proves both registered
 * adapters pass it without a request.
 */
const slotOf = (adapter: MarketplaceAdapter): TenantIntegrationProvider => {
  const slot = adapter.credentialSlot as TenantIntegrationProvider;
  if (!TENANT_INTEGRATION_PROVIDERS.includes(slot)) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Маркетплейс ${adapter.id} объявил слот ${adapter.credentialSlot}, которого нет в ` +
        `tenant_integration_secret.provider (${TENANT_INTEGRATION_PROVIDERS.join(", ")}).`,
    );
  }
  return slot;
};

const storedCredentials = async (
  req: AuthenticatedMedusaRequest,
  adapter: MarketplaceAdapter,
  tenantId: string,
): Promise<{ credentials: Record<string, unknown>; isEnabled: boolean } | null> => {
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const slot = await readTenantSecretSlot(pg, tenantId, slotOf(adapter), {
    includeDisabled: true,
  });
  return slot ? { credentials: slot.credentials, isEnabled: slot.is_enabled } : null;
};

/**
 * The whole state, assembled once. `PUT` and `DELETE` answer with it too, so
 * the panel never restates its own request as a result (rule 20a: a report is
 * a read-back).
 */
const readState = async (
  req: AuthenticatedMedusaRequest,
  adapter: MarketplaceAdapter,
): Promise<MarketplaceKeyResponse> => {
  const tenant = await getTenantScope(req);
  const stored = await storedCredentials(req, adapter, tenant.id);
  const values = stored?.credentials ?? {};

  /**
   * Asking costs one request on Ozon and nothing on Wildberries, and it is the
   * point of the screen: the owner has just typed a key and needs to see what
   * it may do. A key that was never stored is not asked anything — an absent
   * credential has no verdict (rule 20a).
   */
  const facts = stored ? await adapter.inspectCredentials(values) : null;

  const keyField = keyFieldOf(adapter);
  const keyValue = values[keyField.name];

  return {
    marketplace: adapter.id,
    label: adapter.label,
    connection: {
      key: maskSecret(typeof keyValue === "string" ? keyValue : null),
      is_enabled: stored?.isEnabled ?? false,
      how_to_store: adapter.credentialHowTo,
    },
    fields: adapter.credentialFields.map((field) => {
      const value = values[field.name];
      const text = typeof value === "string" ? value : null;
      return {
        name: field.name,
        label: field.label,
        secret: field.secret,
        hint: field.hint,
        doc_url: field.docUrl,
        value: field.secret ? null : text,
        masked: field.secret ? maskSecret(text) : null,
      };
    }),
    credentials: facts
      ? {
          expires_at: facts.expiresAt,
          expired: facts.expired,
          expires_in_days: facts.expiresInDays,
          expiring_soon: facts.expiringSoon,
          read_only: facts.readOnly,
          read_only_source: facts.readOnlySource,
          scopes: facts.scopes,
          error: facts.error,
        }
      : null,
  };
};

/**
 * The credentials to store, built from the adapter's field list and the body.
 *
 * A SECRET field left empty keeps its stored value, the same rule the
 * Robokassa form follows: the owner sees «сохранён ••••1234» and must not have
 * to retype a key she cannot read to change the field next to it. A non-secret
 * field is required every time, because there is nothing to keep secret about
 * it and an empty one is a real absence.
 *
 * Pure: takes what is stored and what was typed, returns what to write or what
 * is missing. That is what makes it testable without a database, and the HTTP
 * spec then only has to prove the wiring.
 */
export const buildCredentials = (
  fields: readonly CredentialField[],
  previous: Record<string, unknown>,
  body: MarketplaceKeyBody,
): { credentials: Record<string, string>; missing: CredentialField[] } => {
  const credentials: Record<string, string> = {};
  const missing: CredentialField[] = [];

  for (const field of fields) {
    const typed = typeof body[field.name] === "string" ? body[field.name].trim() : "";
    const kept = field.secret && typeof previous[field.name] === "string"
      ? (previous[field.name] as string)
      : "";
    const value = typed || kept;
    if (!value) {
      missing.push(field);
      continue;
    }
    credentials[field.name] = value;
  }

  return { credentials, missing };
};

/** The body keys this marketplace accepts, for the validator and the 400. */
export const allowedKeys = (adapter: MarketplaceAdapter): string[] =>
  adapter.credentialFields.map((field) => field.name);

export const putMarketplaceKey = async (
  req: AuthenticatedMedusaRequest<MarketplaceKeyBody>,
  res: MedusaResponse,
  marketplaceId: string,
) => {
  const adapter = requireAdapter(marketplaceId);
  const body = (req.validatedBody ?? {}) as MarketplaceKeyBody;
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);

  const unknown = Object.keys(body).filter((key) => !allowedKeys(adapter).includes(key));
  if (unknown.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${adapter.label}: неизвестные поля ${unknown.join(", ")}. Принимаются: ${allowedKeys(adapter).join(", ")}.`,
    );
  }

  const stored = await storedCredentials(req, adapter, tenant.id);
  const { credentials, missing } = buildCredentials(
    adapter.credentialFields,
    stored?.credentials ?? {},
    body,
  );

  if (missing.length) {
    // The FIELD, never its content: an error message is the shortest path from
    // a secret to a log file.
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${adapter.label}: заполните ${missing.map((field) => `«${field.label}»`).join(", ")}.`,
    );
  }

  /**
   * Saving a key switches the integration on. The owner has just typed a
   * credential; leaving the row disabled would show «ключ сохранён» next to a
   * shop that reads nothing, and the form has no switch to explain it.
   */
  await writeTenantSecretSlot(pg, tenantModule, {
    tenantId: tenant.id,
    provider: slotOf(adapter),
    credentials,
    isEnabled: true,
  });

  res.json(await readState(req, adapter));
};

export const deleteMarketplaceKey = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  marketplaceId: string,
) => {
  const adapter = requireAdapter(marketplaceId);
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = req.scope.resolve<TenantModuleService>(TENANT_MODULE);

  await deleteTenantSecretSlot(pg, tenantModule, tenant.id, slotOf(adapter));

  res.json(await readState(req, adapter));
};

export const getMarketplaceKey = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  marketplaceId: string,
) => {
  res.json(await readState(req, requireAdapter(marketplaceId)));
};
