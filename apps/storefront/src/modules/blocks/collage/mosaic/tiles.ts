import type { HttpTypes } from "@medusajs/types"

import { resolveImageRef, type BlockImage } from "@lib/data/block-image"
import { getCategoryByHandle } from "@lib/data/categories"
import { getCountryCode } from "@lib/data/cookies"
import { listProducts } from "@lib/data/products"
import { categoryImage } from "@lib/util/category-image"
import { DEFAULT_REGION } from "@lib/util/env"

import { pickText } from "../../shared/localized-text"
import type { MosaicTile } from "./props"

/** A tile ready to draw: a picture with its caption and link, or a product for the storefront's card. */
export type ResolvedTile =
  | { kind: "picture"; picture: BlockImage; title: string | null; href: string | null }
  | { kind: "product"; product: HttpTypes.StoreProduct }

async function resolveTile(tile: MosaicTile, locale: string): Promise<ResolvedTile | null> {
  try {
    if ("image" in tile) {
      const picture = await resolveImageRef(tile.image, locale)
      return picture ? { kind: "picture", picture, title: pickText(tile.title, locale), href: tile.href } : null
    }
    if ("category" in tile) {
      const category = await getCategoryByHandle([tile.category])
      const image = category ? categoryImage(category) : null
      if (!category || !image?.url) return null
      return {
        kind: "picture",
        picture: { url: image.url, alt: image.alt || category.name, width: null, height: null },
        title: category.name || null,
        href: `/categories/${tile.category}`,
      }
    }
    const { response } = await listProducts({
      countryCode: (await getCountryCode()) ?? DEFAULT_REGION,
      queryParams: { handle: tile.product, limit: 1 },
    })
    const product = response.products.find((candidate) => candidate.handle === tile.product)
    return product ? { kind: "product", product } : null
  } catch (error) {
    // A failed read is not an empty source (rule 20a): the tile drops out, and the log names it.
    console.error(`collage/mosaic: could not read ${nameOf(tile)}`, error)
    return null
  }
}

/** The tile as the log names it: `product "skillet"`, `category "cookware"`, `image {"src":…}`. */
const nameOf = (tile: MosaicTile): string =>
  "product" in tile
    ? `product "${tile.product}"`
    : "category" in tile
      ? `category "${tile.category}"`
      : `image ${JSON.stringify(tile.image)}`

/**
 * The mosaic's tiles, each read through the shop's own loaders, the ones its pages use: a
 * picture through `resolveImageRef`, a category through `getCategoryByHandle` and the picture
 * its owner gave it (`categoryImage`), a product through `listProducts` with the prices of the
 * visitor's region. A tile that is not there (no such product or category, a category without a
 * picture, a failed read) is dropped; the rest keep their order. A failed read is logged.
 */
export async function resolveMosaicTiles(tiles: readonly MosaicTile[], locale: string): Promise<ResolvedTile[]> {
  const resolved = await Promise.all(tiles.map((tile) => resolveTile(tile, locale)))
  return resolved.filter((tile): tile is ResolvedTile => tile !== null)
}
