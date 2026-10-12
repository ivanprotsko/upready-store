import { clx } from "@medusajs/ui"
import { MessageCircle, Send, Users, type LucideIcon } from "lucide-react"
import { getLocale } from "next-intl/server"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import { SECTION_TYPE } from "../../shared/section-type"
import { NETWORK_LABEL, type Network, type NewsletterSignupProps } from "./props"

/**
 * The network's glyph, lucide's, never its brand mark: a paper plane for Telegram, a group for a VK
 * community, a message for MAX. It follows the network, so a template never names it.
 */
const NETWORK_ICON: Record<Network, LucideIcon> = {
  telegram: Send,
  vk: Users,
  max: MessageCircle,
}

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

const BUTTON =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] border px-6 text-base font-medium motion-reduce:transition-none xsmall:w-auto small:text-sm"

const BUTTON_CLASS = {
  "cta-primary": clx(
    BUTTON,
    "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))] transition-opacity hover:opacity-90",
    focusRing
  ),
  "cta-secondary": clx(
    BUTTON,
    "border-[var(--border)] bg-transparent text-ui-fg-base transition-colors hover:border-[var(--foreground)]",
    focusRing
  ),
} as const

/**
 * `newsletter/signup` (t-2026-10-12-33, R1 build list item 6): subscribe to the shop. A heading, a
 * line of text and a button per channel of the shop, Telegram, a VK group, MAX, each with its
 * network's icon and name; the first one is the primary button in the template's button layer, the
 * others are outlined on no fill of their own, so they never outweigh it: under an outlined button
 * layer (`ferrite`) the primary is outlined too, and a filled secondary would read as the main one. Centred on a `--muted` panel by default, as Crave's «Spice up your inbox»;
 * left or on the page on request. Footer f4 will reuse it.
 *
 * Channels only: there is no subscribe endpoint in the backend or the storefront, so `parseProps`
 * refuses `mode: "email"` and no form is ever drawn that would post nowhere.
 *
 * It draws its own heading stack, centred, in the shell's type (`SECTION_TYPE`), as `text/rich-text`
 * does: 24 / 16 / 16 px at 360 (heading, text, buttons), 32 / 18 / 14 px from 1024. On a phone the
 * buttons stand one under another at full width; from 512 px they sit in a row.
 *
 * A channel without a link is a place the shop has not filled: it is skipped, and with none left the
 * block draws nothing, words or not.
 */
export default async function NewsletterSignup({ heading, text, channels, align, tone }: NewsletterSignupProps) {
  const locale = await getLocale()
  const links = channels.flatMap(({ network, href, label }) => {
    const name = pickText(label, locale) ?? pickText(NETWORK_LABEL[network], locale)
    return href && name ? [{ network, href, name }] : []
  })

  if (links.length === 0) {
    return null
  }

  const title = pickText(heading, locale)
  const body = pickText(text, locale)
  const centred = align === "center"

  return (
    <BlockSection block="newsletter/signup" locale={locale}>
      <div
        className={clx(
          tone === "muted" &&
            "rounded-[var(--radius)] bg-[var(--muted)] px-6 py-[var(--layer-space-8,2rem)] xsmall:px-12 small:px-16 small:py-[var(--layer-space-12,3rem)]"
        )}
      >
        <div
          className={clx(
            "flex max-w-2xl flex-col gap-[var(--layer-space-6,1.5rem)]",
            centred && "mx-auto items-center text-center"
          )}
        >
          {title || body ? (
            <div data-role="section-header" className={clx("flex flex-col gap-3", centred && "items-center")}>
              {title ? (
                <h2 data-role="heading" className={SECTION_TYPE.heading}>
                  {title}
                </h2>
              ) : null}
              {body ? (
                <p data-role="description" className={clx(SECTION_TYPE.description, "max-w-prose")}>
                  {body}
                </p>
              ) : null}
            </div>
          ) : null}
          <ul
            className={clx(
              "flex w-full flex-col gap-3 xsmall:flex-row xsmall:flex-wrap",
              centred && "xsmall:justify-center"
            )}
          >
            {links.map(({ network, href, name }, index) => {
              const role = index === 0 ? "cta-primary" : "cta-secondary"
              const Icon = NETWORK_ICON[network]
              return (
                <li key={`${network}-${href}`}>
                  <a data-role={role} href={href} className={BUTTON_CLASS[role]}>
                    <Icon
                      data-role="icon"
                      aria-hidden="true"
                      focusable="false"
                      strokeWidth={1.75}
                      className="size-5 shrink-0"
                    />
                    {name}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </BlockSection>
  )
}
