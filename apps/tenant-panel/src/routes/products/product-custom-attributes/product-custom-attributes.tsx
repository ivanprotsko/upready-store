import { Heading } from "@medusajs/ui"
import { useParams } from "react-router-dom"

import { RouteDrawer } from "../../../components/modals"
import { ProductCustomAttributesForm } from "./components/product-custom-attributes-form/product-custom-attributes-form"

// t15-product-attributes: the values of ONE product. Which characteristics
// appear here is the SCHEMA's business — `GET /tenants/products/:id/attributes`
// answers with the ones the tenant declared for this product's category and for
// the whole catalog — so the screen renders what it is given and never invents
// a field.
//
// This component only opens the drawer. Everything that needs the modal's own
// context — `useRouteModal()` above all — lives in the form inside it, because
// `RouteModalProvider` is created BY `RouteDrawer` and is invisible to the
// component that renders it.

export const ProductCustomAttributes = () => {
  const { id } = useParams()

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>Характеристики товара</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">
          Значения характеристик, которые магазин объявил для этого товара.
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      <ProductCustomAttributesForm productId={id!} />
    </RouteDrawer>
  )
}
