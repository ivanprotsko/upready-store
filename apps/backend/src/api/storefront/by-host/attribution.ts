/**
 * The attribution line every tenant storefront carries in its footer:
 * «создание интернет-магазина — upready», where the first part is the anchor of
 * a link to us (`t-2026-09-12-footer-attribution`, Ivan's order 2 and 2.1).
 *
 * Point 2.1 is the whole reason this file exists rather than a constant in the
 * storefront's markup: different shops need DIFFERENT anchors, so that the links
 * we earn carry different keywords. The anchor is therefore data, resolved here
 * on three levels and merged field by field, so a shop can override the anchor
 * alone and inherit the address:
 *
 *   1. the shop      — `tenant.metadata.attribution`, an object with any of
 *                      `anchor`, `href`, `brand`, `rel`;
 *   2. its group     — `tenant.metadata.attribution_group` names an entry of
 *                      `ATTRIBUTION_GROUPS`, which is how one anchor is handed to
 *                      a whole batch of shops without touching each of them;
 *   3. the platform  — `ATTRIBUTION_ANCHOR` / `ATTRIBUTION_HREF` /
 *                      `ATTRIBUTION_BRAND` / `ATTRIBUTION_REL`, and the constants
 *                      below when even those are unset.
 *
 * The anchor is NOT a UI string and never enters `messages/*.json`: it is a
 * keyword chosen by whoever runs our SEO, not a sentence a translator can
 * rewrite.
 *
 * `rel` is `noopener` — no `nofollow`, deliberately. This is an honest credit
 * from the maker of the shop, not a sold placement; `noopener` is there because
 * the link opens in a new tab. See
 * `artifacts/docs/2026-09-12-storefront-wave2-mockup.md` §1.
 */

export type Attribution = {
  anchor: string;
  href: string;
  brand: string;
  rel: string;
};

/** Shipped defaults, used when the deployment configures nothing. */
export const ATTRIBUTION_FALLBACK: Attribution = {
  anchor: "создание интернет-магазина",
  href: "https://upready.dev",
  brand: "upready",
  rel: "noopener",
};

const trimmed = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const platformDefault = (): Attribution => ({
  anchor: trimmed(process.env.ATTRIBUTION_ANCHOR) ?? ATTRIBUTION_FALLBACK.anchor,
  href: trimmed(process.env.ATTRIBUTION_HREF) ?? ATTRIBUTION_FALLBACK.href,
  brand: trimmed(process.env.ATTRIBUTION_BRAND) ?? ATTRIBUTION_FALLBACK.brand,
  rel: trimmed(process.env.ATTRIBUTION_REL) ?? ATTRIBUTION_FALLBACK.rel,
});

export type AttributionOverride = Partial<Attribution>;

/**
 * `ATTRIBUTION_GROUPS` as `{"<group>": {"anchor": "…"}}`. Malformed JSON is
 * reported once and then treated as "no groups": a typo in one environment
 * variable must not take the storefront's footer down for every shop, and a
 * silent empty parse would be the same bug one level quieter (rule 20).
 */
export const parseAttributionGroups = (
  raw: string | undefined,
  onError: (message: string) => void = (message) => console.error(message),
): Record<string, AttributionOverride> => {
  if (!raw || !raw.trim()) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    onError(
      `ATTRIBUTION_GROUPS is not valid JSON, so no attribution group resolves: ${String(error)}`,
    );
    return {};
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    onError(
      'ATTRIBUTION_GROUPS must be an object of the shape {"<group>": {"anchor": "…"}}.',
    );
    return {};
  }

  const groups: Record<string, AttributionOverride> = {};

  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      groups[name] = pickOverride(value as Record<string, unknown>);
    }
  }

  return groups;
};

/** The four fields we accept from data, ignoring anything else that rides along. */
export const pickOverride = (
  source: Record<string, unknown> | null | undefined,
): AttributionOverride => {
  if (!source) {
    return {};
  }

  const override: AttributionOverride = {};

  for (const key of ["anchor", "href", "brand", "rel"] as const) {
    const value = trimmed(source[key]);

    if (value) {
      override[key] = value;
    }
  }

  return override;
};

/**
 * The line this tenant's footer shows. `metadata` is `tenant.metadata` as stored;
 * anything unexpected in it is ignored rather than thrown on, because a shop with
 * a typo in its metadata must still render a footer.
 */
export const resolveAttribution = (
  metadata: Record<string, unknown> | null | undefined,
  groups: Record<string, AttributionOverride> = parseAttributionGroups(
    process.env.ATTRIBUTION_GROUPS,
  ),
): Attribution => {
  const shop = pickOverride(
    (metadata?.attribution as Record<string, unknown> | undefined) ?? null,
  );

  const groupName = trimmed(metadata?.attribution_group);
  const group = groupName ? (groups[groupName] ?? {}) : {};

  return { ...platformDefault(), ...group, ...shop };
};
