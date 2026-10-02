/**
 * Telegram auth provider for the Medusa auth module (t-2026-10-02-telegram-auth).
 *
 * Shaped after `auth-yandex`, with one structural difference: Telegram's Login
 * Widget and Mini App `initData` both arrive as one already-signed POST body,
 * so there is no redirect leg. Everything happens inside `authenticate()`,
 * like the built-in `emailpass` provider — no `location`, no `validateCallback`.
 *
 * The bot token is per TENANT, not per deployment (`src/tenant-secrets/telegram.ts`),
 * because one backend serves every shop and each shop has its own bot. The
 * tenant is resolved from the request's own publishable key
 * (`AuthenticationInput.headers`), the same way a storefront's every other
 * call already names its shop.
 *
 * Flow (both surfaces, no browser redirect):
 *   storefront  POST /auth/customer/telegram  { ...widget fields }  -> { success, authIdentity }
 *   storefront  POST /auth/customer/telegram  { initData }          -> { success, authIdentity }
 *
 * A brand new buyer's token carries no `actor_id`; the storefront then creates
 * the customer with the standard `POST /store/customers`, which also links it
 * to this identity. There is no match-an-existing-account leg: Telegram has no
 * verified email to match on, so an e-mail buyer links Telegram explicitly
 * from the profile (`/store/customers/me/telegram-link`).
 */

import {
  AbstractAuthModuleProvider,
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import type {
  AuthIdentityProviderService,
  AuthenticationInput,
  AuthenticationResponse,
  Logger,
} from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { readUsableTelegramBot } from "../../../tenant-secrets/telegram";
import { authIdentityEntityId } from "../lib/identity";
import { resolveTenantIdFromHeaders, type GraphQuery } from "../lib/tenant";
import { verifyInitData, verifyLoginWidget, type VerifyFailureReason } from "../lib/verify";

export type TelegramAuthOptions = {
  /** `auth_date` freshness bound in seconds, both surfaces. 0 disables it. Default 86400. */
  authDateMaxAgeSec?: number;
};

type InjectedDependencies = {
  logger: Logger;
  [ContainerRegistrationKeys.QUERY]: GraphQuery;
  [ContainerRegistrationKeys.PG_CONNECTION]: Knex;
};

/** Worded for the sign-in page, never an attacker-controlled string. */
const errorMessageFor = (reason: VerifyFailureReason): string => {
  switch (reason) {
    case "expired":
      return "This Telegram sign-in has expired. Try again.";
    case "missing_input":
    case "no_hash":
    case "bad_hash":
      return "Telegram sign-in could not be verified.";
    case "bad_user":
    case "parse_error":
      return "Telegram sign-in sent an unexpected response.";
    default:
      return "Telegram sign-in failed.";
  }
};

export class TelegramAuthService extends AbstractAuthModuleProvider {
  static identifier = "telegram";
  static DISPLAY_NAME = "Telegram";

  protected readonly config_: TelegramAuthOptions;
  protected readonly logger_: Logger;
  protected readonly query_: GraphQuery;
  protected readonly pg_: Knex;

  /**
   * Runs at boot. There is no platform-wide secret to miss here (every bot
   * belongs to a tenant, read from the database per request), so the only
   * thing that can be half-configured is the freshness bound itself.
   */
  static validateOptions(options: TelegramAuthOptions) {
    if (
      options.authDateMaxAgeSec !== undefined &&
      (!Number.isFinite(options.authDateMaxAgeSec) || options.authDateMaxAgeSec < 0)
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Telegram authDateMaxAgeSec must be a non-negative number of seconds (TELEGRAM_AUTH_MAX_AGE_SEC)",
      );
    }
  }

  constructor(container: InjectedDependencies, options: TelegramAuthOptions = {}) {
    super();
    this.config_ = options;
    this.logger_ = container.logger;
    this.query_ = container[ContainerRegistrationKeys.QUERY];
    this.pg_ = container[ContainerRegistrationKeys.PG_CONNECTION];
  }

  /** Telegram has no password to register: the identity is created on first successful verify. */
  async register(_: AuthenticationInput): Promise<AuthenticationResponse> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Telegram does not support registration. Use method `authenticate` instead.",
    );
  }

  async authenticate(
    req: AuthenticationInput,
    authIdentityService: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    const body = (req.body ?? {}) as Record<string, string>;

    const tenantId = await resolveTenantIdFromHeaders(this.query_, req.headers);
    if (!tenantId) {
      return {
        success: false,
        error: "This request does not name a shop (missing or unknown publishable key).",
      };
    }

    // `readUsableTelegramBot`, not `readTelegramBotSecret`: an empty token
    // must fail exactly like a missing one (chrxnasdmds incident `b553c540`),
    // and it has to fail HERE, on this one buyer's click, not corrupt a whole
    // shop silently — there is no boot-time check possible for a per-tenant
    // row, so this is the earliest point the emptiness can be caught.
    const bot = await readUsableTelegramBot(this.pg_, tenantId);
    if (!bot) {
      return { success: false, error: "Telegram sign-in is not configured for this shop." };
    }

    const verdict =
      typeof body.initData === "string" && body.initData
        ? verifyInitData(body.initData, bot.credentials.token, {
            maxAgeSec: this.config_.authDateMaxAgeSec,
          })
        : verifyLoginWidget(body, bot.credentials.token, {
            maxAgeSec: this.config_.authDateMaxAgeSec,
          });

    if (!verdict.ok) {
      this.logger_?.warn(
        `[auth-telegram] rejected (${verdict.reason}) for tenant ${tenantId}`,
      );
      return { success: false, error: errorMessageFor(verdict.reason) };
    }

    const entityId = authIdentityEntityId(verdict.user.id);
    const userMetadata = {
      telegram_id: verdict.user.id,
      telegram_username: verdict.user.username ?? null,
      telegram_first_name: verdict.user.first_name ?? null,
      telegram_last_name: verdict.user.last_name ?? null,
      telegram_photo_url: verdict.user.photo_url ?? null,
    };

    try {
      let authIdentity;
      try {
        await authIdentityService.retrieve({ entity_id: entityId });
        // A returning buyer: refresh the cached profile, since the Telegram
        // name or @username may have changed since the last login.
        authIdentity = await authIdentityService.update(entityId, {
          user_metadata: userMetadata,
        });
      } catch (error: any) {
        if (error?.type !== MedusaError.Types.NOT_FOUND) {
          throw error;
        }
        authIdentity = await authIdentityService.create({
          entity_id: entityId,
          user_metadata: userMetadata,
        });
      }

      return { success: true, authIdentity };
    } catch (error: any) {
      this.logger_?.error(`[auth-telegram] authenticate failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

export default TelegramAuthService;
