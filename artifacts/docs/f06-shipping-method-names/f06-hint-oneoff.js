"use strict";
/**
 * ONE-OFF data operation, round 2 of f06-shipping-method-names (приёмка PR #45, находка 1).
 *
 * The pickup card's hint «Адрес и время пришлём после заказа» wraps onto two
 * lines in a 180 px card and pushes «Бесплатно» against it. The repository now
 * writes the shorter «Адрес пришлём после заказа», and this brings the shops
 * already renamed by the first pass in step with it.
 *
 * Narrow on purpose: it touches an option ONLY when its `delivery_hint` is
 * still, character for character, the string the first pass wrote. A hint the
 * owner typed herself never matches, so hers is never overwritten. Idempotent:
 * once rewritten, the old string is gone and a second run finds nothing.
 *
 *   docker cp f06-hint-oneoff.js mt-backend:/app/src/scripts/f06-hint-oneoff.js
 *   docker exec -e TENANT=cherkashino mt-backend node_modules/.bin/medusa exec ./src/scripts/f06-hint-oneoff.js
 *   docker exec mt-backend rm /app/src/scripts/f06-hint-oneoff.js
 */
const { ContainerRegistrationKeys } = require("@medusajs/framework/utils");
const { updateShippingOptionsWorkflow } = require("@medusajs/medusa/core-flows");

const TENANT_METHOD_SCHEMA = "upready.shipping-method/v1";
const OLD_HINT = "Адрес и время пришлём после заказа";
const NEW_HINT = "Адрес пришлём после заказа";

const isTenantMethodData = (data) =>
  typeof data === "object" && data !== null && data.schema === TENANT_METHOD_SCHEMA && typeof data.tariff === "object";

module.exports.default = async function f06HintOneOff({ container }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const only = (process.env.TENANT || "").trim().toLowerCase();

  const { data: allTenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "name", "handle", "sales_channel.stock_locations.fulfillment_sets.service_zones.id"],
  });
  const tenants = only
    ? allTenants.filter((t) => String(t.handle || "").toLowerCase() === only || String(t.id || "").toLowerCase() === only)
    : allTenants;

  let rewritten = 0;
  for (const tenant of tenants) {
    const zoneIds = ((tenant.sales_channel && tenant.sales_channel.stock_locations) || []).flatMap((location) =>
      (location.fulfillment_sets || []).flatMap((set) => (set.service_zones || []).map((zone) => zone.id)),
    );
    if (!zoneIds.length) continue;

    const { data: options } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "data"],
      filters: { service_zone_id: zoneIds },
    });

    const updates = options
      .filter((option) => isTenantMethodData(option.data) && option.data.delivery_hint === OLD_HINT)
      .map((option) => ({ id: option.id, data: { ...option.data, delivery_hint: NEW_HINT } }));

    if (updates.length) {
      await updateShippingOptionsWorkflow(container).run({ input: updates });
      rewritten += updates.length;
      logger.info(`[f06-hint-oneoff] ${tenant.name}: ${updates.length} hint(s) shortened`);
    }
  }

  logger.info(
    `[f06-hint-oneoff] ${rewritten} hints rewritten across ${tenants.length} tenants${only ? ` (TENANT=${only})` : ""}`,
  );
};
