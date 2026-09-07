import type {
  ImageAspect,
  ImageFit,
  ImageHover,
  ImageRadius,
  ProfileImageTreatment,
} from "./types"

/**
 * layout.imageTreatment reaches the DOM twice over.
 *
 * 1. As `data-*` attributes on <html>, set before first paint by the theme agent's pre-paint
 *    script, so the card grid never reflows when the profile's aspect differs from the
 *    stylesheet default. image-frame.module.css maps each attribute to its custom property.
 * 2. As the fallback baked into every `var(--image-…, fallback)` below, taken from
 *    profile.generated.json, so the treatment still applies when the attribute layer is
 *    absent — which is exactly the state of the repository until the pre-paint script lands.
 *
 * The attribute values are hyphenated ("4-5", not "4:5") so they are safe to use unquoted in
 * a selector and in a URL.
 */

export const ASPECT_ATTR: Record<ImageAspect, string> = {
  "1:1": "1-1",
  "4:5": "4-5",
  "3:4": "3-4",
}

export const ASPECT_RATIO: Record<ImageAspect, string> = {
  "1:1": "1 / 1",
  "4:5": "4 / 5",
  "3:4": "3 / 4",
}

export const RADIUS_LENGTH: Record<ImageRadius, string> = {
  none: "0px",
  md: "0.5rem",
  lg: "0.75rem",
}

/** `second-image` swaps the source rather than scaling it, so its scale stays 1. */
export const HOVER_SCALE: Record<ImageHover, string> = {
  none: "1",
  "second-image": "1",
  zoom: "1.04",
}

export type ImageTreatmentAttributes = {
  "data-image-aspect": string
  "data-image-fit": ImageFit
  "data-image-radius": ImageRadius
  "data-image-hover": ImageHover
}

/**
 * The attributes the pre-paint script must put on <html>. Exported so whoever owns that
 * script writes one line instead of re-deriving the mapping.
 */
export function imageTreatmentAttributes(
  treatment: ProfileImageTreatment | null
): ImageTreatmentAttributes | null {
  if (!treatment) return null
  return {
    "data-image-aspect": ASPECT_ATTR[treatment.aspect],
    "data-image-fit": treatment.fit,
    "data-image-radius": treatment.radius,
    "data-image-hover": treatment.hover,
  }
}

/** The custom-property fallbacks written onto the frame element itself. */
export function imageTreatmentStyle(
  treatment: ProfileImageTreatment | null
): React.CSSProperties {
  if (!treatment) return {}
  return {
    aspectRatio: `var(--image-aspect, ${ASPECT_RATIO[treatment.aspect]})`,
    borderRadius: `var(--image-radius, ${RADIUS_LENGTH[treatment.radius]})`,
    ["--image-fit-fallback" as string]: treatment.fit,
    ["--image-hover-scale-fallback" as string]: HOVER_SCALE[treatment.hover],
  }
}
