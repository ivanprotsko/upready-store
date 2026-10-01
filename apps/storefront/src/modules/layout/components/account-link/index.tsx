"use client"

import { usePathname, useSearchParams } from "next/navigation"
import type { ComponentProps } from "react"
import { Link } from "@i18n/navigation"

/** The second path segment decides it: `/ru/cart`, `/ru/checkout`. */
function isCartOrCheckoutPath(pathname: string): boolean {
  const section = pathname.split("/").filter(Boolean)[1]
  return section === "cart" || section === "checkout"
}

type Props = Omit<ComponentProps<typeof Link>, "href">

/**
 * The sign-in entry point used by the header and the phone bottom nav. On the
 * cart and checkout pages it carries the buyer's current path in `?return=`,
 * so `login`/`signup` send them back there instead of stranding them on
 * `/account`; `lib/util/return-path.ts` sanitises it again on the way out.
 * Everywhere else it is the plain `/account` link it always was.
 */
export default function AccountLink(props: Props) {
  const pathname = usePathname() ?? "/"
  const searchParams = useSearchParams()

  if (!isCartOrCheckoutPath(pathname)) {
    return <Link href="/account" {...props} />
  }

  const query = searchParams?.toString()
  const current = query ? `${pathname}?${query}` : pathname

  return <Link href={`/account?return=${encodeURIComponent(current)}`} {...props} />
}
