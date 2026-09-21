import { HttpTypes } from "@medusajs/types"
import { useTranslation } from "react-i18next"

export const CustomerCell = ({
  customer,
}: {
  customer?: HttpTypes.AdminCustomer | null
}) => {
  if (!customer) {
    return <span className="text-ui-fg-muted">-</span>
  }

  const { first_name, last_name, email } = customer
  const name = [first_name, last_name].filter(Boolean).join(" ")

  // o21-owner-panel-ux: a long name pushed the total out of the table at 768
  // and 1280; the name gives way (the whole of it is on the order), money not.
  return (
    <div className="flex h-full w-full items-center md:max-w-[140px] lg:max-w-[180px] xl:max-w-[280px]">
      <span className="truncate" title={name || email}>
        {name || email}
      </span>
    </div>
  )
}

export const CustomerHeader = () => {
  const { t } = useTranslation()

  return (
    <div className="flex h-full w-full items-center">
      <span className="truncate">{t("fields.customer")}</span>
    </div>
  )
}
