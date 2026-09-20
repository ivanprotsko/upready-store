import type React from "react"
import { Suspense } from "react"
import { getLocale, getTranslations } from "next-intl/server"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductAttributes from "@modules/products/components/product-attributes"
import ProductDescription from "@modules/products/components/product-description"
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import Breadcrumb, {
  type BreadcrumbItem,
} from "@modules/common/components/breadcrumb"
import JsonLd from "@modules/common/components/json-ld"
import ProductReviews, {
  REVIEWS_PAGE_SIZE,
} from "@modules/products/components/product-reviews"
import { listProductReviews } from "@lib/data/product-reviews"
import { buildProductJsonLd } from "@lib/util/json-ld"
import { notFound } from "next/navigation"
import type { HttpTypes } from "@medusajs/types"

import ProductActionsWrapper from "./product-actions-wrapper"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
  /** 1-based page of the reviews list, from the `?rp=` search parameter. */
  reviewsPage: number
}

const ProductTemplate: React.FC<ProductTemplateProps> = async ({
  product,
  region,
  countryCode,
  images,
  reviewsPage,
}) => {
  const [t, locale] = await Promise.all([getTranslations(""), getLocale()])

  if (!product || !product.id) {
    return notFound()
  }

  let rootCategory = product.categories?.[0]
  while (rootCategory?.parent_category) {
    rootCategory = rootCategory.parent_category
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: t("Breadcrumb.home"), href: "/" },
    { label: t("Breadcrumb.store"), href: "/store" },
    ...(rootCategory
      ? [
          {
            label: rootCategory.name,
            href: `/categories/${rootCategory.handle}`,
          },
        ]
      : []),
    { label: product.title },
  ]

  // One request for the reviews, read three times over: the average next to
  // the title, the block below the card, and the product's JSON-LD. Fetching
  // it in each place would let the three disagree on the same page.
  const reviews = await listProductReviews(product.id, {
    limit: REVIEWS_PAGE_SIZE,
    offset: (Math.max(1, reviewsPage) - 1) * REVIEWS_PAGE_SIZE,
  })

  const jsonLd = await buildProductJsonLd({
    product,
    locale,
    breadcrumbs: breadcrumbItems,
    reviews: reviews.summary,
  })

  return (
    <>
      <JsonLd data={jsonLd} />

      <div
        className="content-container flex flex-col gap-y-6 py-6"
        data-testid="product-container"
      >
        <Breadcrumb items={breadcrumbItems} />

        {/* Two columns from 1024: the gallery, and the buy box that stays in view beside it.
            The gallery column is capped so the 3:4 main frame fits a laptop screen with
            the header above it. It used to be three columns (gallery | summary | buy
            card) with the gallery in the narrowest one, which left a small photo and a
            void under the two short columns. On a phone everything stacks, gallery first. */}
        <div className="grid grid-cols-1 items-start gap-x-8 gap-y-6 small:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] medium:gap-x-12">
          <div className="w-full min-w-0 small:max-w-[600px]">
            <ImageGallery images={images} title={product.title} />
          </div>

          <aside className="flex min-w-0 flex-col gap-y-6 small:sticky small:top-20 small:max-w-[520px]">
            <ProductInfo product={product} reviews={reviews.summary} />
            <ProductOnboardingCta />
            <Suspense
              fallback={
                <ProductActions
                  disabled={true}
                  product={product}
                  region={region}
                />
              }
            >
              <ProductActionsWrapper id={product.id} region={region} />
            </Suspense>
            <ProductTabs product={product} />
          </aside>
        </div>

        {/* Under both columns, on one spacing scale: what the product is (the longest text
            on the page, at a measure that reads), then its characteristics as a table. A
            product with neither renders neither, and no empty heading. */}
        <div className="flex flex-col gap-y-10 pt-4 small:gap-y-12 small:pt-8">
          <ProductDescription product={product} />
          <Suspense fallback={null}>
            <ProductAttributes productId={product.id} />
          </Suspense>
        </div>
      </div>

      <ProductReviews
        productId={product.id}
        productHandle={product.handle ?? ""}
        page={reviewsPage}
        data={reviews}
      />

      <div
        className="content-container my-12 small:my-16"
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate
