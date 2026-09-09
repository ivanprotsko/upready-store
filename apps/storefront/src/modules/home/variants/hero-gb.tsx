import { galleryBrandName, getGallerySlides } from "./hero-gallery-data"
import HeroGalleryStrips from "./hero-gb-strips"

/**
 * GB · hero stripes (composer key "gb", `artifacts/docs/composer/lib/blocks.js:290`
 * `galleryB`). Server wrapper — same slide source and same 3-slide floor as `hero-ga.tsx`,
 * handed to the click-to-expand client island in `hero-gb-strips.tsx`.
 */
export default async function HeroGB() {
  const slides = await getGallerySlides()
  if (!slides) {
    return null
  }

  return <HeroGalleryStrips slides={slides} brandName={galleryBrandName} />
}
