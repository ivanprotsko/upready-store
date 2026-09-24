import { getOlavkaHeroSlides } from "@lib/data/olavka-home"

import OlavkaHeroSliderCarousel from "./olavka-hero-slider-carousel"

/**
 * HeroSlider · Olavka redesign (t-2026-09-24-n15, Figma node 227-8180). Server wrapper:
 * assembles the slide list once per request (`getOlavkaHeroSlides`, real tenant data — its
 * TODO for a panel-side slides editor is on `OlavkaHeroSlide`) and hands it to the client
 * island that owns position state, pointer/keyboard input and the transform
 * (`olavka-hero-slider-carousel.tsx`), the same split `hero-ga.tsx` uses.
 *
 * Below two slides there is nothing to slide: the block renders nothing rather than a
 * one-slide carousel with dead arrows.
 */
export default async function OlavkaHeroSlider() {
  const slides = await getOlavkaHeroSlides()
  if (slides.length < 2) {
    return null
  }

  return <OlavkaHeroSliderCarousel slides={slides} />
}
