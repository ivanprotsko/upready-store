import { getOlavkaHeroSlides } from "@lib/data/olavka-home"

import OlavkaHeroSliderCarousel from "./olavka-hero-slider-carousel"

/**
 * HeroSliders · Olavka (t-2026-09-24-n15), Figma 238:17551. Server wrapper: reads the
 * slide list once per request (`getOlavkaHeroSlides` — the tenant's banners from the panel,
 * else its course products) and hands it to the client island (`olavka-hero-slider-carousel.tsx`)
 * that owns the scroll-snap track. No slides at all → no markup, never a placeholder band.
 */
export default async function OlavkaHeroSlider() {
  const slides = await getOlavkaHeroSlides()
  if (!slides.length) {
    return null
  }

  return <OlavkaHeroSliderCarousel slides={slides} />
}
