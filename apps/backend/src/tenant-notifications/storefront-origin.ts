/**
 * Where a customer's link must point (t08-order-notifications).
 *
 * On this deployment one backend serves every shop, so `STOREFRONT_URL` cannot
 * be the address in a customer's e-mail: on the multi-tenant host it is the
 * ENGINE's domain (`https://shipshift.dev`), while the shop the order was
 * placed in answers on `<handle>.shipshift.dev` or on its owner's own domain
 * (measured 2026-09-14, `~/upready/memory/upready-store-mt-caching-and-media-traps-2026-09-14.md` §2).
 * A letter built from the global variable sends the customer to the wrong site.
 *
 * So the shop's host is resolved per order, and `STOREFRONT_URL` keeps one job:
 * it donates the SCHEME and the PORT, which a host alone cannot carry. That is
 * what makes a local stand work, where every shop lives on
 * `http://<handle>.localhost:8041`, while the same code on the live host builds
 * `https://<handle>.shipshift.dev` with no port at all. With no tenant resolved
 * (a single-store install), `STOREFRONT_URL` is returned whole, unchanged.
 */

import {
  baseDomainCovering,
  baseDomains,
  normalizeHost,
  primaryHostFor,
} from "../api/storefront/by-host/hosts";
import { STOREFRONT_URL } from "../emails/i18n";

export type ShopHostInput = {
  handle: string;
  /** The custom domain the owner marked primary, if any. */
  primaryDomain?: string | null;
};

type UrlTemplate = {
  protocol: string;
  port: string;
  /** The hostname of the fallback address, lowercased and portless. */
  host: string;
};

/**
 * Scheme and port of the fallback address. An unparsable value is treated as
 * `https` with no port rather than throwing: a bad variable must not stop an
 * order confirmation from going out.
 */
export const templateFrom = (fallbackUrl: string = STOREFRONT_URL): UrlTemplate => {
  try {
    const url = new URL(fallbackUrl);
    return { protocol: url.protocol, port: url.port, host: normalizeHost(url.hostname) };
  } catch {
    return { protocol: "https:", port: "", host: "" };
  }
};

/**
 * WHICH base domain a shop's subdomain is built on, when several are
 * configured. The deployment's own fallback address is the tell: a stand whose
 * `STOREFRONT_URL` is `http://localhost:8041` builds `acme.localhost:8041`,
 * while the live host, where it is `https://shipshift.dev`, builds
 * `acme.shipshift.dev`. Without that, the default list's FIRST entry would win
 * and every stand would mail out links to a domain it cannot serve.
 */
export const baseDomainFor = (fallbackUrl: string = STOREFRONT_URL): string =>
  baseDomainCovering(templateFrom(fallbackUrl).host) ?? baseDomains()[0] ?? "";

/**
 * The origin of one shop: `<scheme>://<host>[:<port>]`, no trailing slash.
 *
 * A custom domain is always reached over https and on the default port — it is
 * a public name with a certificate, and it never borrows the stand's port.
 */
export const shopOrigin = (
  shop: ShopHostInput | null | undefined,
  fallbackUrl: string = STOREFRONT_URL,
): string => {
  if (!shop?.handle) {
    return fallbackUrl.replace(/\/$/, "");
  }

  if (shop.primaryDomain) {
    // `primaryHostFor` is the canon for "which address is the main one"; with a
    // primary domain set it answers that domain, and a public domain is always
    // reached over https on the default port.
    return `https://${primaryHostFor({ handle: shop.handle, primaryDomain: shop.primaryDomain })}`;
  }

  const { protocol, port } = templateFrom(fallbackUrl);
  const base = baseDomainFor(fallbackUrl);
  const host = base ? `${shop.handle}.${base}` : shop.handle;

  return `${protocol}//${host}${port ? `:${port}` : ""}`;
};

/**
 * The address of ONE order in the owner's panel. `PANEL_PUBLIC_URL` is the
 * deployment's panel (`https://panel.shipshift.dev`); `DEMO_PANEL_URL` is what
 * the onboarding wizard already hands a new owner, so it stands in when the
 * first is not set. Neither set means no link at all rather than a broken one.
 */
export const panelOrderUrl = (
  orderId: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null => {
  const base = env.PANEL_PUBLIC_URL || env.DEMO_PANEL_URL;

  if (!base) {
    return null;
  }

  return `${base.replace(/\/$/, "")}/orders/${orderId}`;
};

/**
 * The panel's own reset-password screen for one tenant admin
 * (f14-no-password-reset). Same `PANEL_PUBLIC_URL`/`DEMO_PANEL_URL` fallback
 * as {@link panelOrderUrl}, and the same "no base set means no link" contract:
 * `subscribers/password-reset-email.ts` logs and skips the send rather than
 * mailing a broken URL.
 */
export const panelResetPasswordUrl = (
  token: string,
  email: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null => {
  const base = env.PANEL_PUBLIC_URL || env.DEMO_PANEL_URL;

  if (!base) {
    return null;
  }

  return `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
};
