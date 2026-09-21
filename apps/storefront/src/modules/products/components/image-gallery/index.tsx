"use client"

import type { HttpTypes } from "@medusajs/types"
import { useMemo } from "react"

import ProductMedia from "@modules/products/components/product-media"

import Gallery from "./gallery"
import { buildItems, itemsSignature, type GalleryItem } from "./items"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
  /** The product's title: the accessible name of its photos. */
  title?: string
}

/**
 * The product page's gallery. Everything visible lives in `./gallery`; this
 * file exists for the two decisions that sit above it.
 *
 * A product with no usable image keeps the gallery's place with the shared frame's
 * designed placeholder. It used to render nothing, and the page collapsed into one
 * column of text with a hole where the photo belongs.
 *
 * The gallery is keyed by the image list. A variant swap hands down a
 * different set of photos, and without the key the component would keep an
 * active index the new list may not even have — the chrxnasdmds suite pins
 * this down as "changing the images prop resets the active index to 0".
 */
const ImageGallery = ({ images, title }: ImageGalleryProps) => {
  const items = useMemo<GalleryItem[]>(() => buildItems(images), [images])
  const signature = useMemo(() => itemsSignature(items), [items])

  if (items.length === 0) {
    return (
      <div data-testid="product-gallery" data-hydrated="true">
        <ProductMedia src={null} alt={title ?? ""} context="gallery" />
      </div>
    )
  }

  return <Gallery key={signature} items={items} title={title} />
}

export default ImageGallery
