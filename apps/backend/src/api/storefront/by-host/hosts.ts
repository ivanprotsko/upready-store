/**
 * Host plumbing shared by `GET /storefront/by-host` (the storefront's bootstrap)
 * and `/tenants/domains` (the panel's screen). One file, so the base-domain list,
 * the normalisation and the "this host is a technical subdomain" rule cannot
 * drift between the route that RESOLVES a host and the route that REFUSES to
 * store one.
 *
 * Design: `docs/multitenancy/storefront-by-host.md` §2.
 *
 * The technical host `<handle>.<base>` is never a `tenant_domain` row: it is
 * derived here from `tenant.handle` (already unique) and the platform's base
 * domains. That is how the invariant "every tenant always has a storefront
 * host, and nobody can delete it" holds by construction — there is no row to
 * delete.
 */

/**
 * Base domains whose `<handle>.<base>` subdomain every tenant owns. `localhost`
 * is in the default so a stand answers on `acme.localhost` with no /etc/hosts
 * entry (Chrome and curl resolve `*.localhost` to 127.0.0.1 themselves).
 */
export const TENANT_BASE_DOMAINS_DEFAULT = "upready.dev,localhost";

export const baseDomains = (): string[] =>
  (process.env.TENANT_BASE_DOMAINS ?? TENANT_BASE_DOMAINS_DEFAULT)
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);

/**
 * A `Host` header as the storefront hands it over: lowercased, the port cut off
 * (`acme.localhost:8013` → `acme.localhost`) and the root label of a
 * fully-qualified name dropped (`acme.upready.dev.` → `acme.upready.dev`).
 * Only a trailing `:<digits>` is a port, so an IPv6 literal's own colons
 * (`[::1]:8013`) survive the cut.
 */
export const normalizeHost = (raw: unknown): string => {
  if (typeof raw !== "string") {
    return "";
  }

  return raw.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
};

/** Every technical host of one tenant, one per configured base domain. */
export const technicalHostsFor = (handle: string): string[] =>
  baseDomains().map((base) => `${handle}.${base}`);

/**
 * The handle behind a technical host, or `null` when the host is not one.
 * Only the FIRST level counts: `shop.acme.localhost` is a custom host a tenant
 * may claim, not the technical subdomain of a tenant called `shop.acme`
 * (a handle cannot contain a dot — `PostTenantCreateSchema`).
 */
export const handleFromTechnicalHost = (host: string): string | null => {
  for (const base of baseDomains()) {
    const suffix = `.${base}`;

    if (!host.endsWith(suffix)) {
      continue;
    }

    const label = host.slice(0, -suffix.length);

    if (!label || label.includes(".")) {
      continue;
    }

    return label;
  }

  return null;
};

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * A storable custom host: at least two DNS labels, each 1–63 characters of
 * lowercase letters, digits and inner hyphens, 253 characters in total. A
 * single-label name (`localhost`) is refused, because it belongs to no tenant
 * and would shadow the single-store fallback.
 */
export const isValidHost = (host: string): boolean => {
  if (!host || host.length > 253) {
    return false;
  }

  const labels = host.split(".");

  return labels.length >= 2 && labels.every((label) => LABEL.test(label));
};
