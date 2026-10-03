import Image from "next/image"

import { Link } from "@i18n/navigation"
import { hero } from "@lib/profile"
import type { HomeHeroProps } from "@modules/home/variants/types"

/**
 * The home hero, driven entirely by home.hero of the store profile. Three layouts:
 *
 *   full-bleed   — the photograph is the full width of the viewport and the copy sits on it
 *                  under a horizontal scrim, so the copy switches to on-image whites;
 *   split        — copy on the page background in --fg/--muted, image in the other half,
 *                  the two separated by a hairline; stacks image-first below 1024px.
 *   announcement — block K of the round-2 hero lab (artifacts/docs/2026-09-09-hero-round-2.md),
 *                  chosen by Ivan on 2026-09-09: no photograph at all, a flat band in the
 *                  brand's own accent. Needs no hero.image, so it is the one layout that
 *                  still renders when a profile has no photograph to offer.
 *
 * No hero in the profile means no markup at all — not an empty band, not a placeholder.
 * Server component with no request-scoped input, so the page stays statically renderable.
 *
 * Tenant panel wave 2, piece 8: every line of copy can also come from the tenant's own
 * home-page document (`content.hero` of `upready.tenant-home/v1`), handed down by
 * `(main)/page.tsx` as the optional props below. A field the tenant left empty falls back
 * to the build profile's own hero, so a stand with no tenant document renders exactly what
 * it rendered before. A tenant that filled in a headline but whose build profile has no
 * hero at all still gets the announcement band: that layout needs no photograph, which is
 * the one layout that can be composed from text alone.
 */
function resolveHero(props: HomeHeroProps) {
  // A shop with its own home document never borrows from the build profile
  // (`HomeHeroProps.profileFallback`): the profile is a fallback for a single-store
  // stand, not another shop's voice or photograph.
  const fallback = props.profileFallback === false ? null : hero
  const headline = props.title || fallback?.headline || null
  const subheadline = props.subtitle || fallback?.subheadline || null
  const image = props.imageUrl || fallback?.image || null
  const cta =
    props.ctaLabel && props.ctaHref
      ? { label: props.ctaLabel, href: props.ctaHref }
      : fallback?.cta ?? null
  // Which layout, when the build profile and the tenant disagree. `announcement` is the
  // one layout that renders NO photograph — it exists for a profile that has none to offer
  // — so a tenant that filled `content.hero.image_url` under a profile pinned to it would
  // have its image stored in the database and invisible on the screen. Measured on the live
  // shops 2026-09-12: all three demo tenants carried a hero image and none showed one.
  // A tenant image therefore overrides an image-less profile layout; every other case keeps
  // the profile's choice, so a single-store stand (no tenant document, no `props.imageUrl`)
  // renders exactly what it rendered before.
  const profileLayout = fallback?.layout ?? null
  const layout =
    props.imageUrl && (!profileLayout || profileLayout === "announcement")
      ? "full-bleed"
      : profileLayout ?? (image ? "full-bleed" : "announcement")

  return { headline, subheadline, image, cta, layout }
}

export default function ProfileHero(props: HomeHeroProps = {}) {
  const resolved = resolveHero(props)

  if (!resolved.headline) {
    return null
  }
  if (resolved.layout === "announcement") {
    return <AnnouncementHero {...resolved} />
  }
  if (!resolved.image) {
    return null
  }

  return resolved.layout === "split" ? (
    <SplitHero {...resolved} />
  ) : (
    <FullBleedHero {...resolved} />
  )
}

type ResolvedHero = ReturnType<typeof resolveHero>

/*
 * The CTA carries the preset's accent (electronics style board §3.2: the primary button is
 * one of the five places --primary appears), in whichever form its surface allows:
 *
 *   page     — the primary button itself: --button-inverted (bridged to --primary) under
 *              --contrast-fg-primary, which globals.css re-points to --primary-foreground on
 *              exactly this class. It used to be --contrast-bg-base, the fixed dark surface
 *              of tooltips and badges, which rendered the accent graphite;
 *   accent   — on the announcement band, which already IS --primary: the same pair
 *              inverted, a --primary-foreground chip with an accent label. Inside the band
 *              --contrast-fg-primary is --primary-foreground, so the chip needs no new token;
 *   image    — on a photograph under its scrim: a pill in the page's own --bg/--fg.
 */
type CtaSurface = "page" | "accent" | "image"

const CTA_SURFACE: Record<CtaSurface, string> = {
  page: "bg-ui-button-inverted text-ui-contrast-fg-primary hover:bg-ui-button-inverted-hover",
  accent: "bg-ui-contrast-fg-primary text-ui-button-inverted hover:underline underline-offset-4",
  image: "bg-ui-bg-base text-ui-fg-base hover:bg-ui-bg-component-hover",
}

function Cta({ on, cta }: { on: CtaSurface; cta: ResolvedHero["cta"] }) {
  if (!cta) return null

  return (
    <Link
      href={cta.href}
      data-testid="profile-hero-cta"
      className={
        "inline-flex h-11 w-fit items-center justify-center rounded-full px-6 text-base font-medium " +
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive focus-visible:ring-2 focus-visible:ring-[var(--ring)] " +
        CTA_SURFACE[on]
      }
    >
      {cta.label}
    </Link>
  )
}

/*
 * Block A of the hero lab (artifacts/docs/2026-09-08-hero-lab.md), chosen by Ivan on
 * 2026-09-09: the photograph full width, a real gradient scrim over it, and ALL the copy in
 * ONE ink — white. The two ways the first attempt failed are both closed here:
 *
 *  - the scrim is written as an inline gradient, not as `from-[var(--foreground)]/70`.
 *    Tailwind cannot put an alpha into a bare var() colour and drops the whole class in
 *    silence, which left `--tw-gradient-stops` unset and computed the band to
 *    `background-image: none` — there was no scrim on any stand at all;
 *  - the subheadline takes --contrast-fg-secondary, the second ink of the surface that is
 *    dark in both modes, and no opacity modifier: `text-ui-contrast-fg-primary/80` lost its
 *    rule entirely and inherited the page ink, black text on a photograph at 1.0-1.4:1. The
 *    alpha lives inside the token (the bridge row), where Tailwind cannot drop it.
 *
 * The gradient runs sideways on desktop, where the copy is anchored left, and upwards on
 * mobile, where it sits at the bottom — two elements rather than one responsive class,
 * because an inline style cannot carry a breakpoint.
 */
const SCRIM_DESKTOP =
  "linear-gradient(to right, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.46) 46%, rgba(0,0,0,0) 78%)"
const SCRIM_MOBILE =
  "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.46) 46%, rgba(0,0,0,0) 84%)"

function FullBleedHero({ headline, subheadline, image, cta }: ResolvedHero) {
  if (!image) return null

  return (
    <section
      data-testid="profile-hero"
      data-hero-layout="full-bleed"
      className="relative isolate h-[440px] w-full overflow-hidden small:h-[560px]"
    >
      <Image
        src={image}
        alt=""
        fill
        priority
        quality={70}
        sizes="100vw"
        className="object-cover object-center"
      />
      <div aria-hidden className="absolute inset-0 small:hidden" style={{ backgroundImage: SCRIM_MOBILE }} />
      <div aria-hidden className="absolute inset-0 hidden small:block" style={{ backgroundImage: SCRIM_DESKTOP }} />
      <div className="content-container relative flex h-full flex-col justify-end pb-10 small:justify-center small:pb-0">
        <div className="flex max-w-[620px] flex-col items-start">
          <h1
            data-testid="profile-hero-headline"
            // theme-colours allowlist: Ivan's hero treatment (2026-09-09, above) — white ink fixed over the photo's own dark scrim, not a theme surface.
            className="text-balance text-[30px] font-semibold leading-[1.06] tracking-[-0.02em] text-white small:text-[48px] small:tracking-[-0.035em]"
          >
            {headline}
          </h1>
          {subheadline ? (
            <p className="mt-4 max-w-[46ch] text-balance text-sm leading-relaxed text-ui-contrast-fg-secondary small:text-base">
              {subheadline}
            </p>
          ) : null}
          <div className="mt-7">
            <Cta on="image" cta={cta} />
          </div>
        </div>
      </div>
    </section>
  )
}

/*
 * Block K of the round-2 lab. Its band is painted with the SAME bridge the primary CTA
 * button already uses (globals.css, "The primary CTA's ink follows the ACCENT, not the
 * mode"): `bg-ui-button-inverted` resolves to the preset's --primary and re-points
 * --contrast-fg-primary to --primary-foreground, so the copy reads on any of the nine
 * accents without a new bridge or a new opacity-on-var() class — the exact pattern that
 * broke block A twice.
 *
 * BOTH lines of copy carry the full ink, on purpose. The bridge also offers
 * --contrast-fg-secondary, a 70% mix of the ink into the accent, and the first cut used it
 * for the subheadline: measured on the live stands (artifacts/docs/stands/measure-k.mjs)
 * that mix fails AA on three accents out of five — 4.47:1 electric blue, 4.09:1 green,
 * 3.66:1 terracotta. The lab's block K never muted the subheadline (`color: inherit`), and
 * that is what Ivan approved; size alone tells the two lines apart.
 *
 * The CTA is the `accent` surface of Cta above: the band's own pair turned over, so its label
 * is the accent and it stands off the band as a chip.
 */
function AnnouncementHero({ headline, subheadline, cta }: ResolvedHero) {
  if (!headline) return null

  return (
    <section
      data-testid="profile-hero"
      data-hero-layout="announcement"
      className="w-full bg-ui-button-inverted"
    >
      <div className="content-container flex flex-col items-start gap-4 py-14 small:py-20">
        <h1
          data-testid="profile-hero-headline"
          className="text-balance text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-ui-contrast-fg-primary small:max-w-[720px] small:text-[46px] small:tracking-[-0.03em]"
        >
          {headline}
        </h1>
        {subheadline ? (
          <p className="max-w-[60ch] text-balance text-sm leading-relaxed text-ui-contrast-fg-primary small:text-base">
            {subheadline}
          </p>
        ) : null}
        <div className="mt-2">
          <Cta on="accent" cta={cta} />
        </div>
      </div>
    </section>
  )
}

function SplitHero({ headline, subheadline, image, cta }: ResolvedHero) {
  if (!image) return null

  return (
    <section
      data-testid="profile-hero"
      data-hero-layout="split"
      className="grid w-full grid-cols-1 border-b border-ui-border-base small:h-[560px] small:grid-cols-2"
    >
      {/* Image first in the DOM so the mobile stack needs no order override. */}
      <div className="relative order-first aspect-[4/5] w-full small:order-last small:aspect-auto small:h-full small:border-l small:border-ui-border-base">
        <Image
          src={image}
          alt=""
          fill
          priority
          quality={70}
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover object-center"
        />
      </div>
      <div className="content-container flex flex-col justify-center border-t border-ui-border-base py-10 small:border-t-0 small:py-0">
        <div className="max-w-[520px]">
          <h1
            data-testid="profile-hero-headline"
            className="text-balance text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-ui-fg-base small:text-[44px] small:tracking-[-0.04em]"
          >
            {headline}
          </h1>
          {subheadline ? (
            <p className="mt-4 text-balance text-sm leading-relaxed text-ui-fg-subtle small:text-base">
              {subheadline}
            </p>
          ) : null}
          <div className="mt-8">
            <Cta on="page" cta={cta} />
          </div>
        </div>
      </div>
    </section>
  )
}
