import type { AuthenticatedMedusaRequest, MedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";
import { getTenantScope } from "../tenant-scope";
import {
  maskRobokassaSettings,
  readRobokassaSecret,
  type MaskedRobokassaSettings,
} from "../../../tenant-secrets/robokassa";
import { readTributeSecretPublic } from "../../../tenant-secrets/tribute";
import { readBtcpaySecretPublic } from "../../../tenant-secrets/btcpay";
import { readBitcartSecretPublic } from "../../../tenant-secrets/bitcart";
import { readX402SecretPublic, x402Ready } from "../../../tenant-secrets/x402";
import {
  manualPaymentMethods,
  resolveTenantPaymentMethods,
  type TenantPaymentMethods,
} from "../../../tenant-secrets/payment-methods";
import {
  tryReadTenantSecret,
  type UnreadableTenantSecret,
} from "../../../tenant-secrets/unreadable";
import { legacyManualPayment, readManualPayment } from "./manual/manual-payment";

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
 *
 * Any request will do, not only the owner's: the x402 store routes
 * (t-2026-10-03-33) name their own address in the payment requirements.
 */
export const backendPublicOrigin = (req: MedusaRequest): string => {
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
  /** `null` while the shop has no Robokassa row yet, or while its row does not decrypt. */
  settings: MaskedRobokassaSettings | null;
  /**
   * The shop's Robokassa row exists but does not decrypt with this
   * deployment's key (46df D1). The panel says so and asks for the requisites
   * again; `PUT` overwrites the row and `DELETE` removes it without reading it.
   */
  unreadable: UnreadableTenantSecret | null;
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
 * The caller's Robokassa row, disabled included. A row that does not decrypt
 * comes back as `unreadable` instead of throwing (46df D1), so neither the
 * panel's read nor its overwrite depends on the old payload.
 */
export const readOwnRobokassaSecret = (
  req: AuthenticatedMedusaRequest,
  tenantId: string,
  pg: Knex = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION),
  logger: Logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER),
) =>
  tryReadTenantSecret(
    pg,
    tenantId,
    "robokassa",
    () => readRobokassaSecret(pg, tenantId, { includeDisabled: true }),
    logger,
  );

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
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const [{ secret, unreadable }, tributeSecret, btcpaySecret, bitcartSecret, x402Secret, tenantResult] =
    await Promise.all([
      readOwnRobokassaSecret(req, tenant.id, pg, logger),
      readTributeSecretPublic(pg, tenant.id, logger),
      readBtcpaySecretPublic(pg, tenant.id, logger),
      readBitcartSecretPublic(pg, tenant.id, logger),
      readX402SecretPublic(pg, tenant.id, logger),
      query.graph({ entity: "tenant", fields: ["metadata"], filters: { id: [tenant.id] } }),
    ]);
  const metadata = (tenantResult.data[0]?.metadata ?? null) as Record<string, unknown> | null;
  const manualPayment = readManualPayment(metadata);
  return {
    settings: secret ? maskRobokassaSettings(secret) : null,
    unreadable,
    result_url: resultUrlFor(req),
    providers: [{ id: "robokassa", title: "Robokassa" }],
    // Tribute's own write side is `/tenants/tribute` (t-cherk-22), BTCPay's
    // is `/tenants/payment-settings/btcpay`, Bitcart's
    // `/tenants/payment-settings/bitcart` and x402's
    // `/tenants/payment-settings/x402`; all are only read here, so the
    // panel's unified "which methods are connected" status includes them
    // without this route owning their credentials.
    methods: resolveTenantPaymentMethods({
      robokassaEnabled: Boolean(secret?.is_enabled),
      tributeEnabled: Boolean(tributeSecret),
      btcpayEnabled: Boolean(btcpaySecret),
      bitcartEnabled: Boolean(bitcartSecret),
      x402Enabled: x402Ready(x402Secret),
      ...manualPaymentMethods(legacyManualPayment(manualPayment)),
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
