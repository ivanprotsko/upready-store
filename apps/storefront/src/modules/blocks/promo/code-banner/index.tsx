import { clx } from "@medusajs/ui"
import Image from "next/image"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { resolveImageRef } from "@lib/data/block-image"

import BlockSection from "../../shared/block-section"
import { pickText, type LocalizedText } from "../../shared/localized-text"
import { SECTION_TYPE } from "../../shared/section-type"
import CopyCode from "./copy-code"
import { HEADLINE, expiresAt, type PromoCodeBannerProps } from "./props"

const BUTTON =
  "inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius)] border px-6 text-base font-medium transition-opacity hover:opacity-90 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 xsmall:w-auto small:text-sm"

/** The code: large, monospaced, in a dashed frame the height of the buttons. */
const FIELD =
  "min-h-11 w-full min-w-0 rounded-[var(--radius)] border-2 border-dashed bg-transparent px-4 text-center font-mono text-xl font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 xsmall:w-auto small:text-2xl"

const BADGE = "inline-flex rounded-full px-3 py-1 text-xs font-medium tabular-nums"

/**
 * Each tone in the palette's own pairs: the panel, its words, the code's frame, the copy button, the link,
 * the badge and the focus ring. On a filled panel every word takes the panel's foreground and the copy
 * button the reverse pair, so nothing on it is the page's colour.
 */
const TONE = {
  plain: {
    panel: "border border-[var(--border)]",
    words: "",
    legal: "text-ui-fg-subtle",
    field: "border-[var(--primary)] text-ui-fg-base",
    copy: "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))]",
    link: "border-[var(--border)] bg-transparent text-ui-fg-base",
    badge: "bg-[var(--primary)] text-[var(--primary-foreground)]",
    ring: "focus-visible:outline-[var(--ring)]",
  },
  accent: {
    panel: "bg-[var(--primary)]",
    words: "text-[var(--primary-foreground)]",
    legal: "text-[var(--primary-foreground)]",
    field: "border-[var(--primary-foreground)] text-[var(--primary-foreground)]",
    copy: "border-[var(--primary-foreground)] bg-[var(--primary-foreground)] text-[var(--primary)]",
    link: "border-[var(--primary-foreground)] bg-transparent text-[var(--primary-foreground)]",
    badge: "border border-[var(--primary-foreground)] text-[var(--primary-foreground)]",
    ring: "focus-visible:outline-[var(--primary-foreground)]",
  },
  inverted: {
    panel: "bg-[var(--foreground)]",
    words: "text-[var(--background)]",
    legal: "text-[var(--background)]",
    field: "border-[var(--background)] text-[var(--background)]",
    copy: "border-[var(--background)] bg-[var(--background)] text-[var(--foreground)]",
    link: "border-[var(--background)] bg-transparent text-[var(--background)]",
    badge: "border border-[var(--background)] text-[var(--background)]",
    ring: "focus-visible:outline-[var(--background)]",
  },
} as const

/** The last day in the words' own language: «30 июня 2027 г.», «June 30, 2027». */
function lastDay(expires: string, label: LocalizedText, locale: string) {
  const language = label[locale] ? locale : label.en ? "en" : (Object.keys(label)[0] ?? locale)
  const [year, month, day] = expires.slice(0, 10).split("-").map(Number)
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    Date.UTC(year, month - 1, day)
  )
}

/**
 * `promo/code-banner` (t-2026-10-12-33, R2 build list item 9): a promo code in the middle of the page, as
 * the Tilda «растения» template's «FLOWERS» on the first order. Measured against that record (T995, a
 * 580 px banner, the code inside a centred heading on a photo, one button); our own tokens throughout.
 *
 * - The code stands large in a dashed frame with «Скопировать» beside it (`./copy-code.tsx`): the Clipboard
 *   API, else the code is selected; «Скопировано» for 2 s, on the button and through `aria-live`.
 * - `card`: a panel with the words, and the picture beside them from 1024 px, above them on a phone; with no
 *   picture, or one the shop does not have, the words centre. `inline`: one band, the words at its start
 *   and the code with the buttons at its end from 1024 px, one under another below it.
 * - `tone`: `plain` on the page inside a `--border` frame, the copy button in the template's button layer;
 *   `accent` on `--primary`; `inverted` on `--foreground`. A filled panel paints every word in its own
 *   foreground and the copy button in the reverse pair.
 * - The headline is the section's `h2` in the section type (`SECTION_TYPE`): the block is a section of its
 *   own, under the page's one `h1`. On a filled panel only its colour changes.
 *
 * The block does not check the code against the shop: the owner keeps the promotion in the panel. Without a
 * code it draws nothing, and nothing once the expiry has passed; the server checks it on every render.
 */
export default async function PromoCodeBanner({
  code,
  headline,
  text,
  badge,
  terms,
  expires,
  button,
  image,
  tone,
  layout,
  copyLabel,
  copiedLabel,
  selectedLabel,
  codeLabel,
  expiresLabel,
}: PromoCodeBannerProps) {
  if (!code || Date.now() >= expiresAt(expires)) {
    return null
  }

  const locale = await getLocale()
  const card = layout === "card"
  const picture = card && image ? await resolveImageRef(image, locale) : null
  const words = (value: LocalizedText) => pickText(value, locale) ?? ""
  const title = pickText(headline, locale) ?? words(HEADLINE)
  const body = pickText(text, locale)
  const offer = pickText(badge, locale)
  const small = pickText(terms, locale)
  const until = expires ? `${words(expiresLabel)} ${lastDay(expires, expiresLabel, locale)}` : null
  const link = button ? pickText(button.label, locale) : null
  const centred = card && !picture
  const t = TONE[tone]

  const heading = (
    <div className={clx("flex flex-col gap-3", centred ? "items-center" : "items-start")}>
      {offer ? (
        <span data-role="badge" className={clx(BADGE, t.badge)}>
          {offer}
        </span>
      ) : null}
      <h2 data-role="headline" className={clx(SECTION_TYPE.heading, t.words)}>
        {title}
      </h2>
      {body ? (
        <p data-role="description" className={clx(SECTION_TYPE.description, t.words)}>
          {body}
        </p>
      ) : null}
    </div>
  )

  const legal =
    small || until ? (
      <div data-role="legal" className={clx("flex flex-col gap-1 text-xs", t.legal)}>
        {small ? <p>{small}</p> : null}
        {until ? <p>{until}</p> : null}
      </div>
    ) : null

  const linkClass = clx(BUTTON, t.link, t.ring)
  const actions = (
    <div
      className={clx(
        "flex w-full flex-col gap-3 xsmall:w-auto xsmall:flex-row xsmall:flex-wrap",
        centred && "xsmall:justify-center"
      )}
    >
      <CopyCode
        code={code}
        labels={{ copy: words(copyLabel), copied: words(copiedLabel), selected: words(selectedLabel), code: words(codeLabel) }}
        fieldClass={clx(FIELD, t.field, t.ring)}
        buttonClass={clx(BUTTON, t.copy, t.ring)}
      />
      {button && link ? (
        button.href.startsWith("/") ? (
          <Link href={button.href} data-role="cta-secondary" className={linkClass}>
            {link}
          </Link>
        ) : (
          <a href={button.href} data-role="cta-secondary" className={linkClass}>
            {link}
          </a>
        )
      ) : null}
    </div>
  )

  return (
    <BlockSection block="promo/code-banner" locale={locale}>
      {card ? (
        <div
          data-layout="card"
          data-tone={tone}
          className={clx("overflow-hidden rounded-[var(--radius)]", t.panel, picture && "grid grid-cols-1 small:grid-cols-2")}
        >
          {picture ? (
            <div
              data-role="media"
              className="relative h-[calc(14rem*var(--layer-density,1))] small:h-auto small:min-h-[calc(24rem*var(--layer-density,1))]"
            >
              <Image src={picture.url} alt={picture.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
            </div>
          ) : null}
          <div
            className={clx(
              "flex flex-col gap-[var(--layer-space-6,1.5rem)] p-[var(--layer-space-6,1.5rem)] small:p-[var(--layer-space-12,3rem)]",
              centred ? "mx-auto max-w-2xl items-center text-center" : "items-start justify-center"
            )}
          >
            {heading}
            {actions}
            {legal}
          </div>
        </div>
      ) : (
        <div
          data-layout="inline"
          data-tone={tone}
          className={clx(
            "flex flex-col gap-[var(--layer-space-6,1.5rem)] rounded-[var(--radius)] p-[var(--layer-space-6,1.5rem)] small:flex-row small:items-center small:justify-between small:gap-[var(--layer-space-12,3rem)] small:px-[var(--layer-space-12,3rem)] small:py-[var(--layer-space-8,2rem)]",
            t.panel
          )}
        >
          <div className="flex min-w-0 flex-col gap-3">
            {heading}
            {legal}
          </div>
          <div className="shrink-0">{actions}</div>
        </div>
      )}
    </BlockSection>
  )
}
