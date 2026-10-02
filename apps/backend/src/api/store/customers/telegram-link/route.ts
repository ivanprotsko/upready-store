import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows";
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

/**
 * POST /store/customers/telegram-link — attach a just-verified Telegram
 * identity to the account that already owns it (t-2026-10-02-telegram-auth).
 *
 * The Telegram sibling of `/store/customers/oauth-link`. Same shape, same
 * safety rule, one difference: Telegram gives no real email to match on, so
 * the match key is `customer.metadata.telegram_id` instead of a
 * provider-verified email. That field is written in exactly two places —
 * here is not one of them — so it can only hold a value a buyer actually
 * proved: `POST /store/customers` right after this route answers
 * `no_account_for_telegram_id` (new buyer, storefront sets it in the create
 * body), or `POST /store/customers/me/telegram-link` (an already-signed-in
 * e-mail buyer linking Telegram as a second way in). A client cannot cause a
 * match by sending a `telegram_id` of its own choosing: the id this route
 * reads comes off the auth identity the `telegram` provider itself wrote
 * during `authenticate()`, never off the request body.
 */

const linkCustomerToAuthIdentityForTelegramWorkflow = createWorkflow(
  "link-customer-to-auth-identity-for-telegram",
  (input: { authIdentityId: string; customerId: string }) => {
    setAuthAppMetadataStep({
      authIdentityId: input.authIdentityId,
      actorType: "customer",
      value: input.customerId,
    });

    return new WorkflowResponse(input);
  },
);

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) => {
  const authIdentityId = req.auth_context?.auth_identity_id;

  if (!authIdentityId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "This route needs the token issued by `/auth/customer/telegram`.",
    );
  }

  if (req.auth_context.actor_id) {
    res.status(200).json({ linked: false, reason: "already_linked" });
    return;
  }

  const authModule = req.scope.resolve(Modules.AUTH);
  const authIdentity = await authModule.retrieveAuthIdentity(authIdentityId, {
    relations: ["provider_identities"],
  });

  const providerIdentity = authIdentity.provider_identities?.find(
    (identity) => identity.provider === "telegram",
  );

  if (!providerIdentity) {
    res.status(200).json({ linked: false, reason: "provider_not_linkable" });
    return;
  }

  const telegramId = (providerIdentity.user_metadata as Record<string, unknown> | undefined)
    ?.telegram_id;

  if (typeof telegramId !== "number") {
    res.status(200).json({ linked: false, reason: "no_telegram_id" });
    return;
  }

  // Raw pg, the established convention for a JSON-metadata match in this
  // codebase (`tenant-secrets/*`): the customer module's own filters do not
  // reach into `metadata` the way a tenant secret's `payload` never needs to
  // either, and this match has to run on every value, not a known key's shape.
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const account = (await pg("customer")
    .select("id")
    .whereRaw("metadata->>'telegram_id' = ?", [String(telegramId)])
    .andWhere({ has_account: true })
    .whereNull("deleted_at")
    .first()) as { id: string } | undefined;

  if (!account) {
    res.status(200).json({ linked: false, reason: "no_account_for_telegram_id" });
    return;
  }

  await linkCustomerToAuthIdentityForTelegramWorkflow(req.scope).run({
    input: { authIdentityId, customerId: account.id },
  });

  res.status(200).json({ linked: true, customer_id: account.id });
};
