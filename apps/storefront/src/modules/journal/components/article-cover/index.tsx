import { clx } from "@medusajs/ui"
import Image from "next/image"

/**
 * An article's cover in a frame of the given aspect: the theme's subtle ground under it, so
 * an article with no cover keeps its place without a broken picture. The `alt` is empty:
 * every cover of the journal sits inside a link whose own text is the article's title.
 */
export default function ArticleCover({
  src,
  sizes,
  aspect,
  priority = false,
  zoom = true,
}: {
  src: string | null
  sizes: string
  /** A Tailwind aspect class, e.g. `aspect-[4/3]`. */
  aspect: string
  priority?: boolean
  /** Grows the picture a little on the link's hover. */
  zoom?: boolean
}) {
  return (
    <div
      className={clx(
        "relative w-full overflow-hidden rounded-rounded border border-ui-border-base bg-ui-bg-subtle",
        aspect
      )}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          className={clx(
            "object-cover",
            zoom &&
              "transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
          )}
        />
      ) : null}
    </div>
  )
}
