import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows";
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { ICustomerModuleService } from "@medusajs/framework/types";

import { authIdentityEntityId } from "../../../../../modules/auth-telegram/lib/identity";
import { verifyLoginWidget } from "../../../../../modules/auth-telegram/lib/verify";
import { readUsableTelegramBot } from "../../../../../tenant-secrets/telegram";
import { resolveTenantFromPublishableKey } from "../../../tenant/resolve-tenant";

/**
 * `POST /store/customers/me/telegram-link` — «Привязать Telegram» for a buyer
 * already signed in by e-mail. The Login Widget payload is verified inline
 * with the shop's own bot token; the caller's e-mail session stays as it is.
 *
 * One person, one account: refused when this Telegram identity already
 * belongs to a different customer.
 */

const linkTelegramToCustomerWorkflow = createWorkflow(
  "link-telegram-to-customer",
  (input: { authIdentityId: string; customerId: string }) => {
    setAuthAppMetadataStep({
      authIdentityId: input.authIdentityId,
      actorType: "customer",
      value: input.customerId,
    });

    return new WorkflowResponse(input);
  },
);

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const customerId = req.auth_context?.actor_id;
  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "You must be logged in.");
  }

  const tenant = await resolveTenantFromPublishableKey(req as unknown as MedusaStoreRequest);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const bot = await readUsableTelegramBot(pg, tenant.id);
  if (!bot) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Telegram sign-in is not configured for this shop.",
    );
  }

  const body = (req.body ?? {}) as Record<string, string>;
  const verdict = verifyLoginWidget(body, bot.credentials.token);
  if (!verdict.ok) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Telegram sign-in could not be verified.",
    );
  }

  const telegramId = verdict.user.id;
  const authModule = req.scope.resolve(Modules.AUTH);
  const entityId = authIdentityEntityId(telegramId);
  const userMetadata = {
    telegram_id: telegramId,
    telegram_username: verdict.user.username ?? null,
    telegram_first_name: verdict.user.first_name ?? null,
    telegram_last_name: verdict.user.last_name ?? null,
    telegram_photo_url: verdict.user.photo_url ?? null,
  };

  const existing = await authModule.listAuthIdentities({
    provider_identities: { entity_id: entityId, provider: "telegram" },
  });

  // The auth identity's own `app_metadata` is the link, not `customer.metadata`:
  // a buyer can write their own metadata through `POST /store/customers/me`.
  const linkedTo = (existing[0]?.app_metadata as Record<string, unknown> | undefined)
    ?.customer_id;
  if (linkedTo && linkedTo !== customerId) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This Telegram account is already linked to another customer.",
    );
  }

  const authIdentity =
    existing[0] ??
    (await authModule.createAuthIdentities({
      provider_identities: [{ provider: "telegram", entity_id: entityId, user_metadata: userMetadata }],
    }));

  await linkTelegramToCustomerWorkflow(req.scope).run({
    input: { authIdentityId: authIdentity.id, customerId },
  });

  const customerModule: ICustomerModuleService = req.scope.resolve(Modules.CUSTOMER);
  const customer = await customerModule.retrieveCustomer(customerId);
  await customerModule.updateCustomers(customerId, {
    metadata: {
      ...(customer.metadata ?? {}),
      telegram_id: telegramId,
      telegram_username: verdict.user.username ?? null,
    },
  });

  res.status(200).json({ linked: true, telegram_username: verdict.user.username ?? null });
};
