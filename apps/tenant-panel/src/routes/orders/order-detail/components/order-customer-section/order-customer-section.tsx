import { Container, Heading } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { ArrowPath, CurrencyDollar, Envelope, FlyingBox } from "@medusajs/icons"
import { ActionMenu } from "../../../../../components/common/action-menu"
import { CustomerInfo } from "../../../../../components/common/customer-info"
import { HttpTypes } from "@medusajs/types"
import { OrderPochtaPoint } from "./order-pochta-point"
import { orderPochtaPoint } from "../../../../../lib/order-pickup-point"

type OrderCustomerSectionProps = {
  order: HttpTypes.AdminOrder
}

export const OrderCustomerSection = ({ order }: OrderCustomerSectionProps) => {
  // U-04 (46df): an order posted to a pickup point has one destination, the
  // point. It comes first, and the address the buyer typed at checkout is
  // labelled as theirs rather than «Адрес доставки», so the packer does not
  // see two places to send the parcel.
  const toPickupPoint = orderPochtaPoint(order) !== null

  return (
    <Container className="divide-y p-0">
      <Header />
      <CustomerInfo.ID data={order} />
      <CustomerInfo.Contact data={order} />
      <CustomerInfo.Company data={order} />
      {toPickupPoint && <OrderPochtaPoint order={order} />}
      <CustomerInfo.Addresses data={order} buyerAddress={toPickupPoint} />
    </Container>
  )
}

const Header = () => {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <Heading level="h2">{t("fields.customer")}</Heading>
      <ActionMenu
        groups={[
          {
            actions: [
              {
                label: t("transferOwnership.label"),
                to: `transfer`,
                icon: <ArrowPath />,
              },
            ],
          },
          {
            actions: [
              {
                label: t("addresses.shippingAddress.editLabel"),
                to: "shipping-address",
                icon: <FlyingBox />,
              },
              {
                label: t("addresses.billingAddress.editLabel"),
                to: "billing-address",
                icon: <CurrencyDollar />,
              },
            ],
          },
          {
            actions: [
              {
                label: t("email.editLabel"),
                to: `email`,
                icon: <Envelope />,
              },
            ],
          },
        ]}
      />
    </div>
  )
}
