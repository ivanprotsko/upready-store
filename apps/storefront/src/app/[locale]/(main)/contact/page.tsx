import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"

import ContentPage from "@modules/common/components/content-page"
import { guardStarterLegalPage } from "@lib/data/legal-links"
import { buildAlternates } from "@lib/util/alternates"
import { pageTitle } from "@lib/util/page-title"

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([
    getTranslations("Metadata.contact"),
    getLocale(),
  ])

  return {
    title: await pageTitle(t("title")),
    description: t("description"),
    alternates: await buildAlternates(locale, "/contact"),
  }
}

// The copy is a placeholder. Rewrite `Metadata.contact` in `messages/*.json`
// with your own before you go live.
export default async function ContactPage() {
  // A tenant shows its own document here, or nothing: this page's whole
  // text is "this is a placeholder from the starter", and a shop must not
  // serve that under its own domain (f05-checkout-legal-stubs). Only a
  // deployment with no tenant still renders it.
  await guardStarterLegalPage("contact")

  const t = await getTranslations("Metadata.contact")

  return <ContentPage title={t("title")} description={t("description")} />
}
