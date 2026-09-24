import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, generateJwtToken, MedusaError, Modules } from "@medusajs/framework/utils";
import { TENANT_ACTOR_TYPE, TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import type { PostTenantSwitchShopBody } from "../../validators";
import { listGroupTenants, readCallerTenant } from "../group-sites";

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
 *
 * t-2026-09-24-n12 (`docs/multitenancy/sites-one-db-many-storefronts.md`
 * §3.1): a tenant of the caller's own group is the second reason a switch is
 * allowed. The design named that `POST /tenants/switch/:tenantId`; it is this
 * route instead, so the panel keeps one switcher. The token's actor has to be
 * a `tenant_admin` row of the target (every `/tenants/*` route resolves the
 * tenant from it), so the first switch into a sibling site creates the
 * caller's row there, same email and name, marked `metadata.via_group` with
 * the group id. A tenant outside the group, like any tenant the email has no
 * row in, keeps answering the same `403` for an existing and an unknown id
 * alike, which tells the caller nothing a `404` would hide.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantSwitchShopBody>,
  res: MedusaResponse,
) => {
  const configModule = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
  const authModuleService: IAuthModuleService = req.scope.resolve(Modules.AUTH);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const { tenant_id } = req.validatedBody;

  const caller = await readCallerTenant(req.scope, req.auth_context.actor_id);

  if (!caller) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Tenant admin ${req.auth_context.actor_id} was not found.`,
    );
  }

  let [target] = await tenantModuleService.listTenantAdmins({
    email: caller.email,
    tenant_id,
  });

  if (!target) {
    const siblings = await listGroupTenants(req.scope, caller.group_id);

    if (!siblings.some((tenant) => tenant.id === tenant_id)) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, `No access to tenant "${tenant_id}".`);
    }

    target = await tenantModuleService.createTenantAdmins({
      email: caller.email,
      first_name: caller.first_name,
      last_name: caller.last_name,
      tenant_id,
      metadata: { via_group: caller.group_id },
    });
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
