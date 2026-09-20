import type { ExecArgs, IFulfillmentModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import {
  defaultCourierAmount,
  defaultMethodNames,
  homeCountryForLocale,
  isMachineMadeDefaultName,
  LEGACY_COURIER_AMOUNT,
  storeDefaultLocale,
} from "../shipping-tariffs/default-method-names";
import { syncShippingOptionType } from "../shipping-tariffs/option-type";
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
  const fulfillment: IFulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
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

  // `TENANT=<handle|id>` narrows the run to one shop, the way the live
  // operation on cherkashino did before the change was reviewed; without it
  // every shop with machine-made names is converged, which is what the boot
  // step is for.
  const only = (process.env.TENANT ?? "").trim().toLowerCase();
  const { data: allTenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "name", "handle", "sales_channel.id", "sales_channel.stock_locations.fulfillment_sets.service_zones.id"],
  });
  const tenants = only
    ? allTenants.filter(
        (tenant) =>
          String(tenant.handle ?? "").toLowerCase() === only || String(tenant.id ?? "").toLowerCase() === only,
      )
    : allTenants;

  let renamed = 0;
  let repriced = 0;
  let typesSynced = 0;
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
      fields: ["id", "name", "data", "type.id", "type.label", "type.description", "prices.currency_code", "prices.amount"],
      filters: { service_zone_id: zoneIds },
    });

    // An option this script already renamed on an earlier run carries the
    // human name and its own `data`; only its `type` row may still hold the
    // English copy, because `updateShippingOptionsWorkflow` never writes a
    // nested type (`shipping-tariffs/option-type.ts`). Those are converged
    // too, without touching name, price or data.
    const typeOnly: { type_id: string | null; copy: { label: string; description: string; code: string } }[] = [];

    const updates = options
      .map((option) => {
        const optionName = option.name as string;
        const typeRow = (option as unknown as { type?: { id?: string; label?: string; description?: string } | null }).type;
        const kind = isMachineMadeDefaultName(optionName, tenant.name as string);
        if (!kind) {
          const already =
            optionName === names.pickup.name ? "pickup" : optionName === names.courier.name ? "courier" : null;
          const owned = isTenantMethodData(option.data) ? option.data : null;
          if (already && owned && (typeRow?.label !== optionName || typeRow?.description !== (owned.description ?? ""))) {
            typeOnly.push({
              type_id: typeRow?.id ?? null,
              copy: { label: optionName, description: owned.description ?? "", code: already },
            });
          }
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
          type_id: ((option as unknown as { type?: { id?: string } | null }).type ?? {}).id ?? null,
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

    for (const entry of typeOnly) {
      if (await syncShippingOptionType(fulfillment, entry.type_id, entry.copy)) {
        typesSynced += 1;
      }
    }

    if (updates.length) {
      await updateShippingOptionsWorkflow(container).run({
        input: updates.map(({ type_id: _typeId, ...update }) => update),
      });
      // The workflow above ignores the nested `type`, so the row is rewritten
      // here; otherwise the option reads «Курьером» while its type still says
      // «Courier delivery.» (`shipping-tariffs/option-type.ts`).
      for (const update of updates) {
        await syncShippingOptionType(fulfillment, update.type_id, update.type);
      }
      renamed += updates.length;
      logger.info(`[rename-default-shipping-methods] ${tenant.name}: ${updates.map((u) => u.name).join(", ")}`);
    }
  }

  logger.info(
    `[rename-default-shipping-methods] renamed ${renamed} options across ${tenants.length} tenants${only ? ` (TENANT=${only})` : ""}, ${repriced} courier defaults repriced from the ${LEGACY_COURIER_AMOUNT} placeholder, ${typesSynced} type rows brought in step`,
  );
}
