import { UIMatch } from "react-router-dom"

import { useProductAttribute } from "../../../hooks/api/product-attributes"

// The crumb of the card is the characteristic's name.
export const AttributeDetailBreadcrumb = (props: UIMatch) => {
  const { id } = props.params || {}
  const { product_attribute: attribute } = useProductAttribute(id!, { enabled: Boolean(id) })

  if (!attribute) {
    return null
  }

  return <span>{attribute.name}</span>
}
