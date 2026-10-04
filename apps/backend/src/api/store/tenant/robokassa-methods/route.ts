import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { Logger } from "@medusajs/framework/types";
import { readRobokassaSecretPublic } from "../../../../tenant-secrets/robokassa";
import {
  robokassaPaymentMethods,
  type RobokassaPaymentMethod,
  type RobokassaPaymentMethodsSource,
} from "../../../../modules/payment-robokassa/payment-methods";
import { tenantOrNull } from "../robokassa";

export type StoreRobokassaMethodsResponse = {
  methods: RobokassaPaymentMethod[];
  /** `none` for a shop without an enabled Robokassa account; the list is then empty. */
  source: RobokassaPaymentMethodsSource | "none";
};

/**
 * `GET /store/tenant/robokassa-methods` (t-2026-10-04-49): the Robokassa
 * methods the shop behind the publishable key has enabled, for the checkout
 * to list as its own rows under «Способ оплаты».
 *
 * The list is read server-side from Robokassa's `GetCurrencies` through the
 * cache in `modules/payment-robokassa/payment-methods.ts`, the same entries
 * the provider writes onto the payment session as its whitelist, so the rows
 * a buyer sees and the aliases the session accepts come from one read. It
 * never fails on Robokassa's account: a stale list or card and SBP stand in.
 *
 * A shop without an enabled account answers an empty list, not a 404. Whether
 * a shop has Robokassa is already public through `GET /store/payment-providers`,
 * so the empty answer tells a second tenant nothing new.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse<StoreRobokassaMethodsResponse>) => {
  const tenant = await tenantOrNull(req);
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const secret = tenant ? await readRobokassaSecretPublic(pg, tenant.id, logger) : null;

  if (!secret) {
    res.json({ methods: [], source: "none" });
    return;
  }

  const { methods, source } = await robokassaPaymentMethods(secret.credentials.merchant_login, logger);
  res.json({ methods, source });
};
