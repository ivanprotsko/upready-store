/**
 * Yandex ID auth provider for the Medusa auth module.
 *
 * Shaped after `@medusajs/auth-google` (the OAuth provider Medusa ships whose
 * flow is closest to this one), with two structural differences:
 *
 *   - Yandex issues no `id_token`, so there is no JWKS verification step. The
 *     code is exchanged for an opaque access token and the profile is read
 *     server-to-server from login.yandex.ru. That request is what proves the
 *     identity (`../lib/oauth.ts`).
 *   - The `state` is signed rather than stored, because this backend serves
 *     every shop from one process and the callback has to know which host,
 *     language and page the buyer started from (`../lib/state.ts`).
 *
 * Flow (the buyer's browser never talks to Medusa directly):
 *   1. storefront  POST /auth/customer/yandex          -> { location }
 *   2. browser     -> Yandex consent screen -> redirect to `callback_url`
 *   3. storefront  GET  /auth/customer/yandex/callback -> { token }
 *
 * `callback_url` points at the STOREFRONT, not at Medusa: the storefront sets
 * the httpOnly `_medusa_jwt` cookie itself and its host is what the Yandex
 * application has registered as a Redirect URI.
 */

import {
  AbstractAuthModuleProvider,
  MedusaError,
} from "@medusajs/framework/utils";
import type {
  AuthIdentityProviderService,
  AuthenticationInput,
  AuthenticationResponse,
  Logger,
} from "@medusajs/framework/types";

import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchYandexProfile,
  mapProfileToIdentity,
} from "../lib/oauth";
import { createNonce, decodeState, encodeState } from "../lib/state";

type InjectedDependencies = {
  logger: Logger;
};

export type YandexAuthOptions = {
  clientId: string;
  clientSecret: string;
  /** Default callback URL; a request may name its own with `callback_url`. */
  callbackUrl: string;
  /** Secret the `state` is signed with. `JWT_SECRET`, else `COOKIE_SECRET`. */
  stateSecret: string;
  /**
   * Optional allowlist of origins a request may name in `callback_url`.
   * Empty means «only the configured `callbackUrl`'s own origin».
   *
   * Yandex is the real gate here: it refuses any `redirect_uri` the
   * application has not registered, so a callback URL nobody registered can
   * never receive a code. This list is defence in depth and the place to add a
   * tenant's own domain once it is registered on both sides.
   */
  allowedCallbackOrigins?: string[];
  /** Narrow the application's permissions for this flow, e.g. "login:email login:info". */
  scope?: string;
  /** Force the Yandex account picker even when a session is already open. */
  forceConfirm?: boolean;
};

export class YandexAuthService extends AbstractAuthModuleProvider {
  static identifier = "yandex";
  static DISPLAY_NAME = "Yandex ID";

  protected readonly config_: YandexAuthOptions;
  protected readonly logger_: Logger;

  /**
   * Runs at boot. A half-configured provider is a login that fails at the
   * consent screen, hours later and on a buyer's machine, so it fails here
   * instead. `medusa-config.ts` registers the provider only when
   * `YANDEX_CLIENT_ID` is set, which is what keeps an install without Yandex
   * keys booting exactly as before.
   */
  static validateOptions(options: YandexAuthOptions) {
    if (!options.clientId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Yandex clientId is required (YANDEX_CLIENT_ID)",
      );
    }
    if (!options.clientSecret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Yandex clientSecret is required (YANDEX_CLIENT_SECRET)",
      );
    }
    if (!options.callbackUrl) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Yandex callbackUrl is required (YANDEX_CALLBACK_URL)",
      );
    }
    if (!options.stateSecret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Yandex stateSecret is required (JWT_SECRET or COOKIE_SECRET)",
      );
    }
  }

  constructor({ logger }: InjectedDependencies, options: YandexAuthOptions) {
    super();

    this.config_ = options;
    this.logger_ = logger;
  }

  /**
   * Yandex ID has no password to register: the account is created on the first
   * successful callback. Mirrors the Google provider.
   */
  async register(_: AuthenticationInput): Promise<AuthenticationResponse> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Yandex does not support registration. Use method `authenticate` instead.",
    );
  }

  /**
   * The origins a `callback_url` may name. Always includes the configured one,
   * so a single-store install needs no extra variable.
   */
  protected allowedOrigins_(): string[] {
    const origins = new Set<string>();
    try {
      origins.add(new URL(this.config_.callbackUrl).origin);
    } catch {
      // validateOptions already rejected an empty value; a malformed one is
      // reported by the first authenticate() call rather than swallowed.
    }
    for (const raw of this.config_.allowedCallbackOrigins ?? []) {
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }
      try {
        origins.add(new URL(trimmed).origin);
      } catch {
        this.logger_?.warn(
          `[auth-yandex] ignoring malformed allowed callback origin: ${trimmed}`,
        );
      }
    }
    return [...origins];
  }

  protected resolveCallbackUrl_(requested?: string): string {
    if (!requested) {
      return this.config_.callbackUrl;
    }

    let origin: string;
    try {
      origin = new URL(requested).origin;
    } catch {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "callback_url is not a valid URL",
      );
    }

    if (!this.allowedOrigins_().includes(origin)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `callback_url origin ${origin} is not allowed (YANDEX_CALLBACK_ORIGINS)`,
      );
    }

    return requested;
  }

  async authenticate(
    req: AuthenticationInput,
    _authIdentityService: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    const query = (req.query ?? {}) as Record<string, string>;
    const body = (req.body ?? {}) as Record<string, string>;

    if (query.error) {
      return {
        success: false,
        error: query.error_description || query.error,
      };
    }

    let callbackUrl: string;
    try {
      callbackUrl = this.resolveCallbackUrl_(body.callback_url);
    } catch (error: any) {
      return { success: false, error: error.message };
    }

    const nonce = body.nonce || createNonce();

    const state = encodeState(
      {
        cb: callbackUrl,
        tn: body.tenant ?? null,
        lc: body.locale ?? null,
        rt: body.return_to ?? null,
        n: nonce,
      },
      this.config_.stateSecret,
    );

    return {
      success: true,
      location: buildAuthorizeUrl({
        clientId: this.config_.clientId,
        redirectUri: callbackUrl,
        state,
        scope: this.config_.scope,
        forceConfirm: this.config_.forceConfirm,
      }),
    };
  }

  async validateCallback(
    req: AuthenticationInput,
    authIdentityService: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    const query = (req.query ?? {}) as Record<string, string>;
    const body = (req.body ?? {}) as Record<string, string>;

    if (query.error) {
      // The buyer pressed «Deny» on the consent screen, or the application is
      // misconfigured. Either way it is Yandex's own wording.
      return {
        success: false,
        error: query.error_description || query.error,
      };
    }

    const code = query.code ?? body.code;
    if (!code) {
      return { success: false, error: "No code provided" };
    }

    const rawState = query.state ?? body.state;
    if (!rawState) {
      return { success: false, error: "No state provided" };
    }

    const verdict = decodeState(rawState, this.config_.stateSecret);
    if (!verdict.ok) {
      // Never echo the state back: it is attacker-controlled input and this
      // string reaches the storefront log.
      return { success: false, error: `Invalid state (${verdict.reason})` };
    }

    try {
      const accessToken = await exchangeCodeForToken({
        code,
        clientId: this.config_.clientId,
        clientSecret: this.config_.clientSecret,
        // Yandex checks that the exchange repeats the redirect_uri the code was
        // issued for, and the state is the only place that value survives.
        redirectUri: verdict.payload.cb,
      });

      const profile = await fetchYandexProfile({ accessToken });
      const { entityId, userMetadata } = mapProfileToIdentity(profile);

      let authIdentity;
      try {
        await authIdentityService.retrieve({ entity_id: entityId });
        // A returning buyer: refresh the cached profile, since the account may
        // have been renamed or its default email changed since the last login.
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
      this.logger_?.error(`[auth-yandex] callback failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

export default YandexAuthService;
