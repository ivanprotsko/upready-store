/**
 * The fulfilment scheme of one marketplace order, in ONE spelling
 * (w15-mp-orders-desk).
 *
 * WHY THIS IS IN THE CORE. Both marketplaces name their schemes in their own
 * lower case — WB answers `deliveryType: "fbs"`, Ozon fills `scheme: "fbo"` —
 * and the spec's column takes `FBS | FBO | DBS | rFBS`. Upper-casing inside
 * each adapter would be the same rule written twice, and the day a third
 * adapter forgets it the feed grows a second «fbs» next to «FBS» and its
 * filter silently splits one scheme into two (rule 20). So the rule lives
 * here, both adapters call it, and `mp_order.scheme` has one spelling by
 * construction.
 *
 * WHAT IT DOES NOT DO. It does not map an unknown word onto a known one.
 * WB's `wbgo` (its own courier delivery) has no name in the set above, and
 * calling it FBS would put our word where WB's stands (rule 17a). An
 * unrecognised value travels upper-cased and shows up in the filter as itself.
 */

/** The schemes `research/marketplace-spec.md` section 2.3 names for the column. */
export const MP_SCHEMES = ["FBS", "FBO", "DBS", "rFBS"] as const;
export type MpScheme = (typeof MP_SCHEMES)[number];

/** `FBS` for `fbs`, `rFBS` for `rfbs`, and an unknown word upper-cased as it came. */
export const canonicalScheme = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const known = MP_SCHEMES.find((scheme) => scheme.toLowerCase() === raw.toLowerCase());
  return known ?? raw.toUpperCase();
};
