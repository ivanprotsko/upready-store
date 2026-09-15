"use strict";
/**
 * ONE-OFF data operation for the live host, 2026-09-15 (task f06-shipping-method-names).
 *
 * It is `src/scripts/rename-default-shipping-methods.ts` of this PR, inlined as
 * plain CommonJS: the image running on the host was built before the PR, so its
 * copy of the script still writes the old descriptions and leaves the courier
 * at the 10-per-currency placeholder. Copied into the container, run, removed:
 *
 *   docker cp f06-rename-oneoff.js mt-backend:/app/src/scripts/f06-rename-oneoff.js
 *   docker exec -e LOCALE=ru mt-backend node_modules/.bin/medusa exec ./src/scripts/f06-rename-oneoff.js
 *   docker exec mt-backend rm /app/src/scripts/f06-rename-oneoff.js
 *
 * Nothing is deployed, rebuilt or restarted by this: it edits rows through the
 * same `updateShippingOptionsWorkflow` the panel uses. Once the PR ships, the
 * backend's entrypoint runs the real script on every boot and finds nothing
 * left to do (the names no longer match the machine pattern).
 */
const { ContainerRegistrationKeys } = require("@medusajs/framework/utils");
const { updateShippingOptionsWorkflow } = require("@medusajs/medusa/core-flows");

const TENANT_METHOD_SCHEMA = "upready.shipping-method/v1";
const PROVISIONED_DEFAULT_TARIFF = "provisioned-default";
const LEGACY_COURIER_AMOUNT = 10;
const COURIER_AMOUNT_BY_CURRENCY = { rub: 300 };
const COURIER_AMOUNT_FALLBACK = 10;
const HOME_COUNTRY_BY_LOCALE = { ru: "ru", en: "us", de: "de", fr: "fr", es: "es", it: "it", pl: "pl", tr: "tr", uk: "ua", kk: "kz", be: "by" };

const NAMES = {
  ru: {
    pickup: { name: "Самовывоз", description: "Заберите заказ у продавца.", delivery_hint: "Адрес и время пришлём после заказа" },
    courier: { name: "Курьером", description: "До двери. Стоимость подтвердит магазин.", delivery_hint: null },
  },
  en: {
    pickup: { name: "Pickup", description: "Collect the order from the seller.", delivery_hint: "We send the address after checkout" },
    courier: { name: "Courier", description: "To your door. The shop confirms the cost.", delivery_hint: null },
  },
};

const lang = (locale) => String(locale || "").toLowerCase().split(/[-_]/)[0];
const defaultMethodNames = (locale) => NAMES[lang(locale)] || NAMES.en;
const homeCountryForLocale = (locale) => HOME_COUNTRY_BY_LOCALE[lang(locale)] || "us";
const defaultCourierAmount = (currency) =>
  COURIER_AMOUNT_BY_CURRENCY[String(currency || "").toLowerCase()] ?? COURIER_AMOUNT_FALLBACK;
const isMachineMadeDefaultName = (name, tenantName) =>
  name === `${tenantName} pickup` ? "pickup" : name === `${tenantName} courier` ? "courier" : null;
const isTenantMethodData = (data) =>
  typeof data === "object" && data !== null && data.schema === TENANT_METHOD_SCHEMA && typeof data.tariff === "object";

module.exports.default = async function f06RenameOneOff({ container }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const locale = process.env.LOCALE || process.env.STOREFRONT_DEFAULT_LOCALE || "en";
  const names = defaultMethodNames(locale);

  const { data: regions } = await query.graph({ entity: "region", fields: ["currency_code", "countries.iso_2"] });
  const homeCountry = homeCountryForLocale(locale);
  const homeCurrency =
    (regions.find((region) => (region.countries || []).some((country) => country && country.iso_2 === homeCountry)) || {})
      .currency_code ||
    (regions[0] || {}).currency_code ||
    "usd";

  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "name", "sales_channel.id", "sales_channel.stock_locations.fulfillment_sets.service_zones.id"],
  });

  let renamed = 0;
  let repriced = 0;
  for (const tenant of tenants) {
    const zoneIds = ((tenant.sales_channel && tenant.sales_channel.stock_locations) || []).flatMap((location) =>
      (location.fulfillment_sets || []).flatMap((set) => (set.service_zones || []).map((zone) => zone.id)),
    );
    if (!zoneIds.length) continue;

    const { data: options } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "data", "prices.currency_code", "prices.amount"],
      filters: { service_zone_id: zoneIds },
    });

    const updates = [];
    for (const option of options) {
      const kind = isMachineMadeDefaultName(option.name, tenant.name);
      if (!kind) continue;
      const human = names[kind];
      const existing = isTenantMethodData(option.data) ? option.data : null;
      const priceRows = (option.prices || []).map((price) => ({
        currency_code: String(price.currency_code || ""),
        amount: Number(price.amount || 0),
      }));
      const homeRow = priceRows.find((price) => price.currency_code === homeCurrency) || priceRows[0];
      const homeAmount = Number((homeRow || {}).amount || 0);
      const isUntouchedPlaceholder =
        kind === "courier" && !existing && priceRows.length > 0 && priceRows.every((p) => p.amount === LEGACY_COURIER_AMOUNT);
      const amount = isUntouchedPlaceholder ? defaultCourierAmount(homeCurrency) : homeAmount;
      const data = existing || {
        schema: TENANT_METHOD_SCHEMA,
        tariff: { kind: "flat", amount },
        description: human.description,
        delivery_hint: human.delivery_hint,
        sort_order: kind === "pickup" ? 0 : 1,
        default_weight_g: 500,
        own_zone: false,
        zone: null,
        ...(isUntouchedPlaceholder ? { tariff_source: PROVISIONED_DEFAULT_TARIFF } : {}),
      };
      if (isUntouchedPlaceholder) repriced += 1;
      updates.push({
        id: option.id,
        name: human.name,
        type: { label: human.name, description: human.description, code: kind },
        data,
        ...(isUntouchedPlaceholder
          ? { prices: priceRows.map((p) => ({ currency_code: p.currency_code, amount: defaultCourierAmount(p.currency_code) })) }
          : {}),
      });
    }

    if (updates.length) {
      await updateShippingOptionsWorkflow(container).run({ input: updates });
      renamed += updates.length;
      logger.info(`[f06-rename-oneoff] ${tenant.name}: ${updates.map((u) => u.name).join(", ")}`);
    }
  }

  logger.info(
    `[f06-rename-oneoff] renamed ${renamed} options across ${tenants.length} tenants, ${repriced} courier defaults repriced from the ${LEGACY_COURIER_AMOUNT} placeholder (home currency ${homeCurrency})`,
  );
};
