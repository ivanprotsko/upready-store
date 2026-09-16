import { z } from "zod";
import { validateWriteRegistry } from "../marketplace-write/registry";
import type { MarketplaceWriteEndpoint } from "../marketplace-write/types";

/**
 * The allow-list of Wildberries MUTATIONS this repository is able to express
 * at all (w20-wb-write-core).
 *
 * Mirror image of `src/modules/wb/endpoints.ts`: that registry may hold
 * nothing but reads, this one nothing but writes, and the two never share an
 * entry. A path alone is never enough to reach a mutation — on WB the same
 * `/api/v3/stocks/{warehouseId}` is a read with POST, an update with PUT and a
 * deletion with DELETE — so what is registered here is an exact (method, path)
 * pair somebody read in WB's documentation, with the page cited.
 *
 * Registering an entry is NOT permission to use it. Five gates stand between
 * this file and a socket (`../marketplace-write/execute.ts`), the last of them
 * an env var no deployment sets. Nothing in this repository calls `wbWrite`
 * outside tests today.
 *
 * Sources. The portal answers curl with HTTP 498, so the pages were read
 * through a headed Chrome and the extracted text is kept in the repository:
 *   artifacts/docs/w01-wb-readonly-client/docs/dev-wildberries-ru-ru-docs-openapi-item-management.txt
 *   artifacts/docs/w01-wb-readonly-client/docs/dev-wildberries-ru-ru-docs-openapi-customer-communication.txt
 *   artifacts/docs/w10-marketplace-spec/docs/dev.wildberries.ru-en-orders-fbs.txt
 * Every `summary` and every quoted sentence below is verbatim from those files.
 */

export const WB_MARKETPLACE = "wb";
export const WB_WRITE_HOST_SUFFIX = ".wildberries.ru";

const DOC_ITEMS = "https://dev.wildberries.ru/en/docs/openapi/item-management";
const DOC_COMMUNICATION = "https://dev.wildberries.ru/en/docs/openapi/customer-communication";
const DOC_ORDERS_FBS = "https://dev.wildberries.ru/en/docs/openapi/orders-fbs";

/**
 * An object whose keys the saved documentation does not spell out. The doc
 * page renders its request samples collapsed (`{"stocks": [{}]}`), so the item
 * fields are not in the extract and are NOT invented here (rule 17a): what the
 * page DOES state — the array, its bounds — is enforced, and the task that
 * builds the class (w21) cites the item shape when it registers a caller.
 */
const undocumentedItem = z.record(z.string(), z.unknown());

/** A mutation WB documents with no request body at all. */
const noBody = z.undefined();

export const WB_WRITE_ENDPOINTS: readonly MarketplaceWriteEndpoint[] = [
  {
    id: "wb.stocks.update",
    marketplace: WB_MARKETPLACE,
    method: "PUT",
    host: "marketplace-api.wildberries.ru",
    path: "/api/v3/stocks/:warehouseId",
    opClass: "stocks",
    docUrl: `${DOC_ITEMS}#tag/sellerWarehousesInventory`,
    summary: "Update Inventory",
    // "Updates item inventory." Request body: `stocks`, required, "Array of
    // objects [ 1 .. 1000 ] items", "Array of size IDs and amounts".
    bodySchema: z.object({ stocks: z.array(undocumentedItem).min(1).max(1000) }).strict(),
  },
  {
    id: "wb.stocks.delete",
    marketplace: WB_MARKETPLACE,
    method: "DELETE",
    host: "marketplace-api.wildberries.ru",
    path: "/api/v3/stocks/:warehouseId",
    opClass: "stocks",
    docUrl: `${DOC_ITEMS}#tag/sellerWarehousesInventory`,
    summary: "Delete Inventory",
    // "Deletes item inventory. This action is irreversible. Deleted stock will
    // require re-uploading to continue sales." Body: `chrtIds`, required,
    // "Array of integers [ 1 .. 1000 ] items", "Size IDs array".
    irreversible: true,
    bodySchema: z.object({ chrtIds: z.array(z.number().int()).min(1).max(1000) }).strict(),
  },
  {
    id: "wb.prices.upload-task",
    marketplace: WB_MARKETPLACE,
    method: "POST",
    host: "discounts-prices-api.wildberries.ru",
    path: "/api/v2/upload/task",
    opClass: "prices",
    docUrl: `${DOC_ITEMS}#tag/pricesAndDiscounts`,
    summary: "Set Prices and Discounts",
    // "Sets prices and discounts." Body: `data`, required, "Array of objects",
    // "Items, prices and discounts. Maximum 1,000 items. Both price and
    // discount can not be empty".
    bodySchema: z.object({ data: z.array(undocumentedItem).min(1).max(1000) }).strict(),
  },
  {
    id: "wb.feedbacks.answer",
    marketplace: WB_MARKETPLACE,
    method: "POST",
    host: "feedbacks-api.wildberries.ru",
    path: "/api/v1/feedbacks/answer",
    opClass: "feedback_answers",
    docUrl: `${DOC_COMMUNICATION}#tag/feedbacks`,
    summary: "Reply to Feedback",
    // "Allows you to respond to the feedback. There is no validation by
    // feedback ID: if an incorrect value is provided in the request, you will
    // not receive an error." Body: `id` (string, required), `text` (string
    // [ 2 .. 5000 ], required).
    //
    // WB validating nothing is exactly why the body is validated HERE: a typo
    // in the id answers somebody else's customer and WB returns 204.
    bodySchema: z
      .object({ id: z.string().min(1), text: z.string().min(2).max(5000) })
      .strict(),
  },
  {
    id: "wb.feedbacks.answer.edit",
    marketplace: WB_MARKETPLACE,
    method: "PATCH",
    host: "feedbacks-api.wildberries.ru",
    path: "/api/v1/feedbacks/answer",
    opClass: "feedback_answers",
    docUrl: `${DOC_COMMUNICATION}#tag/feedbacks`,
    summary: "Edit Response to Feedback",
    // "Allows you to edit an already sent response to the feedback. You can
    // edit the response only once within 60 days." Same body as the reply.
    bodySchema: z
      .object({ id: z.string().min(1), text: z.string().min(2).max(5000) })
      .strict(),
  },
  {
    id: "wb.fbs.supply.create",
    marketplace: WB_MARKETPLACE,
    method: "POST",
    host: "marketplace-api.wildberries.ru",
    path: "/api/v3/supplies",
    opClass: "fbs_orders",
    docUrl: `${DOC_ORDERS_FBS}#tag/supplies`,
    summary: "Create a New Supply",
    // "Supplies applicable only for assembly orders in the FBS (Fulfillment by
    // Seller) delivery." Body: `name`, "string [ 1 .. 128 ] characters",
    // "Supply name". A 201 carries `{"id": "WB-GI-1234567"}`.
    //
    // Registered because «Собрать» has nowhere to put an order otherwise: on
    // WB there is no "confirm this order" method at all, the confirm status is
    // a SIDE EFFECT of adding the order to a supply (see the next entry).
    bodySchema: z.object({ name: z.string().min(1).max(128) }).strict(),
  },
  {
    id: "wb.fbs.supply.add-orders",
    marketplace: WB_MARKETPLACE,
    method: "PATCH",
    host: "marketplace-api.wildberries.ru",
    // Not a typo and not the `/api/v3/` prefix of its neighbours: the doc page
    // gives this one method the `/api/marketplace/v3/` prefix, and a path is
    // never guessed from the family it sits in (rule 17a).
    path: "/api/marketplace/v3/supplies/:supplyId/orders",
    opClass: "fbs_orders",
    docUrl: `${DOC_ORDERS_FBS}#tag/supplies`,
    summary: "Add Assembly Orders to the Supply",
    // "The method adds up to 100 assembly orders to the supply and moves it to
    // the confirm status." Path parameter `supplyId` ("WB-GI-1234567"); body:
    // `orders`, "Array of integers [ 1 .. 100 ] items", "Assembly order IDs".
    // A 204 is the success answer.
    bodySchema: z.object({ orders: z.array(z.number().int()).min(1).max(100) }).strict(),
  },
  {
    id: "wb.fbs.order.cancel",
    marketplace: WB_MARKETPLACE,
    method: "PATCH",
    host: "marketplace-api.wildberries.ru",
    path: "/api/v3/orders/:orderId/cancel",
    opClass: "fbs_orders",
    docUrl: `${DOC_ORDERS_FBS}#tag/assemblyOrders`,
    summary: "Cancel the Assembly Order",
    // "Moves the assembly orders to cancel ("Canceled by the seller") status.
    // You can cancel an assembly order before it is handed over to
    // Wildberries." Path parameter `orderId`; the page documents no request
    // body, and a 204 is the success answer.
    bodySchema: noBody,
  },
  {
    id: "wb.fbs.supply.deliver",
    marketplace: WB_MARKETPLACE,
    method: "PATCH",
    host: "marketplace-api.wildberries.ru",
    path: "/api/v3/supplies/:supplyId/deliver",
    opClass: "fbs_orders",
    docUrl: `${DOC_ORDERS_FBS}#tag/supplies`,
    summary: "Move the Supply to the Delivery",
    // "Closes the supply and moves all assembly orders to complete (In
    // Delivery) status. You cannot add any assembly orders to the supply after
    // it is closed." No request body on the page.
    irreversible: true,
    bodySchema: noBody,
  },
];

/**
 * Checked at module load, so a bad entry fails the process at boot rather than
 * at the first mutation. Exported too, because the guard suite calls it with
 * hand-built entries.
 */
export const validateWbWriteRegistry = (
  entries: readonly MarketplaceWriteEndpoint[] = WB_WRITE_ENDPOINTS,
): void =>
  validateWriteRegistry(entries, {
    marketplace: WB_MARKETPLACE,
    hostSuffix: WB_WRITE_HOST_SUFFIX,
  });

validateWbWriteRegistry();
