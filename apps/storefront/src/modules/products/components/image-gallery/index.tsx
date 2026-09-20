"use client"

import type { HttpTypes } from "@medusajs/types"
import { useMemo } from "react"

import Gallery from "./gallery"
import { buildItems, itemsSignature, type GalleryItem } from "./items"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
  /** `metadata.aspect_ratio` of the product, e.g. "3/4". Sizes the hero box. */
  aspectRatio?: string
}

/**
 * The product page's gallery. Everything visible lives in `./gallery`; this
 * file exists for the two decisions that sit above it.
 *
 * A product with no usable image renders nothing at all, so the page does not
 * open with an empty grey box where a photo should be.
 *
 * The gallery is keyed by the image list. A variant swap hands down a
 * different set of photos, and without the key the component would keep an
 * active index the new list may not even have — the chrxnasdmds suite pins
 * this down as "changing the images prop resets the active index to 0".
 */
const ImageGallery = ({ images, aspectRatio }: ImageGalleryProps) => {
  const items = useMemo<GalleryItem[]>(() => buildItems(images), [images])
  const signature = useMemo(() => itemsSignature(items), [items])

  if (items.length === 0) {
    return null
  }

  return <Gallery key={signature} items={items} aspectRatio={aspectRatio} />
}

export default ImageGallery
