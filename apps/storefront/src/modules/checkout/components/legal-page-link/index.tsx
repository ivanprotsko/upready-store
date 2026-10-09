"use client"

import { useState, type MouseEvent, type ReactNode } from "react"
import { Loader } from "@medusajs/icons"
import { Link } from "@i18n/navigation"
import { getTenantPage, type TenantPage } from "@lib/data/tenant-pages"
import { tenantPageKeyOf } from "@lib/util/legal-page-key"
import { CheckoutModal } from "@modules/checkout/components/checkout-modal"
import MarkdownContent from "@modules/content/components/markdown-content"

type Props = {
  href: string
  children: ReactNode
  className?: string
  "data-testid"?: string
}

const textOf = (node: ReactNode): string =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join("")
      : ""

/**
 * A document the checkout links (the offer, the policy, the consent, the delivery
 * and returns terms) opens in a window over the checkout instead of taking the
 * buyer away from a half-filled order (t-2026-10-09-56, Ivan 09.10: «страницы на
 * которые пользователь может перейти из чекаута нужно показывать в всплывающем
 * окне»). The page is read through the same `getTenantPage` the `/pages/<key>`
 * route renders, and drawn with the same `MarkdownContent`.
 *
 * It stays a real link: a click with a modifier key, a middle click and a
 * crawler still reach `/pages/<key>`. A page that cannot be read opens in a new
 * tab, so the buyer still gets the text rather than an empty window.
 */
export default function LegalPageLink({
  href,
  children,
  className = "underline",
  "data-testid": dataTestId,
}: Props) {
  const key = tenantPageKeyOf(href)
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<TenantPage | null>(null)

  if (!key) {
    return (
      <Link href={href} target="_blank" className={className} data-testid={dataTestId}>
        {children}
      </Link>
    )
  }

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    // The address with the locale prefix `Link` wrote, read before the await.
    const url = event.currentTarget.href
    setOpen(true)
    if (page) return
    const openInTab = () => {
      setOpen(false)
      window.open(url, "_blank", "noopener")
    }
    getTenantPage(key)
      .then((read) => (read ? setPage(read) : openInTab()))
      .catch(openInTab)
  }

  return (
    <>
      <Link
        href={href}
        onClick={onClick}
        className={className}
        aria-haspopup="dialog"
        data-testid={dataTestId}
      >
        {children}
      </Link>
      <CheckoutModal
        open={open}
        onClose={() => setOpen(false)}
        title={page?.title ?? textOf(children)}
        wide
      >
        <div className="flex flex-col gap-y-4 pb-2" data-testid="legal-page-modal">
          {page ? (
            <MarkdownContent source={page.body} />
          ) : (
            <Loader className="mx-auto my-8 animate-spin text-ui-fg-muted" />
          )}
        </div>
      </CheckoutModal>
    </>
  )
}
