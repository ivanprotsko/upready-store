import { retrieveCartSnapshot } from "@lib/data/cart"
import CartTemplate from "@modules/cart/templates"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { pageTitle } from "@lib/util/page-title"
import { NOINDEX } from "@lib/util/robots"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.cart")

  return {
    title: await pageTitle(t("title")),
    description: t("description"),
    robots: NOINDEX,
  }
}

type CartPageProps = {
  searchParams: Promise<{ error?: string }>
}

export default async function Cart({ searchParams }: CartPageProps) {
  const [snapshot, { error }] = await Promise.all([
    retrieveCartSnapshot(),
    searchParams,
  ])

  return <CartTemplate snapshot={snapshot} error={error} />
}
