/**
 * The shop a `/auth/customer/telegram` request is for. A module provider's
 * container has no `query`, so the tenant is resolved from the publishable key
 * by the route's middleware (`src/api/auth/telegram-tenant.ts`), which always
 * overwrites this header — a value a client sends itself never survives it.
 */
export const TELEGRAM_TENANT_HEADER = "x-upready-telegram-tenant";

export const tenantIdFromHeaders = (
  headers: Record<string, string> | undefined,
): string | null => {
  if (!headers) {
    return null;
  }
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === TELEGRAM_TENANT_HEADER) {
      return headers[key] || null;
    }
  }
  return null;
};
