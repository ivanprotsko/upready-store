import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import createTenantWorkflow from "../../workflows/tenant/create-tenant";
import type { PostTenantCreateBody } from "./validators";

/**
 * `POST /tenants` — registers a tenant together with its first admin. Called
 * with the registration token from `POST /auth/tenant/emailpass/register`;
 * after it the same email logs in through `POST /auth/tenant/emailpass`.
 *
 * The response is the tenant with its sales channel and publishable key, the
 * same shape `GET /tenants/me` reads back through the links. `tenant.api_key.token`
 * is in clear: a publishable key is public by design and the storefront needs it.
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
      plan_id: req.validatedBody.plan_id ?? null,
      plan_trial_days: req.validatedBody.plan_trial_days ?? null,
      authIdentityId: req.auth_context.auth_identity_id,
    },
  });

  res.status(201).json(result);
};
