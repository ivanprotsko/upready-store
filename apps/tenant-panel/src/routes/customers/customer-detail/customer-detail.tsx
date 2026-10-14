import { Badge, Container, Heading, Table, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link, useParams } from "react-router-dom"

import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { DisplayIdCell } from "../../../components/table/table-cells/order/display-id-cell"
import { OrderStageCell } from "../../../components/table/table-cells/order/order-stage-cell"
import { PaymentStatusCell } from "../../../components/table/table-cells/order/payment-status-cell"
import { MoneyAmountCell } from "../../../components/table/table-cells/common/money-amount-cell"
import { TableScroll } from "../../../components/table/table-scroll"
import { useCustomer } from "../../../hooks/api/customers"
import { useOrders } from "../../../hooks/api/orders"

// tenant-panel: t13-customers-screen. Own screen, no Admin counterpart at
// this path (the Admin's customer detail is store-wide and out of scope
// here). Contacts and addresses come straight off `GET
// /tenants/customers/:id?fields=*addresses` (the route piece 2 already
// shipped); the order list reuses `useOrders` filtered by `customer_id` —
// `GET /tenants/orders` already intersects that with the tenant's own order
// ids (`apps/backend/src/api/tenants/orders/route.ts`), so no new backend
// route was needed for this piece. Order rows reuse the same cell
// components the Orders table uses, so status and totals read identically
// in both places.

const ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "payment_status",
  "fulfillment_status",
  "total",
  "currency_code",
  "created_at",
  "items.requires_shipping",
  "metadata",
  "payment_collections.payments.provider_id",
  // t-2026-10-14-58, step C: the order's stage (`OrderStageCell`), as in the list.
  "payment_collections.payments.canceled_at",
  "payment_collections.payment_sessions.provider_id",
  "payment_collections.payment_sessions.status",
  "fulfillments.packed_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
  "fulfillments.data",
].join(",")

export const CustomerDetail = () => {
  const { t } = useTranslation()
  const { id } = useParams()

  const { customer, isLoading, isError, error } = useCustomer(id!, {
    fields: "*addresses",
  })

  const { orders, isLoading: isLoadingOrders } = useOrders(
    { customer_id: id, fields: ORDER_FIELDS, order: "-created_at", limit: 50 },
    { enabled: !!id }
  )

  if (isError) {
    throw error
  }

  if (isLoading || !customer) {
    return <SingleColumnPageSkeleton sections={3} showJSON={false} />
  }

  const name = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">{name || t("customers.guest")}</Heading>
          {customer.has_account ? (
            <Badge size="2xsmall" color="green">
              {t("customers.registered")}
            </Badge>
          ) : (
            <Badge size="2xsmall" color="grey">
              {t("customers.guest")}
            </Badge>
          )}
        </div>
        <div className="text-ui-fg-subtle grid grid-cols-2 gap-4 px-6 py-4 text-sm">
          <div>
            <Text size="small" weight="plus" leading="compact">
              {t("fields.email")}
            </Text>
            <Text size="small">{customer.email ?? "-"}</Text>
          </div>
          <div>
            <Text size="small" weight="plus" leading="compact">
              {t("fields.phone")}
            </Text>
            <Text size="small">{customer.phone ?? "-"}</Text>
          </div>
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("customers.detail.addressesHeading")}</Heading>
        </div>
        {(customer.addresses ?? []).length === 0 ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              {t("customers.detail.noAddresses")}
            </Text>
          </div>
        ) : (
          (customer.addresses ?? []).map((address: any) => (
            <div key={address.id} className="px-6 py-4">
              <Text size="small">
                {[
                  address.address_1,
                  address.address_2,
                  address.city,
                  address.province,
                  address.postal_code,
                  address.country_code?.toUpperCase(),
                ]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
            </div>
          ))
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("orders.domain")}</Heading>
        </div>
        {isLoadingOrders ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              {t("general.loading")}
            </Text>
          </div>
        ) : !orders?.length ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              {t("customers.detail.noOrders")}
            </Text>
          </div>
        ) : (
          <TableScroll>
            <Table>
              <Table.Body>
                {orders.map((order: any) => (
                  <Table.Row
                    key={order.id}
                    className="[&_td:last-child]:text-right"
                  >
                    <Table.Cell>
                      <Link to={`/orders/${order.id}`}>
                        <DisplayIdCell displayId={order.display_id} />
                      </Link>
                    </Table.Cell>
                    <Table.Cell>
                      <PaymentStatusCell
                        status={order.payment_status}
                        metadata={order.metadata}
                        paymentCollections={order.payment_collections}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <OrderStageCell order={order} />
                    </Table.Cell>
                    <Table.Cell>
                      <MoneyAmountCell
                        currencyCode={order.currency_code}
                        amount={order.total}
                        align="right"
                      />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </TableScroll>
        )}
      </Container>
    </div>
  )
}
