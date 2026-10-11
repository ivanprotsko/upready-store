import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

/**
 * The floor for every password a shop owner or a platform staff member SETS.
 * 46df A-22 (ASVS L2 §2.1.1) set it at 12; Ivan lowered it to 8 on 11.10.2026
 * (t-2026-10-11-23: «Пароль нужно сделать 8 символов а не 12»). The same number is written into
 * `PostTenantUpdatePasswordSchema` (`../tenants/validators.ts`) and the
 * staff-issued passwords in `../admin/tenants/validators.ts`. Buyers' own
 * passwords (`/auth/customer/*`) are not governed by it.
 */
export const OWNER_PASSWORD_MIN_LENGTH = 8;

export const OWNER_PASSWORD_TOO_SHORT_MESSAGE = `Password must be at least ${OWNER_PASSWORD_MIN_LENGTH} characters long.`;

/**
 * `POST /auth/tenant/emailpass/update` and `POST /auth/user/emailpass/update`:
 * Medusa's own handler for the reset-password link passes `req.body` straight
 * to `EmailPassAuthService.update`, which stores any non-empty password. The
 * panel's reset form checks the length too, but a form is not a control, so
 * the gate runs here, before the core handler, and answers `400` with the
 * same text the panel shows to the owner. A stored shorter password is never
 * read here; only the one being set.
 *
 * `POST /auth/tenant/emailpass/register` (the owner's first password, set by
 * the storefront's onboarding wizard) goes through `EmailPassAuthService.register`
 * with the same lack of a check, so the same gate runs there too.
 */
export const requireOwnerPasswordLength = (
  req: MedusaRequest<{ password?: unknown }>,
  res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const password = req.body?.password;

  if (typeof password !== "string" || password.length < OWNER_PASSWORD_MIN_LENGTH) {
    res.status(400).json({ type: "invalid_data", message: OWNER_PASSWORD_TOO_SHORT_MESSAGE });
    return;
  }

  next();
};
