/**
 * What a failed exchange with a marketplace means to the owner, as the key of
 * one plain sentence (o21-owner-panel-ux, P3). The raw text never reaches the
 * screen: it goes to `SupportDetails`.
 *
 * The reasons are the ones she can act on. A rejected key is hers to reissue,
 * «подождите» and «площадка не отвечает» need nothing from her, and everything
 * else is for support.
 */
export type MarketplaceErrorReason = "key" | "rights" | "wait" | "down" | "unknown"

export const marketplaceErrorReason = (raw: string | null | undefined): MarketplaceErrorReason => {
  const text = (raw ?? "").toLowerCase()
  if (/\b401\b|unauthorized|invalid api|token|api[- ]?key|client-id/.test(text)) {
    return "key"
  }
  if (/\b403\b|forbidden|permission|scope|access denied/.test(text)) {
    return "rights"
  }
  if (/\b429\b|too many|rate limit/.test(text)) {
    return "wait"
  }
  if (/\b50[0-4]\b|timeout|timed out|econn|enotfound|fetch failed|network/.test(text)) {
    return "down"
  }
  return "unknown"
}

/** `marketplaceErrors.<reason>` in the dictionary. */
export const marketplaceErrorKey = (raw: string | null | undefined) =>
  `marketplaceErrors.${marketplaceErrorReason(raw)}`
