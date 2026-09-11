import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, deduplicate } from "@medusajs/framework/utils";
import { assertOwnedOrder } from "../../helpers";

type OrderItemRow = {
  item_id: string;
  version: number;
  history?: { version: { from: number; to: number } };
  [key: string]: unknown;
};

/**
 * `GET /tenants/orders/:id/line-items` — the order's items across every
 * version, deduplicated to the newest row per item with a `history.version`
 * range attached. Mirrors
 * `@medusajs/medusa/dist/api/admin/orders/[id]/line-items/route.js` line for
 * line; the dedup loop is the Admin's, not ours.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  await assertOwnedOrder(req, id);

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const result = await query.graph({
    entity: "order_items",
    // `order_id` is how the Admin filters this entry point
    // (`dist/api/admin/orders/[id]/line-items/route.js`), but the entity map
    // Medusa generates into `.medusa/types` types `RemoteQueryFilters<"order_items">`
    // without it, so the object is cast rather than the filter dropped.
    filters: {
      ...req.filterableFields,
      order_id: id,
    } as Parameters<typeof query.graph>[0]["filters"],
    fields: deduplicate((req.queryConfig.fields ?? []).concat(["item_id", "version"])),
  });

  const data = result.data as unknown as OrderItemRow[];
  const deduplicatedItems: Record<string, OrderItemRow> = {};

  for (const item of data) {
    const itemId = item.item_id;
    const version = item.version;

    if (!deduplicatedItems[itemId]) {
      deduplicatedItems[itemId] = {
        ...item,
        history: { version: { from: version, to: version } },
      };
      continue;
    }

    const history = deduplicatedItems[itemId].history!;
    history.version.to = Math.max(version, history.version.to);
    history.version.from = Math.min(version, history.version.from);

    if (version > deduplicatedItems[itemId].version) {
      deduplicatedItems[itemId] = { ...item, history };
    }
  }

  res.json({ order_items: Object.values(deduplicatedItems) });
};
