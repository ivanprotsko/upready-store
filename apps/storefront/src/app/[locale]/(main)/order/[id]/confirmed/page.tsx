import { retrieveOrder } from "@lib/data/orders"
import OrderCompletedTemplate from "@modules/order/templates/order-completed-template"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { pageTitle } from "@lib/util/page-title"
import { NOINDEX } from "@lib/util/robots"

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.orderConfirmed")

  return {
    title: await pageTitle(t("title")),
    description: t("description"),
    robots: NOINDEX,
  }
}

export default async function OrderConfirmedPage(props: Props) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ])
  /*
   * `token` is the order's access token (b07-store-api-isolation). A guest has
   * no account, so it is the only thing that gets them this page: the checkout
   * redirect puts it in the URL (`lib/data/cart.ts` placeOrder) and so does the
   * link in the order-placed email. A logged-in owner needs none of it, their
   * session is enough, so a missing token is not an error here.
   */
  const order = await retrieveOrder(params.id, searchParams.token).catch(
    () => null
  )

  if (!order) {
    return notFound()
  }

  return <OrderCompletedTemplate order={order} />
}
