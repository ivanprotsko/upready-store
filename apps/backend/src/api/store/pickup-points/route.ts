import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { SEED_PICKUP_POINTS } from "../../../migration-scripts/data/pickup-points";

/**
 * `GET /store/pickup-points` — a general-purpose read of the active
 * profile's pickup-point list (name, address, opening hours), one row per
 * `"pickup"`-type stock location `lib/fulfillment.ts`'s `seedFulfillment()`
 * seeds for this profile.
 *
 * NOT used by the checkout flow (`checkout-shipping-section`,
 * `checkout-pickup-point-sheet`): each pickup point is its own shipping
 * option (a `fulfillment_set` links 1:1 to a stock location, so N points
 * need N options — see `seedFulfillment()`'s own doc comment), and the
 * checkout page has already fetched that list (`GET /store/shipping-
 * options`, widened `fields`, `lib/data/fulfillment.ts`) to render the
 * shipping-method cards in the first place — deriving points from it
 * (`toPickupPoint`, `lib/util/fulfillment.ts`) costs one field-list change
 * and zero extra round trips, versus a second fetch here. This route's own
 * `id` is the **stock location's** id, not a shipping option's — do not
 * write it into `cart.metadata`'s `pickup_point_id` (`composition.ts`'s
 * `PICKUP_METADATA_KEYS`), which the checkout flow stamps with the chosen
 * shipping OPTION's id instead, since that is what a later
 * `setShippingMethod` call needs. Kept as a standalone, still-correct read
 * for a future consumer (an admin view, a store locator) that only needs
 * the point list, not a working cart.
 *
 * Runs behind Medusa's global publishable-key gate on `/store` (same as
 * `/store/storefront-settings`'s GET — see that route's own comment for why
 * a local `middlewares.ts` matcher could not exempt it even if this route
 * wanted to, which it doesn't: every storefront visitor may read this list).
 *
 * There is no core Store API for stock locations (`find … -iname
 * "*stock-location*"` under `api/store` in `@medusajs/medusa` → none), so
 * this route resolves the point identity from `SEED_PICKUP_POINTS` — the
 * same per-profile `data/profiles/<id>/pickup-points.json` the seed reads —
 * and joins it to the real DB row by name to pick up the seed's own
 * `stock_location.id` and the address/`opening_hours` the operator would
 * see if they edited the location directly in the admin later. A profile's
 * own point disappearing from the response (name renamed in the DB,
 * location deleted) is silent by design — `.filter(Boolean)` — rather than
 * a 500 on a demo store.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!SEED_PICKUP_POINTS.length) {
    res.status(200).json({ pickup_points: [] });
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const names = SEED_PICKUP_POINTS.map((point) => point.name);

  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: [
      "id",
      "name",
      "address.address_1",
      "address.city",
      "address.postal_code",
      "address.country_code",
      "metadata",
    ],
    filters: { name: names },
  });

  const byName = new Map(stockLocations.map((location) => [location.name, location]));

  const pickup_points = SEED_PICKUP_POINTS.map((seedPoint) => {
    const location = byName.get(seedPoint.name);
    if (!location) return null;

    const metadata = (location.metadata ?? {}) as Record<string, unknown>;
    const openingHours =
      typeof metadata.opening_hours === "string"
        ? metadata.opening_hours
        : seedPoint.opening_hours;

    return {
      id: location.id,
      name: location.name,
      address: {
        address_1: location.address?.address_1 ?? seedPoint.address.address_1,
        city: location.address?.city ?? seedPoint.address.city,
        postal_code: location.address?.postal_code ?? seedPoint.address.postal_code,
        country_code: location.address?.country_code ?? seedPoint.address.country_code,
      },
      opening_hours: openingHours,
    };
  }).filter((point): point is NonNullable<typeof point> => point !== null);

  res.status(200).json({ pickup_points });
}
