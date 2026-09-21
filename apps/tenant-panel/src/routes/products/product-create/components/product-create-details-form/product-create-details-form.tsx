import { Divider, Heading } from "@medusajs/ui"
import { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { FormExtensionZone } from "../../../../../dashboard-app"
import { useExtension } from "../../../../../providers/extension-provider"
import { ProductCreateSchemaType } from "../../types"
import { ProductCreateGeneralSection } from "./components/product-create-details-general-section"
import { ProductCreateMediaSection } from "./components/product-create-details-media-section"
import { ProductCreatePriceSection } from "./components/product-create-details-price-section"
import { ProductCreateVariantsSection } from "./components/product-create-details-variant-section"

type ProductAttributesProps = {
  form: UseFormReturn<ProductCreateSchemaType>
}

export const ProductCreateDetailsForm = ({ form }: ProductAttributesProps) => {
  const { getFormFields } = useExtension()
  const fields = getFormFields("product", "create", "general")

  return (
    <div className="flex flex-col items-center p-16 max-md:px-4 max-md:py-6">
      <div className="flex w-full max-w-[720px] flex-col gap-y-8">
        <Header />
        {/* o21-owner-panel-ux: photos first, then the name and the price. That
            is the order she thinks in: «вот баночка, называется так, стоит
            столько». */}
        <div className="flex flex-col gap-y-6">
          <ProductCreateMediaSection form={form} />
          <ProductCreateGeneralSection
            form={form}
            afterName={<ProductCreatePriceSection form={form} />}
          />
          <FormExtensionZone fields={fields} form={form} />
        </div>
        <Divider />
        <ProductCreateVariantsSection form={form} />
      </div>
    </div>
  )
}

const Header = () => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col">
      <Heading>{t("products.create.header")}</Heading>
    </div>
  )
}
