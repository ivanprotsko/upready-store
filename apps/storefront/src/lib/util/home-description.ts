import { metaDescription } from "./meta-description"

/**
 * The home page's `description` (t-2026-10-08-13). The shop's own text wins:
 * the line its owner wrote under the hero title in the panel, in the visitor's
 * language. A shop that wrote none gets the neutral line of the catalog, which
 * is true for any shop. The starter's "discover our curated collection" was not.
 */
export const homeDescription = (ownText: string | null | undefined, neutral: string): string =>
  metaDescription(ownText) ?? neutral
