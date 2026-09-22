import type React from "react"
import { Suspense } from "react"
import { getLocale, getTranslations } from "next-intl/server"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductAttributes from "@modules/products/components/product-attributes"
import AttributesSummary from "@modules/products/components/product-attributes/summary"
import ProductDescription from "@modules/products/components/product-description"
import DescriptionExcerpt from "@modules/products/components/product-description/excerpt"
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta"
import { ProductSelectionProvider } from "@modules/products/components/product-selection"
import VariantPicker from "@modules/products/components/product-selection/variant-picker"
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
import { prepareAttributeRows } from "@modules/products/components/product-attributes/rows"
import { listProductAttributes } from "@lib/data/product-attributes"
import { listProductReviews } from "@lib/data/product-reviews"
import { buildProductJsonLd } from "@lib/util/json-ld"
import { stripHtml } from "@lib/util/strip-html"
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

/** A card on the page: 1px hairline on the page's own base colour, the large radius of the config. */
const CARD = "rounded-large border border-ui-border-base bg-ui-bg-base"

/**
 * The product page, laid out after Ivan's Figma mockup (frame «ProductPage», 1184 wide,
 * `handoff/o-20260921-01/t-2026-09-22-01-pdp-figma-layout.md`): on the page's own base colour,
 * three white cards in a row — the gallery, the summary (breadcrumb pill, title, rating,
 * variant pickers, six characteristics with dotted leaders, a three-line excerpt of the
 * description), and the buy box — then the full description and characteristics in one
 * more card, the reviews, and the related products. On a phone the three cards stack in
 * that order and the buy box's sticky bar keeps the button reachable.
 */
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
  // the title, the block below the cards, and the product's JSON-LD. Fetching
  // it in each place would let the three disagree on the same page. The
  // characteristics likewise: fetched once, shown twice (six in the card, all
  // in the table).
  const [reviews, attributeRows] = await Promise.all([
    listProductReviews(product.id, {
      limit: REVIEWS_PAGE_SIZE,
      offset: (Math.max(1, reviewsPage) - 1) * REVIEWS_PAGE_SIZE,
    }),
    listProductAttributes(product.id).then((rows) => prepareAttributeRows(rows, product.handle)),
  ])

  const jsonLd = await buildProductJsonLd({
    product,
    locale,
    breadcrumbs: breadcrumbItems,
    reviews: reviews.summary,
  })

  const hasDescription = Boolean(product.description && stripHtml(product.description))
  const hasDetails = hasDescription || attributeRows.length > 0

  return (
    <>
      <JsonLd data={jsonLd} />

      <div data-testid="product-page">
        <div
          className="content-container flex flex-col gap-y-6 pb-6 pt-8 small:gap-y-8 small:pb-8 small:pt-10"
          data-testid="product-container"
        >
          <ProductSelectionProvider product={product}>
            {/* Three cards from 1024: the gallery, the summary (the widest), the buy box
                that stays in view beside them. On a phone they stack in that order. */}
            <div className="grid grid-cols-1 items-start gap-4 small:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)] small:gap-6">
              <div className={`${CARD} p-3 small:p-4`} data-testid="product-gallery-card">
                <ImageGallery images={images} title={product.title} />
              </div>

              <div
                className={`${CARD} relative flex min-w-0 flex-col gap-y-5 px-4 pb-5 pt-7 small:px-6 small:pb-6 small:pt-9`}
                data-testid="product-summary-card"
              >
                {/* The trail hangs on the card's top edge, centred, without the product's
                    own title: that is the heading right under it. */}
                <div className="absolute inset-x-4 top-0 flex -translate-y-1/2 justify-center">
                  <Breadcrumb items={breadcrumbItems.slice(0, -1)} variant="pill" />
                </div>
                <ProductInfo product={product} reviews={reviews.summary} />
                <VariantPicker />
                <AttributesSummary rows={attributeRows} />
                <DescriptionExcerpt product={product} />
              </div>

              <aside
                className={`${CARD} flex min-w-0 flex-col gap-y-4 p-4 small:sticky small:top-20 small:p-5`}
                data-testid="product-buy-card"
              >
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
              </aside>
            </div>
          </ProductSelectionProvider>

          {/* Under the cards, on one spacing scale: what the product is (the longest text
              on the page, at a measure that reads), then all its characteristics as a
              table. Both «Всё …» links of the summary card land here. A product with
              neither renders neither, and no empty card. */}
          {hasDetails && (
            <div
              id="product-details"
              className={`${CARD} flex flex-col gap-y-10 p-4 small:gap-y-12 small:p-8`}
              data-testid="product-details"
            >
              <ProductDescription product={product} />
              <ProductAttributes rows={attributeRows} />
            </div>
          )}
        </div>

        <ProductReviews
          productId={product.id}
          productHandle={product.handle ?? ""}
          page={reviewsPage}
          data={reviews}
        />

        <div
          className="content-container pb-12 pt-6 small:pb-16 small:pt-8"
          data-testid="related-products-container"
        >
          <Suspense fallback={<SkeletonRelatedProducts />}>
            <RelatedProducts product={product} countryCode={countryCode} />
          </Suspense>
        </div>
      </div>
    </>
  )
}

export default ProductTemplate
