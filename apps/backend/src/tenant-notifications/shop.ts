import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { STORE_EMAIL, STORE_NAME, STOREFRONT_URL } from "../emails/i18n";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { shopOrigin } from "./storefront-origin";

/**
 * WHO an order belongs to, as every notification needs it
 * (t08-order-notifications). One resolver for both channels, so the shop a
 * customer's e-mail links to and the shop whose owner hears about the order in
 * Telegram can never be two different shops.
 *
 * Nothing here throws. A shop that cannot be resolved (an order placed in a
 * sales channel no tenant owns — the single-store install this starter also
 * ships as) falls back to the platform's own `STORE_*` and `STOREFRONT_URL`,
 * which is exactly what the code did before tenants existed.
 */

export type ShopNotificationSettings = {
  id: string;
  email_from_name: string | null;
  email_reply_to: string | null;
  telegram_chat_id: string | null;
  telegram_chat_title: string | null;
  telegram_linked_at: Date | null;
  link_code: string | null;
  link_code_expires_at: Date | null;
};

export type ShopIdentity = {
  /** `null` on a single-store install, or when the order's channel belongs to nobody. */
  tenantId: string | null;
  handle: string | null;
  /** What the letter signs itself with and what the owner's message calls the shop. */
  name: string;
  /** The shop's OWN public origin, never the engine's (`storefront-origin.ts`). */
  storefrontUrl: string;
  /** Shown in the e-mail footer and used as `Reply-To` when the owner set one. */
  contactEmail: string;
  replyTo: string | null;
  fromName: string;
  settings: ShopNotificationSettings | null;
};

const platformShop = (): ShopIdentity => ({
  tenantId: null,
  handle: null,
  name: STORE_NAME,
  storefrontUrl: STOREFRONT_URL.replace(/\/$/, ""),
  contactEmail: STORE_EMAIL,
  replyTo: null,
  fromName: STORE_NAME,
  settings: null,
});

const settingsService = (container: MedusaContainer): TenantModuleService =>
  container.resolve<TenantModuleService>(TENANT_MODULE);

/**
 * The shop's settings row, or `null` when it has never been opened in the
 * panel. Absence is a state of its own: it means "the owner has configured
 * nothing", not "the shop does not exist".
 */
export const readSettings = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<ShopNotificationSettings | null> => {
  const rows = await settingsService(container).listTenantNotificationSettings({
    tenant_id: tenantId,
  });

  return (rows[0] as ShopNotificationSettings | undefined) ?? null;
};

/** Creates the row on first use, so a caller never has to branch on its absence. */
export const ensureSettings = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<ShopNotificationSettings> => {
  const existing = await readSettings(container, tenantId);

  if (existing) {
    return existing;
  }

  const created = await settingsService(container).createTenantNotificationSettings({
    tenant_id: tenantId,
  });

  return (Array.isArray(created) ? created[0] : created) as ShopNotificationSettings;
};

type TenantRow = {
  id: string;
  name?: string;
  handle?: string;
  domains?: Array<{ host?: string; is_primary?: boolean }> | null;
};

const identityFor = async (
  container: MedusaContainer,
  tenant: TenantRow | null,
): Promise<ShopIdentity> => {
  if (!tenant?.id || !tenant.handle) {
    return platformShop();
  }

  const settings = await readSettings(container, tenant.id);
  const primaryDomain =
    tenant.domains?.find((domain) => domain.is_primary && domain.host)?.host ?? null;
  const name = tenant.name || STORE_NAME;

  return {
    tenantId: tenant.id,
    handle: tenant.handle,
    name,
    storefrontUrl: shopOrigin({ handle: tenant.handle, primaryDomain }),
    contactEmail: settings?.email_reply_to || STORE_EMAIL,
    replyTo: settings?.email_reply_to ?? null,
    fromName: settings?.email_from_name || name,
    settings,
  };
};

const TENANT_FIELDS = [
  "tenant.id",
  "tenant.name",
  "tenant.handle",
  "tenant.domains.host",
  "tenant.domains.is_primary",
];

/**
 * The shop an ORDER was placed in, walked through the `tenant-order` link the
 * `order.placed` subscriber writes (`src/links/tenant-order.ts`). An order
 * whose link is not written yet resolves to the platform shop, and the letter
 * still goes out — a missing link must not cost the customer their confirmation.
 */
export const resolveShopForOrder = async (
  container: MedusaContainer,
  orderId: string,
): Promise<ShopIdentity> => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", ...TENANT_FIELDS],
      filters: { id: orderId },
    });

    const tenant = (data[0] as { tenant?: TenantRow | TenantRow[] } | undefined)?.tenant;
    const row = Array.isArray(tenant) ? (tenant[0] ?? null) : (tenant ?? null);

    return await identityFor(container, row);
  } catch (error) {
    // A shop that cannot be read is a defect worth a log line, never a reason
    // to drop the notification: the platform identity still produces a valid
    // letter (rule 20a — a swallowed failure has to surface).
    logger.warn(
      `[tenant-notifications] Could not resolve the shop of order ${orderId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return platformShop();
  }
};

/** The same identity, for a caller that already knows the tenant (the panel's test message). */
export const resolveShopForTenant = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<ShopIdentity> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "tenant",
    fields: ["id", "name", "handle", "domains.host", "domains.is_primary"],
    filters: { id: tenantId },
  });

  return identityFor(container, (data[0] as TenantRow | undefined) ?? null);
};
