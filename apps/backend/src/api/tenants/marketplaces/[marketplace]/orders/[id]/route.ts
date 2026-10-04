import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { MARKETPLACE_MODULE } from "../../../../../../modules/marketplace";
import type MarketplaceModuleService from "../../../../../../modules/marketplace/service";
import { mpOrderToRow, toAmount } from "../../../../../../modules/marketplace/order-feed";
import { getTenantScope } from "../../../../tenant-scope";
import { marketplaceOf } from "../load-orders";

/**
 * `GET /tenants/marketplaces/:marketplace/orders/:id` — one marketplace order,
 * with its lines, the shop product behind each line, and the status history
 * we observed (w15-mp-orders-desk, moved under the marketplace by
 * mp-section-design task-04).
 *
 * A FOREIGN ID IS A MISSING ID. The order is looked up by its id, the tenant
 * from the token AND the marketplace from the path; an order of another shop,
 * or of the other marketplace, answers the same 404 as one that does not
 * exist, so the response never tells one tenant that another tenant's row
 * exists (the rule `tenant-scope.ts` records).
 *
 * READ-ONLY, like everything in this directory: `mp_*` tables and the shop's
 * own products only, no adapter network member, no endpoint id, no verb but GET.
 */

type Row = Record<string, unknown>;

const iso = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  const at = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

/**
 * The first photo of a marketplace card, small. WB stores each photo as an
 * object of sizes (`tm` is its own thumbnail size, `hq` the full one); a bare
 * string is taken as it is.
 */
const thumbnailOf = (photos: unknown): string | null => {
  const first = Array.isArray(photos) ? photos[0] : null;
  if (typeof first === "string") {
    return first || null;
  }
  if (first && typeof first === "object") {
    const sizes = first as Record<string, unknown>;
    for (const key of ["tm", "c246x328", "square", "c516x688", "big", "hq"]) {
      if (typeof sizes[key] === "string" && sizes[key]) {
        return sizes[key] as string;
      }
    }
  }
  return null;
};

const notFound = (id: string) =>
  new MedusaError(MedusaError.Types.NOT_FOUND, `Заказ ${id} не найден у этого магазина.`);

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const adapter = marketplaceOf(req);
  const tenant = await getTenantScope(req);
  const id = String(req.params.id);

  if (!id.startsWith("mporder_")) {
    throw notFound(id);
  }

  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const scope = { tenant_id: tenant.id, marketplace: adapter.id };
  const [order] = (await mp.listMpOrders({ id, ...scope })) as Row[];

  if (!order) {
    throw notFound(id);
  }

  const [lines, events] = await Promise.all([
    mp.listMpOrderLines({ order_id: id, ...scope }) as Promise<Row[]>,
    mp.listMpOrderStatusEvents({ order_id: id, ...scope }) as Promise<Row[]>,
  ]);

  /**
   * A line names the item by the marketplace's own item id (WB `nmID`, Ozon
   * `sku`) and by the seller's article. The link to the shop's catalogue,
   * however, is keyed on the CARD's external id (`mp_product.external_id`), and
   * those two are the same number on WB but not on Ozon, where a card is a
   * `product_id` and a line is a `sku`. So the article is the second way in,
   * and both are tried before the line is called «нет в магазине». Only the
   * cards and links these lines can name are read.
   */
  const lineExternalIds = [...new Set(lines.map((line) => line.external_id).filter(Boolean))] as string[];
  const vendorCodes = [...new Set(lines.map((line) => line.vendor_code).filter(Boolean))] as string[];

  const [cardsByExternal, cardsByVendor] = await Promise.all([
    lineExternalIds.length
      ? (mp.listMpProducts({ ...scope, external_id: lineExternalIds }) as Promise<Row[]>)
      : Promise.resolve([] as Row[]),
    vendorCodes.length
      ? (mp.listMpProducts({ ...scope, vendor_code: vendorCodes }) as Promise<Row[]>)
      : Promise.resolve([] as Row[]),
  ]);

  const cardByExternal = new Map(cardsByExternal.map((card) => [String(card.external_id), card]));
  const cardByVendorCode = new Map<string, Row>();
  for (const card of cardsByVendor) {
    cardByVendorCode.set(String(card.vendor_code), card);
  }

  const linkKeys = [
    ...new Set([
      ...lineExternalIds,
      ...[...cardsByExternal, ...cardsByVendor].map((card) => String(card.external_id)),
    ]),
  ];
  const links = linkKeys.length
    ? ((await mp.listMpLinks({ ...scope, external_id: linkKeys })) as Row[])
    : [];
  const linkByExternal = new Map(links.map((link) => [String(link.external_id), link]));

  const productIds = new Set<string>();
  const resolved = lines.map((line) => {
    const external = line.external_id ? String(line.external_id) : null;
    const card =
      (external ? cardByExternal.get(external) : undefined) ??
      (line.vendor_code ? cardByVendorCode.get(String(line.vendor_code)) : undefined) ??
      null;
    const link =
      (external ? linkByExternal.get(external) : undefined) ??
      (card ? linkByExternal.get(String(card.external_id)) : undefined) ??
      null;

    if (link?.product_id) {
      productIds.add(String(link.product_id));
    }

    return { line, link, card };
  });

  /** Titles, handles and pictures of whatever the lines linked to, asked once. */
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

  res.json({
    order: {
      ...mpOrderToRow(order as never, lines.length),
      /** WB does not date its own status changes; `null` here means exactly that. */
      status_changed_at: iso(order.status_changed_at),
      synced_at: iso(order.synced_at),
      /** The raw mirror row this was computed from, for anyone chasing a number. */
      source_row_id: order.source_row_id ?? null,
    },
    lines: resolved.map(({ line, link, card }) => {
      const product = link?.product_id ? products.get(String(link.product_id)) : undefined;
      return {
        id: String(line.id),
        line_key: String(line.line_key),
        vendor_code: (line.vendor_code ?? null) as string | null,
        external_id: (line.external_id ?? null) as string | null,
        qty: line.qty === null || line.qty === undefined ? null : Number(line.qty),
        price: toAmount(line.price),
        discount: toAmount(line.discount),
        /** The card of this item on the marketplace, when the card import has run. */
        marketplace_title: (card?.title ?? null) as string | null,
        /** The shop product's picture, else the marketplace card's first photo. */
        thumbnail: ((product?.thumbnail ?? null) as string | null) ?? thumbnailOf(card?.photos),
        /**
         * `null` means the article has no product in this shop. The screen says
         * «нет в магазине» and shows the article, so the owner can see WHICH
         * article is missing rather than an empty cell (rule 20a).
         */
        product: link?.product_id
          ? {
              id: String(link.product_id),
              variant_id: (link.variant_id ?? null) as string | null,
              title: (product?.title ?? null) as string | null,
              handle: (product?.handle ?? null) as string | null,
              matched_by: String(link.matched_by ?? "vendor_code"),
            }
          : null,
      };
    }),
    /**
     * OUR observations, not the marketplace's log: neither WB nor Ozon hands
     * out a status history, so this is what each import saw and when. The
     * screen labels it that way. Newest first.
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
