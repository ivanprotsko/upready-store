import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows";
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";

/**
 * POST /store/customers/oauth-link — attach an OAuth identity to the account
 * that already owns its email.
 *
 * WHY IT EXISTS. `POST /store/customers` refuses an email that already has an
 * account: `validateCustomerAccountCreation`
 * (`@medusajs/medusa/core-flows`, step `validate-customer-account-creation`)
 * throws DUPLICATE_ERROR the moment `has_account` is true for that address. So
 * a buyer who registered with email and password, then pressed «Sign in with
 * Yandex ID», would be told their own address is taken. This route is the other
 * branch: same person, second way in.
 *
 * WHAT MAKES IT SAFE. The email is NEVER taken from the request. It is read off
 * the provider identity the auth module holds, which the provider wrote from a
 * server-to-server call to login.yandex.ru — an address the browser cannot
 * choose. Linking by a provider-verified email is the standard account-linking
 * rule; linking by a client-supplied one would be account takeover.
 *
 * WHAT IT DOES NOT DO. It never creates a customer, and it never re-links an
 * auth identity that already has one. A `has_account: false` row (the customer
 * Medusa mints for a guest checkout) is NOT a match: those are claimed by
 * `/store/customers/me/claim-orders` after the account exists, which is the
 * path f03-guest-order-not-in-account already built.
 *
 * TENANCY. A customer is a store-wide row on this platform: there is no
 * tenant-customer link, and a shop owns a buyer exactly when one of the shop's
 * own orders names them (`src/api/tenants/customers/helpers.ts`). So this
 * matches on email across the store, which is precisely what `emailpass` login
 * already does for the same person on the same backend. Narrowing it to one
 * tenant would need that link to exist first.
 */

const linkCustomerToAuthIdentityWorkflow = createWorkflow(
  "link-customer-to-auth-identity",
  (input: { authIdentityId: string; customerId: string }) => {
    setAuthAppMetadataStep({
      authIdentityId: input.authIdentityId,
      actorType: "customer",
      value: input.customerId,
    });

    return new WorkflowResponse(input);
  },
);

/** Providers this route will link. `emailpass` owns its own account by construction. */
const LINKABLE_PROVIDERS = ["yandex"];

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) => {
  const authIdentityId = req.auth_context?.auth_identity_id;

  if (!authIdentityId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "This route needs the token issued by the OAuth callback.",
    );
  }

  if (req.auth_context.actor_id) {
    // Already an account behind this identity: nothing to link, and saying so
    // is not an error the storefront has to recover from.
    res.status(200).json({ linked: false, reason: "already_linked" });
    return;
  }

  const authModule = req.scope.resolve(Modules.AUTH);
  const authIdentity = await authModule.retrieveAuthIdentity(authIdentityId, {
    relations: ["provider_identities"],
  });

  const providerIdentity = authIdentity.provider_identities?.find((identity) =>
    LINKABLE_PROVIDERS.includes(identity.provider),
  );

  if (!providerIdentity) {
    res.status(200).json({ linked: false, reason: "provider_not_linkable" });
    return;
  }

  // The verified address, straight off the identity the provider wrote.
  const email = String(
    (providerIdentity.user_metadata as Record<string, unknown> | undefined)
      ?.email ?? "",
  )
    .trim()
    .toLowerCase();

  if (!email) {
    res.status(200).json({ linked: false, reason: "no_verified_email" });
    return;
  }

  const customerModule = req.scope.resolve(Modules.CUSTOMER);
  const existing = await customerModule.listCustomers({ email });
  const account = existing.find((customer) => customer.has_account);

  if (!account) {
    // No account owns this address yet, so the storefront's next call
    // (`POST /store/customers`) is the right one and will succeed.
    res.status(200).json({ linked: false, reason: "no_account_for_email" });
    return;
  }

  await linkCustomerToAuthIdentityWorkflow(req.scope).run({
    input: { authIdentityId, customerId: account.id },
  });

  res.status(200).json({ linked: true, customer_id: account.id });
};
