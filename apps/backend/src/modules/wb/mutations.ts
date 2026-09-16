import type { MutationEntry } from "../marketplace/contract";

/**
 * MUTATIONS OF WILDBERRIES, BY (verb, path) — the second belt of the read-only
 * invariant for the WB adapter (w12-marketplace-core, spec section 2.5).
 *
 * Nothing routes THROUGH this list: `WB_READ_ENDPOINTS` is default-deny and a
 * path absent from it cannot be called whatever this list says. The list is a
 * tripwire on the AUTHOR — a registry entry whose (method, path) stands here
 * fails module load, loudly, at boot. It is needed precisely because on WB the
 * verb decides and the path does not: `POST /api/v3/stocks/{warehouseId}` is
 * "Get Inventory" while `PUT` on the SAME path is "Update Inventory" and
 * `DELETE` is "Delete Inventory".
 *
 * EVERY line below was taken from the method index extracted from the saved
 * documentation pages, not from memory (rule 17a):
 * `artifacts/docs/w10-marketplace-spec/docs/wb-methods-index.tsv`
 * (SECTION / HOST / METHOD / PATH / SUMMARY; the sandbox hosts are excluded,
 * because this repository never addresses them). The `summary` column here is
 * that file's own SUMMARY, copied verbatim; `docUrl` is the section page the
 * row came from.
 *
 * Ivan's order, 2026-09-16 07:10 WITA: the documentation is read from the
 * saved copies. dev.wildberries.ru answers this machine with HTTP 498 and
 * bans the IP, so nothing here was re-fetched.
 */

const ITEMS = "https://dev.wildberries.ru/en/docs/openapi/item-management";
const ORDERS = "https://dev.wildberries.ru/en/docs/openapi/orders-fbs";
const COMMUNICATION = "https://dev.wildberries.ru/en/docs/openapi/customer-communication";
const PRICES = "https://dev.wildberries.ru/en/docs/openapi/item-management";
const RETURNS = "https://dev.wildberries.ru/en/docs/openapi/orders-fbs";

/**
 * The write-verb methods first: every PUT, PATCH and DELETE the index holds on
 * a production host. On WB a write verb is never a read, so the whole set
 * belongs here and the list needs no judgement call.
 */
const WRITE_VERBS: readonly MutationEntry[] = [
  { method: "DELETE", path: "/api/feedbacks/v1/pins", summary: "Unpin Feedback", docUrl: COMMUNICATION },
  { method: "DELETE", path: "/api/v3/orders/{orderId}/meta", summary: "Delete Assembly Order Label Identifiers", docUrl: ORDERS },
  { method: "DELETE", path: "/api/v3/passes/{passId}", summary: "Delete the Pass", docUrl: ORDERS },
  { method: "DELETE", path: "/api/v3/stocks/{warehouseId}", summary: "Delete Inventory", docUrl: ITEMS },
  { method: "DELETE", path: "/api/v3/supplies/{supplyId}", summary: "Delete the Supply", docUrl: ORDERS },
  { method: "DELETE", path: "/api/v3/supplies/{supplyId}/trbx", summary: "Delete Shipping Units from the Supply", docUrl: ORDERS },
  { method: "DELETE", path: "/api/v3/warehouses/{warehouseId}", summary: "Delete Warehouse", docUrl: ITEMS },
  { method: "DELETE", path: "/content/v2/tag/{id}", summary: "Delete the Label", docUrl: ITEMS },
  { method: "PATCH", path: "/api/marketplace/v3/fbs/settings/autoreturns", summary: "Update Seller Auto-Return Settings", docUrl: ORDERS },
  { method: "PATCH", path: "/api/marketplace/v3/fbs/settings/autoreturns/items", summary: "Update Item Auto-Return Settings", docUrl: ORDERS },
  { method: "PATCH", path: "/api/marketplace/v3/fbs/supplies/shipping-method", summary: "Set Supply Shipping Method", docUrl: ORDERS },
  { method: "PATCH", path: "/api/marketplace/v3/fbs/supplies/waybill", summary: "Set Supply Waybill ID", docUrl: ORDERS },
  { method: "PATCH", path: "/api/marketplace/v3/supplies/{supplyId}/orders", summary: "Add Assembly Orders to the Supply", docUrl: ORDERS },
  { method: "PATCH", path: "/api/v1/claim", summary: "Answer Buyers Application", docUrl: RETURNS },
  { method: "PATCH", path: "/api/v1/feedbacks/answer", summary: "Edit Response to Feedback", docUrl: COMMUNICATION },
  { method: "PATCH", path: "/api/v1/questions", summary: "Working with Questions", docUrl: COMMUNICATION },
  { method: "PATCH", path: "/api/v3/orders/{orderId}/cancel", summary: "Cancel the Assembly Order", docUrl: ORDERS },
  { method: "PATCH", path: "/api/v3/supplies/{supplyId}/deliver", summary: "Move the Supply to the Delivery", docUrl: ORDERS },
  { method: "PATCH", path: "/content/v2/tag/{id}", summary: "Update the Label", docUrl: ITEMS },
  { method: "PUT", path: "/api/marketplace/v3/fbs/supplies/{supplyId}/spot", summary: "Add SPOT Data to Supply", docUrl: ORDERS },
  { method: "PUT", path: "/api/marketplace/v3/orders/{orderId}/meta/customs-declaration", summary: "Add Custom Declaration number to the Order", docUrl: ORDERS },
  { method: "PUT", path: "/api/v3/dbw/warehouses/{warehouseId}/contacts", summary: "Update Contacts List", docUrl: ITEMS },
  { method: "PUT", path: "/api/v3/orders/{orderId}/meta/expiration", summary: "Add Expiration Date to the Assembly Order", docUrl: ORDERS },
  { method: "PUT", path: "/api/v3/orders/{orderId}/meta/gtin", summary: "Add GTIN to the Assembly Order", docUrl: ORDERS },
  { method: "PUT", path: "/api/v3/orders/{orderId}/meta/imei", summary: "Add IMEI to the Assembly Order", docUrl: ORDERS },
  { method: "PUT", path: "/api/v3/orders/{orderId}/meta/sgtin", summary: "Add Labeling Code Chestny ZNAK to the Assembly Order", docUrl: ORDERS },
  { method: "PUT", path: "/api/v3/orders/{orderId}/meta/uin", summary: "Add UIN (Unique Identification Number) to the Assembly Order", docUrl: ORDERS },
  { method: "PUT", path: "/api/v3/passes/{passId}", summary: "Update Pass", docUrl: ORDERS },
  { method: "PUT", path: "/api/v3/stocks/{warehouseId}", summary: "Update Inventory", docUrl: ITEMS },
  { method: "PUT", path: "/api/v3/warehouses/{warehouseId}", summary: "Update Warehouse", docUrl: ITEMS },
];

/**
 * The dangerous half: POSTs the documentation's own title calls a WRITE. WB
 * mixes reads and writes inside one verb, so each of these was judged by its
 * SUMMARY in the index and nothing else. `POST /content/v2/get/cards/list`
 * ("Listings") and `POST /api/v3/stocks/{warehouseId}` ("Get Inventory") are
 * reads by that same rule, which is why they are registered and absent here.
 */
const WRITE_POSTS: readonly MutationEntry[] = [
  { method: "POST", path: "/api/content/v1/recommendations/set", summary: "Set Item Recommendations", docUrl: ITEMS },
  { method: "POST", path: "/api/discounts-prices/v1/upload/task/b2b/wholesale", summary: "Set Wholesale Discounts for B2B", docUrl: PRICES },
  { method: "POST", path: "/api/feedbacks/v1/pins", summary: "Pin Feedbacks", docUrl: COMMUNICATION },
  { method: "POST", path: "/api/v1/feedbacks/answer", summary: "Reply to Feedback", docUrl: COMMUNICATION },
  { method: "POST", path: "/api/v1/feedbacks/order/return", summary: "Return Item by Feedback ID", docUrl: COMMUNICATION },
  { method: "POST", path: "/api/v1/seller/message", summary: "Send Message", docUrl: COMMUNICATION },
  { method: "POST", path: "/api/v2/nm-report/downloads", summary: "Create the Report", docUrl: ITEMS },
  { method: "POST", path: "/api/v2/nm-report/downloads/retry", summary: "Regenerate the Report", docUrl: ITEMS },
  { method: "POST", path: "/api/v2/upload/task", summary: "Set Prices and Discounts", docUrl: PRICES },
  { method: "POST", path: "/api/v2/upload/task/club-discount", summary: "Set WB Club Discounts", docUrl: PRICES },
  { method: "POST", path: "/api/v2/upload/task/size", summary: "Set Size Prices", docUrl: PRICES },
  { method: "POST", path: "/api/v3/passes", summary: "Create Pass", docUrl: ORDERS },
  { method: "POST", path: "/api/v3/supplies", summary: "Create a New Supply", docUrl: ORDERS },
  { method: "POST", path: "/api/v3/supplies/{supplyId}/trbx", summary: "Add Shipping Units to the Supply", docUrl: ORDERS },
  { method: "POST", path: "/api/v3/warehouses", summary: "Create Warehouse", docUrl: ITEMS },
  { method: "POST", path: "/content/v2/barcodes", summary: "Generation of SKUs", docUrl: ITEMS },
  { method: "POST", path: "/content/v2/cards/delete/trash", summary: "Transfer Listing to Trash", docUrl: ITEMS },
  { method: "POST", path: "/content/v2/cards/moveNm", summary: "Merging or Separating of Listings", docUrl: ITEMS },
  { method: "POST", path: "/content/v2/cards/recover", summary: "Recover Listing from Trash", docUrl: ITEMS },
  { method: "POST", path: "/content/v2/cards/update", summary: "Update Listings", docUrl: ITEMS },
  { method: "POST", path: "/content/v2/cards/upload", summary: "List Items", docUrl: ITEMS },
  { method: "POST", path: "/content/v2/cards/upload/add", summary: "List Items with Merge", docUrl: ITEMS },
  { method: "POST", path: "/content/v2/tag", summary: "Create a Label", docUrl: ITEMS },
  { method: "POST", path: "/content/v2/tag/nomenclature/link", summary: "Label Management in the Listing", docUrl: ITEMS },
  { method: "POST", path: "/content/v3/media/file", summary: "Upload Media File", docUrl: ITEMS },
  { method: "POST", path: "/content/v3/media/save", summary: "Upload Media Files via Links", docUrl: ITEMS },
];

export const WB_MUTATIONS: readonly MutationEntry[] = [...WRITE_VERBS, ...WRITE_POSTS];
