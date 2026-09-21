import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import {
  InventoryLevelWorkflowEvents,
  ReservationItemWorkflowEvents,
} from "@medusajs/framework/utils";
import { notifyStorefrontRevalidate } from "../storefront-revalidate";

type IdPayload = { id?: string };

/**
 * The storefront caches `+variants.inventory_quantity` with `force-cache`
 * (`apps/storefront/src/lib/data/products.ts`), and that quantity is the stocked
 * amount minus the reservations. So a level edited in the Admin and a
 * reservation made by a placed order both change what a product page has to
 * show, and neither is a `product.*` event.
 *
 * These are the workflow events, the same family `product-updated.ts` listens
 * to. Core flows emit them on every path that matters here: the Admin's stock
 * edits (`update-`, `batch-`, `create-` and `delete-inventory-levels`) and
 * `complete-cart`, which emits `reservation-item.created`. The inventory
 * module's own `inventory.*` events fire for the same writes, so listening to
 * both families would clear the cache twice.
 *
 * Core flows hand these events a list of ids, so the payload is read in either
 * shape. The id only names the change in the log line.
 */
export default async function inventoryUpdatedHandler({
  event,
}: SubscriberArgs<IdPayload | IdPayload[]>) {
  const first = Array.isArray(event.data) ? event.data[0] : event.data;

  await notifyStorefrontRevalidate({ type: event.name, id: first?.id });
}

export const config: SubscriberConfig = {
  event: [
    InventoryLevelWorkflowEvents.CREATED,
    InventoryLevelWorkflowEvents.UPDATED,
    InventoryLevelWorkflowEvents.DELETED,
    ReservationItemWorkflowEvents.CREATED,
    ReservationItemWorkflowEvents.UPDATED,
    ReservationItemWorkflowEvents.DELETED,
  ],
};
