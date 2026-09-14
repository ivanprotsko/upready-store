import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { STORE_EMAIL, STORE_NAME, STOREFRONT_URL } from "../emails/i18n";
import tenantSalesChannelLink from "../links/tenant-sales-channel";
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
  /**
   * The shop's OWN default language (`tenant_locale_settings.default_locale`,
   * t06-locale-currency), or `null` when it has never picked one. The owner's
   * Telegram message is written in it; the deployment's
   * `STOREFRONT_DEFAULT_LOCALE` is the fallback.
   */
  defaultLocale: string | null;
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
  defaultLocale: null,
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
  locale_settings?: { default_locale?: string | null } | null;
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
    defaultLocale: tenant.locale_settings?.default_locale ?? null,
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
  "id",
  "name",
  "handle",
  "domains.host",
  "domains.is_primary",
  "locale_settings.default_locale",
];

const tenantById = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<TenantRow | null> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "tenant",
    fields: TENANT_FIELDS,
    filters: { id: tenantId },
  });

  return (data[0] as TenantRow | undefined) ?? null;
};

/**
 * The shop an ORDER was placed in, found through its SALES CHANNEL — the same
 * road `linkOrderToTenantStep` walks, and for the same reason: a shop owns its
 * channel from the moment it is created, so the answer is there before the
 * order exists.
 *
 * Why not the `tenant-order` link: that link is written by a SIBLING subscriber
 * of the same `order.placed` event (`order-placed-tenant-link.ts`). Two
 * subscribers of one event run concurrently, so reading it here is a race — and
 * a race whose losing side is silent, because an unresolved shop still produces
 * a perfectly valid letter with the wrong links in it. Measured on the seam
 * test 2026-09-15: every letter of the first run carried
 * `http://localhost:8061/account/orders`, the engine's own address, instead of
 * the shop's `http://acme.localhost:8061/...`.
 *
 * An order in a channel no tenant owns (staff orders, the seed profile's own
 * channel) resolves to the platform shop, and the letter still goes out.
 */
export const resolveShopForOrder = async (
  container: MedusaContainer,
  orderId: string,
): Promise<ShopIdentity> => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "sales_channel_id"],
      filters: { id: orderId },
    });

    const salesChannelId = (orders[0] as { sales_channel_id?: string | null } | undefined)
      ?.sales_channel_id;

    if (!salesChannelId) {
      return platformShop();
    }

    const { data: owners } = await query.graph({
      entity: tenantSalesChannelLink.entryPoint,
      fields: ["tenant_id"],
      filters: { sales_channel_id: salesChannelId },
    });

    const tenantId = (owners[0] as { tenant_id?: string } | undefined)?.tenant_id;

    return await identityFor(container, tenantId ? await tenantById(container, tenantId) : null);
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
): Promise<ShopIdentity> => identityFor(container, await tenantById(container, tenantId));
