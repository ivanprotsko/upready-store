"use client"

import { clx } from "@medusajs/ui"
import Image from "next/image"
import { useState } from "react"

type HoverImageProps = {
  src: string
  sizes: string
  quality: number
}

/**
 * A card's second photo, shown while a mouse is over the frame.
 *
 * It is not in the document until a mouse enters the frame for the first time. An
 * invisible `<img>` in the viewport is still fetched, so rendering it up front doubled
 * the image bytes of every grid, and on a phone nobody can hover to see what they paid
 * for. Touch and pen never mount it.
 */
export default function HoverImage({ src, sizes, quality }: HoverImageProps) {
  const [mounted, setMounted] = useState(false)
  const [loaded, setLoaded] = useState(false)

  return (
    <span
      aria-hidden
      data-product-media-hover={mounted ? "mounted" : "idle"}
      className="absolute inset-0"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setMounted(true)
      }}
    >
      {mounted ? (
        <span
          className={clx(
            "absolute inset-0 bg-ui-bg-subtle opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none",
            loaded && "group-hover/media:opacity-100"
          )}
        >
          <Image
            src={src}
            alt=""
            fill
            quality={quality}
            sizes={sizes}
            draggable={false}
            onLoad={() => setLoaded(true)}
            className="object-contain object-center"
          />
        </span>
      ) : null}
    </span>
  )
}
