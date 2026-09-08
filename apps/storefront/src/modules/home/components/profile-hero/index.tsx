import Image from "next/image"

import { Link } from "@i18n/navigation"
import { hero } from "@lib/profile"

/**
 * The home hero, driven entirely by home.hero of the store profile. Two layouts, drawn as
 * frames 1-4 of artifacts/docs/2026-09-07-profile-home-mockup.md:
 *
 *   full-bleed — the photograph is the full width of the viewport and the copy sits on it
 *                under a horizontal scrim, so the copy switches to on-image whites;
 *   split      — copy on the page background in --fg/--muted, image in the other half,
 *                the two separated by a hairline; stacks image-first below 1024px.
 *
 * No hero in the profile means no markup at all — not an empty band, not a placeholder.
 * Server component with no request-scoped input, so the page stays statically renderable.
 */
export default function ProfileHero() {
  if (!hero || !hero.image) {
    return null
  }

  return hero.layout === "split" ? <SplitHero /> : <FullBleedHero />
}

function Cta({ onImage }: { onImage: boolean }) {
  if (!hero?.cta) return null

  return (
    <Link
      href={hero.cta.href}
      data-testid="profile-hero-cta"
      className={
        "inline-flex h-11 items-center justify-center rounded-full px-6 text-base font-medium " +
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive focus-visible:ring-2 focus-visible:ring-[var(--ring)] " +
        (onImage
          ? "w-fit bg-ui-bg-base text-ui-fg-base hover:bg-ui-bg-component-hover"
          : "w-fit bg-ui-contrast-bg-base text-ui-contrast-fg-primary hover:bg-ui-contrast-bg-base-hover")
      }
    >
      {hero.cta.label}
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
 *  - the copy carries its alpha inside the value (`text-[rgba(255,255,255,0.86)]`) instead
 *    of behind a `/86` modifier, for the same reason. The subheadline used to lose its rule
 *    entirely and inherit the page ink: black text on a light photograph, 1.0-1.4:1.
 *
 * The gradient runs sideways on desktop, where the copy is anchored left, and upwards on
 * mobile, where it sits at the bottom — two elements rather than one responsive class,
 * because an inline style cannot carry a breakpoint.
 */
const SCRIM_DESKTOP =
  "linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.30) 46%, rgba(0,0,0,0) 76%)"
const SCRIM_MOBILE =
  "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.30) 46%, rgba(0,0,0,0) 82%)"

function FullBleedHero() {
  if (!hero?.image) return null

  return (
    <section
      data-testid="profile-hero"
      data-hero-layout="full-bleed"
      className="relative isolate h-[440px] w-full overflow-hidden small:h-[560px]"
    >
      <Image
        src={hero.image}
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
            className="text-[30px] font-semibold leading-[1.06] tracking-[-0.02em] text-white small:text-[48px] small:tracking-[-0.035em]"
          >
            {hero.headline}
          </h1>
          {hero.subheadline ? (
            <p className="mt-4 max-w-[46ch] text-sm leading-relaxed text-[rgba(255,255,255,0.86)] small:text-base">
              {hero.subheadline}
            </p>
          ) : null}
          <div className="mt-7">
            <Cta onImage />
          </div>
        </div>
      </div>
    </section>
  )
}

function SplitHero() {
  if (!hero?.image) return null

  return (
    <section
      data-testid="profile-hero"
      data-hero-layout="split"
      className="grid w-full grid-cols-1 border-b border-ui-border-base small:h-[560px] small:grid-cols-2"
    >
      {/* Image first in the DOM so the mobile stack needs no order override. */}
      <div className="relative order-first aspect-[4/5] w-full small:order-last small:aspect-auto small:h-full small:border-l small:border-ui-border-base">
        <Image
          src={hero.image}
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
            className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-ui-fg-base small:text-[44px] small:tracking-[-0.04em]"
          >
            {hero.headline}
          </h1>
          {hero.subheadline ? (
            <p className="mt-4 text-sm leading-relaxed text-ui-fg-subtle small:text-base">
              {hero.subheadline}
            </p>
          ) : null}
          <div className="mt-8">
            <Cta onImage={false} />
          </div>
        </div>
      </div>
    </section>
  )
}
