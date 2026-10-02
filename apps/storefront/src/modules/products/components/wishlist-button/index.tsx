"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { addWishlistItem, removeWishlistItem } from "@lib/data/wishlist"
import {
  addToWishlistStorage,
  clearWishlistStorage,
  readWishlistStorage,
  removeFromWishlistStorage,
} from "@lib/util/wishlist-storage"
import Heart from "@modules/common/icons/heart"

type Props = {
  productId: string
  /** Whether this product is on the signed-in customer's list, as the server rendered it — authoritative while logged in. */
  initialActive: boolean
  /** From the server page (rule 19g): a guest's state lives in this browser's own localStorage instead. */
  isLoggedIn: boolean
  className?: string
}

/**
 * The heart toggle (t-cherk-32): the product card and the product page share
 * this one component. A logged-in customer's state is the account's own list,
 * read server-side and passed in as `initialActive`; toggling it calls the
 * store API directly (`addWishlistItem`/`removeWishlistItem`, both Server
 * Actions) and Next replays the current route's server components once the
 * call resolves, so every other card showing the same product updates with
 * it. A guest's state lives only in this browser (`wishlist-storage.ts`) and
 * is merged into the account on sign-in (`lib/data/customer.ts`).
 */
export default function WishlistButton({
  productId,
  initialActive,
  isLoggedIn,
  className,
}: Props) {
  const t = useTranslations("WishlistButton")
  const [active, setActive] = useState(initialActive)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (isLoggedIn) {
      // The account is truth once signed in; a stale guest id left over from
      // before sign-in must not keep echoing as "saved" after a later sign-out.
      clearWishlistStorage(window.localStorage)
      return
    }
    setActive(readWishlistStorage(window.localStorage).includes(productId))
  }, [isLoggedIn, productId])

  const onClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    // The card wraps itself in one <Link>; without this the heart would also
    // navigate to the product page (tests/stands/helpers.ts documents the
    // same overlay-over-a-<Link> shape for the card's quick-select chips).
    event.preventDefault()
    event.stopPropagation()

    if (pending) {
      return
    }

    const next = !active
    setActive(next)
    setPending(true)
    try {
      if (isLoggedIn) {
        if (next) {
          await addWishlistItem(productId)
        } else {
          await removeWishlistItem(productId)
        }
      } else if (next) {
        addToWishlistStorage(window.localStorage, productId)
      } else {
        removeFromWishlistStorage(window.localStorage, productId)
      }
    } catch {
      setActive(!next)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={active}
      aria-label={t(active ? "remove" : "add")}
      data-testid="wishlist-button"
      data-active={active}
      className={
        className ??
        "inline-flex items-center justify-center rounded-full bg-ui-bg-base/80 p-1.5 text-ui-fg-subtle shadow-elevation-card-rest transition-colors hover:text-ui-fg-base disabled:opacity-60"
      }
    >
      <Heart filled={active} className={active ? "text-ui-tag-red-icon" : undefined} />
    </button>
  )
}
