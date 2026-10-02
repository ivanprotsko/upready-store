/**
 * `t-cherk-31` — the «sister sites» a shop cross-links `hreflang` to: the
 * other sites of the same client, domain plus the one locale each stands for.
 *
 * Two sources, merged (`design: plan.md` §3 picks the smallest shape that
 * covers both):
 *
 * - GROUP-DERIVED: every other tenant of this one's `tenant_group`, when it
 *   has saved both a primary domain and `tenant_locale_settings.default_locale`
 *   (`/store/tenant/sites` builds this half, it needs a `query.graph` call this
 *   module does not do). Automatic, and it stays correct as the group's own
 *   domains and locale change — no second place to edit.
 * - OVERRIDE: `tenant.metadata.hreflang_sisters`, written by the owner through
 *   `PUT /tenants/hreflang-sisters`, for a sister that does NOT live in this
 *   database — Ivan's Р2 fork, where `.ru` and `.com` end up on different
 *   servers with different databases, so the group query above would never see
 *   it. A flat array in `metadata` rather than a new table: the list is at most
 *   a handful of rows, it needs no relation, and `branding`/`analytics` already
 *   use this exact shape for a per-tenant settings document nobody else reads.
 *
 * The override wins on a domain both sources name, because it is the one the
 * owner typed on purpose; the group side is only ever a convenience default.
 */

export type HreflangSister = {
  domain: string;
  locale: string;
};

const isHreflangSister = (value: unknown): value is HreflangSister =>
  Boolean(value) &&
  typeof (value as HreflangSister).domain === "string" &&
  typeof (value as HreflangSister).locale === "string";

/** The owner's override list, or `[]` for a tenant that never saved one. */
export const readHreflangSistersOverride = (
  metadata: Record<string, unknown> | null | undefined,
): HreflangSister[] => {
  const raw = metadata?.["hreflang_sisters"];

  return Array.isArray(raw) ? raw.filter(isHreflangSister) : [];
};

/** Both sources, deduplicated by domain (case-insensitive), override wins. */
export const mergeHreflangSisters = (
  groupDerived: HreflangSister[],
  override: HreflangSister[],
): HreflangSister[] => {
  const byDomain = new Map<string, HreflangSister>();

  for (const sister of [...groupDerived, ...override]) {
    byDomain.set(sister.domain.toLowerCase(), sister);
  }

  return [...byDomain.values()];
};
