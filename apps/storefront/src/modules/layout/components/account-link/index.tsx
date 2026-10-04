"use client"

import { usePathname, useSearchParams } from "next/navigation"
import type { ComponentProps, MouseEvent } from "react"
import { Link } from "@i18n/navigation"
import { openLoginModal, useLoginModal } from "@modules/account/components/login-modal/store"

/** The second path segment decides it: `/ru/cart`, `/ru/checkout`. */
function isCartOrCheckoutPath(pathname: string): boolean {
  const section = pathname.split("/").filter(Boolean)[1]
  return section === "cart" || section === "checkout"
}

type ClickLike = Pick<
  MouseEvent,
  "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented" | "preventDefault"
>

/**
 * A guest's plain click on «Войти» opens the sign-in modal over the page instead of following
 * the link (t-2026-10-04-24, Ivan 04.10: «вход нужно сделать в popup без перехода на другую
 * страницу»). A click with a modifier or another button keeps the browser's own meaning (a new
 * tab, a new window), and so does every click while no modal is mounted. Answers whether the
 * modal took the click.
 */
export function openLoginModalOnClick(event: ClickLike, options: { email?: boolean } = {}): boolean {
  if (event.defaultPrevented) return false
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false
  }
  if (!openLoginModal(options)) return false
  event.preventDefault()
  return true
}

type Props = Omit<ComponentProps<typeof Link>, "href"> & {
  /** Open the modal with the e-mail form unfolded: the checkout's «По эл. почте». */
  emailForm?: boolean
}

/**
 * The sign-in entry point used by the header, the side menu, the phone bottom nav and the
 * checkout. For a guest, with `LoginModalHost` on the page, a click opens the sign-in modal and
 * the page stays where it is; the modal signs in and comes back to this same address.
 *
 * The `href` stays for everything else: a signed-in buyer (the host renders no modal, so the
 * store is not `available`), a click before hydration, a new tab. On the cart and checkout pages
 * it carries the buyer's current path in `?return=`, so `login`/`signup` send them back there
 * instead of stranding them on `/account`; `lib/util/return-path.ts` sanitises it again on the
 * way out. Everywhere else it is the plain `/account` link it always was.
 */
export default function AccountLink({ emailForm = false, onClick, ...props }: Props) {
  const pathname = usePathname() ?? "/"
  const searchParams = useSearchParams()
  const { available } = useLoginModal()

  let href = "/account"
  if (isCartOrCheckoutPath(pathname)) {
    const query = searchParams?.toString()
    const current = query ? `${pathname}?${query}` : pathname
    href = `/account?return=${encodeURIComponent(current)}`
  }

  return (
    <Link
      href={href}
      aria-haspopup={available ? "dialog" : undefined}
      {...props}
      onClick={(event) => {
        onClick?.(event)
        openLoginModalOnClick(event, { email: emailForm })
      }}
    />
  )
}
