const MAX_LENGTH = 160

/**
 * A candidate can be raw tenant markdown (`@lib/util/markdown.ts`'s body, or a
 * page title), not just HTML. `resolveLegalPlaceholders` in the backend's
 * `tenant-legal/requisites.ts` wraps an unfilled `{{ТОКЕН}}` in backticks so
 * the storefront's markdown reader renders it as a code span rather than
 * eating its underscores as emphasis (t12-legal-requisites). A `<meta>` tag
 * and `<title>` have no markdown reader behind them, so that backtick would
 * otherwise reach a search result or a social-card preview literally
 * (accept-t12-legal-requisites-3 nit 1) instead of turning into styling.
 */
export function metaDescription(
  ...candidates: (string | null | undefined)[]
): string | undefined {
  for (const candidate of candidates) {
    const text = candidate
      ?.replace(/<[^>]*>/g, " ")
      .replace(/`/g, "")
      .replace(/\s+/g, " ")
      .trim()

    if (!text) continue
    if (text.length <= MAX_LENGTH) return text

    const clipped = text.slice(0, MAX_LENGTH - 1)
    const lastSpace = clipped.lastIndexOf(" ")
    const cut = lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped

    return `${cut.replace(/[\s.,;:!?–—-]+$/, "")}…`
  }

  return undefined
}
