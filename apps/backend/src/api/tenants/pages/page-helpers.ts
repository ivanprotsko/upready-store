import { MedusaError } from "@medusajs/framework/utils";
import {
  TENANT_PAGE_KEYS,
  type TenantPageKey,
} from "../../../modules/tenant/models/tenant-page";

/**
 * Shared shape and guards for the five content pages
 * (`docs/tenant-panel/api-contract.md`, "Piece 7"). The panel lists all five
 * sections whether or not the tenant has saved them, so an unsaved key is a
 * real row in the response with `id: null` rather than a gap the client has to
 * reconstruct from the key list.
 */
export type TenantPageDto = {
  id: string | null;
  key: TenantPageKey;
  locale: string;
  title: string;
  body: string;
  published: boolean;
};

/** The model's own default; the panel edits one language today. */
export const DEFAULT_PAGE_LOCALE = "en";

const isPageKey = (value: string): value is TenantPageKey =>
  (TENANT_PAGE_KEYS as readonly string[]).includes(value);

/**
 * A key outside the fixed five is a missing page, not a bad request: the
 * contract's own wording for `GET /tenants/pages/:key` is "404 for an unknown
 * key", and 404 is also what keeps this route from telling a caller which
 * section names exist. (`INVALID_DATA` in the same contract line covers the
 * body, which `PutTenantPageSchema` validates.)
 */
export const assertPageKey = (raw: string): TenantPageKey => {
  if (!isPageKey(raw)) {
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

/** The unsaved state of one section, in the same shape a saved row answers. */
export const blankPage = (key: TenantPageKey, locale: string): TenantPageDto => ({
  id: null,
  key,
  locale,
  title: "",
  body: "",
  published: false,
});

type PageRow = {
  id: string;
  key: string;
  locale: string;
  title: string;
  body: string;
  published: boolean;
};

export const toPageDto = (row: PageRow): TenantPageDto => ({
  id: row.id,
  key: row.key as TenantPageKey,
  locale: row.locale,
  title: row.title,
  body: row.body,
  published: row.published,
});

/**
 * The five sections in their canonical order, saved rows in place of the
 * blanks. A row whose key is not one of the five (a key removed from
 * `TENANT_PAGE_KEYS` after it was saved) is dropped rather than listed, so the
 * panel never renders a section it has no screen for.
 */
export const fillPageList = (rows: PageRow[], locale: string): TenantPageDto[] => {
  const saved = new Map(rows.filter((row) => isPageKey(row.key)).map((row) => [row.key, row]));

  return TENANT_PAGE_KEYS.map((key) => {
    const row = saved.get(key);
    return row ? toPageDto(row) : blankPage(key, locale);
  });
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
export const pickPageForLocale = <T extends PageRow>(rows: T[], requested: string | null): T | null => {
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
