import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * The tenant's language and currency defaults (t06-locale-currency): which
 * storefront locale a visitor with no pick of their own lands on, which of the
 * 36 shipped locales the switcher offers for THIS shop, and which country (and
 * therefore which Medusa region, and therefore which currency) prices open in.
 * One row per tenant, absent for a shop that has never saved these — the
 * storefront then falls back to the deployment's own `STOREFRONT_DEFAULT_LOCALE`
 * / `LOCALE_PIN` / `LOCALE_COUNTRY_MAP`, which is exactly today's single-image
 * behaviour.
 *
 * Kept as its own document rather than folded into `tenant_home_config`: the
 * home document is replaced whole on every `PUT /tenants/home`, and coupling it
 * to language/currency would mean a home-page edit could silently wipe a
 * locale pick made through a different screen.
 */
const TenantLocaleSettings = model.define("tenant_locale_settings", {
  id: model.id({ prefix: "tloc" }).primaryKey(),
  /** One of the 36 storefront locale codes (`LOCALE_CODES` in `validators.ts`). */
  default_locale: model.text(),
  /** A non-empty subset of the 36 codes, always containing `default_locale`. */
  enabled_locales: model.json(),
  /**
   * Two-letter ISO country code the shop's `default_locale` prices in, e.g.
   * `"ru"` for roubles. Null falls back to the deployment's own
   * `LOCALE_COUNTRY_MAP` entry for that locale, or to region detection.
   */
  default_country: model.text().nullable(),
  tenant: model.belongsTo(() => Tenant, {
    mappedBy: "locale_settings",
  }),
});

export default TenantLocaleSettings;
