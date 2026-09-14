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

/**
 * The base domain a host arrived on (`acme.shipshift.dev` → `shipshift.dev`), or
 * null when the host is not `<label>.<base>` for any configured base.
 *
 * The MAIN address of a shop is built on this rather than on the first configured
 * base: a stand opened at `acme.localhost:8013` must stay canonical on itself, and
 * naming `acme.upready.dev` there would send the developer's browser to a host
 * that does not exist (`specs/tenant-address/CANONICAL.md` §1.1).
 */
export const baseDomainOfHost = (host: string): string | null => {
  for (const base of baseDomains()) {
    const suffix = `.${base}`;

    if (!host.endsWith(suffix)) {
      continue;
    }

    const label = host.slice(0, -suffix.length);

    if (label && !label.includes(".")) {
      return base;
    }
  }

  return null;
};

/**
 * The base domain that COVERS a host: the one it is a subdomain of, or the one
 * it IS. `acme.localhost` and a bare `localhost` both answer `localhost`.
 *
 * `baseDomainOfHost` above answers only for `<label>.<base>`, which is right
 * when the question is "whose technical subdomain is this". This one answers
 * "which of our worlds does this address live in", and a deployment's own
 * fallback address (`STOREFRONT_URL`) is exactly such a host: on the live
 * multi-tenant deployment it is the base itself (`shipshift.dev`), on a stand
 * it is `localhost:8041`. Used by `src/tenant-notifications/storefront-origin.ts`
 * to pick the base a shop's subdomain is built on.
 */
export const baseDomainCovering = (host: string): string | null => {
  for (const base of baseDomains()) {
    if (host === base || host.endsWith(`.${base}`)) {
      return base;
    }
  }

  return null;
};

/**
 * The shop's MAIN public address: the custom domain its owner marked primary, or
 * the platform subdomain built from its handle. One source, and everything that
 * has to agree — `canonical`, `hreflang`, `sitemap`, `robots`, `JSON-LD`,
 * `og:url` — is built from it.
 */
export const primaryHostFor = (input: {
  handle: string;
  primaryDomain?: string | null;
  requestHost?: string | null;
}): string => {
  if (input.primaryDomain) {
    return input.primaryDomain;
  }

  const base =
    (input.requestHost ? baseDomainOfHost(input.requestHost) : null) ??
    baseDomains()[0];

  return `${input.handle}.${base}`;
};

/**
 * The shop's technical address — `<tenant_id>.<base>` — as a host LABEL. A host
 * is lowercase by the time it reaches us, and a Medusa id is a lowercase prefix
 * plus an uppercase ULID (`ten_01M28GBEV6SBGBWKFCHTHREN9N`, measured on the live
 * deployment 2026-09-12), so the label is the id lowercased.
 *
 * This address exists so support, integrations, internal links and monitoring
 * have one name that survives every change of handle. It is never canonical: it
 * answers 301 to the main address, and `noindex` if it ever answers 200 at all
 * (`specs/tenant-address/CANONICAL.md` §1.3).
 */
export const isTenantIdLabel = (label: string): boolean =>
  /^ten_[a-z0-9]+$/.test(label);

/**
 * The ids to try for a `ten_…` label: the ULID re-uppercased (how Medusa mints
 * them today) and the label as written, so a lowercase id would still resolve.
 */
export const tenantIdsFromLabel = (label: string): string[] => {
  const upper = `ten_${label.slice(4).toUpperCase()}`;

  return upper === label ? [label] : [upper, label];
};

/** The technical id host of a tenant, for the panel's list of addresses. */
export const tenantIdHostFor = (tenantId: string, base: string): string =>
  `${tenantId.toLowerCase()}.${base}`;

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
