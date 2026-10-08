import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { resolveTenantFromPublishableKey } from "../../resolve-tenant";
import { allowedReturnUrl, issueSsoCode, parseReturnHosts } from "../school-sso";
import { ssoCodeStore } from "../scope";
import type { PostStoreSsoCodeBody } from "../validators";

/**
 * `POST /store/tenant/sso/code` (t-2026-10-08-36) → `{ code }`: a single-use
 * code, good for 60 seconds, that the school trades for this buyer's token at
 * `POST /store/tenant/sso/exchange`. Called by the storefront's
 * `/api/school-sso` with the buyer's own token and the shop's publishable key;
 * the code is bound to both.
 *
 * `return_to` has to be an address on a host `SCHOOL_SSO_RETURN_HOSTS` lists,
 * so a code is never minted for a page this platform does not trust. An empty
 * list mints nothing, which is the state of every deployment that has no
 * school.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostStoreSsoCodeBody>,
  res: MedusaResponse,
) => {
  const tenant = await resolveTenantFromPublishableKey(req as unknown as MedusaStoreRequest);
  const { actor_id: customerId, auth_identity_id: authIdentityId } = req.auth_context ?? {};

  if (!customerId || !authIdentityId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "You must be logged in.");
  }

  const hosts = parseReturnHosts(process.env.SCHOOL_SSO_RETURN_HOSTS);

  if (!allowedReturnUrl(req.validatedBody.return_to, hosts)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "return_to is not an allowed address.");
  }

  // The provider the buyer signed in with rides in the token the framework
  // decoded, though `AuthContext` does not declare it.
  const authProvider = (req.auth_context as { auth_provider?: unknown }).auth_provider;

  const code = await issueSsoCode(ssoCodeStore(req.scope), {
    customer_id: customerId,
    auth_identity_id: authIdentityId,
    auth_provider: typeof authProvider === "string" ? authProvider : null,
    tenant_id: tenant.id,
  });

  res.json({ code });
};
