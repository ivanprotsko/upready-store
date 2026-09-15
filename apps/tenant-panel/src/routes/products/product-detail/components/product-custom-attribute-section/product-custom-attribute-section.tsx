import { PencilSquare } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { Container, Heading, Text } from "@medusajs/ui"
import { Link } from "react-router-dom"

import { ActionMenu } from "../../../../../components/common/action-menu"
import { SectionRow } from "../../../../../components/common/section"
import { useProductAttributeValues } from "../../../../../hooks/api/product-attributes"
import { booleanLabel } from "../../../../product-attributes/attribute-labels"

// t15-product-attributes: the shop's OWN characteristics on the product screen,
// next to the Admin's fixed weight/dimensions/HS-code section. Which rows show
// up is the schema's business, so this section renders what
// `/tenants/products/:id/attributes` answers and nothing else.
//
// A characteristic with no value still gets a row HERE, with a dash: this is
// the owner's screen, and an empty row is what tells them there is something
// left to fill. The product PAGE is the opposite — it shows filled rows only.

type ProductCustomAttributeSectionProps = {
  product: HttpTypes.AdminProduct
}

export const ProductCustomAttributeSection = ({
  product,
}: ProductCustomAttributeSectionProps) => {
  const { product_attributes: attributes, isPending } = useProductAttributeValues(product.id)

  const displayValue = (attribute: NonNullable<typeof attributes>[number]): string => {
    if (attribute.value === null || attribute.value === undefined) {
      return "—"
    }
    if (attribute.type === "boolean") {
      return booleanLabel(Boolean(attribute.value))
    }
    if (attribute.type === "select") {
      const choice = attribute.options.find((option) => option.value === attribute.value)
      return choice?.label ?? String(attribute.value)
    }
    if (attribute.type === "number" && attribute.unit) {
      return `${attribute.value} ${attribute.unit}`
    }
    return String(attribute.value)
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Характеристики</Heading>
        <ActionMenu
          groups={[
            {
              actions: [
                {
                  label: "Заполнить",
                  to: "custom-attributes",
                  icon: <PencilSquare />,
                },
              ],
            },
          ]}
        />
      </div>
      {isPending ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            Загружаем…
          </Text>
        </div>
      ) : !attributes?.length ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            Для этого товара характеристик не объявлено. Они создаются один раз
            в разделе{" "}
            <Link to="/product-attributes" className="text-ui-fg-interactive">
              «Характеристики товаров»
            </Link>
            .
          </Text>
        </div>
      ) : (
        attributes.map((attribute) => (
          <SectionRow
            key={attribute.key}
            title={attribute.name}
            value={displayValue(attribute)}
          />
        ))
      )}
    </Container>
  )
}
