import type { MedusaNextFunction, MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import {
  readRobokassaSecretPublic,
  type RobokassaReceiptLineInput,
} from "../../../tenant-secrets/robokassa";
import { resolveTenantFromPublishableKey, type StoreTenant } from "./resolve-tenant";

export const ROBOKASSA_PROVIDER_ID = "pp_robokassa_robokassa";

/**
 * The shop behind the request's publishable key, or `null` when the key is
 * the platform's single-store one (no tenant link). Robokassa is a per-shop
 * account, so a keyless or tenantless request simply does not have it.
 * Exported for `tenant/payment-methods.ts`, which resolves the same tenant
 * for the wider "which methods are connected" question.
 */
export const tenantOrNull = async (req: MedusaStoreRequest): Promise<StoreTenant | null> => {
  try {
    return await resolveTenantFromPublishableKey(req);
  } catch (error) {
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND) {
      return null;
    }
    throw error;
  }
};

/** Whether the shop behind the request has an enabled Robokassa account. */
export const robokassaAvailableFor = async (req: MedusaStoreRequest): Promise<boolean> => {
  const tenant = await tenantOrNull(req);
  if (!tenant) {
    return false;
  }
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  return Boolean(await readRobokassaSecretPublic(pg, tenant.id, req.scope.resolve(ContainerRegistrationKeys.LOGGER)));
};

/**
 * `POST /store/payment-collections/:id/payment-sessions` for Robokassa
 * (t03-tenant-secrets-robokassa, step 4).
 *
 * The provider resolves the shop's credentials from `data.tenant_id`, and that
 * id must be the SERVER's word, never the client's: it is taken from the
 * publishable key, checked against the cart the payment collection belongs
 * to, and written over whatever the body carried. Any other client key that
 * the provider treats as server-owned (`result_*`) is dropped here as well;
 * the provider rebuilds its data from scratch anyway (`initiatePayment`),
 * so this is the second wall, not the only one.
 *
 * A shop without an enabled account gets 404 on the provider, the same answer
 * as for a provider that does not exist, so a second tenant cannot probe
 * whether the first one configured Robokassa.
 */
export const injectRobokassaTenant = async (
  req: MedusaStoreRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const body = (req.body ?? {}) as { provider_id?: string; data?: Record<string, unknown> };
  if (body.provider_id !== ROBOKASSA_PROVIDER_ID) {
    return next();
  }

  const tenant = await tenantOrNull(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  // An unreadable secret reads as "not connected" (46df A-02): the same 404 as a shop without Robokassa.
  const secret = tenant
    ? await readRobokassaSecretPublic(pg, tenant.id, req.scope.resolve(ContainerRegistrationKeys.LOGGER))
    : null;
  if (!tenant || !secret) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Payment provider ${ROBOKASSA_PROVIDER_ID} is not available for this shop.`,
    );
  }

  // t-cherk-30: the cart's items and shipping cost only matter once the shop's
  // fiscalization switch is on, so a shop without it pays no extra query — the
  // 54-FZ `Receipt` is built once here, from the server's own read of the
  // cart, and ridden through `data.receipt_lines` to `initiatePayment`
  // (`src/modules/payment-robokassa/service.ts`), never from the client.
  const wantsReceipt = secret.credentials.fiscalization_enabled;
  const fields = ["id", "cart.id", "cart.sales_channel_id"];
  if (wantsReceipt) {
    fields.push(
      "cart.items.title",
      "cart.items.quantity",
      "cart.items.total",
      "cart.shipping_methods.name",
      "cart.shipping_methods.total",
    );
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: collections } = await query.graph({
    entity: "payment_collection",
    fields,
    filters: { id: req.params.id },
  });
  const cart = collections[0]?.cart as
    | {
        id?: string;
        sales_channel_id?: string | null;
        items?: Array<{ title: string; quantity: number; total: number }>;
        shipping_methods?: Array<{ name: string; total: number }>;
      }
    | undefined;
  if (!cart?.id || cart.sales_channel_id !== tenant.sales_channel_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Payment collection ${req.params.id} was not found.`);
  }

  const receiptLines: RobokassaReceiptLineInput[] | undefined = wantsReceipt
    ? [
        ...(cart.items ?? []).map((item) => ({
          name: item.title,
          quantity: Number(item.quantity),
          amount: Number(item.total),
          kind: "item" as const,
        })),
        ...(cart.shipping_methods ?? []).map((method) => ({
          name: method.name,
          quantity: 1,
          amount: Number(method.total),
          kind: "shipping" as const,
        })),
      ]
    : undefined;

  const { tenant_id: _tenant, result_confirmed_at: _confirmed, result_out_sum: _sum, ...clientData } =
    body.data ?? {};
  req.body = {
    ...body,
    data: { ...clientData, tenant_id: tenant.id, receipt_lines: receiptLines },
  };
  next();
};
