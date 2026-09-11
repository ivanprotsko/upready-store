import Image from "next/image"
import { clx } from "@medusajs/ui"

import ModeImage from "@modules/common/components/mode-image"

import "./image-frame.globals.css"
import styles from "./image-frame.module.css"
import { imageTreatmentStyle } from "./image-treatment"
import type { ProfileImageTreatment } from "./types"

/**
 * The box a catalogue picture sits in. Aspect, fit, radius and hover all come from
 * layout.imageTreatment; see image-treatment.ts for how the value reaches the DOM.
 *
 * Server component with no request-scoped input, so every page that uses it stays
 * statically renderable.
 */
export default function ImageFrame({
  src,
  srcDark,
  alt,
  treatment,
  secondSrc,
  priority,
  sizes,
  quality,
  className,
  "data-testid": dataTestid,
}: {
  src: string
  /** The dark version of `src` (`specs/store-profiles/MODE-IMAGE-PAIRS.md`); absent means
   *  the pair was never filled and both modes show `src`. The hover frame below has no
   *  pair of its own: the mode axis belongs to the product's main image. */
  srcDark?: string | null
  alt: string
  treatment: ProfileImageTreatment
  /** Rendered on top and cross-faded in on hover when hover === "second-image". */
  secondSrc?: string | null
  priority?: boolean
  sizes?: string
  quality?: number
  className?: string
  "data-testid"?: string
}) {
  const showSecond = treatment.hover === "second-image" && Boolean(secondSrc)

  return (
    <div
      className={clx(
        styles.frame,
        treatment.fit === "contain" && "bg-ui-bg-subtle",
        className
      )}
      style={imageTreatmentStyle(treatment)}
      data-image-frame=""
      data-image-aspect={treatment.aspect}
      data-testid={dataTestid}
    >
      <ModeImage
        src={src}
        srcDark={srcDark}
        alt={alt}
        priority={priority}
        quality={quality}
        sizes={sizes}
        draggable={false}
        className={styles.image}
      />
      {showSecond ? (
        <Image
          src={secondSrc as string}
          alt=""
          aria-hidden
          fill
          quality={quality}
          sizes={sizes}
          draggable={false}
          className={clx(styles.image, styles.secondary)}
        />
      ) : null}
    </div>
  )
}
