import "server-only"

import { getTranslations } from "next-intl/server"

import { getSiteName } from "@lib/data/cookies"
import type { ProductDescriptionCopy } from "@lib/util/product-description"

/**
 * The request's words for `productFallbackDescription`: the two catalog keys in the request's
 * language and the shop's name. The product page's metadata and its schema.org node read the
 * same three, so both show the same line.
 */
export async function getProductDescriptionCopy(): Promise<ProductDescriptionCopy> {
  const [tPage, tHome, siteName] = await Promise.all([
    getTranslations("TenantPage"),
    getTranslations("Metadata.home"),
    getSiteName(),
  ])

  return {
    titled: (values) => tPage("metaDescription", values),
    neutral: tHome("description"),
    siteName,
  }
}
