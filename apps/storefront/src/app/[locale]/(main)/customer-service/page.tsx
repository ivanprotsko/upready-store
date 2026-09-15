import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"

import ContentPage from "@modules/common/components/content-page"
import { guardStarterLegalPage } from "@lib/data/legal-links"
import { buildAlternates } from "@lib/util/alternates"
import { pageTitle } from "@lib/util/page-title"

type FaqEntry = {
  question: string
  answer: string
}

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([
    getTranslations("Metadata.customerService"),
    getLocale(),
  ])

  return {
    title: await pageTitle(t("title")),
    description: t("description"),
    alternates: await buildAlternates(locale, "/customer-service"),
  }
}

// The copy is a placeholder. Rewrite `Metadata.customerService` and
// `ContentPages.faq` in `messages/*.json` with your own before you go live.
export default async function CustomerServicePage() {
  // A tenant shows its own document here, or nothing: this page's whole
  // text is "this is a placeholder from the starter", and a shop must not
  // serve that under its own domain (f05-checkout-legal-stubs). Only a
  // deployment with no tenant still renders it.
  await guardStarterLegalPage("support")

  const [t, tc] = await Promise.all([
    getTranslations("Metadata.customerService"),
    getTranslations("ContentPages"),
  ])
  const faq = tc.raw("faq") as FaqEntry[]

  return (
    <ContentPage title={t("title")} description={t("description")}>
      <dl className="flex flex-col gap-y-4">
        {faq.map((entry) => (
          <div key={entry.question}>
            <dt className="text-large-semi text-ui-fg-base">{entry.question}</dt>
            <dd className="text-base-regular text-ui-fg-subtle">
              {entry.answer}
            </dd>
          </div>
        ))}
      </dl>
    </ContentPage>
  )
}
