import type { ReactNode } from "react"

import type { PricingIcon } from "@lib/platform-pricing/types"

/**
 * The line icons of `oksana-3tier-pricing.html`, 16×16, stroked with
 * `currentColor`. `box`, `gear`, `globe` and `shield` are the section icons of
 * its config; `guard`, `card` and `check` are the three value blocks'.
 */
const PATHS: Record<PricingIcon, ReactNode> = {
  box: (
    <>
      <path d="M2 5l6-3 6 3-6 3z" />
      <path d="M2 5v6l6 3 6-3V5" />
      <path d="M8 8v6" />
    </>
  ),
  gear: (
    <>
      <path d="M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4" />
      <circle cx="8" cy="8" r="2.3" />
    </>
  ),
  globe: (
    <>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M1.7 8h12.6M8 1.7c1.7 1.7 2.6 3.9 2.6 6.3S9.7 12.6 8 14.3C6.3 12.6 5.4 10.4 5.4 8S6.3 3.4 8 1.7z" />
    </>
  ),
  shield: (
    <>
      <path d="M8 1.8l5.5 2.4v3.4c0 3.3-2.3 5.4-5.5 6.6-3.2-1.2-5.5-3.3-5.5-6.6V4.2z" />
      <path d="M5.6 8l1.6 1.6 3-3.2" />
    </>
  ),
  guard: <path d="M8 1.8l5.5 2.4v3.4c0 3.3-2.3 5.4-5.5 6.6-3.2-1.2-5.5-3.3-5.5-6.6V4.2z" />,
  card: (
    <>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
      <path d="M1.5 6.5h13" />
    </>
  ),
  check: <path d="M3 8.2l3.2 3.2L13 4.6" />,
}

export function LineIcon({ name, className }: { name: PricingIcon; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.box}
    </svg>
  )
}

/** The hero's star. Decoration, not content. */
export function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 1.5l1.6 3.4 3.7.5-2.7 2.6.7 3.7L8 10.4 4.7 12.2l.7-3.7L2.7 5.9l3.7-.5z" />
    </svg>
  )
}

/** The filled check of the card feature lists. */
export function CheckMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="#18181b" />
      <path
        d="M5.8 10.3l2.7 2.7 5.3-5.6"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
