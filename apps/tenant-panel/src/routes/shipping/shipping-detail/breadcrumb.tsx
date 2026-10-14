import { UIMatch } from "react-router-dom"

import { useShippingMethods } from "../../../hooks/api/shipping-methods"

// The crumb of the card is the method's name, read from the same list.
export const ShippingDetailBreadcrumb = (props: UIMatch) => {
  const { id } = props.params || {}
  const { methods } = useShippingMethods()
  const method = methods?.find((item) => item.id === id)

  if (!method) {
    return null
  }

  return <span>{method.name}</span>
}
