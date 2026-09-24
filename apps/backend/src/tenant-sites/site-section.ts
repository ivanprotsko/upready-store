import type { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";

/**
 * The part of a shop that makes it look and read like itself, as one plain
 * document: the `site` section of the `upready.tenant-bundle/v1` export
 * (`docs/multitenancy/tenant-bundle-format.md`) and what `clone-tenant` copies
 * into a new site of the same client (t-2026-09-24-n12,
 * `docs/multitenancy/sites-one-db-many-storefronts.md` §3.4).
 *
 * One reader (`readSiteSection`) and one writer (`applySiteSection`), so the
 * export and the clone never disagree on what a site's settings are.
 *
 * Left out on purpose, because a second site must NOT inherit them:
 * integration secrets (WB/Ozon/СДЭК/Robokassa keys are entered on each site),
 * domains, handle aliases, redirects, orders, and the Telegram link code (a
 * one-time pairing secret). The Telegram chat itself is copied: it is where
 * the owner reads new orders, and a second site of the same owner reports to
 * the same chat until the owner changes it.
 */

/** The `tenant.metadata` keys a site copies: its look, its counters, its parcel weight. */
export const SITE_METADATA_KEYS = ["branding", "analytics", "shipping_default_weight_g"] as const;

export type SiteSection = {
  metadata: Partial<Record<(typeof SITE_METADATA_KEYS)[number], unknown>>;
  locale_settings: {
    default_locale: string;
    enabled_locales: unknown;
    default_country: string | null;
  } | null;
  home_config: { config: unknown } | null;
  requisites: Record<string, unknown> | null;
  notification_settings: {
    email_from_name: string | null;
    email_reply_to: string | null;
    telegram_chat_id: string | null;
    telegram_chat_title: string | null;
  } | null;
  product_attributes: Array<{
    key: string;
    name: string;
    type: string;
    unit: string | null;
    position: number;
    category_id: string | null;
    show_on_product: boolean;
    use_as_filter: boolean;
    options: Array<{ value: string; label: string; position: number }>;
  }>;
  pages: Array<{
    key: string;
    locale: string;
    title: string;
    body: string;
    published: boolean;
    in_footer: boolean;
    footer_order: number | null;
    seo_title: string | null;
    seo_description: string | null;
  }>;
};

const REQUISITE_FIELDS = [
  "legal_name",
  "inn",
  "ogrn",
  "legal_address",
  "return_address",
  "phone",
  "phone_confirmed",
  "email",
  "dpo_email",
  "delivery_methods",
  "effective_date",
  "revision_date",
  "document_date",
  "rkn_notice_date",
  "rkn_reg_number",
  "newsletter_management_url",
  "bank_details",
] as const;

const pick = <T extends Record<string, unknown>>(row: T, keys: readonly string[]) =>
  Object.fromEntries(keys.map((key) => [key, row[key] ?? null]));

/** Reads one tenant's site section. Every part is `null` or `[]` when the shop has none. */
export const readSiteSection = async (container: MedusaContainer, tenantId: string): Promise<SiteSection> => {
  const service: TenantModuleService = container.resolve(TENANT_MODULE);

  const [tenant] = await service.listTenants({ id: tenantId });
  if (!tenant) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Tenant ${tenantId} was not found.`);
  }

  const metadata = (tenant.metadata ?? {}) as Record<string, unknown>;
  const [locale] = await service.listTenantLocaleSettings({ tenant_id: tenantId });
  const [home] = await service.listTenantHomeConfigs({ tenant_id: tenantId });
  const [requisites] = await service.listTenantRequisites({ tenant_id: tenantId });
  const [notifications] = await service.listTenantNotificationSettings({ tenant_id: tenantId });
  const attributes = await service.listTenantProductAttributes(
    { tenant_id: tenantId },
    { relations: ["options"], order: { position: "ASC" } },
  );
  const pages = await service.listTenantPages({ tenant_id: tenantId });

  return {
    metadata: Object.fromEntries(
      SITE_METADATA_KEYS.filter((key) => metadata[key] !== undefined).map((key) => [key, metadata[key]]),
    ),
    locale_settings: locale
      ? {
          default_locale: locale.default_locale,
          enabled_locales: locale.enabled_locales,
          default_country: locale.default_country ?? null,
        }
      : null,
    home_config: home ? { config: home.config } : null,
    requisites: requisites ? pick(requisites as unknown as Record<string, unknown>, REQUISITE_FIELDS) : null,
    notification_settings: notifications
      ? {
          email_from_name: notifications.email_from_name ?? null,
          email_reply_to: notifications.email_reply_to ?? null,
          telegram_chat_id: notifications.telegram_chat_id ?? null,
          telegram_chat_title: notifications.telegram_chat_title ?? null,
        }
      : null,
    product_attributes: attributes.map((attribute) => ({
      key: attribute.key,
      name: attribute.name,
      type: attribute.type,
      unit: attribute.unit ?? null,
      position: attribute.position,
      category_id: attribute.category_id ?? null,
      show_on_product: attribute.show_on_product,
      use_as_filter: attribute.use_as_filter,
      options: [...(attribute.options ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((option) => ({ value: option.value, label: option.label, position: option.position })),
    })),
    pages: pages.map((page) => ({
      key: page.key,
      locale: page.locale,
      title: page.title,
      body: page.body,
      published: page.published,
      in_footer: page.in_footer,
      footer_order: page.footer_order ?? null,
      seo_title: page.seo_title ?? null,
      seo_description: page.seo_description ?? null,
    })),
  };
};

/** What `applySiteSection` created, so a failed clone can take exactly that back. */
export type AppliedSiteSection = {
  tenant_id: string;
  previous_metadata: Record<string, unknown> | null;
  locale_settings_id: string | null;
  home_config_id: string | null;
  requisites_id: string | null;
  notification_settings_id: string | null;
  product_attribute_ids: string[];
  page_ids: string[];
};

/**
 * Writes a site section into a NEW tenant. It creates rows and never updates
 * one, so it is only safe on a tenant that has none of them yet, which is
 * what a tenant fresh out of `createTenantWorkflow` is.
 */
export const applySiteSection = async (
  container: MedusaContainer,
  tenantId: string,
  section: SiteSection,
  options: { pages: boolean },
): Promise<AppliedSiteSection> => {
  const service: TenantModuleService = container.resolve(TENANT_MODULE);
  const [tenant] = await service.listTenants({ id: tenantId });
  const previousMetadata = (tenant?.metadata ?? null) as Record<string, unknown> | null;

  const applied: AppliedSiteSection = {
    tenant_id: tenantId,
    previous_metadata: previousMetadata,
    locale_settings_id: null,
    home_config_id: null,
    requisites_id: null,
    notification_settings_id: null,
    product_attribute_ids: [],
    page_ids: [],
  };

  if (Object.keys(section.metadata).length) {
    await service.updateTenants({ id: tenantId, metadata: { ...(previousMetadata ?? {}), ...section.metadata } });
  }

  if (section.locale_settings) {
    const row = await service.createTenantLocaleSettings({
      ...section.locale_settings,
      enabled_locales: section.locale_settings.enabled_locales as Record<string, unknown>,
      tenant_id: tenantId,
    });
    applied.locale_settings_id = row.id;
  }

  if (section.home_config) {
    const row = await service.createTenantHomeConfigs({
      config: section.home_config.config as Record<string, unknown>,
      tenant_id: tenantId,
    });
    applied.home_config_id = row.id;
  }

  if (section.requisites) {
    const row = await service.createTenantRequisites({ ...section.requisites, tenant_id: tenantId });
    applied.requisites_id = row.id;
  }

  if (section.notification_settings) {
    const row = await service.createTenantNotificationSettings({
      ...section.notification_settings,
      tenant_id: tenantId,
    });
    applied.notification_settings_id = row.id;
  }

  for (const attribute of section.product_attributes) {
    const { options: attributeOptions, ...fields } = attribute;
    const row = await service.createTenantProductAttributes({
      ...fields,
      type: fields.type as never,
      tenant_id: tenantId,
    });
    applied.product_attribute_ids.push(row.id);
    if (attributeOptions.length) {
      await service.createTenantProductAttributeOptions(
        attributeOptions.map((option) => ({ ...option, attribute_id: row.id })),
      );
    }
  }

  if (options.pages && section.pages.length) {
    const rows = await service.createTenantPages(section.pages.map((page) => ({ ...page, tenant_id: tenantId })));
    applied.page_ids = rows.map((row) => row.id);
  }

  return applied;
};

/** Takes back exactly what `applySiteSection` created. */
export const revertSiteSection = async (container: MedusaContainer, applied: AppliedSiteSection) => {
  const service: TenantModuleService = container.resolve(TENANT_MODULE);

  if (applied.page_ids.length) await service.deleteTenantPages(applied.page_ids);
  if (applied.product_attribute_ids.length) await service.deleteTenantProductAttributes(applied.product_attribute_ids);
  if (applied.notification_settings_id) await service.deleteTenantNotificationSettings(applied.notification_settings_id);
  if (applied.requisites_id) await service.deleteTenantRequisites(applied.requisites_id);
  if (applied.home_config_id) await service.deleteTenantHomeConfigs(applied.home_config_id);
  if (applied.locale_settings_id) await service.deleteTenantLocaleSettings(applied.locale_settings_id);
  await service.updateTenants({ id: applied.tenant_id, metadata: applied.previous_metadata });
};
