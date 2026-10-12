"use client"

import { useState } from "react"

type Props = {
  /** The Yandex ID picture (`customerAvatarUrl`), or null to draw the initials. */
  src: string | null
  /** One or two letters (`customerInitials`), drawn when there is no picture or it fails to load. */
  initials: string
}

/**
 * The signed-in buyer's avatar in the checkout header (t-2026-10-12-05, Ivan 12.10 item 6.2:
 * «показывать аватар если я залогинен а не иконку "пользователя", но он долен остаться не
 * кликабельным»). A 28 px circle: the Yandex ID picture when the profile has one, otherwise the
 * initials in the theme's own colours. A picture Yandex no longer serves falls back to the
 * initials too.
 *
 * Decorative and inert: the contact label beside it names the buyer, so it is hidden from
 * assistive technology, and it is no link and no button (no hover, no pointer, no focus stop).
 */
export default function CustomerAvatar({ src, initials }: Props) {
  const [failed, setFailed] = useState(false)
  const picture = src && !failed ? src : null

  return (
    <span
      aria-hidden
      className="inline-flex h-7 w-7 shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-ui-border-base bg-ui-bg-component txt-compact-xsmall-plus text-ui-fg-subtle"
      data-testid="checkout-avatar"
      data-kind={picture ? "picture" : "initials"}
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element -- a 50 px picture from avatars.yandex.net, no next/image host to carry for it.
        <img
          src={picture}
          alt=""
          width={28}
          height={28}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  )
}
