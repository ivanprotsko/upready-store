import { CORE_LAYOUT_IDS } from "@medusajs/admin-shared"
import { useLoaderData, useParams } from "react-router-dom"

import { TwoColumnPageSkeleton } from "../../../components/common/skeleton"
import { LayoutComposer, detailPageDefaultEntries } from "../../../components/layout-composer"
import { useProduct } from "../../../hooks/api/products"
import { ProductAttributeSection } from "./components/product-attribute-section"
import { ProductCustomAttributeSection } from "./components/product-custom-attribute-section"
import { ProductGeneralSection } from "./components/product-general-section"
import { ProductMediaSection } from "./components/product-media-section"
import { ProductOptionSection } from "./components/product-option-section"
import { ProductOrganizationSection } from "./components/product-organization-section"
import { ProductTranslationSection } from "./components/product-translation-section"
import { ProductVariantSection } from "./components/product-variant-section"
import { ExtendedProduct, PRODUCT_DETAIL_FIELDS } from "./constants"
import { productLoader } from "./loader"

import { ProductShippingProfileSection } from "./components/product-shipping-profile-section"
import { ProductSitesSection } from "./components/product-sites-section"

export const ProductDetail = () => {
  const initialData = useLoaderData() as Awaited<
    ReturnType<typeof productLoader>
  >

  const { id } = useParams()
  const { product, isLoading, isError, error } = useProduct(
    id!,
    { fields: PRODUCT_DETAIL_FIELDS },
    {
      initialData: initialData,
    }
  )

  if (isLoading || !product) {
    return (
      <TwoColumnPageSkeleton
        mainSections={4}
        sidebarSections={3}
        showJSON
        showMetadata
      />
    )
  }

  if (isError) {
    throw error
  }

  return (
    <LayoutComposer
      widgetsZonePrefix="product.details"
      preferredLayoutId={CORE_LAYOUT_IDS.TWO_COLUMN}
      data={product}
      sections={{
        main: (
          <>
            <LayoutComposer.Entry id="ProductGeneralSection">
              <ProductGeneralSection product={product} />
            </LayoutComposer.Entry>
            <LayoutComposer.Entry id="ProductMediaSection">
              <ProductMediaSection product={product} />
            </LayoutComposer.Entry>
            <LayoutComposer.Entry id="ProductOptionSection">
              <ProductOptionSection product={product} />
            </LayoutComposer.Entry>
            <LayoutComposer.Entry id="ProductVariantSection">
              <ProductVariantSection product={product} />
            </LayoutComposer.Entry>
            {detailPageDefaultEntries(product)}
          </>
        ),
        side: (
          <>
            {/* o21-owner-panel-ux (P3): «Каналы продаж» is off the owner's
                product card. Her shop is one channel, and the backend puts
                every product of the shop into it by itself. */}
            {/* t-2026-09-24-n12: «Сайты», on which of the owner's sites the
                product is shown. Renders nothing for a shop with one site. */}
            <LayoutComposer.Entry id="ProductSitesSection">
              <ProductSitesSection product={product} />
            </LayoutComposer.Entry>
            <LayoutComposer.Entry id="ProductShippingProfileSection">
              <ProductShippingProfileSection
                product={product as ExtendedProduct}
              />
            </LayoutComposer.Entry>
            <LayoutComposer.Entry id="ProductOrganizationSection">
              <ProductOrganizationSection product={product} />
            </LayoutComposer.Entry>
            {/* t-cherk-37: which of the shop's languages this product's own
                title/subtitle/description are translated into. */}
            <LayoutComposer.Entry id="ProductTranslationSection">
              <ProductTranslationSection product={product} />
            </LayoutComposer.Entry>
            <LayoutComposer.Entry id="ProductAttributeSection">
              <ProductAttributeSection product={product} />
            </LayoutComposer.Entry>
            {/* t15-product-attributes: the shop's own characteristics, right
                under Medusa's fixed weight/dimensions/HS-code block. */}
            <LayoutComposer.Entry id="ProductCustomAttributeSection">
              <ProductCustomAttributeSection product={product} />
            </LayoutComposer.Entry>
          </>
        ),
      }}
    />
  )
}
