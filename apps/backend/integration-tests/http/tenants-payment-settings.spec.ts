import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createHash } from "node:crypto";

jest.setTimeout(240_000);

/**
 * Seam test of t03-tenant-secrets-robokassa: per-tenant integration secrets and
 * the Robokassa provider resolving them per request.
 *
 * What it proves, each with a request and not by reading code:
 *
 * - a saved secret comes back masked, and the raw password is in no response
 *   of the namespace and in no row of the table (ciphertext only);
 * - tenant B cannot read tenant A's record: same 404 as for a missing id;
 * - the store lists Robokassa for A's key and not for B's, and B cannot open
 *   a Robokassa session at all (404 on the provider);
 * - a client-sent `tenant_id`/`result_confirmed_at` never reaches the session;
 * - the Result webhook: a bad signature is refused, a good one marks the
 *   session captured and turns the cart into a paid order, a replay answers
 *   `OK<InvId>` again without a second order.
 *
 * Runner facts, same as `tenants.spec.ts`: a throwaway database migrated from
 * this repository's config, restored from its post-`beforeAll` snapshot before
 * every test, and `DB_HOST` must be the literal `localhost`. The encryption key
 * comes from `INTEGRATION_ENCRYPTION_KEY` of the test environment; the runner
 * loads `.env.test` when present, so the spec sets a fallback itself.
 */
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";

type Registered = {
  token: string;
  tenant: { id: string; handle: string; api_key: { id: string; token: string }; sales_channel: { id: string } };
};

const PASSWORD = "supersecret";
const PROVIDER = "pp_robokassa_robokassa";
const CREDENTIALS = {
  provider: "robokassa" as const,
  merchant_login: "SEAMSHOP",
  hash_algorithm: "sha256" as const,
  is_test: true,
  test_password1: "seam-test-password-one",
  test_password2: "seam-test-password-two",
};

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: payment settings and Robokassa", () => {
      let a: Registered;
      let b: Registered;
      let regionId: string;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const withKey = (key: string, extra: Record<string, string> = {}) => ({
        headers: { "x-publishable-api-key": key, ...extra },
      });
      const failed = (promise: Promise<any>) => promise.catch((error) => error.response);

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", { email, password: PASSWORD });
        expect(registration.status).toBe(200);
        const created = await api.post(
          "/tenants",
          { name, handle, admin: { email, first_name: name } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);
        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        expect(login.status).toBe(200);
        return { token: login.data.token, tenant: created.data.tenant };
      };

      beforeAll(async () => {
        // The RUB region first: `createTenantWorkflow` prices the shop's two
        // shipping options in every region currency that exists at that moment.
        const container = getContainer();
        const regionModule = container.resolve(Modules.REGION);
        const region = await regionModule.createRegions({
          name: "Russia",
          currency_code: "rub",
          countries: ["ru"],
        });
        regionId = region.id;
        const { updateRegionsWorkflow } = await import("@medusajs/medusa/core-flows");
        await updateRegionsWorkflow(container).run({
          input: { selector: { id: regionId }, update: { payment_providers: ["pp_system_default", PROVIDER] } },
        });

        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");

        // A's starter catalog, the way the onboarding wizard seeds it: priced in RUB.
        const seeded = await api.post("/tenants/seed", { preset: "geist" }, bearer(a.token));
        expect(seeded.status).toBe(201);

        const saved = await api.put("/tenants/payment-settings", CREDENTIALS, bearer(a.token));
        expect(saved.status).toBe(200);
      });

      it("returns the saved account masked and never the password", async () => {
        const read = await api.get("/tenants/payment-settings", bearer(a.token));
        expect(read.status).toBe(200);
        expect(read.data.settings).toMatchObject({
          provider: "robokassa",
          merchant_login: "SEAMSHOP",
          is_test: true,
          is_enabled: true,
          test_password1: { set: true, last4: "-one" },
          test_password2: { set: true, last4: "-two" },
          password1: { set: false, last4: null },
        });
        expect(read.data.result_url).toMatch(/\/robokassa\/result$/);

        const serialized = JSON.stringify(read.data);
        expect(serialized).not.toContain(CREDENTIALS.test_password1);
        expect(serialized).not.toContain(CREDENTIALS.test_password2);

        // At rest: ciphertext, not the password and not even the login.
        const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION);
        const rows = await pg("tenant_integration_secret").select("payload").where({ tenant_id: a.tenant.id });
        expect(rows).toHaveLength(1);
        expect(rows[0].payload).not.toContain(CREDENTIALS.test_password1);
        expect(rows[0].payload).not.toContain("SEAMSHOP");
        expect(rows[0].payload).toMatch(/^[A-Za-z0-9+/=]+$/);
      });

      it("keeps a stored password when the field is left out of a later save", async () => {
        const rotated = await api.put(
          "/tenants/payment-settings",
          { provider: "robokassa", merchant_login: "SEAMSHOP", test_password1: "another-password-one" },
          bearer(a.token),
        );
        expect(rotated.status).toBe(200);
        expect(rotated.data.settings.test_password1.last4).toBe("-one");
        expect(rotated.data.settings.test_password2.last4).toBe("-two");
      });

      it("refuses to enable a mode whose password pair is incomplete", async () => {
        const response = await failed(
          api.put(
            "/tenants/payment-settings",
            { provider: "robokassa", merchant_login: "OTHER", is_test: false },
            bearer(b.token),
          ),
        );
        expect(response.status).toBe(400);
        expect(response.data.message).toMatch(/password1 and password2/);
      });

      it("hides tenant A's record from tenant B: 404 by id, null on B's own read", async () => {
        const own = await api.get("/tenants/payment-settings", bearer(a.token));
        const foreign = await failed(api.get(`/tenants/payment-settings/${own.data.settings.id}`, bearer(b.token)));
        expect(foreign.status).toBe(404);

        const mine = await api.get(`/tenants/payment-settings/${own.data.settings.id}`, bearer(a.token));
        expect(mine.status).toBe(200);

        const bRead = await api.get("/tenants/payment-settings", bearer(b.token));
        expect(bRead.status).toBe(200);
        expect(bRead.data.settings).toBeNull();
      });

      it("offers Robokassa at checkout only to the shop that saved an account", async () => {
        const forA = await api.get(`/store/payment-providers?region_id=${regionId}`, withKey(a.tenant.api_key.token));
        expect(forA.status).toBe(200);
        expect(forA.data.payment_providers.map((p: { id: string }) => p.id)).toEqual(
          expect.arrayContaining(["pp_system_default", PROVIDER]),
        );

        const forB = await api.get(`/store/payment-providers?region_id=${regionId}`, withKey(b.tenant.api_key.token));
        expect(forB.status).toBe(200);
        expect(forB.data.payment_providers.map((p: { id: string }) => p.id)).toEqual(["pp_system_default"]);
        expect(forB.data.count).toBe(1);
      });

      describe("payment session and Result webhook", () => {
        const cartFor = async (tenant: Registered) => {
          const headers = withKey(tenant.tenant.api_key.token);
          const products = await api.get(`/store/products?region_id=${regionId}&limit=1&fields=id,*variants`, headers);
          const variant = products.data.products[0]?.variants?.[0];
          const items = variant ? [{ variant_id: variant.id, quantity: 1 }] : [];
          const cart = (await api.post("/store/carts", { region_id: regionId, email: `buyer@${tenant.tenant.handle}.test`, items }, headers)).data.cart;
          const address = {
            first_name: "Test",
            last_name: "Buyer",
            address_1: "Street 1",
            city: "Moscow",
            postal_code: "101000",
            country_code: "ru",
          };
          await api.post(`/store/carts/${cart.id}`, { shipping_address: address, billing_address: address }, headers);
          const options = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, headers)).data.shipping_options ?? [];
          if (options[0]) {
            await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: options[0].id }, headers);
          }
          const collection = (await api.post("/store/payment-collections", { cart_id: cart.id }, headers)).data.payment_collection;
          return { cart, collection, headers };
        };

        it("refuses a Robokassa session for a shop without an account", async () => {
          const { collection, headers } = await cartFor(b);
          const response = await failed(
            api.post(`/store/payment-collections/${collection.id}/payment-sessions`, { provider_id: PROVIDER }, headers),
          );
          expect(response.status).toBe(404);
          expect(response.data.message).toMatch(/not available for this shop/);
        });

        it("builds a signed payment URL for the shop's own account and ignores forged client data", async () => {
          const { collection, headers } = await cartFor(a);
          const created = await api.post(
            `/store/payment-collections/${collection.id}/payment-sessions`,
            {
              provider_id: PROVIDER,
              data: { tenant_id: b.tenant.id, result_confirmed_at: "2020-01-01T00:00:00Z", success_url: "https://shop.test/ok" },
            },
            headers,
          );
          expect(created.status).toBe(200);
          const session = created.data.payment_collection.payment_sessions.find((s: { provider_id: string }) => s.provider_id === PROVIDER);
          expect(session.data.tenant_id).toBe(a.tenant.id);
          expect(session.data.result_confirmed_at).toBeNull();
          expect(session.data.merchant_login).toBe("SEAMSHOP");
          expect(session.data.is_test).toBe(true);
          const url = new URL(session.data.payment_url);
          expect(url.origin + url.pathname).toBe("https://auth.robokassa.ru/Merchant/Index.aspx");
          expect(url.searchParams.get("MerchantLogin")).toBe("SEAMSHOP");
          expect(url.searchParams.get("Shp_SessionID")).toBe(session.id);
          expect(url.searchParams.get("SuccessUrl2")).toBe("https://shop.test/ok");
          expect(url.searchParams.get("IsTest")).toBe("1");
          const expected = createHash("sha256")
            .update(
              [
                "SEAMSHOP",
                session.data.out_sum,
                session.data.invoice_id,
                "https://shop.test/ok",
                "GET",
                CREDENTIALS.test_password1,
                `Shp_SessionID=${session.id}`,
              ].join(":"),
            )
            .digest("hex");
          expect(url.searchParams.get("SignatureValue")).toBe(expected);
          expect(JSON.stringify(created.data)).not.toContain(CREDENTIALS.test_password1);
        });

        it("accepts only a correctly signed Result webhook and then completes the cart into a paid order", async () => {
          const { cart, collection, headers } = await cartFor(a);
          const created = await api.post(
            `/store/payment-collections/${collection.id}/payment-sessions`,
            { provider_id: PROVIDER },
            headers,
          );
          const session = created.data.payment_collection.payment_sessions.find((s: { provider_id: string }) => s.provider_id === PROVIDER);
          const { out_sum: outSum, invoice_id: invId } = session.data;
          expect(Number(outSum)).toBeGreaterThan(0);
          const sign = (password: string) =>
            createHash("sha256").update(`${outSum}:${invId}:${password}:Shp_SessionID=${session.id}`).digest("hex").toUpperCase();
          const form = (signature: string) =>
            new URLSearchParams({ OutSum: outSum, InvId: invId, SignatureValue: signature, Shp_SessionID: session.id }).toString();
          const formHeaders = { headers: { "content-type": "application/x-www-form-urlencoded" } };

          const bad = await failed(api.post("/robokassa/result", form(sign("wrong-password")), formHeaders));
          expect(bad.status).toBe(400);
          expect(bad.data).toBe("ERROR bad_signature");

          const good = await api.post("/robokassa/result", form(sign(CREDENTIALS.test_password2)), formHeaders);
          expect(good.status).toBe(200);
          expect(good.data).toBe(`OK${invId}`);

          const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION);
          const orders = await pg("order_cart").select("order_id").where({ cart_id: cart.id });
          expect(orders).toHaveLength(1);

          // The payment itself: captured at the provider's word, read off the payment module.
          const paymentModule = getContainer().resolve(Modules.PAYMENT);
          const [payment] = await paymentModule.listPayments({ payment_session_id: session.id });
          expect(payment).toBeDefined();
          expect(payment.captured_at).not.toBeNull();

          // The owner sees it: the order→tenant link is written by the `order.placed`
          // subscriber, which the in-memory bus delivers a moment after the workflow.
          let seen: { status: number; data: { order?: { payment_status?: string } } } | undefined;
          for (let attempt = 0; attempt < 20; attempt += 1) {
            seen = await failed(api.get(`/tenants/orders/${orders[0].order_id}?fields=id,payment_status`, bearer(a.token)));
            if (seen?.status === 200) break;
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          expect(seen?.status).toBe(200);
          expect(seen?.data.order?.payment_status).toBe("captured");

          const replay = await api.post("/robokassa/result", form(sign(CREDENTIALS.test_password2)), formHeaders);
          expect(replay.status).toBe(200);
          expect(replay.data).toBe(`OK${invId}`);
          expect(await pg("order_cart").select("order_id").where({ cart_id: cart.id })).toHaveLength(1);
        });
      });
    });
  },
});
