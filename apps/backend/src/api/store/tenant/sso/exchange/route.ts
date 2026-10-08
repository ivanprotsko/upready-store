import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import type { AuthIdentityDTO, IAuthModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { generateJwtTokenForAuthIdentity } from "@medusajs/medusa/api/auth/utils/generate-jwt-token";
import { resolveTenantFromPublishableKey } from "../../resolve-tenant";
import { redeemSsoCode } from "../school-sso";
import { ssoCodeStore, ssoLock } from "../scope";
import type { PostStoreSsoExchangeBody } from "../validators";

const CUSTOMER_ACTOR_TYPE = "customer";

const rejected = () =>
  new MedusaError(MedusaError.Types.UNAUTHORIZED, "The code is unknown, expired or already used.");

/**
 * `POST /store/tenant/sso/exchange` (t-2026-10-08-36) → `{ token }`: the
 * school's server trades the code from its `/auth/callback` for the buyer's
 * token. It sends the shop's publishable key, and only the shop the code was
 * minted for gets the token; a second exchange of the same code, a code past
 * its 60 seconds and a code another shop's key presents all answer 401.
 *
 * The token is minted by `@medusajs/medusa`'s own
 * `generateJwtTokenForAuthIdentity` with the project's `http` settings, the
 * call its login route makes, so it is the token a sign-in on the storefront
 * would have produced: same secret, same lifetime, same payload. The auth
 * identity is read again rather than copied from the code, and has to still
 * point at the buyer the code was minted for.
 */
export const POST = async (
  req: MedusaStoreRequest<PostStoreSsoExchangeBody>,
  res: MedusaResponse,
) => {
  const tenant = await resolveTenantFromPublishableKey(req);

  const grant = await redeemSsoCode(
    ssoCodeStore(req.scope),
    ssoLock(req.scope),
    req.validatedBody.code,
    tenant.id,
  );

  if (!grant) {
    throw rejected();
  }

  const authModuleService: IAuthModuleService = req.scope.resolve(Modules.AUTH);

  let authIdentity: AuthIdentityDTO;

  try {
    authIdentity = await authModuleService.retrieveAuthIdentity(grant.auth_identity_id, {
      relations: ["provider_identities"],
    });
  } catch {
    throw rejected();
  }

  if (authIdentity.app_metadata?.[`${CUSTOMER_ACTOR_TYPE}_id`] !== grant.customer_id) {
    throw rejected();
  }

  const { http } = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig;

  const token = await generateJwtTokenForAuthIdentity(
    {
      authIdentity,
      actorType: CUSTOMER_ACTOR_TYPE,
      authProvider: grant.auth_provider ?? authIdentity.provider_identities?.[0]?.provider,
      container: req.scope,
    },
    {
      secret: http.jwtSecret as string,
      expiresIn: http.jwtExpiresIn,
      options: http.jwtOptions,
    },
  );

  res.json({ token });
};
