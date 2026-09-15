/**
 * Redirect rows derived from what a MIGRATED catalogue already carries in its
 * own metadata (b02-legal-and-redirects, piece 2).
 *
 * `t11-seo-redirects` gave the platform the table and the middleware, and
 * `import-cherkashino-redirects.ts` filled that table ONCE, by hand, from the
 * migration registry JSON of one worktree — which is why the rows existed on
 * the acceptance stand and the live shop answered 404 for every old address
 * (`artifacts/q03-gap-recheck/gap-recheck.md` §4: `tenant_redirect` empty on
 * the whole platform). A registry file that lives next to one task's report is
 * not something a deploy can run, so the source of truth moves to the place
 * the deploy already has: the imported rows themselves.
 *
 * The importer writes `metadata.migrated_from` plus `metadata.source_url` on
 * every product and category it creates
 * (`apps/backend/scripts/cherkashina-migration/import.mjs`), so the old
 * address of a row and its new handle are both in the database. This module
 * turns that pair into redirect rows; `src/scripts/backfill-tenant-redirects.ts`
 * writes them and `docker-entrypoint.sh` runs it on every boot.
 *
 * Nothing here invents a path. A row with `source_url` is taken as written.
 * A row that carries only `source_handle` — every category imported before
 * this task, because the importer wrote `source_url` for products alone — is
 * rebuilt from the prefix its OWN siblings carry, and only when every sibling
 * of the same `migrated_from` agrees on that prefix; that is the very string
 * `import.mjs` composes (`${SOURCE_URL_PREFIX}/categories/<handle>`), read off
 * the data instead of retyped. Where the siblings disagree, or there are none,
 * the row is reported as unmapped and no redirect is written.
 *
 * The one thing the module DOES decide is the locale segment of the target,
 * because the old shop's URL shape is not this platform's — see `targetLocale`.
 */

export type MigratedResource = {
  /** `products` or `categories` — the segment this platform uses in its own URLs. */
  kind: "products" | "categories";
  /** The row's handle TODAY, after any rename the owner has since made. */
  handle: string;
  created_at?: string | Date | null;
  metadata?: Record<string, unknown> | null;
};

export type DerivedRedirect = {
  from_path: string;
  to_path: string;
  status_code: 301;
  /** The `migrated_from` value that produced this row, for the tenant's marker. */
  source: string;
};

export type DerivationResult = {
  rows: DerivedRedirect[];
  /** Sources seen among the rows that produced at least one path. */
  sources: string[];
  /** One line per row that carries a migration stamp but no usable address. */
  unmapped: string[];
};

/** The pathname of an absolute URL, or of a value already written as a path. */
export const sourcePathOf = (value: unknown): string | null => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const raw = value.trim();
  if (raw.startsWith("/")) {
    return raw.split("?")[0].split("#")[0];
  }
  try {
    return new URL(raw).pathname;
  } catch {
    return null;
  }
};

/**
 * Which locale segment the NEW address gets.
 *
 * The old shop's own locale stands in its path (olavka.ru answered on
 * `/ru/ru/products/<handle>`, the doubled segment of its Astro router), and it
 * is the honest first guess: a visitor arriving from a Russian page wants the
 * Russian one. It is used only when this shop actually answers in it —
 * otherwise the shop's default locale is, because a redirect into a language
 * the shop does not serve is a second 404 one hop later.
 */
export const targetLocale = (
  fromPath: string,
  enabledLocales: string[],
  defaultLocale: string,
): string => {
  const first = fromPath.split("/").filter(Boolean)[0];
  if (first && enabledLocales.includes(first)) {
    return first;
  }
  return enabledLocales.includes(defaultLocale) ? defaultLocale : (enabledLocales[0] ?? defaultLocale);
};

/**
 * The redirect rows one tenant's migrated catalogue implies.
 *
 * `seededAt` is the marker the backfill leaves on the tenant after a
 * successful run: rows created at or before it were already offered once, and
 * an address MISSING from the table since then was deleted by the owner in the
 * panel, not forgotten — re-minting it would undo her edit on the next deploy.
 * Rows created after the marker (a second import, a catalogue added later) are
 * still derived.
 */
export const deriveMigratedRedirects = (
  resources: MigratedResource[],
  options: {
    enabledLocales: string[];
    defaultLocale: string;
    /** ISO timestamp per `migrated_from` source, from `tenant.metadata`. */
    seededAt?: Record<string, string> | null;
  },
): DerivationResult => {
  const rows: DerivedRedirect[] = [];
  const unmapped: string[] = [];
  const sources = new Set<string>();
  const seenFrom = new Set<string>();
  const prefixes = sourcePrefixes(resources);

  for (const resource of resources) {
    const metadata = resource.metadata ?? {};
    const source = typeof metadata.migrated_from === "string" ? metadata.migrated_from : null;
    if (!source) {
      continue;
    }

    const marker = options.seededAt?.[source];
    if (marker && !isCreatedAfter(resource.created_at, marker)) {
      continue;
    }

    const fromPath = sourcePathOf(metadata.source_url) ?? rebuiltSourcePath(resource, source, prefixes);
    if (!fromPath) {
      unmapped.push(
        `${resource.kind.slice(0, -1)} ${resource.handle}: no metadata.source_url, and its address could not be rebuilt from the siblings of "${source}"`,
      );
      continue;
    }

    const locale = targetLocale(fromPath, options.enabledLocales, options.defaultLocale);
    const toPath = `/${locale}/${resource.kind}/${resource.handle}`;

    if (fromPath === toPath) {
      // The old address IS the new one (a shop migrated onto the same paths):
      // a row here would be a self-redirect, which the middleware reads as a
      // loop and answers 508 to.
      continue;
    }

    if (seenFrom.has(fromPath)) {
      unmapped.push(`${resource.kind.slice(0, -1)} ${resource.handle}: ${fromPath} is claimed by another row`);
      continue;
    }

    seenFrom.add(fromPath);
    sources.add(source);
    rows.push({ from_path: fromPath, to_path: toPath, status_code: 301, source });
  }

  return { rows, sources: [...sources], unmapped };
};

/**
 * The one path prefix each `migrated_from` source writes in front of
 * `/<kind>/<handle>`, taken from the rows that DO carry `source_url`. A source
 * whose rows disagree (two shops merged into one tenant, a partial re-import
 * from a different mirror) gets `null` and its `source_url`-less rows stay
 * unmapped — a prefix nobody can point at is exactly the guess this module
 * refuses to make.
 */
const sourcePrefixes = (resources: MigratedResource[]): Map<string, string | null> => {
  const seen = new Map<string, string | null>();

  for (const resource of resources) {
    const metadata = resource.metadata ?? {};
    const source = typeof metadata.migrated_from === "string" ? metadata.migrated_from : null;
    const path = sourcePathOf(metadata.source_url);
    if (!source || !path) {
      continue;
    }

    const marker = `/${resource.kind}/`;
    const cut = path.lastIndexOf(marker);
    if (cut < 0) {
      continue;
    }

    const prefix = path.slice(0, cut);
    if (!seen.has(source)) {
      seen.set(source, prefix);
    } else if (seen.get(source) !== prefix) {
      seen.set(source, null);
    }
  }

  return seen;
};

/** `<prefix>/<kind>/<source_handle>` — what the importer itself would have written. */
const rebuiltSourcePath = (
  resource: MigratedResource,
  source: string,
  prefixes: Map<string, string | null>,
): string | null => {
  const sourceHandle = (resource.metadata ?? {}).source_handle;
  const prefix = prefixes.get(source);
  if (typeof sourceHandle !== "string" || !sourceHandle || prefix === undefined || prefix === null) {
    return null;
  }
  return `${prefix}/${resource.kind}/${sourceHandle}`;
};

const isCreatedAfter = (createdAt: MigratedResource["created_at"], marker: string): boolean => {
  if (!createdAt) {
    // No timestamp to compare — treat the row as already offered, so a missing
    // column can never resurrect a redirect the owner deleted.
    return false;
  }
  const created = createdAt instanceof Date ? createdAt.getTime() : Date.parse(String(createdAt));
  const seeded = Date.parse(marker);
  if (Number.isNaN(created) || Number.isNaN(seeded)) {
    return false;
  }
  return created > seeded;
};

/** The tenant-metadata key the backfill stamps, `{ "<migrated_from>": "<ISO>" }`. */
export const SEEDED_METADATA_KEY = "redirects_seeded_from";

export const readSeededMarker = (metadata: unknown): Record<string, string> => {
  const bag = (metadata ?? {}) as Record<string, unknown>;
  const stored = bag[SEEDED_METADATA_KEY];
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [source, at] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof at === "string") out[source] = at;
  }
  return out;
};
