import { Heading } from "@medusajs/ui"
import { useParams } from "react-router-dom"

import { RouteDrawer } from "../../../components/modals"
import { ProductTranslationsForm } from "./components/product-translations-form/product-translations-form"

// t-cherk-37: translates ONE product's own text into one language at a time.
// Same shape as `product-custom-attributes`: this component only opens the
// drawer, and everything that needs `useRouteModal()` lives in the form inside
// it, because `RouteModalProvider` is created BY `RouteDrawer`.

export const ProductTranslations = () => {
  const { id } = useParams()

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>Переводы товара</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">
          Название, подзаголовок и описание товара на выбранном языке
          витрины.
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      <ProductTranslationsForm productId={id!} />
    </RouteDrawer>
  )
}
