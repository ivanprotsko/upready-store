import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import {
  defaultCourierAmount,
  defaultMethodNames,
  homeCountryForLocale,
  isMachineMadeDefaultName,
  LEGACY_COURIER_AMOUNT,
  storeDefaultLocale,
} from "../shipping-tariffs/default-method-names";
import {
  isTenantMethodData,
  PROVISIONED_DEFAULT_TARIFF,
  TENANT_METHOD_SCHEMA,
  type TenantMethodData,
} from "../shipping-tariffs/tariff";

/**
 * Renames the machine-made defaults of EXISTING tenants («<Shop> pickup» /
 * «<Shop> courier», written by the first cut of `provisionTenantWarehouseWorkflow`)
 * to the human names new tenants now get («Самовывоз» / «Курьером» for ru),
 * gives them the buyer-facing description the checkout shows under the name,
 * and stamps the tenant-method `data` on them so /shipping lists them.
 *
 * A courier default still priced at the workflow's old placeholder (10 in
 * every currency, which reached a Russian checkout as «10,00 ₽») is repriced
 * to `defaultCourierAmount(currency)` and marked `tariff_source:
 * "provisioned-default"`, so the panel asks the owner to confirm it. Nothing
 * else is repriced and nothing is deleted; an option the owner already renamed
 * or edited is left alone — its name no longer matches the machine pattern, or
 * its `data` already carries her own tariff. Idempotent.
 *
 *   npx medusa exec ./src/scripts/rename-default-shipping-methods.ts
 *   LOCALE=en npx medusa exec ./src/scripts/rename-default-shipping-methods.ts
 *
 * The backend runs it on every boot (`docker-entrypoint.sh`), so a deploy
 * converges the shops provisioned by an older image without anyone
 * remembering to.
 */
export default async function renameDefaultShippingMethods({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const locale = process.env.LOCALE ?? storeDefaultLocale();
  const names = defaultMethodNames(locale);

  // The shop's own currency, the one the panel shows a tariff in: the currency
  // of the region covering the country this locale ships from (ru → ru → rub).
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["currency_code", "countries.iso_2"],
  });
  const homeCountry = homeCountryForLocale(locale);
  const homeCurrency =
    (regions.find((region) =>
      ((region.countries ?? []) as { iso_2?: string }[]).some((country) => country?.iso_2 === homeCountry),
    )?.currency_code as string | undefined) ??
    (regions[0]?.currency_code as string | undefined) ??
    "usd";

  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "name", "sales_channel.id", "sales_channel.stock_locations.fulfillment_sets.service_zones.id"],
  });

  let renamed = 0;
  let repriced = 0;
  for (const tenant of tenants) {
    type Loc = { fulfillment_sets?: { service_zones?: { id: string }[] }[] };
    const zoneIds = ((tenant.sales_channel?.stock_locations ?? []) as Loc[]).flatMap((location) =>
      (location.fulfillment_sets ?? []).flatMap((set) => (set.service_zones ?? []).map((zone) => zone.id)),
    );
    if (!zoneIds.length) {
      continue;
    }
    const { data: options } = await query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "data", "prices.currency_code", "prices.amount"],
      filters: { service_zone_id: zoneIds },
    });

    const updates = options
      .map((option) => {
        const kind = isMachineMadeDefaultName(option.name as string, tenant.name as string);
        if (!kind) {
          return null;
        }
        const human = names[kind];
        const sortOrder = kind === "pickup" ? 0 : 1;
        const existing = isTenantMethodData(option.data) ? option.data : null;
        // `prices` is a pricing-module link the generated ShippingOption type does not carry.
        const prices = (option as unknown as { prices?: { currency_code?: string | null; amount?: number | null }[] | null })
          .prices;
        const priceRows = (prices ?? []).map((price) => ({
          currency_code: String(price.currency_code ?? ""),
          amount: Number(price.amount ?? 0),
        }));
        const homeAmount = Number(
          priceRows.find((price) => price.currency_code === homeCurrency)?.amount ?? priceRows[0]?.amount ?? 0,
        );
        // The old placeholder: the same 10 in every currency, nobody has
        // touched it (no tenant-method `data` means it was never saved from
        // the panel). That is the «10,00 ₽ courier» this script exists to end.
        const isUntouchedPlaceholder =
          kind === "courier" &&
          !existing &&
          priceRows.length > 0 &&
          priceRows.every((price) => price.amount === LEGACY_COURIER_AMOUNT);
        const amount = isUntouchedPlaceholder ? defaultCourierAmount(homeCurrency) : homeAmount;
        const data: TenantMethodData = existing ?? {
          schema: TENANT_METHOD_SCHEMA,
          tariff: { kind: "flat", amount },
          description: human.description,
          delivery_hint: human.delivery_hint,
          sort_order: sortOrder,
          default_weight_g: 500,
          own_zone: false,
          zone: null,
          ...(isUntouchedPlaceholder ? { tariff_source: PROVISIONED_DEFAULT_TARIFF } : {}),
        };
        if (isUntouchedPlaceholder) {
          repriced += 1;
        }
        return {
          id: option.id as string,
          name: human.name,
          type: { label: human.name, description: human.description, code: kind },
          data,
          ...(isUntouchedPlaceholder
            ? {
                prices: priceRows.map((price) => ({
                  currency_code: price.currency_code,
                  amount: defaultCourierAmount(price.currency_code),
                })),
              }
            : {}),
        };
      })
      .filter((update): update is NonNullable<typeof update> => update !== null);

    if (updates.length) {
      await updateShippingOptionsWorkflow(container).run({ input: updates });
      renamed += updates.length;
      logger.info(`[rename-default-shipping-methods] ${tenant.name}: ${updates.map((u) => u.name).join(", ")}`);
    }
  }

  logger.info(
    `[rename-default-shipping-methods] renamed ${renamed} options across ${tenants.length} tenants, ${repriced} courier defaults repriced from the ${LEGACY_COURIER_AMOUNT} placeholder`,
  );
}
