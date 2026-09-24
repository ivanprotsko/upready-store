import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { getTenantScope } from "../tenant-scope";
import {
  maskRobokassaSettings,
  readRobokassaSecret,
  type MaskedRobokassaSettings,
} from "../../../tenant-secrets/robokassa";
import {
  manualPaymentMethods,
  resolveTenantPaymentMethods,
  type TenantPaymentMethods,
} from "../../../tenant-secrets/payment-methods";
import { readManualPayment } from "./manual/manual-payment";

/**
 * A host served over plain HTTP for real: a local stand. Everything else on
 * this platform answers over TLS, so `http://` in front of it is never the
 * scheme the shop actually lives on.
 */
const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost)(?::\d+)?$/i;

/**
 * The origin of the engine as the outside world reaches it. `BACKEND_PUBLIC_URL`
 * is the deployment's own answer (on the MT host `https://shipshift.dev`) and
 * wins whenever it is set; without it the request's own host is used.
 *
 * b10-panel-gaps: that fallback used to copy the scheme off the request, and the
 * request reaches the engine from the panel's nginx over plain HTTP inside the
 * compose network. The owner was handed `http://…` for a field Robokassa refuses,
 * measured on the live panel 2026-09-15 (`artifacts/q02-qa-owner/report.md` §4).
 * A public host is therefore always `https`; only a local stand keeps `http`.
 */
export const backendPublicOrigin = (req: AuthenticatedMedusaRequest): string => {
  const configured = process.env.BACKEND_PUBLIC_URL;

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
  const forwarded = req.get("x-forwarded-proto");
  const scheme = LOCAL_HOST.test(host) ? forwarded ?? req.protocol : "https";

  return `${scheme}://${host}`;
};

/**
 * The Result URL the owner pastes into the Robokassa dashboard.
 */
export const resultUrlFor = (req: AuthenticatedMedusaRequest): string =>
  `${backendPublicOrigin(req)}/robokassa/result`;

export type PaymentSettingsResponse = {
  /** `null` while the shop has no Robokassa row yet. */
  settings: MaskedRobokassaSettings | null;
  result_url: string;
  /** The value Robokassa shows as the payment page's SuccessUrl2/FailUrl2 origin, informational. */
  providers: Array<{ id: "robokassa"; title: string }>;
  /**
   * Which methods the buyer sees right now (t-2026-09-24-n10), the same
   * resolver `/store/payment-providers` and `/storefront/by-host` use — the
   * panel's «Приём оплат» renders this as a status per method, not just
   * Robokassa's own.
   */
  methods: TenantPaymentMethods;
};

/**
 * The masked view of the caller's own Robokassa row, `null` when there is
 * none. Disabled rows are included: the panel shows a switched-off account as
 * switched off, it does not pretend the credentials are gone.
 */
export const readOwnPaymentSettings = async (
  req: AuthenticatedMedusaRequest,
): Promise<PaymentSettingsResponse> => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const [secret, tenantResult] = await Promise.all([
    readRobokassaSecret(pg, tenant.id, { includeDisabled: true }),
    query.graph({ entity: "tenant", fields: ["metadata"], filters: { id: [tenant.id] } }),
  ]);
  const metadata = (tenantResult.data[0]?.metadata ?? null) as Record<string, unknown> | null;
  const manualPayment = readManualPayment(metadata);
  return {
    settings: secret ? maskRobokassaSettings(secret) : null,
    result_url: resultUrlFor(req),
    providers: [{ id: "robokassa", title: "Robokassa" }],
    methods: resolveTenantPaymentMethods({
      robokassaEnabled: Boolean(secret?.is_enabled),
      ...manualPaymentMethods(manualPayment),
    }),
  };
};

/**
 * A foreign id is a missing id (`tenant-scope.ts`): the row is looked up
 * inside the caller's tenant only, so tenant B asking for tenant A's record
 * gets the same 404 as for a record that never existed.
 */
export const assertOwnedPaymentSettings = async (
  req: AuthenticatedMedusaRequest,
  id: string,
): Promise<MaskedRobokassaSettings> => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = await readRobokassaSecret(pg, tenant.id, { includeDisabled: true });
  if (!secret || secret.id !== id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Payment settings ${id} were not found.`);
  }
  return maskRobokassaSettings(secret);
};
