import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import type { IAuthModuleService } from "@medusajs/framework/types";
import type { PostTenantUpdatePasswordBody } from "../../validators";

/**
 * `POST /tenants/me/password` — tenant-panel wave 2, piece 4.
 *
 * There is no Admin counterpart route: the native Admin only ever changes a
 * user's password through the unauthenticated reset-password flow
 * (`POST /auth/user/emailpass/reset-password` + `.../update` with the reset
 * token). A tenant admin who is already logged in and simply wants to change
 * their password needs the current-password check that flow does not have,
 * so this route calls the auth module directly.
 *
 * Measured against `@medusajs/auth-emailpass@2.19.0`
 * (`dist/services/emailpass.js`, `EmailPassAuthService.authenticate`/`.update`)
 * and `@medusajs/auth@2.19.0` (`dist/services/auth-module.js`,
 * `getAuthIdentityProviderService`): for the emailpass provider, the
 * "entity_id" tracked on a `provider_identities` row is the account's EMAIL,
 * not the actor id `req.auth_context.actor_id` carries — `authenticate`
 * retrieves the identity with `authIdentityService.retrieve({ entity_id:
 * email })`, and `updateProvider`'s `update(data, authIdentityService)` calls
 * `authIdentityService.update(entity_id, data)` against that same field. The
 * generic `POST /auth/[actor_type]/[auth_provider]/update` route (which does
 * pass `entity_id: req.auth_context.actor_id`) only works there because the
 * bearer token on it comes from `generateResetPasswordTokenWorkflow`, which
 * stamps the *identifier the requester typed* (their email) into that token's
 * `actor_id`, not because `actor_id` and the provider's `entity_id` are the
 * same concept in general. A normal tenant session token's `actor_id` is the
 * `tenant_admin` row id, so this route reads the email itself off that row
 * and passes it as `entity_id` explicitly, for both the verification call and
 * the update call.
 *
 * `IAuthModuleService` type: `@medusajs/types` package, `dist/auth/service.d.ts`
 * (`authenticate(provider, providerData): Promise<AuthenticationResponse>`,
 * `updateProvider(provider, providerData): Promise<AuthenticationResponse>`).
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantUpdatePasswordBody>,
  res: MedusaResponse,
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const authModuleService: IAuthModuleService = req.scope.resolve(Modules.AUTH);

  const { current_password, new_password } = req.validatedBody;

  const {
    data: [tenantAdmin],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "email"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  });

  if (!tenantAdmin) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Tenant admin ${req.auth_context.actor_id} was not found.`,
    );
  }

  const { success: currentPasswordValid } = await authModuleService.authenticate("emailpass", {
    body: {
      email: tenantAdmin.email as string,
      password: current_password,
    },
  });

  if (!currentPasswordValid) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Current password is incorrect");
  }

  const { success: updated, error } = await authModuleService.updateProvider("emailpass", {
    entity_id: tenantAdmin.email,
    password: new_password,
  });

  if (!updated) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      error || "Failed to update password",
    );
  }

  res.json({ ok: true });
};
