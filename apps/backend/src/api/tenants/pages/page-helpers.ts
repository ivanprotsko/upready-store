import { MedusaError } from "@medusajs/framework/utils";
import {
  TENANT_PAGE_KEYS,
  isReservedPageKey,
  isValidPageSlug,
  type TenantPageKey,
} from "../../../modules/tenant/models/tenant-page";

/**
 * Shared shape and guards for tenant content pages (t05-page-keys widened
 * `docs/tenant-panel/api-contract.md`, "Piece 7", from a fixed set of five keys
 * to a free slug per tenant). The panel lists the five reserved sections
 * whether or not the tenant has saved them, so an unsaved reserved key is a
 * real row in the response with `id: null` rather than a gap the client has to
 * reconstruct from the key list; a custom slug only appears once it has been
 * created.
 */
export type TenantPageDto = {
  id: string | null;
  key: string;
  locale: string;
  title: string;
  body: string;
  published: boolean;
  in_footer: boolean;
  footer_order: number | null;
  reserved: boolean;
};

/** The model's own default; the panel edits one language today. */
export const DEFAULT_PAGE_LOCALE = "en";

/**
 * A key that is syntactically valid (`isValidPageSlug`) — reserved or custom —
 * so it may be looked up, created or updated. Kept for the path segment; the
 * body's own fields are `PutTenantPageSchema`'s job.
 */
export const assertPageKey = (raw: string): string => {
  if (!isValidPageSlug(raw) && !isReservedPageKey(raw)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Page with key "${raw}" was not found`);
  }

  return raw;
};

/**
 * `?locale=` on the tenant-side reads. Absent means `en`; anything that is not
 * a language tag is `INVALID_DATA`, never a silent fallback to `en`, so a
 * typo in the panel's query does not quietly edit the English page.
 */
export const parsePageLocale = (raw: unknown): string => {
  if (raw === undefined || raw === null || raw === "") {
    return DEFAULT_PAGE_LOCALE;
  }

  if (typeof raw !== "string" || !/^[a-z]{2}(?:-[A-Za-z0-9]{2,8})?$/.test(raw)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid request: 'locale' must be a BCP-47 language tag, e.g. en or pt-BR",
    );
  }

  return raw;
};

/** The unsaved state of a reserved section, in the same shape a saved row answers. */
export const blankPage = (key: TenantPageKey, locale: string): TenantPageDto => ({
  id: null,
  key,
  locale,
  title: "",
  body: "",
  published: false,
  // A reserved key kept its old behaviour: every published one used to show in
  // the footer unconditionally, so an unsaved reserved section still defaults
  // to "on" the first time its form opens. A custom page opts in explicitly.
  in_footer: true,
  footer_order: null,
  reserved: true,
});

type PageRow = {
  id: string;
  key: string;
  locale: string;
  title: string;
  body: string;
  published: boolean;
  in_footer: boolean;
  footer_order: number | null;
};

export const toPageDto = (row: PageRow): TenantPageDto => ({
  id: row.id,
  key: row.key,
  locale: row.locale,
  title: row.title,
  body: row.body,
  published: row.published,
  in_footer: row.in_footer,
  footer_order: row.footer_order,
  reserved: isReservedPageKey(row.key),
});

/**
 * The panel's list screen: the five reserved sections first, in their
 * canonical order (saved rows in place of the blanks, same as before
 * t05-page-keys), then every custom page the tenant has created, alphabetical
 * by title so a growing list stays scannable rather than reordering itself
 * every save.
 */
export const listPagesForPanel = (rows: PageRow[], locale: string): TenantPageDto[] => {
  const saved = new Map(rows.map((row) => [row.key, row]));

  const reserved = TENANT_PAGE_KEYS.map((key) => {
    const row = saved.get(key);
    return row ? toPageDto(row) : blankPage(key, locale);
  });

  const custom = rows
    .filter((row) => !isReservedPageKey(row.key))
    .map(toPageDto)
    .sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key));

  return [...reserved, ...custom];
};

const LOCALE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/**
 * The visitor's locale on the PUBLIC reads (`/store/tenant/pages*`). The
 * framework's `applyLocale` middleware already resolves it into `req.locale`
 * (`?locale=` first — which it DELETES from `req.query` — then the
 * `x-medusa-locale` header the storefront sends on every SDK call), so this
 * reads `req.locale` and only falls back to the raw header for a request that
 * bypassed the middleware. A malformed value is not an error on a public route:
 * it means «no preference», and the fallback chain of `pickPageForLocale`
 * decides.
 */
export const requestedPageLocale = (req: {
  locale?: string;
  headers: Record<string, unknown>;
}): string | null => {
  const raw = req.locale ?? req.headers["x-medusa-locale"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return LOCALE_TAG.test(trimmed) ? trimmed : null;
};

/**
 * One page per key for a visitor: their locale first, then its language part
 * (`pt-BR` → `pt`), then `en` (what the panel wrote first), then whatever
 * locale exists. A tenant whose default language is not English (the
 * Cherkashina shop: ru default, en second) is otherwise unreadable on its own
 * storefront, which served the `en` row alone before this fallback.
 */
export const pickPageForLocale = <T extends { locale: string }>(
  rows: T[],
  requested: string | null,
): T | null => {
  if (!rows.length) return null;
  const candidates = [requested, requested?.split("-")[0], DEFAULT_PAGE_LOCALE].filter(
    (l): l is string => Boolean(l),
  );
  for (const locale of candidates) {
    const hit = rows.find((row) => row.locale === locale);
    if (hit) return hit;
  }
  return [...rows].sort((a, b) => a.locale.localeCompare(b.locale))[0];
};
