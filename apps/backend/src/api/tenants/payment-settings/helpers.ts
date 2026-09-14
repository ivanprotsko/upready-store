import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { getTenantScope } from "../tenant-scope";
import {
  maskRobokassaSettings,
  readRobokassaSecret,
  type MaskedRobokassaSettings,
} from "../../../tenant-secrets/robokassa";

/**
 * The Result URL the owner pastes into the Robokassa dashboard. The public
 * address of the engine is a deployment value (`BACKEND_PUBLIC_URL`, on the
 * MT host `https://shipshift.dev`); when it is not set the request's own host
 * is used, which is right on a local stand and behind a proxy that forwards
 * the host header.
 */
export const resultUrlFor = (req: AuthenticatedMedusaRequest): string => {
  const base =
    process.env.BACKEND_PUBLIC_URL ||
    `${req.get("x-forwarded-proto") ?? req.protocol}://${req.get("x-forwarded-host") ?? req.get("host")}`;
  return `${base.replace(/\/$/, "")}/robokassa/result`;
};

export type PaymentSettingsResponse = {
  /** `null` while the shop has no Robokassa row yet. */
  settings: MaskedRobokassaSettings | null;
  result_url: string;
  /** The value Robokassa shows as the payment page's SuccessUrl2/FailUrl2 origin, informational. */
  providers: Array<{ id: "robokassa"; title: string }>;
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
  const secret = await readRobokassaSecret(pg, tenant.id, { includeDisabled: true });
  return {
    settings: secret ? maskRobokassaSettings(secret) : null,
    result_url: resultUrlFor(req),
    providers: [{ id: "robokassa", title: "Robokassa" }],
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
