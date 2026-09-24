import {
  COURSE_COVER_SIZES,
  coverSrcSet,
  type CourseCover as CourseCoverData,
} from "@lib/util/course-page"

/**
 * The course's cover in the gallery's place (t-2026-09-24-n23): one picture,
 * cut in advance into WebP variants of 480…1920 px by
 * `apps/backend/scripts/media/make-image-variants.mjs`, offered to the browser
 * through `srcset` + `sizes` so a phone, a tablet and a desktop each fetch
 * their own file.
 *
 * A plain `<img>`, not `next/image`: the variants ARE the optimisation, and the
 * optimiser would re-encode an already tuned WebP through `/_next/image` for
 * nothing. `width`/`height` reserve the box before the file arrives, so the
 * page does not jump; the ratio is the picture's own, never cropped.
 */
const CourseCover = ({ cover }: { cover: CourseCoverData }) => {
  const srcSet = coverSrcSet(cover)

  return (
    // eslint-disable-next-line @next/next/no-img-element -- pre-cut variants in srcset; next/image would re-encode them through /_next/image.
    <img
      src={cover.src}
      srcSet={srcSet || undefined}
      sizes={srcSet ? COURSE_COVER_SIZES : undefined}
      width={cover.width}
      height={cover.height}
      alt={cover.alt}
      fetchPriority="high"
      decoding="async"
      className="block h-auto w-full rounded-[var(--radius,8px)] bg-ui-bg-subtle"
      data-testid="course-cover"
    />
  )
}

export default CourseCover
