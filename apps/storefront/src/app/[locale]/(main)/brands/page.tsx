import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"

import { listBrands } from "@lib/data/brands"
import { buildAlternates } from "@lib/util/alternates"
import { pageTitle } from "@lib/util/page-title"
import BrandTiles from "@modules/brands/components/brand-tiles"
import Breadcrumb from "@modules/common/components/breadcrumb"

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("Store"), getLocale()])

  return {
    title: await pageTitle(t("brands")),
    alternates: await buildAlternates(locale, "/brands"),
  }
}

/** Every brand of the shop (ask a0e1); a shop that keeps no brands has no such page. */
export default async function BrandsPage() {
  const [t, brands] = await Promise.all([getTranslations(), listBrands()])

  if (!brands.length) {
    notFound()
  }

  return (
    <div className="flex flex-col py-6 content-container" data-testid="brands-page">
      <Breadcrumb items={[{ label: t("Breadcrumb.home"), href: "/" }, { label: t("Store.brands") }]} />
      <h1 className="h3-webs mb-8" data-testid="brands-page-title">
        {t("Store.brands")}
      </h1>
      <BrandTiles brands={brands} />
    </div>
  )
}
