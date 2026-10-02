import { PUBLISHABLE_KEY_HEADER } from "@medusajs/framework/utils";

/**
 * Which shop a buyer-facing Telegram request is for, resolved the same way
 * `login-method-gate.ts`'s `resolveTenantMetadataFromPublishableKey` does
 * (`api_key` → `sales_channels_link` → `sales_channel.tenant`) — re-implemented
 * here rather than imported, because a module under `src/modules` should not
 * reach into `src/api`.
 *
 * `AuthenticationInput.headers` carries whatever the storefront's SDK sent,
 * and Express lowercases header names before this object is built, but the
 * lookup is case-insensitive anyway: nothing here should depend on that.
 */
export type GraphQuery = {
  graph: (args: {
    entity: string;
    fields: string[];
    filters: Record<string, unknown>;
  }) => Promise<{ data: Array<Record<string, unknown>> }>;
};

const headerValue = (
  headers: Record<string, string> | undefined,
  name: string,
): string | null => {
  if (!headers) {
    return null;
  }
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) {
      return headers[key];
    }
  }
  return null;
};

export const resolveTenantIdFromHeaders = async (
  query: GraphQuery,
  headers: Record<string, string> | undefined,
): Promise<string | null> => {
  const token = headerValue(headers, PUBLISHABLE_KEY_HEADER);
  if (!token) {
    return null;
  }

  const { data: keys } = await query.graph({
    entity: "api_key",
    fields: ["id", "sales_channels_link.sales_channel_id"],
    filters: { token: [token] },
  });

  const channelIds = (
    (keys[0]?.sales_channels_link ?? []) as { sales_channel_id?: string }[]
  )
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

  const hit = channels.find(
    (channel) => (channel?.tenant as { id?: string } | null)?.id,
  );
  return ((hit?.tenant as { id?: string } | undefined)?.id as string | undefined) ?? null;
};
