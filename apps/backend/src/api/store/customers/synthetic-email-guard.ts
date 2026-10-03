import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

import {
  isSyntheticTelegramEmail,
  syntheticEmailFor,
} from "../../../modules/auth-telegram/lib/identity";

const TELEGRAM_ENTITY_PREFIX = "telegram:";

/**
 * `tg_<id>@telegram.local` is reserved for the Telegram identity with that id.
 * Without this guard anyone could register (email+password) or create a
 * customer under a Telegram buyer's synthetic address first, and that buyer's
 * own first Telegram sign-in would then fail with «already has an account».
 */
export const guardSyntheticTelegramEmail = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email !== "string" || !isSyntheticTelegramEmail(email)) {
    next();
    return;
  }

  const authIdentityId = req.auth_context?.auth_identity_id;
  if (authIdentityId) {
    const authModule = req.scope.resolve(Modules.AUTH);
    const identity = await authModule.retrieveAuthIdentity(authIdentityId, {
      relations: ["provider_identities"],
    });
    const owns = identity.provider_identities?.some(
      (provider) =>
        provider.provider === "telegram" &&
        provider.entity_id.startsWith(TELEGRAM_ENTITY_PREFIX) &&
        syntheticEmailFor(provider.entity_id.slice(TELEGRAM_ENTITY_PREFIX.length)) ===
          email.toLowerCase(),
    );
    if (owns) {
      next();
      return;
    }
  }

  res.status(400).json({ message: "This address is reserved for Telegram sign-in." });
};
