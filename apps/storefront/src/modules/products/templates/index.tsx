import type React from "react"
import { Suspense } from "react"
import { getLocale, getTranslations } from "next-intl/server"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductAttributes from "@modules/products/components/product-attributes"
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

        <div className="flex flex-col small:flex-row gap-x-8 items-start">
          <div className="flex-1 w-full">
            <ImageGallery images={images} />
          </div>

          <div className="flex flex-col small:sticky small:top-20 small:w-[320px] w-full gap-y-6 py-8 small:py-0 shrink-0">
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
            {/* t15-product-attributes: the shop's own characteristics, above
                the shipping tab, where a buyer comparing two supplements looks
                for composition and volume. Renders nothing when the product
                carries none. */}
            <Suspense fallback={null}>
              <ProductAttributes productId={product.id} />
            </Suspense>
            <ProductTabs product={product} />
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
