import { galleryBrandName, getGallerySlides } from "./hero-gallery-data"
import HeroGalleryCarousel from "./hero-ga-carousel"

/**
 * GA · hero carousel with neighbours (composer key "ga",
 * `artifacts/docs/composer/lib/blocks.js:279` `galleryA`). Server wrapper: fetches the slide
 * list once per request (`getGallerySlides`, `./hero-gallery-data.ts` — categories capped at
 * 5, live per-request product counts) and hands it to the client island that owns position
 * state, pointer/keyboard input and the transform math (`hero-ga-carousel.tsx`). The composer's
 * own `moveA()` queries the DOM directly and has no server/client split to port as-is.
 *
 * Falls back to no markup at all below the 3-slide minimum (`hero-gallery-data.ts`'s
 * `MIN_SLIDES`, composer's own "≥ 3 слайда" role, `blocks.js:207`) — the same rule
 * `ProfileHero` and `CategoryTiles` already apply to a profile with nothing to show, never a
 * placeholder band.
 */
export default async function HeroGA() {
  const slides = await getGallerySlides()
  if (!slides) {
    return null
  }

  return <HeroGalleryCarousel slides={slides} brandName={galleryBrandName} />
}
