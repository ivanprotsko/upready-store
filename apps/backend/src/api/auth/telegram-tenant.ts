import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, PUBLISHABLE_KEY_HEADER } from "@medusajs/framework/utils";

import { TELEGRAM_TENANT_HEADER } from "../../modules/auth-telegram/lib/tenant";

type GraphQuery = {
  graph: (args: {
    entity: string;
    fields: string[];
    filters: Record<string, unknown>;
  }) => Promise<{ data: Array<Record<string, unknown>> }>;
};

/** `api_key` → `sales_channels_link` → `sales_channel.tenant`, as `login-method-gate.ts` resolves a shop. */
const tenantIdForPublishableKey = async (
  query: GraphQuery,
  token: string,
): Promise<string | null> => {
  const { data: keys } = await query.graph({
    entity: "api_key",
    fields: ["id", "sales_channels_link.sales_channel_id"],
    filters: { token: [token] },
  });

  const channelIds = ((keys[0]?.sales_channels_link ?? []) as { sales_channel_id?: string }[])
    .map((link) => link.sales_channel_id)
    .filter((id): id is string => Boolean(id));
  if (!channelIds.length) {
    return null;
  }

  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "tenant.id"],
    filters: { id: channelIds },
  });
  const hit = channels.find((channel) => (channel?.tenant as { id?: string } | null)?.id);
  return (hit?.tenant as { id?: string } | undefined)?.id ?? null;
};

/**
 * Runs before Medusa's `/auth/customer/telegram` handler: names the shop for
 * the `telegram` auth provider, whose own container cannot resolve it.
 */
export const resolveTelegramTenant = async (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  delete req.headers[TELEGRAM_TENANT_HEADER];

  const raw = req.headers[PUBLISHABLE_KEY_HEADER];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (token) {
    const query = req.scope.resolve<GraphQuery>(ContainerRegistrationKeys.QUERY);
    const tenantId = await tenantIdForPublishableKey(query, token);
    if (tenantId) {
      req.headers[TELEGRAM_TENANT_HEADER] = tenantId;
    }
  }

  next();
};
