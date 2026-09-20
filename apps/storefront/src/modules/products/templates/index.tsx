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

        {/* b17: the frame of the chrxnasdmds product page.
              base   (<512)      one column, everything stacked
              xsmall (512–1023)  gallery | summary, the buy card below both
              small  (1024+)     gallery | summary | sticky buy card
            The gallery column is the narrow one on purpose: a hero sized to
            half the page is what turned the old layout into a column of
            full-width photos with the text pushed off the first screen. The
            description and the characteristics span the first two columns
            under the gallery, which is where that page puts them. */}
        <div className="grid grid-cols-1 xsmall:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] small:grid-cols-[minmax(0,1fr)_minmax(240px,1fr)_minmax(260px,22rem)] gap-6 small:gap-x-8 small:gap-y-10 items-start">
          <div className="w-full min-w-0 self-start">
            <ImageGallery
              images={images}
              aspectRatio={
                (product.metadata as Record<string, unknown> | null)
                  ?.aspect_ratio as string | undefined
              }
            />
          </div>

          <div className="min-w-0 flex flex-col gap-y-6 self-start xsmall:col-start-2 small:col-start-2">
            <ProductInfo product={product} reviews={reviews.summary} />
            {/* t15-product-attributes, in the place the chrxnasdmds page keeps
                its «О товаре» table: right under the rating, so the first
                thing after the photo is what the product actually is. */}
            <Suspense fallback={null}>
              <ProductAttributes productId={product.id} />
            </Suspense>
          </div>

          <aside className="min-w-0 flex flex-col gap-y-6 xsmall:col-span-2 small:col-span-1 small:col-start-3 small:row-start-1 small:sticky small:top-20 small:self-start">
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

          {/* The description spans the gallery and the summary columns, under
              both — the longest text on the page, at the width that makes it
              readable. A product with none renders nothing here. */}
          <div className="min-w-0 xsmall:col-span-2 small:col-start-1 small:col-end-3 small:row-start-2">
            <ProductDescription product={product} />
          </div>
        </div>
      </div>

      <ProductReviews
        productId={product.id}
        productHandle={product.handle ?? ""}
        page={reviewsPage}
        data={reviews}
      />

      <div
        className="content-container my-16 small:my-32"
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
