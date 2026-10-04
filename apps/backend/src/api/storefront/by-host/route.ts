import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";
import { isAttributionHidden, resolveAttribution } from "./attribution";
import { brandingResponse, readBranding } from "../../tenants/branding/branding";
import { loginSettingsResponse, readBuyerLoginMethod } from "../../tenants/login-settings/login-settings";
import {
  legacyManualPayment,
  manualPaymentPublicView,
  readManualPayment,
} from "../../tenants/payment-settings/manual/manual-payment";
import { paymentPreNoticePublicView, readPaymentPreNotice } from "../../../tenant-legal/payment-pre-notice";
import { readRobokassaSecretPublic } from "../../../tenant-secrets/robokassa";
import { readTributeSecretPublic } from "../../../tenant-secrets/tribute";
import { readTenantTestMode } from "../../../tenant-secrets/test-mode";
import { manualPaymentMethods, resolveTenantPaymentMethods } from "../../../tenant-secrets/payment-methods";
import {
  baseDomains,
  handleFromTechnicalHost,
  isTenantIdLabel,
  normalizeHost,
  primaryHostFor,
  tenantIdsFromLabel,
} from "./hosts";

/**
 * `GET /storefront/by-host?host=<host>` — the one call a storefront makes before
 * it knows which shop it is serving. Tenant-panel wave 2, piece 9
 * (`t-2026-09-12-mt-storefront-by-host`, `docs/multitenancy/storefront-by-host.md`).
 *
 * Public: no auth, no publishable key. It cannot live under `/store/*`, where
 * the framework's global gate answers 400 "Publishable API key required" to any
 * call without a key — and a key is exactly what this route exists to hand out
 * (measured 2026-09-11 on the stand, design §1). The key is not a secret: every
 * storefront ships it in its own HTML.
 *
 * Resolution order (design §2):
 *   1. an exact `tenant_domain` row (custom hosts, stored lowercase, no port);
 *   2. otherwise `<handle>.<base>` for one of `TENANT_BASE_DOMAINS`, matched
 *      against `tenant.handle`;
 *   3. otherwise 404 — the storefront then falls back to single-store mode.
 *
 * Theme, composition and the home document come from `tenant_home_config`
 * (piece 8). A tenant that never saved one gets `null` in all three and the
 * storefront keeps its build-time profile: a shop with no home document is
 * still a shop, and its catalog must render.
 */

type TenantHomeDocument = {
  theme?: { preset?: string } | null;
  settings?: { defaultMode?: string } | null;
} & Record<string, unknown>;

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const host = normalizeHost(req.query.host);

  if (!host) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Query parameter `host` is required.",
    );
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: domains } = await query.graph({
    entity: "tenant_domain",
    fields: ["id", "host", "tenant.id"],
    filters: { host: [host] },
  });

  let tenantId = domains[0]?.tenant?.id as string | undefined;

  // A technical host is `<label>.<base>`, and the label is one of three things:
  // the shop's CURRENT handle, a handle it used to answer on (kept for the 301s
  // and reserved for good), or its tenant id. All three resolve to the shop; only
  // the first is ever its main address (`specs/tenant-address/CANONICAL.md`).
  if (!tenantId) {
    const label = handleFromTechnicalHost(host);

    if (label) {
      const { data: byHandle } = await query.graph({
        entity: "tenant",
        fields: ["id"],
        filters: { handle: [label] },
      });

      tenantId = byHandle[0]?.id as string | undefined;

      if (!tenantId) {
        const { data: byAlias } = await query.graph({
          entity: "tenant_handle_alias",
          fields: ["id", "handle", "tenant.id"],
          filters: { handle: [label] },
        });

        tenantId = byAlias[0]?.tenant?.id as string | undefined;
      }

      if (!tenantId && isTenantIdLabel(label)) {
        const { data: byId } = await query.graph({
          entity: "tenant",
          fields: ["id"],
          filters: { id: tenantIdsFromLabel(label) },
        });

        tenantId = byId[0]?.id as string | undefined;
      }
    }
  }

  if (!tenantId) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No storefront is configured for host "${host}".`,
    );
  }

  const {
    data: [tenant],
  } = await query.graph({
    entity: "tenant",
    fields: [
      "id",
      "handle",
      "name",
      "metadata",
      "api_key.token",
      "home_config.config",
      "domains.host",
      "domains.is_primary",
      "locale_settings.default_locale",
      "locale_settings.enabled_locales",
      "locale_settings.default_country",
    ],
    // t17-analytics: `analytics` below reads `tenant.metadata.analytics`,
    // written by `PUT /tenants/analytics`. `metadata` is already fetched.
    filters: { id: [tenantId] },
  });

  if (!tenant?.id) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `No storefront is configured for host "${host}".`,
    );
  }

  const home = (tenant.home_config?.config ?? null) as TenantHomeDocument | null;
  const settings = home?.settings ?? null;
  const preset = home?.theme?.preset ?? null;

  // olavka-payments: the shop's offline ways to pay on `pp_system_default`
  // (`PUT /tenants/payment-settings/manual`), read once and reused below both
  // for the checkout's manual-kind UI (`manual_payment`) and for the
  // connected-methods resolver (`payment_methods`) — one parse of the raw
  // metadata document, not two.
  const manualPayment = readManualPayment(tenant.metadata as Record<string, unknown> | null);

  // t-2026-09-24-n10: which payment methods THIS shop has connected, so the
  // storefront can label `pp_system_default`'s demo card honestly instead of
  // presenting it as a real "manual payment" once it is the last resort.
  // `/store/payment-providers` (the checkout's own filter) uses the same
  // resolver against the same facts.
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const [robokassaSecret, tributeSecret, testMode] = await Promise.all([
    readRobokassaSecretPublic(pg, tenant.id as string, logger),
    readTributeSecretPublic(pg, tenant.id as string, logger),
    readTenantTestMode(pg, tenant.id as string),
  ]);
  const paymentMethods = resolveTenantPaymentMethods({
    robokassaEnabled: Boolean(robokassaSecret),
    tributeEnabled: Boolean(tributeSecret),
    ...manualPaymentMethods(legacyManualPayment(manualPayment)),
  });

  const primaryDomain = ((tenant.domains ?? []) as { host?: string; is_primary?: boolean }[]).find(
    (domain) => domain?.is_primary && domain.host,
  )?.host;

  const primaryHost = primaryHostFor({
    handle: tenant.handle as string,
    primaryDomain: primaryDomain ?? null,
    requestHost: host,
  });
  const attributionHidden = isAttributionHidden(
    (tenant.metadata ?? null) as Record<string, unknown> | null,
  );

  res.json({
    tenant: {
      id: tenant.id,
      handle: tenant.handle,
      name: tenant.name,
    },
    // The ONE address everything absolute is built on — canonical, hreflang,
    // sitemap, robots, JSON-LD, og:url — and the target every other address of
    // this shop redirects to, page for page. The storefront compares the host it
    // was asked on against this one; see `src/middleware.ts`.
    primary_host: primaryHost,
    is_primary_host: host === primaryHost,
    // For the panel's list of addresses: the zone this request's technical host
    // lives in, so the id address can be written out without guessing.
    base_domain: baseDomains()[0],
    // Null only for a tenant whose key was deleted through the Admin: one key
    // per tenant is `createTenantWorkflow`'s invariant, not a database
    // constraint (`src/links/tenant-api-key.ts`). The storefront treats a null
    // the way it treats a 404 — single-store fallback — rather than calling the
    // Store API with the string "null".
    publishable_key: (tenant.api_key?.token as string | undefined) ?? null,
    theme: preset ? { preset, mode: settings?.defaultMode ?? null } : null,
    // The footer's attribution line, resolved shop → group → platform default
    // (`attribution.ts`). A shop that configures nothing still gets the
    // platform's own anchor; only a shop switched off with `attribution_hidden`
    // gets none, and says so in `attribution_hidden` so the storefront does not
    // fall back to the platform line either.
    attribution: attributionHidden
      ? null
      : resolveAttribution((tenant.metadata ?? null) as Record<string, unknown> | null),
    attribution_hidden: attributionHidden,
    // t11-seo-redirects step 6: the search-engine ownership tags the owner
    // pasted in from Yandex Webmaster / Google Search Console
    // (`PUT /tenants/seo-verification`), rendered as `<meta name="…">` in this
    // shop's `<head>` alone.
    seo_verification: {
      yandex:
        ((tenant.metadata as Record<string, unknown> | null)?.seo_verification as
          | Record<string, unknown>
          | undefined)?.yandex as string | undefined ?? null,
      google:
        ((tenant.metadata as Record<string, unknown> | null)?.seo_verification as
          | Record<string, unknown>
          | undefined)?.google as string | undefined ?? null,
    },
    // t17-analytics step 1: this shop's own counters, or both null when the
    // owner has set neither — the storefront then loads no analytics script
    // at all for this tenant (never the platform's build-time GA id, which
    // is the single-store fallback only, not a shared default for tenants).
    analytics: {
      yandex_metrica_id:
        ((tenant.metadata as Record<string, unknown> | null)?.analytics as
          | Record<string, unknown>
          | undefined)?.yandex_metrica_id as string | undefined ?? null,
      ga4_measurement_id:
        ((tenant.metadata as Record<string, unknown> | null)?.analytics as
          | Record<string, unknown>
          | undefined)?.ga4_measurement_id as string | undefined ?? null,
    },
    // t16-owner-branding: logo, favicon, og image, primary colour, footer
    // credit — served with the rest of this document so the storefront's
    // very first render already has them, no extra round trip.
    branding: brandingResponse(readBranding(tenant.metadata as Record<string, unknown> | null)),
    // o25-login-methods: which sign-in forms the storefront renders for THIS
    // shop's buyers. Enforcement lives on the backend routes themselves
    // (`login-method-gate.ts`); this is only what decides what to show.
    login: loginSettingsResponse(
      readBuyerLoginMethod(tenant.metadata as Record<string, unknown> | null),
    ),
    // olavka-payments: the shop's offline ways to pay on `pp_system_default`
    // (`PUT /tenants/payment-settings/manual`). A section that is off carries
    // no wallets and no contacts; the checkout offers only what is on, and a
    // shop that configured neither keeps the single «manual payment» it has.
    manual_payment: manualPaymentPublicView(manualPayment),
    // t-2026-09-24-n10: which of Robokassa and the manual provider's offline
    // kinds this shop has connected, and whether the demo card is still its
    // only way to pay. `/store/payment-providers` already filters the
    // checkout's own provider list off the same resolver; this copy is for
    // the honest demo-card label, which needs the fact and not just the list.
    payment_methods: paymentMethods,
    // t-2026-10-04-21 (checkout-v2 A3): payments and/or delivery in a provider's
    // test contour, from the accounts' own `is_test` flags — the storefront's
    // red dot in the top-right corner reads this.
    test_mode: testMode,
    // Rule 5zd (t-2026-10-03-32): the pre-payment notice's per-method fields,
    // owner-edited in «Настройки → Оплата». Nothing here is secret.
    payment_pre_notice: paymentPreNoticePublicView(
      readPaymentPreNotice(tenant.metadata as Record<string, unknown> | null),
    ),
    settings,
    home,
    // t06-locale-currency: absent (null) for a tenant that never saved
    // `tenant_locale_settings` — the storefront then falls back to its own
    // build-time `STOREFRONT_DEFAULT_LOCALE`/`LOCALE_PIN`/`LOCALE_COUNTRY_MAP`,
    // exactly today's single-image behaviour.
    locale: tenant.locale_settings
      ? {
          default_locale: tenant.locale_settings.default_locale,
          enabled_locales: tenant.locale_settings.enabled_locales,
          default_country: tenant.locale_settings.default_country ?? null,
        }
      : null,
  });
};
