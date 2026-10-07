import { metaDescription } from "./meta-description"

/**
 * What decides whether the home page draws its hero block: the shop's hero
 * variant, the block order it saved, and whether it is an Olavka shop.
 */
type HomeHeroInput = {
  olavka: boolean
  /** The hero variant of the shop's composition; `none` draws no hero. */
  hero: string
  /** The order the shop saved, before any block is taken out of it. */
  savedOrder: readonly string[]
}

/**
 * The order the home page draws its blocks in. An Olavka shop's own blocks
 * take the hero's place, so the composed hero is left out of its order.
 */
export const homeBlockOrder = <Block extends string>(
  savedOrder: readonly Block[],
  olavka: boolean
): readonly Block[] => (olavka ? savedOrder.filter((block) => block !== "hero") : savedOrder)

/**
 * Whether the hero block is on the home page at all. One rule for the page
 * and for its `description`, so the two cannot drift apart.
 */
export const heroIsDrawn = ({ olavka, hero, savedOrder }: HomeHeroInput): boolean =>
  hero !== "none" && homeBlockOrder(savedOrder, olavka).includes("hero")

/**
 * The home page's `description` (t-2026-10-08-13). The shop's own text wins:
 * the line its owner wrote under the hero title in the panel, in the visitor's
 * language. A shop that wrote none gets the neutral line of the catalog, which
 * is true for any shop. The starter's "discover our curated collection" was not.
 *
 * The owner's line counts only while the hero is drawn. A shop that switched
 * the block off still has its text in the saved document, and that text is no
 * longer something the shop says: on one shop it promised a discount the shop
 * had withdrawn together with the block.
 */
export const homeDescription = (
  input: HomeHeroInput & { subtitle: string | null | undefined; neutral: string }
): string => (heroIsDrawn(input) ? metaDescription(input.subtitle) : undefined) ?? input.neutral
