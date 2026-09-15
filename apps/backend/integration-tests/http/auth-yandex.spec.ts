import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

import { decodeState, encodeState } from "../../src/modules/auth-yandex/lib/state";

jest.setTimeout(180_000);

/**
 * Seam test of the Yandex ID provider through the real HTTP surface
 * (w02-yandex-id-auth). What it is here to catch is the wiring, not the OAuth
 * arithmetic the unit tests already cover:
 *
 * - the provider is actually registered under the id `yandex`, so
 *   `/auth/customer/yandex` exists and answers a Yandex consent-screen URL;
 * - declaring the auth module in `medusa-config.ts` did not take `emailpass`
 *   down with it, which is what would happen if the provider list there ever
 *   loses its first entry (`resolveModules` in @medusajs/utils replaces the
 *   default list wholesale);
 * - a callback nobody signed is refused with 401 rather than spending a code;
 * - `/store/customers/oauth-link` is not reachable without the token the
 *   callback issues.
 *
 * The suite needs `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET` and
 * `YANDEX_CALLBACK_URL` in the environment: without them `medusa-config.ts`
 * does not register the provider at all (that conditional registration is the
 * point, so an install with no Yandex keys boots unchanged). The values are
 * never asserted literally — the test reads them from `process.env`, so a real
 * client id never lands in this file.
 *
 * Runner facts, the same as the other specs here: `DB_HOST` has to be the
 * literal `localhost` or the runner forces SSL and nothing connects, and the
 * database is restored from its post-`beforeAll` snapshot before every test.
 */

const CLIENT_ID = process.env.YANDEX_CLIENT_ID;
const STATE_SECRET =
  process.env.JWT_SECRET || process.env.COOKIE_SECRET || "supersecret";
const CALLBACK_URL =
  process.env.YANDEX_CALLBACK_URL || "http://localhost:8000/api/yandex-callback";

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("auth: sign in with Yandex ID", () => {
      const failed = (promise: Promise<unknown>) =>
        promise.then(
          (response) => response as { status: number; data: any },
          (error) => error.response as { status: number; data: any },
        );

      /** A shop, for the two checks that need a publishable key of their own. */
      const registerTenant = async (handle: string, name: string) => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", {
          email,
          password: "supersecret",
        });
        const created = await api.post(
          "/tenants",
          { name, handle, admin: { email, first_name: name } },
          { headers: { authorization: `Bearer ${registration.data.token}` } },
        );
        expect(created.status).toBe(201);
        return created.data as {
          tenant: { id: string; handle: string; api_key: { token: string } };
        };
      };

      it("needs the Yandex environment to mean anything", () => {
        // A green suite with no keys configured would be a suite that measures
        // nothing, so it says so instead (rule 20a: zero is not empty).
        expect(CLIENT_ID).toBeTruthy();
      });

      it("hands the storefront a Yandex consent-screen URL", async () => {
        const response = await api.post("/auth/customer/yandex", {
          callback_url: CALLBACK_URL,
          tenant: "cherkashino",
          locale: "ru",
          return_to: "/ru/account",
          nonce: "n-integration",
        });

        expect(response.status).toBe(200);

        const location = new URL(response.data.location);
        expect(`${location.origin}${location.pathname}`).toBe(
          "https://oauth.yandex.ru/authorize",
        );
        expect(location.searchParams.get("response_type")).toBe("code");
        expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
        expect(location.searchParams.get("redirect_uri")).toBe(CALLBACK_URL);

        // The state is signed by the backend and carries the tenant, the
        // language and the page to come back to.
        const verdict = decodeState(
          location.searchParams.get("state")!,
          STATE_SECRET,
        );
        expect(verdict.ok).toBe(true);
        if (verdict.ok) {
          expect(verdict.payload.tn).toBe("cherkashino");
          expect(verdict.payload.lc).toBe("ru");
          expect(verdict.payload.rt).toBe("/ru/account");
          expect(verdict.payload.n).toBe("n-integration");
        }

        // Whatever else is on that URL, the secret is not.
        expect(response.data.location).not.toContain(
          process.env.YANDEX_CLIENT_SECRET,
        );
      });

      it("refuses a callback URL from an origin nobody allowed", async () => {
        const response = await failed(
          api.post("/auth/customer/yandex", {
            callback_url: "https://evil.example.com/api/yandex-callback",
          }),
        );

        expect(response.status).toBe(401);
      });

      it("refuses a callback whose state it never signed", async () => {
        const forged = `${Buffer.from(
          JSON.stringify({
            cb: CALLBACK_URL,
            tn: null,
            lc: null,
            rt: null,
            n: "n-1",
            exp: Math.floor(Date.now() / 1000) + 600,
          }),
          "utf8",
        ).toString("base64url")}.not-a-signature`;

        const response = await failed(
          api.get(`/auth/customer/yandex/callback?code=code-1&state=${forged}`),
        );

        expect(response.status).toBe(401);
      });

      it("refuses a callback whose state has expired", async () => {
        const stale = encodeState(
          { cb: CALLBACK_URL, tn: null, lc: null, rt: null, n: "n-1" },
          STATE_SECRET,
          { nowMs: Date.now() - 3_600_000 },
        );

        const response = await failed(
          api.get(`/auth/customer/yandex/callback?code=code-1&state=${stale}`),
        );

        expect(response.status).toBe(401);
      });

      it("refuses a callback with no code at all", async () => {
        const state = encodeState(
          { cb: CALLBACK_URL, tn: null, lc: null, rt: null, n: "n-1" },
          STATE_SECRET,
        );

        const response = await failed(
          api.get(`/auth/customer/yandex/callback?state=${state}`),
        );

        expect(response.status).toBe(401);
      });

      it("does not offer registration, which Yandex has no password for", async () => {
        const response = await failed(
          api.post("/auth/customer/yandex/register", {}),
        );

        expect(response.status).toBeGreaterThanOrEqual(400);
      });

      it("keeps email and password working next to it", async () => {
        // The regression this exists for: naming the auth module in
        // medusa-config.ts replaces Medusa's own provider list, so a config
        // that forgets `emailpass` kills every existing login at once.
        const registration = await api.post("/auth/customer/emailpass/register", {
          email: "emailpass-still-works@example.com",
          password: "supersecret-customer",
        });

        expect(registration.status).toBe(200);
        expect(registration.data.token).toBeTruthy();
      });

      it("lists both providers for the customer actor", async () => {
        const response = await api.get("/auth/customer/providers");
        const ids = (response.data.providers ?? []).map(
          (provider: { id: string }) => provider.id,
        );

        expect(ids).toEqual(expect.arrayContaining(["emailpass", "yandex"]));
      });

      it("guards /store/customers/oauth-link behind the callback's own token", async () => {
        // Two gates stand in front of this route and the test measures both,
        // because the first one hides the second: `/store/*` needs a
        // publishable key (400 without one) BEFORE authentication is even
        // reached, so a bare call proves nothing about the auth middleware.
        const noKey = await failed(api.post("/store/customers/oauth-link", {}));
        expect(noKey.status).toBe(400);

        const shop = await registerTenant("linkguard", "Link Guard Shop");
        const noToken = await failed(
          api.post(
            "/store/customers/oauth-link",
            {},
            { headers: { "x-publishable-api-key": shop.tenant.api_key.token } },
          ),
        );
        expect(noToken.status).toBe(401);
      });

      it("answers the storefront honestly when nothing is there to link", async () => {
        // The route never creates an account and never links one it cannot
        // prove: an identity with no OAuth provider behind it gets `linked:
        // false` and a reason, so the storefront falls through to
        // `POST /store/customers` instead of failing the login.
        const shop = await registerTenant("linkfall", "Link Fallthrough Shop");
        const registration = await api.post(
          "/auth/customer/emailpass/register",
          {
            email: "nothing-to-link@example.com",
            password: "supersecret-customer",
          },
          { headers: { "x-publishable-api-key": shop.tenant.api_key.token } },
        );

        const response = await api.post(
          "/store/customers/oauth-link",
          {},
          {
            headers: {
              "x-publishable-api-key": shop.tenant.api_key.token,
              authorization: `Bearer ${registration.data.token}`,
            },
          },
        );

        expect(response.status).toBe(200);
        expect(response.data).toEqual({
          linked: false,
          reason: "provider_not_linkable",
        });
      });
    });
  },
});
