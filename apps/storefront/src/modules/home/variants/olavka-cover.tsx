import Image from "next/image"

import { Link } from "@i18n/navigation"
import type { HomeHeroProps } from "@modules/home/variants/types"

/**
 * Cover · Olavka redesign (t-2026-09-24-n15, Figma node 227-8180): the top cover band of
 * the home page. Copy and photograph come from the tenant's own home document
 * (`content.hero`, handed down by `(main)/page.tsx` as `HomeHeroProps`, already in the
 * visitor's language); a shop whose document has no headline renders nothing, never a
 * placeholder band.
 *
 * GROUNDWORK STATE: proportions, type and the mobile layout follow the Figma node once it
 * is readable (see `nav/variants/h7.tsx`).
 */
export default function OlavkaCover({ title, subtitle, ctaLabel, ctaHref, imageUrl }: HomeHeroProps) {
  if (!title) {
    return null
  }

  return (
    <section
      className="relative isolate w-full overflow-hidden bg-ui-bg-subtle"
      data-testid="olavka-cover"
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          priority
          quality={70}
          sizes="100vw"
          className="object-cover object-center"
        />
      ) : null}
      {imageUrl ? (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.36) 50%, rgba(0,0,0,0) 80%)",
          }}
        />
      ) : null}
      <div className="content-container relative flex min-h-[320px] flex-col justify-end pb-10 small:min-h-[440px] small:justify-center small:pb-0">
        <div className="flex max-w-[620px] flex-col items-start">
          <h1
            className={
              "text-balance text-[30px] font-semibold leading-[1.06] tracking-[-0.02em] small:text-[46px] " +
              (imageUrl ? "text-white" : "text-ui-fg-base")
            }
            data-testid="olavka-cover-title"
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className={
                "mt-4 max-w-[46ch] text-balance text-sm leading-relaxed small:text-base " +
                (imageUrl ? "text-[rgba(255,255,255,0.86)]" : "text-ui-fg-subtle")
              }
            >
              {subtitle}
            </p>
          ) : null}
          {ctaLabel && ctaHref ? (
            <Link
              href={ctaHref}
              className={
                "mt-7 inline-flex h-11 w-fit items-center justify-center rounded-full px-6 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] " +
                (imageUrl
                  ? "bg-ui-bg-base text-ui-fg-base hover:bg-ui-bg-component-hover"
                  : "bg-ui-contrast-bg-base text-ui-contrast-fg-primary hover:bg-ui-contrast-bg-base-hover")
              }
              data-testid="olavka-cover-cta"
            >
              {ctaLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  )
}
