import type { IFulfillmentModuleService, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { defaultMethodNames, matchesKnownDefaultName } from "./default-method-names";
import { syncShippingOptionType } from "./option-type";
import { isTenantMethodData, type TenantMethodData } from "./tariff";

type OptionRow = {
  id: string;
  name: string;
  data: unknown;
  type?: { id?: string | null } | null;
};

/**
 * Renames the still-default shipping methods (pickup, courier) among
 * `serviceZoneIds` to the copy of `locale` — the container-level half of the
 * fix for f06's nit: those names used to follow the deployment's own
 * `STOREFRONT_DEFAULT_LOCALE`, one value shared by every tenant on the
 * backend, regardless of the language the shop actually sells in.
 *
 * Only a method whose name STILL matches one of the copies
 * `default-method-names.ts` mints for some locale is touched
 * (`matchesKnownDefaultName`) — a method the owner has already renamed keeps
 * her name. Price and tariff are untouched; this is a name/description/
 * delivery-hint relocalization only, so a courier the owner repriced but
 * never renamed still gets relocalized copy without losing her price. An
 * option with no tenant-method `data` yet (provisioned before tariffs
 * existed) is left alone rather than guessed at.
 *
 * Called from `api/tenants/locale-settings/route.ts` (`PUT`, request-scoped
 * to the tenant behind the token) and from fixtures/scripts that already know
 * a tenant's `service_zone_ids` without a request. Returns how many options
 * were relocalized, for the caller to log.
 */
export const relocalizeDefaultShippingMethods = async (
  container: MedusaContainer,
  serviceZoneIds: string[],
  locale: string,
): Promise<number> => {
  if (!serviceZoneIds.length) {
    return 0;
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillment: IFulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const names = defaultMethodNames(locale);

  const { data: rows } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "data", "type.id"],
    filters: { service_zone_id: serviceZoneIds },
  });

  const updates: {
    id: string;
    name: string;
    data: TenantMethodData;
    type_id: string | null;
    type: { label: string; description: string; code: "pickup" | "courier" };
  }[] = [];

  for (const row of rows as unknown as OptionRow[]) {
    const kind = matchesKnownDefaultName(row.name);
    const existing = isTenantMethodData(row.data) ? row.data : null;
    if (!kind || !existing) {
      continue;
    }
    const human = names[kind];
    updates.push({
      id: row.id,
      name: human.name,
      data: { ...existing, description: human.description, delivery_hint: human.delivery_hint },
      type_id: row.type?.id ?? null,
      type: { label: human.name, description: human.description, code: kind },
    });
  }

  if (!updates.length) {
    return 0;
  }

  await updateShippingOptionsWorkflow(container).run({
    input: updates.map(({ type_id: _typeId, ...update }) => update),
  });

  // `updateShippingOptionsWorkflow` never writes the nested `type`
  // (`shipping-tariffs/option-type.ts`), so the row is rewritten here too.
  for (const update of updates) {
    await syncShippingOptionType(fulfillment, update.type_id, update.type);
  }

  return updates.length;
};
