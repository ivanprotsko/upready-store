import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import createTenantWorkflow from "../../workflows/tenant/create-tenant";
import type { PostTenantCreateBody } from "./validators";

/**
 * `POST /tenants` — registers a tenant together with its first admin. Called
 * with the registration token from `POST /auth/tenant/emailpass/register`;
 * after it the same email logs in through `POST /auth/tenant/emailpass`.
 *
 * The response carries the publishable key token in clear: it is returned by
 * the API Key Module at creation only, and the tenant's storefront needs it.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantCreateBody>,
  res: MedusaResponse,
) => {
  // An `actor_id` means the token already belongs to a registered tenant admin.
  if (req.auth_context?.actor_id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Request already authenticated as a tenant admin.",
    );
  }

  const { result } = await createTenantWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      authIdentityId: req.auth_context.auth_identity_id,
    },
  });

  res.status(201).json(result);
};
