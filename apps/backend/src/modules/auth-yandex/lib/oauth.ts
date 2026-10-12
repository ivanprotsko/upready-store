/**
 * Yandex ID OAuth 2.0 — pure helpers and thin HTTP wrappers.
 *
 * Kept apart from the provider service so URL building and the profile to
 * auth-identity mapping are unit-testable without booting a Medusa container
 * (`../__tests__/oauth.unit.spec.ts`).
 *
 * Protocol (https://yandex.ru/dev/id/doc/ru/codes/code-url,
 * https://yandex.ru/dev/id/doc/ru/user-information):
 *   1. redirect  GET  https://oauth.yandex.ru/authorize?response_type=code&client_id=…
 *   2. exchange  POST https://oauth.yandex.ru/token   (application/x-www-form-urlencoded)
 *   3. profile   GET  https://login.yandex.ru/info?format=json
 *                     header: Authorization: OAuth <access_token>
 *
 * Unlike Google, Yandex issues NO `id_token`, so there is no JWT to verify
 * against a JWKS. The access token is opaque and the profile call IS the
 * verification: it is a server-to-server request the browser cannot forge.
 */

import { MedusaError } from "@medusajs/framework/utils";

export const YANDEX_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize";
export const YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token";
export const YANDEX_PROFILE_URL = "https://login.yandex.ru/info";

/** Raw shape of https://login.yandex.ru/info?format=json, the fields we consume. */
export type YandexProfile = {
  id?: string;
  login?: string;
  client_id?: string;
  display_name?: string;
  real_name?: string;
  first_name?: string;
  last_name?: string;
  default_email?: string;
  emails?: string[];
  default_avatar_id?: string;
  is_avatar_empty?: boolean;
  psuid?: string;
};

/** What the provider stores on the Medusa auth identity. */
export type YandexIdentity = {
  /** Stable Yandex account id, the auth identity's `entity_id`. */
  entityId: string;
  userMetadata: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    name: string | null;
    login: string | null;
    picture: string | null;
    /**
     * Yandex's `default_avatar_id`, null when the account has no picture or the
     * application lacks `login:avatar`. The storefront keeps it on the customer
     * (`/api/yandex-callback`) and draws the checkout header's avatar from it
     * (t-2026-10-12-05).
     */
    avatar_id: string | null;
  };
};

export type TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

/**
 * Build the Yandex consent-screen URL.
 *
 * `scope` is optional on purpose. A Yandex application carries the permissions
 * it was granted in the application itself (`login:email`, `login:info`,
 * `login:avatar`), and asking for a scope the application does not hold makes
 * Yandex reject the request. Pass it only to narrow this particular flow.
 */
export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
  forceConfirm?: boolean;
}): string {
  const url = new URL(YANDEX_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  if (params.scope) {
    url.searchParams.set("scope", params.scope);
  }
  if (params.forceConfirm) {
    // Shows the account picker even when a Yandex session is already open.
    // Without it a shared browser silently reuses the previous account.
    url.searchParams.set("force_confirm", "yes");
  }
  return url.toString();
}

/** The account's `default_avatar_id`, or null when there is no picture to show. */
export function avatarId(profile: YandexProfile): string | null {
  const id = profile.default_avatar_id?.trim();
  if (!id || profile.is_avatar_empty) {
    return null;
  }
  return id;
}

/** Public avatar URL for a `default_avatar_id`, or null when there is none. */
export function avatarUrl(profile: YandexProfile): string | null {
  const id = avatarId(profile);
  return id ? `https://avatars.yandex.net/get-yapic/${id}/islands-200` : null;
}

/** `default_email`, falling back to the first address in `emails`. */
export function resolveProfileEmail(profile: YandexProfile): string | null {
  const primary = profile.default_email?.trim();
  if (primary) {
    return primary.toLowerCase();
  }
  const first = profile.emails?.find((e) => typeof e === "string" && e.trim());
  return first ? first.trim().toLowerCase() : null;
}

/**
 * Map a Yandex profile onto the auth-identity shape.
 *
 * Throws when the profile carries no id or no email. A Medusa customer cannot
 * exist without an email, so an application configured WITHOUT the
 * `login:email` permission has to fail at login with a readable reason rather
 * than create an account nobody can use. The storefront turns this into the
 * «no email» message on the login page.
 */
export function mapProfileToIdentity(profile: YandexProfile): YandexIdentity {
  const entityId = profile.id?.trim();
  if (!entityId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Yandex profile is missing 'id'",
    );
  }

  const email = resolveProfileEmail(profile);
  if (!email) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Yandex profile has no email, the application needs the 'login:email' permission",
    );
  }

  const firstName = profile.first_name?.trim() || null;
  const lastName = profile.last_name?.trim() || null;
  const name =
    profile.real_name?.trim() ||
    profile.display_name?.trim() ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    null;

  return {
    entityId,
    userMetadata: {
      email,
      first_name: firstName,
      last_name: lastName,
      name,
      login: profile.login?.trim() || null,
      picture: avatarUrl(profile),
      avatar_id: avatarId(profile),
    },
  };
}

/**
 * Exchange the authorization code for an access token.
 *
 * The client secret travels in the POST body, never in a URL, so it cannot
 * reach an access log. A failure message repeats only what Yandex answered
 * (`error` / `error_description`) and never the credentials: the storefront
 * logs this string, and `../__tests__/oauth.unit.spec.ts` asserts the secret is
 * absent from it.
 */
export async function exchangeCodeForToken(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const doFetch = params.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  });
  if (params.redirectUri) {
    body.set("redirect_uri", params.redirectUri);
  }

  const res = await doFetch(YANDEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!res.ok || !data.access_token) {
    const reason =
      data.error_description || data.error || `${res.status} ${res.statusText}`;
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Yandex token exchange failed: ${reason}`,
    );
  }

  return data.access_token;
}

/** Fetch the account profile with an access token. */
export async function fetchYandexProfile(params: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<YandexProfile> {
  const doFetch = params.fetchImpl ?? fetch;
  const url = new URL(YANDEX_PROFILE_URL);
  url.searchParams.set("format", "json");

  const res = await doFetch(url.toString(), {
    method: "GET",
    // Yandex uses the "OAuth" authorization scheme here, NOT "Bearer".
    headers: { Authorization: `OAuth ${params.accessToken}` },
  });

  if (!res.ok) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      `Yandex profile request failed: ${res.status} ${res.statusText}`,
    );
  }

  return (await res.json()) as YandexProfile;
}
