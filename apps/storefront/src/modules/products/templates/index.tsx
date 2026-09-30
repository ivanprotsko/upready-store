import type React from "react"
import { Suspense } from "react"
import { getLocale, getTranslations } from "next-intl/server"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import AttributesSummary from "@modules/products/components/product-attributes/summary"
import DescriptionExcerpt from "@modules/products/components/product-description/excerpt"
import ProductDetailsDrawer from "@modules/products/components/product-details-drawer"
import ProductDetailsOpener from "@modules/products/components/product-details-drawer/opener"
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta"
import { ProductSelectionProvider } from "@modules/products/components/product-selection"
import VariantPicker from "@modules/products/components/product-selection/variant-picker"
import RelatedProducts from "@modules/products/components/related-products"
import RecentlyViewed from "@modules/products/components/recently-viewed"
import ProductInfo from "@modules/products/templates/product-info"
import CourseBlock from "@modules/products/components/course-block"
import CourseCover from "@modules/products/components/course-page/cover"
import CourseDescription from "@modules/products/components/course-page/description"
import {
  CourseAbout,
  CourseFaq,
  CourseTestimonials,
} from "@modules/products/components/course-page/sections"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import Breadcrumb, {
  type BreadcrumbItem,
} from "@modules/common/components/breadcrumb"
import HydrationSlot from "@modules/common/components/hydration-slot"
import JsonLd from "@modules/common/components/json-ld"
import ProductReviews, {
  REVIEWS_PAGE_SIZE,
} from "@modules/products/components/product-reviews"
import { prepareAttributeRows } from "@modules/products/components/product-attributes/rows"
import { getProductCourse } from "@lib/data/courses"
import { listProductAttributes } from "@lib/data/product-attributes"
import { listProductReviews } from "@lib/data/product-reviews"
import { buildProductJsonLd } from "@lib/util/json-ld"
import { readCourseCover, readCoursePage } from "@lib/util/course-page"
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
 * description, then the one «Характеристики и описание» button), and the buy box — then
 * the reviews and the related products. The button opens a шторка from the right with
 * all the characteristics and the whole description (t-2026-09-23-01, after Wildberries);
 * the block that used to hold them under the cards is gone. On a phone the three cards
 * stack in that order and the buy box's sticky bar keeps the button reachable.
 *
 * A course (a product `getProductCourse` answers for) is laid out as two columns from
 * 1024 instead (t-2026-09-24-n23): the content column holds the cover, the centre card
 * with the course's whole description, then «О программе», the lesson list, «Вопросы и
 * ответы» and the testimonials; the right column is the buy box alone, sticky under the
 * header all the way down that column. On a phone the order is cover, centre card, buy
 * box, sections, and the sticky bar keeps «В корзину» reachable as on any product.
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
  // in the drawer).
  // The course, if this product sells one: its lesson list, and the switch to the
  // course layout below.
  const [reviews, attributeRows, course] = await Promise.all([
    listProductReviews(product.id, {
      limit: REVIEWS_PAGE_SIZE,
      offset: (Math.max(1, reviewsPage) - 1) * REVIEWS_PAGE_SIZE,
    }),
    listProductAttributes(product.id).then((rows) =>
      prepareAttributeRows(rows, product.handle)
    ),
    getProductCourse(product.id),
  ])

  const jsonLd = await buildProductJsonLd({
    product,
    locale,
    breadcrumbs: breadcrumbItems,
    reviews: reviews.summary,
  })

  const description = product.description ? stripHtml(product.description) : ""
  const hasDetails = Boolean(description) || attributeRows.length > 0

  const breadcrumbPill = (
    <div className="absolute inset-x-4 top-0 flex -translate-y-1/2 justify-center">
      <Breadcrumb items={breadcrumbItems.slice(0, -1)} variant="pill" />
    </div>
  )
  const buyBox = (
    <>
      <ProductOnboardingCta />
      <Suspense
        fallback={
          <ProductActions disabled={true} product={product} region={region} />
        }
      >
        <ProductActionsWrapper id={product.id} region={region} />
      </Suspense>
    </>
  )

  if (course) {
    const metadata = product.metadata as Record<string, unknown> | null
    const cover = readCourseCover(metadata)
    const page = readCoursePage(metadata)

    const summaryCard = (
      <div
        className={`${CARD} relative flex min-w-0 flex-col gap-y-5 px-4 pb-5 pt-7 small:px-6 small:pb-6 small:pt-9`}
        data-testid="product-summary-card"
      >
        {/* ProductInfo and AttributesSummary are async, so lazy rows in the RSC
            payload: the slot keeps them off this <div>'s own children, see
            HydrationSlot (46df U-06). The same in every card below. */}
        <HydrationSlot>
          {breadcrumbPill}
          <ProductInfo product={product} reviews={reviews.summary} />
          <VariantPicker />
          <AttributesSummary rows={attributeRows} />
          <CourseDescription description={product.description} />
          {hasDetails && <ProductDetailsOpener />}
        </HydrationSlot>
      </div>
    )

    return (
      <>
        <JsonLd data={jsonLd} />

        <div data-testid="product-page" data-layout="course">
          <HydrationSlot>
            <div
              className="content-container flex flex-col gap-y-6 pb-6 pt-8 small:gap-y-8 small:pb-8 small:pt-10"
              data-testid="product-container"
            >
              <ProductSelectionProvider product={product}>
                {/* Two columns from 1024: the content (row 1: cover and centre card, row 2:
                    the sections) and the buy box, which spans both rows so that its
                    sticky box has the whole height of the content to travel along. This
                    reuses the normal product page's own three-way grid template, with the
                    content spanning the first two columns, so the buy box lands on exactly
                    the same width as on every other product page (t-2026-09-25-18, 2.2) —
                    a fixed-width column here used to disagree with it. */}
                <div className="grid grid-cols-1 gap-4 small:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)] small:gap-6">
                  <div className="flex min-w-0 flex-col gap-4 small:col-span-2 small:col-start-1 small:row-start-1 small:gap-6">
                    {cover ? (
                      <>
                        <div
                          className={`${CARD} p-3 small:p-4`}
                          data-testid="product-gallery-card"
                        >
                          <CourseCover cover={cover} />
                        </div>
                        {summaryCard}
                      </>
                    ) : (
                      <div className="grid grid-cols-1 items-start gap-4 small:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] small:gap-6">
                        <div
                          className={`${CARD} p-3 small:p-4`}
                          data-testid="product-gallery-card"
                        >
                          <ImageGallery images={images} title={product.title} />
                        </div>
                        {summaryCard}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 small:col-start-3 small:row-span-2 small:row-start-1">
                    <aside
                      className={`${CARD} flex min-w-0 flex-col gap-y-4 p-4 small:sticky small:top-20 small:p-5`}
                      data-testid="product-buy-card"
                    >
                      <HydrationSlot>{buyBox}</HydrationSlot>
                    </aside>
                  </div>

                  <div
                    className="flex min-w-0 flex-col gap-4 small:col-span-2 small:col-start-1 small:row-start-2 small:gap-6"
                    data-testid="course-sections"
                  >
                    <HydrationSlot>
                      {page && <CourseAbout sections={page.about} />}
                      <CourseBlock
                        data={course}
                        productHandle={product.handle ?? ""}
                      />
                      {page && <CourseFaq items={page.faq} />}
                      {page && <CourseTestimonials items={page.testimonials} />}
                    </HydrationSlot>
                  </div>
                </div>
                {hasDetails && (
                  <ProductDetailsDrawer
                    rows={attributeRows}
                    description={description}
                  />
                )}
              </ProductSelectionProvider>
            </div>

            <ProductReviews
              productId={product.id}
              productHandle={product.handle ?? ""}
              page={reviewsPage}
              data={reviews}
            />

            <div
              className="content-container flex flex-col gap-y-12 py-12 small:gap-y-16 small:py-16"
              data-testid="related-products-container"
            >
              <Suspense fallback={<SkeletonRelatedProducts />}>
                <RelatedProducts product={product} countryCode={countryCode} />
              </Suspense>
              <RecentlyViewed
                currentHandle={product.handle ?? ""}
                countryCode={countryCode}
              />
            </div>
          </HydrationSlot>
        </div>
      </>
    )
  }

  return (
    <>
      <JsonLd data={jsonLd} />

      <div data-testid="product-page">
        {/* ProductReviews is async, and the related products come past Flight's
            3200-byte row limit (the product handed to ProductSelectionProvider fills
            the row first), so this <div>'s children arrive as lazy rows: see
            HydrationSlot (46df U-06). The course layout above is wrapped the same way. */}
        <HydrationSlot>
          <div
            className="content-container flex flex-col gap-y-6 pb-6 pt-8 small:gap-y-8 small:pb-8 small:pt-10"
            data-testid="product-container"
          >
            <ProductSelectionProvider product={product}>
              {/* Three cards from 1024: the gallery, the summary (the widest), the buy box
                  that stays in view beside them. On a phone they stack in that order. */}
              <div className="grid grid-cols-1 items-start gap-4 small:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)] small:gap-6">
                <div
                  className={`${CARD} p-3 small:p-4`}
                  data-testid="product-gallery-card"
                >
                  <ImageGallery images={images} title={product.title} />
                </div>

                <div
                  className={`${CARD} relative flex min-w-0 flex-col gap-y-5 px-4 pb-5 pt-7 small:px-6 small:pb-6 small:pt-9`}
                  data-testid="product-summary-card"
                >
                  {/* ProductInfo, AttributesSummary and DescriptionExcerpt are async:
                      see HydrationSlot (46df U-06). */}
                  <HydrationSlot>
                    {/* The trail hangs on the card's top edge, centred, without the product's
                        own title: that is the heading right under it. */}
                    <div className="absolute inset-x-4 top-0 flex -translate-y-1/2 justify-center">
                      <Breadcrumb
                        items={breadcrumbItems.slice(0, -1)}
                        variant="pill"
                      />
                    </div>
                    <ProductInfo product={product} reviews={reviews.summary} />
                    <VariantPicker />
                    <AttributesSummary rows={attributeRows} />
                    <DescriptionExcerpt product={product} />
                    {hasDetails && <ProductDetailsOpener />}
                  </HydrationSlot>
                </div>

                <aside
                  className={`${CARD} flex min-w-0 flex-col gap-y-4 p-4 small:sticky small:top-20 small:p-5`}
                  data-testid="product-buy-card"
                >
                  {/* ProductOnboardingCta is async: see HydrationSlot (46df U-06). */}
                  <HydrationSlot>
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
                  </HydrationSlot>
                </aside>
              </div>
              {hasDetails && (
                <ProductDetailsDrawer
                  rows={attributeRows}
                  description={description}
                />
              )}
            </ProductSelectionProvider>
          </div>

          <ProductReviews
            productId={product.id}
            productHandle={product.handle ?? ""}
            page={reviewsPage}
            data={reviews}
          />

          {/* The rows under everything, after Ivan's Figma mockup: what is bought with this
              product (server-rendered, the related query), then what this browser looked at
              before it (client-rendered from localStorage, absent until it has two tiles). */}
          <div
            className="content-container flex flex-col gap-y-12 py-12 small:gap-y-16 small:py-16"
            data-testid="related-products-container"
          >
            <Suspense fallback={<SkeletonRelatedProducts />}>
              <RelatedProducts product={product} countryCode={countryCode} />
            </Suspense>
            <RecentlyViewed
              currentHandle={product.handle ?? ""}
              countryCode={countryCode}
            />
          </div>
        </HydrationSlot>
      </div>
    </>
  )
}

export default ProductTemplate
