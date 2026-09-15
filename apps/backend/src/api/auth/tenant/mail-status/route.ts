import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { STORE_EMAIL } from "../../../../emails/i18n";

/**
 * `GET /auth/tenant/mail-status` — public, pre-auth (f14-no-password-reset).
 *
 * Outside `/tenants/*`, so none of that prefix's `authenticate(TENANT_ACTOR_TYPE, …)`
 * middleware in `api/middlewares.ts` applies to it; a visitor on the login
 * screen who has not authenticated yet is exactly who needs to read it.
 *
 * SMTP is a single platform-wide account (`medusa-config.ts`:
 * `useSmtp = Boolean(process.env.SMTP_HOST)`), not a per-tenant secret, so
 * exposing whether it is set leaks nothing about any one shop. The
 * `forgot-password` screen reads this before claiming a reset email is on its
 * way: `POST /auth/tenant/emailpass/reset-password` always answers 204
 * regardless of SMTP, so without this read the panel would show "we sent you
 * an email" on every MT deployment that has not set `SMTP_HOST`
 * (`deploy/mt/shipshift.env.example`), which is a lie, not a honest dead end
 * (rule 20a).
 */
export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  res.json({
    configured: Boolean(process.env.SMTP_HOST),
    contact_email: STORE_EMAIL,
  });
};
