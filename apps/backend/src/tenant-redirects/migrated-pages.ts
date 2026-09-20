/**
 * The old CONTENT-page addresses of a migrated shop (b08-seo-storefront).
 *
 * `migrated-redirects.ts` derives the catalogue's 301s from metadata the
 * importer left on every product and category. A content page cannot be done
 * the same way: `tenant_page` has no `metadata` column at all
 * (`src/modules/tenant/models/tenant-page.ts`), and the importer creates pages
 * through `PUT /tenants/pages/<key>`, which carries title, body, locale and
 * nothing else. So the pair "old address → page key" has no home in the
 * database, and the one place it IS written down is the migration registry the
 * live import produced
 * (`handoff/day-2026-09-16-oksana-store/artifacts/x01-tenant-live-import/02-mapping-registry-live.json`,
 * 16 `kind: "page"` rows, 15 of them with a `source_url`).
 *
 * A registry file next to one task's report is not something a deploy can run,
 * which is exactly the lesson b02-legal-and-redirects wrote down. So the 15
 * rows live HERE, in the tree the image is built from, and
 * `__tests__/migrated-pages-parity.unit.spec.ts` fails the build if this table
 * and that registry ever disagree.
 *
 * Nothing here invents a destination. `key` is the `tenant_page` key the page
 * was migrated INTO when the migration found one, and otherwise the source
 * slug itself — which is the key `t05-page-keys` made legal (`PAGE_SLUG_PATTERN`)
 * and the one `gap-recheck.md` §7 names for the three pages the shop still
 * lacks (`/ru/pages/delivery`, `/ru/pages/faq`, `/ru/pages/returns`). A row
 * whose page the tenant does not actually have writes NO redirect: a 301 into
 * a 404 is a worse answer than the 404 itself. The rows therefore start
 * answering on their own, with no code change, as soon as the shop's owner (or
 * `b14-pages-legal-content`) creates the page.
 */

export type MigratedPageAddress = {
  /** The pathname of the old shop, as the registry wrote it. */
  from_path: string;
  /** `tenant_page.key` the address belongs to. */
  key: string;
  /** `tenant_page.locale` the old address was written in. */
  locale: string;
};

/**
 * Keyed by the `migrated_from` stamp the importer puts on the catalogue
 * (`apps/backend/scripts/cherkashina-migration/import.mjs`), so a tenant is
 * only offered the addresses of the shop it was actually imported from.
 *
 * The old mirror's router doubled the locale: `/<country>/<locale>/<slug>`.
 * Taken as written, never rebuilt by a regex.
 */
export const MIGRATED_PAGE_ADDRESSES: Record<string, MigratedPageAddress[]> = {
  chrxnasdmds: [
    { from_path: "/ru/ru/contact", key: "contacts", locale: "ru" },
    { from_path: "/ru/ru/terms", key: "offer", locale: "ru" },
    { from_path: "/ru/ru/privacy", key: "privacy", locale: "ru" },
    { from_path: "/ru/ru/returns", key: "returns", locale: "ru" },
    { from_path: "/ru/ru/consent", key: "consent", locale: "ru" },
    { from_path: "/ru/ru/consent-marketing", key: "consent-marketing", locale: "ru" },
    { from_path: "/ru/ru/return-memo", key: "return-memo", locale: "ru" },
    { from_path: "/ru/ru/about", key: "about", locale: "ru" },
    { from_path: "/ru/ru/delivery", key: "delivery", locale: "ru" },
    { from_path: "/ru/ru/faq", key: "faq", locale: "ru" },
    { from_path: "/ru/ru/wholesale", key: "wholesale", locale: "ru" },
    { from_path: "/ru/en/about", key: "about", locale: "en" },
    { from_path: "/ru/en/delivery", key: "delivery", locale: "en" },
    { from_path: "/ru/en/faq", key: "faq", locale: "en" },
    { from_path: "/ru/en/wholesale", key: "wholesale", locale: "en" },
  ],
};

/** One published page of a tenant, as the backfill reads it. */
export type TenantPageRow = {
  key: string;
  locale: string;
  published?: boolean | null;
  created_at?: string | Date | null;
};

export type DerivedPageRedirect = {
  from_path: string;
  to_path: string;
  status_code: 301;
  /** The `migrated_from` value that produced this row, for the tenant's marker. */
  source: string;
};

export type PageDerivationResult = {
  rows: DerivedPageRedirect[];
  sources: string[];
  /** One line per old address with no page to send it to, for the deploy log. */
  unmapped: string[];
};

/**
 * Which locale the NEW address gets. The old address carries its own locale in
 * the second segment, and the registry records it; a shop that has SAVED its
 * language list is taken at its word, because a redirect into a language it
 * does not offer is a second 404 one hop later. An absent list is "nothing
 * saved", not "this shop is in English" — the same reading
 * `migrated-redirects.ts` settled on for the catalogue.
 */
export const pageTargetLocale = (
  addressLocale: string,
  enabledLocales: string[] | null,
  defaultLocale: string,
): string => {
  if (!enabledLocales || enabledLocales.length === 0) {
    return addressLocale;
  }

  if (enabledLocales.includes(addressLocale)) {
    return addressLocale;
  }

  return enabledLocales.includes(defaultLocale) ? defaultLocale : enabledLocales[0];
};

/**
 * The redirect rows one tenant's migrated CONTENT PAGES imply.
 *
 * `sources` are the `migrated_from` stamps found on this tenant's catalogue,
 * which is what says the shop came from that mirror at all. `seededAt` is the
 * same marker the catalogue derivation honours: a row the owner deleted in the
 * panel stays deleted instead of coming back on the next deploy.
 */
export const deriveMigratedPageRedirects = (
  sources: string[],
  pages: TenantPageRow[],
  options: {
    enabledLocales: string[] | null;
    defaultLocale: string;
    seededAt?: Record<string, string> | null;
  },
): PageDerivationResult => {
  const rows: DerivedPageRedirect[] = [];
  const unmapped: string[] = [];
  const used = new Set<string>();
  const seenFrom = new Set<string>();

  const published = new Map(
    pages
      .filter((page) => page.published !== false)
      .map((page) => [`${page.key}:${page.locale}`, page] as const),
  );

  for (const source of sources) {
    const addresses = MIGRATED_PAGE_ADDRESSES[source];
    if (!addresses) {
      continue;
    }

    // The pages get their OWN marker, not the catalogue's. The catalogue was
    // stamped by b02's first deploy, months of page addresses later; reading
    // that stamp here would mean "already offered" for rows that have never
    // been written once (measured on the b08 stand: `redirects_seeded_from`
    // already carried `chrxnasdmds` while `tenant_redirect` held no page row
    // at all).
    const marker = options.seededAt?.[source];

    for (const address of addresses) {
      const locale = pageTargetLocale(address.locale, options.enabledLocales, options.defaultLocale);
      const page = published.get(`${address.key}:${locale}`);

      if (!page) {
        unmapped.push(
          `page ${address.from_path}: the shop has no published page "${address.key}" in "${locale}" — no redirect written (it appears by itself once the page exists)`,
        );
        continue;
      }

      // The marker says "this address was offered once". An address whose page
      // is OLDER than the marker and missing from the table was deleted by the
      // owner, and minting it again would undo her edit on the next deploy. A
      // page created AFTER the marker has never been offered at all — which is
      // every one of the ten addresses waiting on `b14-pages-legal-content`, so
      // reading the marker as "this source is done" would have frozen them out
      // for good (measured on the b08 stand: the page created after the first
      // run got no redirect until this branch existed).
      if (marker && !isCreatedAfter(page.created_at, marker)) {
        continue;
      }

      const toPath = `/${locale}/pages/${address.key}`;

      if (address.from_path === toPath || seenFrom.has(address.from_path)) {
        continue;
      }

      seenFrom.add(address.from_path);
      used.add(source);
      rows.push({ from_path: address.from_path, to_path: toPath, status_code: 301, source });
    }
  }

  return { rows, sources: [...used], unmapped };
};

/**
 * The tenant-metadata key the page backfill stamps,
 * `{ "<migrated_from>": "<ISO>" }`. Separate from the catalogue's
 * `redirects_seeded_from` on purpose — see `deriveMigratedPageRedirects`.
 */
export const PAGE_SEEDED_METADATA_KEY = "page_redirects_seeded_from";

export const readPageSeededMarker = (metadata: unknown): Record<string, string> => {
  const bag = (metadata ?? {}) as Record<string, unknown>;
  const stored = bag[PAGE_SEEDED_METADATA_KEY];
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [source, at] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof at === "string") out[source] = at;
  }
  return out;
};

/**
 * Was the page created after the backfill last stamped this source? No
 * timestamp is read as "already offered", so a missing column can never
 * resurrect a redirect the owner deleted — the same reading
 * `migrated-redirects.ts` gives the catalogue's rows.
 */
const isCreatedAfter = (createdAt: TenantPageRow["created_at"], marker: string): boolean => {
  if (!createdAt) {
    return false;
  }
  const created = createdAt instanceof Date ? createdAt.getTime() : Date.parse(String(createdAt));
  const seeded = Date.parse(marker);
  if (Number.isNaN(created) || Number.isNaN(seeded)) {
    return false;
  }
  return created > seeded;
};
