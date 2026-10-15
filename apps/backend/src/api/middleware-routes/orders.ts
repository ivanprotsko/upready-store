import {
  type MiddlewareRoute,
  maybeApplyLinkFilter,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http";
import { listTransformQueryConfig as listClaimQueryConfig } from "@medusajs/medusa/api/admin/claims/query-config";
import { retrieveTransformQueryConfig as retrieveCustomerQueryConfig } from "@medusajs/medusa/api/admin/customers/query-config";
import { AdminCustomerParams } from "@medusajs/medusa/api/admin/customers/validators";
import {
  TenantExportCustomersParams,
  TenantGetCustomersParams,
} from "../tenants/customers/validators";
import { listTransformQueryConfig as listExchangeQueryConfig } from "@medusajs/medusa/api/admin/exchanges/query-config";
import { listTransformQueryConfig as listFulfillmentProviderQueryConfig } from "@medusajs/medusa/api/admin/fulfillment-providers/query-config";
import { AdminFulfillmentProvidersParams } from "@medusajs/medusa/api/admin/fulfillment-providers/validators";
import {
  exportTransformQueryConfig as exportOrderQueryConfig,
  listOrderItemsQueryConfig,
  retrieveOrderChangesTransformQueryConfig,
  retrieveTransformQueryConfig as retrieveOrderQueryConfig,
} from "@medusajs/medusa/api/admin/orders/query-config";
import {
  AdminGetOrdersOrderItemsParams,
  AdminGetOrdersOrderParams,
  AdminGetOrdersParams,
  AdminMarkOrderFulfillmentAsDelivered,
  AdminOrderCancelFulfillment,
  AdminOrderChangesParams,
  AdminOrderCreateFulfillment,
  AdminOrderCreateShipment,
} from "@medusajs/medusa/api/admin/orders/validators";
import { retrieveTransformQueryConfig as retrievePaymentQueryConfig } from "@medusajs/medusa/api/admin/payments/query-config";
import {
  AdminCreatePaymentCapture,
  AdminGetPaymentParams,
} from "@medusajs/medusa/api/admin/payments/validators";
import { listTransformQueryConfig as listReservationQueryConfig } from "@medusajs/medusa/api/admin/reservations/query-config";
import { AdminGetReservationsParams } from "@medusajs/medusa/api/admin/reservations/validators";
import { listTransformQueryConfig as listReturnQueryConfig } from "@medusajs/medusa/api/admin/returns/query-config";
import { listTransformQueryConfig as listShippingOptionQueryConfig } from "@medusajs/medusa/api/admin/shipping-options/query-config";
import { AdminGetShippingOptionsParams } from "@medusajs/medusa/api/admin/shipping-options/validators";
import {
  listTransformQueryConfig as listStockLocationQueryConfig,
  retrieveTransformQueryConfig as retrieveStockLocationQueryConfig,
} from "@medusajs/medusa/api/admin/stock-locations/query-config";
import {
  AdminGetStockLocationParams,
  AdminGetStockLocationsParams,
} from "@medusajs/medusa/api/admin/stock-locations/validators";
// ---- t-cherk-com-hotfix batch 5: the owner rejects a buyer's payment receipt.
import { PostTenantRejectPaymentReceiptSchema } from "../tenants/orders/validators";

/**
 * Order detail, payments and fulfillments, the references their forms read,
 * customers, the RMA lists and the orders export.
 *
 * `../middlewares.ts` composes this array with the other files of this folder in
 * a fixed order (t-2026-10-14-55).
 */
export const orderRoutes: MiddlewareRoute[] = [
  // ---- piece 2: order detail (/tenants/orders/:id/**, payments, fulfillments)
  // Every matcher below parses its query with the Admin's own validator and
  // query config, exactly as `@medusajs/medusa/dist/api/admin/orders/middlewares.js`
  // does, so the copied order-detail screen may send the Admin's `fields`
  // syntax and read the Admin's response shape back. Ownership is NOT decided
  // here: each route calls `assertOwnedOrder` / `assertOwnedPayment` from
  // `tenants/orders/helpers.ts` before it reads or writes anything.
  {
    matcher: "/tenants/orders/:id",
    method: ["GET"],
    middlewares: [
      validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
    ],
  },
  {
    matcher: "/tenants/orders/:id/preview",
    method: ["GET"],
    middlewares: [
      validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
    ],
  },
  {
    matcher: "/tenants/orders/:id/changes",
    method: ["GET"],
    middlewares: [
      validateAndTransformQuery(AdminOrderChangesParams, retrieveOrderChangesTransformQueryConfig),
    ],
  },
  {
    matcher: "/tenants/orders/:id/line-items",
    method: ["GET"],
    middlewares: [
      validateAndTransformQuery(AdminGetOrdersOrderItemsParams, listOrderItemsQueryConfig),
    ],
  },
  {
    matcher: "/tenants/orders/:id/cancel",
    method: ["POST"],
    // The Admin takes no body here either; its own
    // `validateAndTransformBody` line is commented out upstream.
    middlewares: [
      validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
    ],
  },
  {
    matcher: "/tenants/orders/:id/fulfillments",
    method: ["POST"],
    middlewares: [
      validateAndTransformBody(AdminOrderCreateFulfillment),
      validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
    ],
  },
  {
    matcher: "/tenants/orders/:id/fulfillments/:fulfillment_id/shipments",
    method: ["POST"],
    middlewares: [
      validateAndTransformBody(AdminOrderCreateShipment),
      validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
    ],
  },
  {
    matcher: "/tenants/orders/:id/fulfillments/:fulfillment_id/cancel",
    method: ["POST"],
    middlewares: [
      validateAndTransformBody(AdminOrderCancelFulfillment),
      validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
    ],
  },
  {
    matcher: "/tenants/orders/:id/fulfillments/:fulfillment_id/mark-as-delivered",
    method: ["POST"],
    middlewares: [
      validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
      validateAndTransformBody(AdminMarkOrderFulfillmentAsDelivered),
    ],
  },
  {
    // t-cherk-com-hotfix batch 5: answers the order, like `/cancel`.
    matcher: "/tenants/orders/:id/payment-receipt/reject",
    method: ["POST"],
    middlewares: [
      validateAndTransformBody(PostTenantRejectPaymentReceiptSchema),
      validateAndTransformQuery(AdminGetOrdersOrderParams, retrieveOrderQueryConfig),
    ],
  },
  {
    matcher: "/tenants/payments/:id/capture",
    method: ["POST"],
    middlewares: [
      validateAndTransformBody(AdminCreatePaymentCapture),
      validateAndTransformQuery(AdminGetPaymentParams, retrievePaymentQueryConfig),
    ],
  },
  // Read-only references the order-detail screen and the fulfillment and
  // shipment forms fill their comboboxes from.
  {
    matcher: "/tenants/stock-locations",
    method: ["GET"],
    middlewares: [
      validateAndTransformQuery(AdminGetStockLocationsParams, listStockLocationQueryConfig),
      // `sales_channel_id` is not a column on a stock location; the Admin
      // turns it into an id filter through the link table and so must we, or
      // the query throws "not existing property".
      maybeApplyLinkFilter({
        entryPoint: "sales_channel_location",
        resourceId: "stock_location_id",
        filterableField: "sales_channel_id",
      }),
    ],
  },
  {
    matcher: "/tenants/stock-locations/:id",
    method: ["GET"],
    middlewares: [
      validateAndTransformQuery(AdminGetStockLocationParams, retrieveStockLocationQueryConfig),
    ],
  },
  {
    matcher: "/tenants/fulfillment-providers",
    method: ["GET"],
    middlewares: [
      validateAndTransformQuery(
        AdminFulfillmentProvidersParams,
        listFulfillmentProviderQueryConfig,
      ),
      // Same reason as the stock-location matcher above: `stock_location_id`
      // reaches a provider only through the link table.
      maybeApplyLinkFilter({
        entryPoint: "location_fulfillment_provider",
        resourceId: "fulfillment_provider_id",
        filterableField: "stock_location_id",
      }),
    ],
  },
  {
    matcher: "/tenants/shipping-options",
    method: ["GET"],
    middlewares: [
      validateAndTransformQuery(AdminGetShippingOptionsParams, listShippingOptionQueryConfig),
      // The create-fulfillment form narrows the options by the chosen
      // warehouse. `stock_location_id` is not a column on a shipping option:
      // without this the query throws "Trying to query by not existing
      // property ShippingOption.stock_location_id" (measured live on
      // :9029, 2026-09-11) and the form can never configure itself.
      maybeApplyLinkFilter({
        entryPoint: "location_fulfillment_set",
        resourceId: "fulfillment_set_id",
        filterableField: "stock_location_id",
        filterByField: "service_zone.fulfillment_set_id",
      }),
    ],
  },
  {
    matcher: "/tenants/reservations",
    method: ["GET"],
    middlewares: [
      validateAndTransformQuery(AdminGetReservationsParams, listReservationQueryConfig),
    ],
  },
  {
    matcher: "/tenants/customers",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(TenantGetCustomersParams, { isList: true })],
  },
  {
    matcher: "/tenants/customers/export",
    method: ["POST"],
    middlewares: [validateAndTransformQuery(TenantExportCustomersParams, { isList: true })],
  },
  {
    matcher: "/tenants/customers/:id",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(AdminCustomerParams, retrieveCustomerQueryConfig)],
  },
  // RMA lists answer an empty page (see the route files). The validators stay
  // wired so `offset` and `limit` echo the request the way every other list
  // under /tenants does. `/tenants/order-edits` has no Admin list route to
  // borrow a validator from, so it takes none.
  {
    matcher: "/tenants/returns",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(AdminGetOrdersParams, listReturnQueryConfig)],
  },
  {
    matcher: "/tenants/claims",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(AdminGetOrdersParams, listClaimQueryConfig)],
  },
  {
    matcher: "/tenants/exchanges",
    method: ["GET"],
    middlewares: [validateAndTransformQuery(AdminGetOrdersParams, listExchangeQueryConfig)],
  },

  // ---- piece 3: orders export (/tenants/orders/export)
  // The filters arrive in the query string, not the body: the Admin's SDK
  // method the copied screen calls (`sdk.admin.order.export(query)`) sends
  // them there, and the Admin's own matcher parses them with the same pair.
  {
    matcher: "/tenants/orders/export",
    method: ["POST"],
    middlewares: [validateAndTransformQuery(AdminGetOrdersParams, exportOrderQueryConfig)],
  },
];
