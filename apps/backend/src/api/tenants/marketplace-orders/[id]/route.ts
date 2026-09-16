import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace";
import type MarketplaceModuleService from "../../../../modules/marketplace/service";
import {
  SOURCE_LABELS,
  mpOrderToRow,
  toAmount,
  type FeedSource,
} from "../../../../modules/marketplace/order-feed";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/marketplace-orders/:id` — one MARKETPLACE order, with its
 * lines, the shop product behind each line, and the status history we observed
 * (w15-mp-orders-desk).
 *
 * WHY ONLY MARKETPLACE ORDERS. A shop order already has a full card in the
 * panel, served by `GET /tenants/orders/:id` and rendered by
 * `routes/orders/order-detail`, with payments, fulfilments, the customer and
 * the timeline. Re-serving a thinner copy of it here would be a second screen
 * for the same thing, drifting from the first (rule 20). The feed links a shop
 * row straight to that screen, and this route answers a shop id with the
 * address of the one that owns it rather than with a bare 404.
 *
 * READ-ONLY, like everything in this directory: `mp_*` tables only, no
 * adapter, no endpoint id, no verb but GET.
 */

type Row = Record<string, unknown>;

const iso = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  const at = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const id = String(req.params.id);

  if (!id.startsWith("mporder_")) {
    res.status(404).json({
      message:
        "Это заказ магазина, а не площадки. Его карточка — GET /tenants/orders/" +
        `${id} (в панели: /orders/${id}).`,
      type: "not_found",
    });
    return;
  }

  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const [order] = (await mp.listMpOrders({ id, tenant_id: tenant.id })) as Row[];

  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Заказ ${id} не найден у этого магазина.`);
  }

  const marketplace = String(order.marketplace);
  const scope = { tenant_id: tenant.id, marketplace };

  const [lines, events, links, cards] = await Promise.all([
    mp.listMpOrderLines({ order_id: id }) as Promise<Row[]>,
    mp.listMpOrderStatusEvents({ order_id: id }) as Promise<Row[]>,
    mp.listMpLinks(scope) as Promise<Row[]>,
    mp.listMpProducts(scope) as Promise<Row[]>,
  ]);

  /**
   * A line names the item by the marketplace's own item id (WB `nmID`, Ozon
   * `sku`) and by the seller's article. The link to the shop's catalogue,
   * however, is keyed on the CARD's external id (`mp_product.external_id`), and
   * those two are the same number on WB but not on Ozon, where a card is a
   * `product_id` and a line is a `sku`. So the article is the second way in,
   * and both are tried before the line is called «нет в магазине».
   */
  const linkByExternal = new Map(links.map((link) => [String(link.external_id), link]));
  const cardByVendorCode = new Map<string, Row>();
  for (const card of cards) {
    if (card.vendor_code) {
      cardByVendorCode.set(String(card.vendor_code), card);
    }
  }

  const productIds = new Set<string>();
  const resolved = lines.map((line) => {
    const byExternal = line.external_id ? linkByExternal.get(String(line.external_id)) : undefined;
    const card = line.vendor_code ? cardByVendorCode.get(String(line.vendor_code)) : undefined;
    const byCard = card ? linkByExternal.get(String(card.external_id)) : undefined;
    const link = byExternal ?? byCard ?? null;

    if (link?.product_id) {
      productIds.add(String(link.product_id));
    }

    return { line, link, card: card ?? null };
  });

  /** Titles and handles of whatever the lines linked to, asked once. */
  const products = new Map<string, Row>();
  if (productIds.size) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle", "thumbnail"],
      filters: { id: [...productIds] },
    });
    for (const product of (data ?? []) as Row[]) {
      products.set(String(product.id), product);
    }
  }

  const source = marketplace as FeedSource;

  res.json({
    order: {
      ...mpOrderToRow(order as never, lines.length),
      source_label: SOURCE_LABELS[source] ?? marketplace,
      /** WB does not date its own status changes; `null` here means exactly that. */
      status_changed_at: iso(order.status_changed_at),
      synced_at: iso(order.synced_at),
      /** The raw mirror row this was computed from, for anyone chasing a number. */
      source_row_id: order.source_row_id ?? null,
    },
    lines: resolved.map(({ line, link, card }) => ({
      id: String(line.id),
      line_key: String(line.line_key),
      vendor_code: (line.vendor_code ?? null) as string | null,
      external_id: (line.external_id ?? null) as string | null,
      qty: line.qty === null || line.qty === undefined ? null : Number(line.qty),
      price: toAmount(line.price),
      discount: toAmount(line.discount),
      /** The card of this item on the marketplace, when the card import has run. */
      marketplace_title: (card?.title ?? null) as string | null,
      /**
       * `null` means the article has no product in this shop. The screen says
       * «нет в магазине» and shows the article, so the owner can see WHICH
       * article is missing rather than an empty cell (rule 20a).
       */
      product: link?.product_id
        ? {
            id: String(link.product_id),
            variant_id: (link.variant_id ?? null) as string | null,
            title: (products.get(String(link.product_id))?.title ?? null) as string | null,
            handle: (products.get(String(link.product_id))?.handle ?? null) as string | null,
            matched_by: String(link.matched_by ?? "vendor_code"),
          }
        : null,
    })),
    /**
     * OUR observations, not the marketplace's log: neither WB nor Ozon hands
     * out a status history, so this is what each import saw and when. The
     * screen labels it that way.
     */
    status_history: events
      .map((event) => ({
        status: (event.status ?? null) as string | null,
        status_detail: (event.status_detail ?? null) as string | null,
        status_changed_at: iso(event.status_changed_at),
        observed_at: iso(event.observed_at),
      }))
      .sort((a, b) => String(b.observed_at).localeCompare(String(a.observed_at))),
  });
};
