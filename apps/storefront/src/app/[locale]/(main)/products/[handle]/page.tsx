import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { buildAlternates } from "@lib/util/alternates"
import { getCountryCode, getTenantDefaultLocale } from "@lib/data/cookies"
import { decodeSegment } from "@lib/util/decode-segment"
import ProductTemplate from "@modules/products/templates"
import type { HttpTypes } from "@medusajs/types"
import { getLocale } from "next-intl/server"
import { DEFAULT_REGION } from "@lib/util/env"
import { getSiteName } from "@lib/data/cookies"
import { getProductDescriptionCopy } from "@lib/data/product-description-copy"
import { productMetaDescription } from "@lib/util/product-description"
import { pageTitle } from "@lib/util/page-title"
import { seoOverride } from "@lib/util/tenant-seo"

type Props = {
  params: Promise<{ handle: string }>
  searchParams: Promise<{ v_id?: string; rp?: string }>
}

/** `?rp=` — the 1-based page of the reviews list. Anything else is page 1. */
function parseReviewsPage(raw: string | undefined): number {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : 1
}

function getImagesForVariant(
  product: HttpTypes.StoreProduct,
  selectedVariantId?: string
) {
  if (!selectedVariantId || !product.variants) {
    return product.images
  }

  const variant = product.variants!.find((v) => v.id === selectedVariantId)
  if (!variant || !variant.images?.length) {
    return product.images
  }

  const imageIdsMap = new Map(variant.images!.map((i) => [i.id, true]))
  return product.images?.filter((i) => imageIdsMap.has(i.id)) ?? null
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [params, countryCode, locale, defaultLocale] = await Promise.all([
    props.params,
    getCountryCode(),
    getLocale(),
    getTenantDefaultLocale(),
  ])

  const cc = countryCode ?? DEFAULT_REGION
  const handle = decodeSegment(params.handle)
  const region = await getRegion(cc)

  if (!region) {
    notFound()
  }

  const product = await listProducts({
    countryCode: cc,
    queryParams: { handle },
  }).then(({ response }) => response.products[0])

  if (!product) {
    notFound()
  }

  const override = seoOverride(product, locale, defaultLocale)

  const title = override.title
    ? await pageTitle(override.title)
    : product.title
      ? await pageTitle(product.title)
      : await getSiteName()

  // A product without a text of its own still gets a description (part A8): its title in
  // the shop and the shop's neutral line. A product with a text keeps the line it had.
  const description = productMetaDescription(
    {
      override: override.description,
      description: product.description,
      subtitle: product.subtitle,
      title: product.title,
    },
    await getProductDescriptionCopy()
  )

  return {
    title,
    description,
    alternates: await buildAlternates(locale, `/products/${params.handle}`),
    openGraph: {
      title,
      description,
      images: product.thumbnail ? [product.thumbnail] : [],
    },
  }
}

export default async function ProductPage(props: Props) {
  const [params, countryCode, searchParams] = await Promise.all([
    props.params,
    getCountryCode(),
    props.searchParams,
  ])

  const cc = countryCode ?? DEFAULT_REGION
  const handle = decodeSegment(params.handle)
  const region = await getRegion(cc)
  const selectedVariantId = searchParams.v_id

  if (!region) {
    notFound()
  }

  const pricedProduct = await listProducts({
    countryCode: cc,
    queryParams: { handle },
  }).then(({ response }) => response.products[0])

  if (!pricedProduct) {
    notFound()
  }

  const images = getImagesForVariant(pricedProduct, selectedVariantId)

  return (
    <ProductTemplate
      product={pricedProduct}
      region={region}
      countryCode={cc}
      images={images ?? []}
      reviewsPage={parseReviewsPage(searchParams.rp)}
    />
  )
}
