import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { setAuthAppMetadataStep, updateCustomersStep } from "@medusajs/medusa/core-flows";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
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

type LinkInput = {
  entityId: string;
  userMetadata: Record<string, unknown>;
  customerId: string;
  customerMetadata: Record<string, unknown>;
};

const ensureTelegramAuthIdentityStep = createStep(
  "ensure-telegram-auth-identity",
  async (input: { entityId: string; userMetadata: Record<string, unknown> }, { container }) => {
    const authModule = container.resolve(Modules.AUTH);
    const [existing] = await authModule.listAuthIdentities({
      provider_identities: { entity_id: input.entityId, provider: "telegram" },
    });
    if (existing) {
      return new StepResponse(existing.id, null);
    }
    const created = await authModule.createAuthIdentities({
      provider_identities: [
        { provider: "telegram", entity_id: input.entityId, user_metadata: input.userMetadata },
      ],
    });
    return new StepResponse(created.id, created.id);
  },
  async (createdId: string | null, { container }) => {
    if (createdId) {
      await container.resolve(Modules.AUTH).deleteAuthIdentities([createdId]);
    }
  },
);

const linkTelegramToCustomerWorkflow = createWorkflow(
  "link-telegram-to-customer",
  (input: LinkInput) => {
    const authIdentityId = ensureTelegramAuthIdentityStep({
      entityId: input.entityId,
      userMetadata: input.userMetadata,
    });
    setAuthAppMetadataStep({
      authIdentityId,
      actorType: "customer",
      value: input.customerId,
    });
    updateCustomersStep({
      selector: { id: input.customerId },
      update: { metadata: input.customerMetadata },
    });

    return new WorkflowResponse(authIdentityId);
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
  const entityId = authIdentityEntityId(telegramId);

  // The auth identity's own `app_metadata` is the link, not `customer.metadata`:
  // a buyer can write their own metadata through `POST /store/customers/me`.
  const authModule = req.scope.resolve(Modules.AUTH);
  const [existing] = await authModule.listAuthIdentities({
    provider_identities: { entity_id: entityId, provider: "telegram" },
  });
  const linkedTo = (existing?.app_metadata as Record<string, unknown> | undefined)?.customer_id;
  if (linkedTo && linkedTo !== customerId) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This Telegram account is already linked to another customer.",
    );
  }

  const customerModule: ICustomerModuleService = req.scope.resolve(Modules.CUSTOMER);
  const customer = await customerModule.retrieveCustomer(customerId);

  await linkTelegramToCustomerWorkflow(req.scope).run({
    input: {
      entityId,
      userMetadata: {
        telegram_id: telegramId,
        telegram_username: verdict.user.username ?? null,
        telegram_first_name: verdict.user.first_name ?? null,
        telegram_last_name: verdict.user.last_name ?? null,
        telegram_photo_url: verdict.user.photo_url ?? null,
      },
      customerId,
      customerMetadata: {
        ...(customer.metadata ?? {}),
        telegram_id: telegramId,
        telegram_username: verdict.user.username ?? null,
      },
    },
  });

  res.status(200).json({ linked: true, telegram_username: verdict.user.username ?? null });
};
