import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, generateJwtToken, MedusaError, Modules } from "@medusajs/framework/utils";
import { TENANT_ACTOR_TYPE, TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import type { PostTenantSwitchShopBody } from "../../validators";

const ENTITY_ID_KEY = `${TENANT_ACTOR_TYPE}_id`;
const PROVIDER = "emailpass";

/**
 * `POST /tenants/me/switch` (o25-platform-admin-all-shops): swaps the
 * caller's session for another shop it also holds a `tenant_admin` row in,
 * without a second login. `403` when the caller's email has no row in the
 * requested tenant — worded generically, unlike `tenant-scope.ts`'s `404`
 * convention, because a shop id is not a resource id a foreign caller could
 * otherwise learn the existence of; the switcher only ever offers ids the
 * caller already sees from `GET /tenants/me/shops`.
 *
 * The token is minted with the framework's own `generateJwtToken`
 * (`@medusajs/framework/utils`) and the project's `http` config, in the same
 * payload shape `@medusajs/medusa`'s login route builds
 * (`api/auth/utils/generate-jwt-token.js`, `generateJwtTokenForAuthIdentity`):
 * `actor_id` = the target row's id, `app_metadata[tenant_id]` = the same id
 * (what `req.auth_context.actor_id` reads back on the next request). That
 * `app_metadata` is also PERSISTED on the auth identity, so the next plain
 * login opens the shop last switched to, not the shop first registered in.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantSwitchShopBody>,
  res: MedusaResponse,
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const configModule = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
  const authModuleService: IAuthModuleService = req.scope.resolve(Modules.AUTH);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const { tenant_id } = req.validatedBody;

  const {
    data: [caller],
  } = await query.graph({
    entity: "tenant_admin",
    fields: ["id", "email"],
    filters: { id: [req.auth_context.actor_id] },
  });

  if (!caller) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Tenant admin ${req.auth_context.actor_id} was not found.`,
    );
  }

  const [target] = await tenantModuleService.listTenantAdmins({
    email: caller.email as string,
    tenant_id,
  });

  if (!target) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `No access to tenant "${tenant_id}".`);
  }

  const authIdentityId = req.auth_context.auth_identity_id;
  const authIdentity = await authModuleService.retrieveAuthIdentity(authIdentityId, {
    relations: ["provider_identities"],
  });
  const previousAppMetadata = (authIdentity.app_metadata as Record<string, unknown> | null) ?? {};
  const nextAppMetadata = { ...previousAppMetadata, [ENTITY_ID_KEY]: target.id };

  const providerIdentity = authIdentity.provider_identities?.find(
    (identity) => identity.provider === PROVIDER,
  );

  const { http } = configModule.projectConfig;

  const token = generateJwtToken(
    {
      actor_id: target.id,
      actor_type: TENANT_ACTOR_TYPE,
      auth_identity_id: authIdentity.id,
      auth_provider: PROVIDER,
      app_metadata: nextAppMetadata,
      user_metadata: providerIdentity?.user_metadata ?? {},
    },
    {
      secret: http.jwtSecret,
      expiresIn: http.jwtExpiresIn,
      jwtOptions: http.jwtOptions,
    },
  );

  await authModuleService.updateAuthIdentities({
    id: authIdentity.id,
    app_metadata: nextAppMetadata,
  });

  res.json({ token });
};
