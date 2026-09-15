/**
 * The registry of Wildberries endpoints this repository is allowed to call
 * (w01-wb-readonly-client).
 *
 * Ivan's order, 2026-09-16 02:46 WITA: the WB key may carry write rights by
 * mistake, so no code path here may ever send a mutating request to
 * Wildberries. That is enforced here and in `transport.ts`, not by trusting the
 * token's scope: `wbRead` takes an endpoint ID and nothing else, the method
 * comes from the entry rather than from the caller, and an ID that is not in
 * this file cannot reach the network at all.
 *
 * Why an allowlist and not a "block the write verbs" rule: on WB the verb does
 * not decide. `POST /api/v3/stocks/{warehouseId}` is "Get Inventory", while
 * `PUT` and `DELETE` on the SAME path update and delete it (measured in the
 * docs, see `MARKETPLACE_STOCKS_DOC`). Only a list of exact (method, path)
 * pairs the documentation calls a read is safe, so that is what this is.
 *
 * Every entry cites where it comes from. The doc pages sit behind an antibot
 * that answers curl with HTTP 498, so they were read on 2026-09-16 through a
 * headed Chrome and the extracted text is kept next to this branch's report in
 * `artifacts/docs/w01-wb-readonly-client/docs/`.
 */

/** Host suffix every registered endpoint must live under. */
export const WB_HOST_SUFFIX = ".wildberries.ru";

/**
 * The doc pages, named once so an entry cites a constant and not a typo.
 * `#tag/...` anchors are the openapi renderer's own operation anchors.
 */
const DOC_GENERAL = "https://dev.wildberries.ru/en/docs/openapi/api-information";
const DOC_ITEMS = "https://dev.wildberries.ru/en/docs/openapi/item-management";
const DOC_REPORTS = "https://dev.wildberries.ru/en/docs/openapi/reports";
const DOC_COMMUNICATION = "https://dev.wildberries.ru/en/docs/openapi/customer-communication";
const DOC_ORDERS_FBS = "https://dev.wildberries.ru/en/docs/openapi/orders-fbs";

export const MARKETPLACE_STOCKS_DOC = `${DOC_ITEMS}#tag/sellerWarehousesInventory`;

/**
 * A read WB defines as a POST with a request body. The `reason` is the doc's
 * own sentence about the method, copied verbatim, so a reviewer can check the
 * claim without opening the portal.
 */
export type WbReadViaPost = {
  docUrl: string;
  reason: string;
};

export type WbReadEndpoint = {
  /** What a caller names. Stable: the sync scripts and the journal use it. */
  id: string;
  /** Host without a scheme, e.g. `content-api.wildberries.ru`. */
  host: string;
  /** GET, or POST for a documented query-with-a-body. Never a write verb. */
  method: "GET" | "POST";
  /** Path with `:name` placeholders, filled from `params`. */
  path: string;
  /** The doc page and anchor this entry was read from. */
  docUrl: string;
  /** The method's title in the WB documentation. */
  summary: string;
  /** Required for, and only for, `method: "POST"`. */
  readViaPost?: WbReadViaPost;
  /**
   * Overrides `WB_TIMEOUT_MS` for this endpoint. Only where a measurement
   * shows the default is too short: the value is a fact, not a preference.
   */
  timeoutMs?: number;
};

/**
 * Everything this repository may ask Wildberries for. Adding an entry is a
 * deliberate act: a POST entry additionally has to be added by hand to
 * `POST_READ_ENDPOINT_IDS` in `__tests__/transport.unit.spec.ts`, and the suite
 * stays red until someone does. That double bookkeeping is the point — a POST
 * is the one shape in which a write could be smuggled in.
 */
export const WB_READ_ENDPOINTS: readonly WbReadEndpoint[] = [
  {
    id: "common.ping",
    host: "common-api.wildberries.ru",
    method: "GET",
    path: "/ping",
    docUrl: `${DOC_GENERAL}#tag/connectionCheck/operation/getPing`,
    summary: "Connection Check",
  },
  {
    id: "common.seller-info",
    host: "common-api.wildberries.ru",
    method: "GET",
    path: "/api/v1/seller-info",
    docUrl: `${DOC_GENERAL}#tag/sellerInformation/operation/getV1SellerInfo`,
    summary: "Get Seller Information",
  },
  {
    id: "content.cards.list",
    host: "content-api.wildberries.ru",
    method: "POST",
    path: "/content/v2/get/cards/list",
    docUrl: `${DOC_ITEMS}#tag/listings`,
    summary: "Listings",
    readViaPost: {
      docUrl: `${DOC_ITEMS}#tag/listings`,
      reason:
        "Method description: \"Returns the listings.\" The cursor (updatedAt, nmID, limit) " +
        "is the pagination state and has to travel in a body, so WB documents this read as a POST.",
    },
  },
  {
    id: "content.cards.limits",
    host: "content-api.wildberries.ru",
    method: "GET",
    path: "/content/v2/cards/limits",
    docUrl: `${DOC_ITEMS}#tag/listings`,
    summary: "Limits for the Listings",
  },
  {
    id: "prices.goods.filter",
    host: "discounts-prices-api.wildberries.ru",
    method: "GET",
    path: "/api/v2/list/goods/filter",
    docUrl: `${DOC_ITEMS}#tag/pricesAndDiscounts`,
    summary: "Get Items with Prices",
  },
  {
    id: "marketplace.warehouses",
    host: "marketplace-api.wildberries.ru",
    method: "GET",
    path: "/api/v3/warehouses",
    docUrl: `${DOC_ITEMS}#tag/sellerWarehouses`,
    summary: "Get Warehouses",
  },
  {
    id: "marketplace.stocks",
    host: "marketplace-api.wildberries.ru",
    method: "POST",
    path: "/api/v3/stocks/:warehouseId",
    docUrl: MARKETPLACE_STOCKS_DOC,
    summary: "Get Inventory",
    readViaPost: {
      docUrl: MARKETPLACE_STOCKS_DOC,
      reason:
        "Method description: \"Returns item inventory.\" The request body is `chrtIds`, up to 1000 " +
        "size IDs to ask about. PUT on the same path is \"Update Inventory\" and DELETE is " +
        "\"Delete Inventory\"; neither is registered here and neither can be, so the path alone " +
        "is never enough to reach a write.",
    },
  },
  {
    id: "statistics.orders",
    host: "statistics-api.wildberries.ru",
    method: "GET",
    path: "/api/v1/supplier/orders",
    docUrl: `${DOC_REPORTS}#tag/mainReports`,
    summary: "Orders",
    /**
     * Measured 2026-09-16 04:14 WITA against the live cabinet: WB answered
     * the headers with 200 and the BODY did not finish inside the default
     * 15 s (`wb_api_call` row: status 200, ms 15016, error "The operation was
     * aborted due to timeout"). The docs cap one answer at roughly 80 000
     * rows, so a 90-day window is simply a large download, not a hung host.
     *
     * Raised rather than papered over with a shorter window: the window is
     * WB's own 90-day retention, and a shorter one would silently lose data.
     */
    timeoutMs: 120_000,
  },
  /**
   * FBS (w23-wb-write-fbs-orders). The whole desk of new orders and supplies
   * is READ through these five entries; the three actions the panel offers
   * travel through `src/modules/wb-write` instead, where they are gated.
   *
   * Two of them are POSTs, and both are documented as queries with a body:
   * WB's assembly order id is an int64 and a request asks about up to 1000 of
   * them at once, which does not fit a query string. The doc sentences are
   * quoted verbatim in `readViaPost.reason`.
   */
  {
    id: "marketplace.fbs.orders.new",
    host: "marketplace-api.wildberries.ru",
    method: "GET",
    path: "/api/v3/orders/new",
    docUrl: `${DOC_ORDERS_FBS}#tag/assemblyOrders`,
    summary: "Get New Assembly Orders",
  },
  {
    id: "marketplace.fbs.orders",
    host: "marketplace-api.wildberries.ru",
    method: "GET",
    path: "/api/v3/orders",
    docUrl: `${DOC_ORDERS_FBS}#tag/assemblyOrders`,
    summary: "Get Assembly Orders",
  },
  {
    id: "marketplace.fbs.orders.status",
    host: "marketplace-api.wildberries.ru",
    method: "POST",
    path: "/api/v3/orders/status",
    docUrl: `${DOC_ORDERS_FBS}#tag/assemblyOrders`,
    summary: "Get Assembly Orders Statuses",
    readViaPost: {
      docUrl: `${DOC_ORDERS_FBS}#tag/assemblyOrders`,
      reason:
        "Method description: \"Returns the statuses of assembly orders from the request.\" The body " +
        "is `orders`, \"List of assembly order IDs\", up to 1000 int64 values, so the question " +
        "itself has to travel in a body.",
    },
  },
  {
    id: "marketplace.fbs.supplies",
    host: "marketplace-api.wildberries.ru",
    method: "GET",
    path: "/api/v3/supplies",
    docUrl: `${DOC_ORDERS_FBS}#tag/supplies`,
    summary: "Get a Supplies List",
  },
  {
    id: "marketplace.fbs.orders.stickers",
    host: "marketplace-api.wildberries.ru",
    method: "POST",
    path: "/api/v3/orders/stickers",
    docUrl: `${DOC_ORDERS_FBS}#tag/assemblyOrders`,
    summary: "Get Assembly Orders Stickers",
    readViaPost: {
      docUrl: `${DOC_ORDERS_FBS}#tag/assemblyOrders`,
      reason:
        "Method description: \"Returns a list of stickers for assembly orders in the confirm — in " +
        "assembly and complete — in delivery statuses.\" The page states no side effect: the " +
        "sticker exists because the order does, and asking for it again returns the same label. " +
        "The body is `orders`, up to 100 assembly order IDs.",
    },
  },
  {
    id: "feedbacks.list",
    host: "feedbacks-api.wildberries.ru",
    method: "GET",
    path: "/api/v1/feedbacks",
    docUrl: `${DOC_COMMUNICATION}#tag/feedbacks`,
    summary: "Feedbacks",
  },
];

/**
 * Thrown before any socket is opened. Carries what was asked for so the log
 * line names the offender, never the token.
 */
export class WbWriteForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WbWriteForbiddenError";
  }
}

/** The verbs that may appear in the registry at all. */
const READ_METHODS = new Set(["GET", "POST"]);

/**
 * Checks the whole registry. Called at module load (bottom of this file), so a
 * bad entry fails the process at boot rather than at the first sync, and
 * called again by the guard suite with hand-built entries.
 */
export const validateRegistry = (entries: readonly WbReadEndpoint[] = WB_READ_ENDPOINTS): void => {
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry.id) {
      throw new WbWriteForbiddenError("A WB endpoint entry has no id.");
    }
    if (seen.has(entry.id)) {
      throw new WbWriteForbiddenError(`Duplicate WB endpoint id ${entry.id}.`);
    }
    seen.add(entry.id);

    if (!READ_METHODS.has(entry.method)) {
      throw new WbWriteForbiddenError(
        `WB endpoint ${entry.id} declares method ${entry.method}. Only GET and documented read POSTs ` +
          "can be registered: this client never writes to Wildberries.",
      );
    }

    if (entry.method === "POST" && !entry.readViaPost?.docUrl) {
      throw new WbWriteForbiddenError(
        `WB endpoint ${entry.id} is a POST without readViaPost.docUrl. A POST is only registrable ` +
          "when the WB documentation defines it as a query with a body; cite the page.",
      );
    }

    if (entry.method === "GET" && entry.readViaPost) {
      throw new WbWriteForbiddenError(
        `WB endpoint ${entry.id} is a GET carrying readViaPost. That field marks a POST read only.`,
      );
    }

    if (!entry.host.endsWith(WB_HOST_SUFFIX) || entry.host.includes("/")) {
      throw new WbWriteForbiddenError(
        `WB endpoint ${entry.id} names host ${entry.host}, which is not a *${WB_HOST_SUFFIX} host.`,
      );
    }

    if (!entry.path.startsWith("/")) {
      throw new WbWriteForbiddenError(`WB endpoint ${entry.id} has a path that is not absolute.`);
    }

    if (!entry.docUrl) {
      throw new WbWriteForbiddenError(`WB endpoint ${entry.id} cites no documentation page.`);
    }
  }
};

/** Every registered POST, the list the guard suite checks by hand. */
export const postReadEndpointIds = (
  entries: readonly WbReadEndpoint[] = WB_READ_ENDPOINTS,
): string[] => entries.filter((entry) => entry.method === "POST").map((entry) => entry.id).sort();

/**
 * The entry a caller named. A miss is a `WbWriteForbiddenError` and not a
 * "not found": an unregistered call is exactly the thing this module exists to
 * refuse, whatever the caller believed it was doing.
 */
export const resolveEndpoint = (endpointId: string): WbReadEndpoint => {
  const entry = WB_READ_ENDPOINTS.find((candidate) => candidate.id === endpointId);
  if (!entry) {
    throw new WbWriteForbiddenError(
      `WB endpoint ${endpointId} is not registered. Only reads listed in ` +
        "src/modules/wb/endpoints.ts may leave this process.",
    );
  }
  return entry;
};

validateRegistry();
