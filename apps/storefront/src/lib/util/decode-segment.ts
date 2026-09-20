/**
 * A dynamic route segment, as the lookup key it is meant to be
 * (f11-new-product-404).
 *
 * Next 15.5 hands `params` the way the segment stands in the URL, which for a
 * non-ASCII handle means percent-encoded. Measured on 2026-09-15 against the
 * live catalogue of `cherkashino.shipshift.dev`, with the product
 * `тест-f11-кириллица` published and `GET /store/products?handle=…` answering
 * `count: 1` for it:
 *
 *     [f11probe] params.handle = "svechi-asd-s-chesnokom-10-sht-cherkashino"
 *     [f11probe] params.handle = "%D1%82%D0%B5%D1%81%D1%82-f11-%D0%BA%D0%B8%D1%80%D0%B8%D0%BB%D0%BB%D0%B8%D1%86%D0%B0"
 *
 * Passed on as it arrives, the second one is searched for literally, matches
 * nothing and the page answers 404 while the card for it sits in the catalogue.
 * So every segment that becomes a handle, a slug or a key goes through here
 * first.
 *
 * A malformed escape (`%` on its own, a lone surrogate) makes
 * `decodeURIComponent` throw. That is a visitor typing into the address bar,
 * not a bug, and it must not take the page down with a 500: the raw value is
 * returned instead and the lookup below answers 404 on its own.
 */
export function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** The same, for a catch-all segment (`[...category]`). */
export function decodeSegments(values: string[]): string[] {
  return values.map(decodeSegment)
}
