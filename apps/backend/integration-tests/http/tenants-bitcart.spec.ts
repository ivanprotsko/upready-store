import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { sweepBitcartInvoices } from "../../src/jobs/bitcart-invoice-sweep";
import { startBitcartMock } from "./bitcart-mock";

jest.setTimeout(240_000);

/**
 * Seam test of the Bitcart provider (ask-20261005-070255-438f, stage 2), end
 * to end through the app's own HTTP routes, against a Bitcart stand-in on a
 * loopback port (`bitcart-mock.ts`). Nothing in `src` is mocked: the provider,
 * the notification route and the sweep call the stand-in with their real
 * `fetch`.
 *
 * What it proves, each with a request:
 *
 * - the owner's store is saved switched off, comes back masked, keeps a stored
 *   token that a later save leaves out, and cannot be switched on incomplete;
 * - the checkout lists Bitcart only for the shop that switched it on, next to
 *   BTCPay when the shop has both, and the other shop cannot open a Bitcart
 *   session at all;
 * - a session is an invoice on the shop's own store, for the cart's amount,
 *   carrying this backend's notification address, and forged client data
 *   never reaches it;
 * - an unsigned notification decides nothing: only an invoice the server
 *   reads as complete turns the cart into one paid order, and a repeat adds
 *   none;
 * - the sweep job and the cart completion settle an invoice whose
 *   notification never came.
 *
 * Runner facts, as in `tenants-btcpay.spec.ts`: a throwaway database restored
 * from its post-`beforeAll` snapshot before every test, `DB_HOST` the literal
 * `localhost`, and the app's own scheduler running both sweep jobs every
 * minute, so an assertion about who settled an invoice accepts either path;
 * the number of orders it never relaxes. The suite runs with
 * `PAYMENTS_CRYPTO_AVAILABLE=true`, and the last block turns it off around
 * its own requests to show what the RU instance answers.
 */
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";
const previousCryptoFlag = process.env.PAYMENTS_CRYPTO_AVAILABLE;
process.env.PAYMENTS_CRYPTO_AVAILABLE = "true";
const previousPublicUrl = process.env.BACKEND_PUBLIC_URL;
process.env.BACKEND_PUBLIC_URL = "https://engine.seam.test";
process.env.STORE_MEDIA_BASE_URL ||= "https://media.example.test/static/store-media";

type Registered = {
  token: string;
  tenant: { id: string; handle: string; api_key: { id: string; token: string }; sales_channel: { id: string } };
};

const PASSWORD = "supersecret-owner";
const PROVIDER = "pp_bitcart_bitcart";
const BTCPAY_PROVIDER = "pp_btcpay_btcpay";
const STORE_ID = "01JSEAMSTORE";
const API_KEY = "seam-bitcart-token";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: Bitcart store, checkout, notification and sweep", () => {
      let a: Registered;
      let b: Registered;
      let regionId: string;
      let bitcart: Awaited<ReturnType<typeof startBitcartMock>>;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const withKey = (key: string) => ({ headers: { "x-publishable-api-key": key } });
      const failed = (promise: Promise<any>) => promise.catch((error) => error.response);
      const providerIds = (response: { data: { payment_providers: Array<{ id: string }> } }) =>
        response.data.payment_providers.map((p) => p.id).sort();

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", { email, password: PASSWORD });
        const created = await api.post(
          "/tenants",
          { name, handle, admin: { email, first_name: name } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);
        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        return { token: login.data.token, tenant: created.data.tenant };
      };

      beforeAll(async () => {
        bitcart = await startBitcartMock({ storeId: STORE_ID, apiKey: API_KEY });

        // The EUR region first: the shop's shipping options are priced in every
        // region currency, and shipped to every region country, that exists
        // when the shop is created.
        const container = getContainer();
        const region = await container.resolve(Modules.REGION).createRegions({
          name: "Germany",
          currency_code: "eur",
          countries: ["de"],
        });
        regionId = region.id;
        const { updateRegionsWorkflow } = await import("@medusajs/medusa/core-flows");
        await updateRegionsWorkflow(container).run({
          input: {
            selector: { id: regionId },
            update: { payment_providers: ["pp_system_default", PROVIDER, BTCPAY_PROVIDER] },
          },
        });

        a = await registerTenant("nakamoto", "Nakamoto Goods");
        b = await registerTenant("cashonly", "Cash Only");

        const seeded = await api.post("/tenants/seed", { preset: "geist" }, bearer(a.token));
        expect(seeded.status).toBe(201);

        const saved = await api.put(
          "/tenants/payment-settings/bitcart",
          { server_url: `${bitcart.serverUrl}/`, admin_url: bitcart.adminUrl, store_id: STORE_ID, api_key: API_KEY },
          bearer(a.token),
        );
        expect(saved.status).toBe(200);
        // A new store starts switched off: no shop offers Bitcart until its owner says so.
        expect(saved.data.settings.is_enabled).toBe(false);

        const enabled = await api.put("/tenants/payment-settings/bitcart", { is_enabled: true }, bearer(a.token));
        expect(enabled.status).toBe(200);
      });

      afterAll(async () => {
        await bitcart?.close();
        if (previousCryptoFlag === undefined) delete process.env.PAYMENTS_CRYPTO_AVAILABLE;
        else process.env.PAYMENTS_CRYPTO_AVAILABLE = previousCryptoFlag;
        if (previousPublicUrl === undefined) delete process.env.BACKEND_PUBLIC_URL;
        else process.env.BACKEND_PUBLIC_URL = previousPublicUrl;
      });

      it("returns the saved store masked, with the notification address every invoice carries", async () => {
        const read = await api.get("/tenants/payment-settings/bitcart", bearer(a.token));

        expect(read.status).toBe(200);
        expect(read.data).toMatchObject({
          provider: "bitcart",
          available: true,
          settings: {
            provider: "bitcart",
            is_enabled: true,
            server_url: bitcart.serverUrl,
            admin_url: bitcart.adminUrl,
            store_id: STORE_ID,
            api_key: { set: true, last4: API_KEY.slice(-4) },
          },
          unreadable: null,
          notification_url: `https://engine.seam.test/bitcart/webhook/${a.tenant.id}`,
        });
        expect(JSON.stringify(read.data)).not.toContain(API_KEY);

        // At rest: ciphertext only.
        const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION);
        const rows = await pg("tenant_integration_secret")
          .select("payload")
          .where({ tenant_id: a.tenant.id, provider: "bitcart" });
        expect(rows).toHaveLength(1);
        expect(rows[0].payload).not.toContain(API_KEY);
        expect(rows[0].payload).not.toContain(STORE_ID);

        // The panel's unified status names Bitcart as connected.
        const summary = await api.get("/tenants/payment-settings", bearer(a.token));
        expect(summary.data.methods).toMatchObject({ bitcart: true, btcpay: false, demo: false });
      });

      it("keeps a stored token a later save leaves out, and refuses an incomplete or plain-http store", async () => {
        const rotated = await api.put("/tenants/payment-settings/bitcart", { api_key: "rotated-token-9999" }, bearer(a.token));
        expect(rotated.status).toBe(200);
        expect(rotated.data.settings.api_key.last4).toBe("9999");
        expect(rotated.data.settings.admin_url).toBe(bitcart.adminUrl);
        expect(rotated.data.settings.is_enabled).toBe(true);

        const incomplete = await failed(
          api.put(
            "/tenants/payment-settings/bitcart",
            { server_url: "https://pay.cashonly.test/api", is_enabled: true },
            bearer(b.token),
          ),
        );
        expect(incomplete.status).toBe(400);
        expect(incomplete.data.message).toMatch(/admin_url, store_id, api_key/);

        const plainHttp = await failed(
          api.put("/tenants/payment-settings/bitcart", { admin_url: "http://pay.cashonly.test/admin" }, bearer(b.token)),
        );
        expect(plainHttp.status).toBe(400);

        const bRead = await api.get("/tenants/payment-settings/bitcart", bearer(b.token));
        expect(bRead.data.settings).toBeNull();
      });

      it("offers Bitcart at checkout only to the shop that switched it on, and next to BTCPay when both are on", async () => {
        const forA = await api.get(`/store/payment-providers?region_id=${regionId}`, withKey(a.tenant.api_key.token));
        expect(providerIds(forA)).toEqual([PROVIDER]);

        const forB = await api.get(`/store/payment-providers?region_id=${regionId}`, withKey(b.tenant.api_key.token));
        expect(providerIds(forB)).toEqual(["pp_system_default"]);

        // Saving a BTCPay store calls no server, so the same shop can switch both on here.
        const btcpay = await api.put(
          "/tenants/payment-settings/btcpay",
          {
            server_url: "https://btcpay.nakamoto.test",
            store_id: "BtcpayStore1",
            api_key: "greenfield-key",
            webhook_secret: "whsec",
            is_enabled: true,
          },
          bearer(a.token),
        );
        expect(btcpay.status).toBe(200);
        const both = await api.get(`/store/payment-providers?region_id=${regionId}`, withKey(a.tenant.api_key.token));
        expect(providerIds(both)).toEqual([PROVIDER, BTCPAY_PROVIDER]);
      });

      describe("payment session, notification, sweep and completion", () => {
        const cartFor = async (tenant: Registered) => {
          const headers = withKey(tenant.tenant.api_key.token);
          const products = await api.get(`/store/products?region_id=${regionId}&limit=1&fields=id,*variants`, headers);
          const variant = products.data.products[0]?.variants?.[0];
          const items = variant ? [{ variant_id: variant.id, quantity: 1 }] : [];
          const cart = (
            await api.post(
              "/store/carts",
              { region_id: regionId, email: `buyer@${tenant.tenant.handle}.test`, items },
              headers,
            )
          ).data.cart;
          const address = {
            first_name: "Test",
            last_name: "Buyer",
            address_1: "Unter den Linden 1",
            city: "Berlin",
            postal_code: "10117",
            country_code: "de",
          };
          await api.post(`/store/carts/${cart.id}`, { shipping_address: address, billing_address: address }, headers);
          const options = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, headers)).data.shipping_options ?? [];
          if (options[0]) {
            await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: options[0].id }, headers);
          }
          const collection = (await api.post("/store/payment-collections", { cart_id: cart.id }, headers)).data
            .payment_collection;
          return { cart, collection, headers };
        };

        const openSession = async (tenant: Registered, data: Record<string, unknown> = {}) => {
          const { cart, collection, headers } = await cartFor(tenant);
          const created = await api.post(
            `/store/payment-collections/${collection.id}/payment-sessions`,
            { provider_id: PROVIDER, data },
            headers,
          );
          expect(created.status).toBe(200);
          const session = created.data.payment_collection.payment_sessions.find(
            (s: { provider_id: string }) => s.provider_id === PROVIDER,
          );
          return { cart, session, headers };
        };

        const notify = (tenantId: string, body: Record<string, unknown>) =>
          failed(api.post(`/bitcart/webhook/${tenantId}`, body, { headers: { "content-type": "application/json" } }));

        // Live links only: `completeCartWorkflow` (2.19) creates the order before
        // it authorizes the payment, and when the authorization fails its
        // compensation soft-deletes the `order_cart` row instead of removing it.
        const ordersOf = async (cartId: string) => {
          const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION);
          return pg("order_cart").select("order_id").where({ cart_id: cartId }).whereNull("deleted_at");
        };

        it("refuses a Bitcart session for a shop that has none", async () => {
          const { collection, headers } = await cartFor(b);
          const response = await failed(
            api.post(`/store/payment-collections/${collection.id}/payment-sessions`, { provider_id: PROVIDER }, headers),
          );
          expect(response.status).toBe(404);
          expect(response.data.message).toMatch(/not available for this shop/);
        });

        it("creates an invoice on the shop's own store for the cart's amount and ignores forged client data", async () => {
          const { session } = await openSession(a, {
            tenant_id: b.tenant.id,
            confirmed_at: "2020-01-01T00:00:00Z",
            invoice_id: "01JFORGED",
            return_url: "https://nakamoto.shop.test/api/payment-return?provider=bitcart",
          });

          const created = bitcart.mock.calls.filter((call) => call.method === "POST" && call.path === "/api/invoices").pop();
          expect(created).toMatchObject({ authorization: `Bearer ${API_KEY}` });
          expect(created?.body).toMatchObject({
            currency: "EUR",
            store_id: STORE_ID,
            order_id: session.id,
            notification_url: `https://engine.seam.test/bitcart/webhook/${a.tenant.id}`,
            redirect_url: "https://nakamoto.shop.test/api/payment-return?provider=bitcart",
          });
          expect(Number(session.amount)).toBeGreaterThan(0);
          expect((created?.body as { price: string }).price).toBe(Number(session.amount).toFixed(2));

          expect(session.data).toMatchObject({
            provider: "bitcart",
            tenant_id: a.tenant.id,
            store_id: STORE_ID,
            invoice_status: "pending",
            confirmed_at: null,
          });
          expect(session.data.invoice_id).not.toBe("01JFORGED");
          expect(session.data.checkout_link).toBe(`${bitcart.adminUrl}/i/${session.data.invoice_id}`);
          expect(JSON.stringify(session.data)).not.toContain(API_KEY);
        });

        it("pays only what the server reads as complete, once, whatever the unsigned notification says", async () => {
          const { cart, session } = await openSession(a);
          const invoiceId = session.data.invoice_id as string;

          // The body says complete; the server says the transfer is only seen.
          bitcart.mock.setStatus(invoiceId, "paid");
          const early = await notify(a.tenant.id, { id: invoiceId, status: "complete" });
          expect(early.status).toBe(200);
          expect(early.data.status).toBe("ok");
          expect(await ordersOf(cart.id)).toHaveLength(0);

          // Another shop's tenant in the path: not this shop's invoice.
          const elsewhere = await notify(b.tenant.id, { id: invoiceId, status: "complete" });
          expect(elsewhere.status).toBe(404);

          bitcart.mock.setStatus(invoiceId, "complete");
          const complete = await notify(a.tenant.id, { id: invoiceId, status: "complete" });
          expect(complete.status).toBe(200);
          expect(["captured", "already_captured"]).toContain(complete.data.outcome);

          expect(await ordersOf(cart.id)).toHaveLength(1);
          const [payment] = await getContainer()
            .resolve(Modules.PAYMENT)
            .listPayments({ payment_session_id: session.id });
          expect(payment.captured_at).not.toBeNull();

          const repeat = await notify(a.tenant.id, { id: invoiceId, status: "complete" });
          expect(repeat.status).toBe(200);
          expect(repeat.data.outcome).toBe("already_captured");
          expect(await ordersOf(cart.id)).toHaveLength(1);

          const unknown = await notify(a.tenant.id, { id: "01JNOSUCHINVOICE", status: "complete" });
          expect(unknown.status).toBe(200);
          expect(unknown.data).toEqual({ status: "ignored", reason: "unknown_invoice" });
        });

        it("settles an invoice whose notification never came: the sweep job reads it from the server", async () => {
          const { cart, session } = await openSession(a);
          bitcart.mock.setStatus(session.data.invoice_id, "complete", "paid_over");

          await sweepBitcartInvoices(getContainer());

          expect(await ordersOf(cart.id)).toHaveLength(1);
          await sweepBitcartInvoices(getContainer());
          expect(await ordersOf(cart.id)).toHaveLength(1);
        });

        it("completes the cart when the buyer is back and the invoice is complete, and refuses while it is not", async () => {
          const { cart, session, headers } = await openSession(a);

          bitcart.mock.setStatus(session.data.invoice_id, "confirmed");
          const tooEarly = await failed(api.post(`/store/carts/${cart.id}/complete`, {}, headers));
          expect(tooEarly.data.type ?? "error").not.toBe("order");
          expect(await ordersOf(cart.id)).toHaveLength(0);

          bitcart.mock.setStatus(session.data.invoice_id, "complete");
          const completed = await api.post(`/store/carts/${cart.id}/complete`, {}, headers);
          expect(completed.data.type).toBe("order");
          expect(await ordersOf(cart.id)).toHaveLength(1);
        });

        it("records an expired invoice on the session as canceled", async () => {
          const { session } = await openSession(a);
          bitcart.mock.setStatus(session.data.invoice_id, "expired");

          const expired = await notify(a.tenant.id, { id: session.data.invoice_id, status: "expired" });
          expect(expired.status).toBe(200);

          const [stored] = await getContainer()
            .resolve(Modules.PAYMENT)
            .listPaymentSessions({ id: session.id }, { select: ["id", "status", "data"] });
          expect(stored.status).toBe("canceled");
          expect(stored.data).toMatchObject({ invoice_status: "expired", last_event: "expired" });
        });
      });

      describe("on an instance without cryptocurrency (PAYMENTS_CRYPTO_AVAILABLE not true)", () => {
        const withFlagOff = async <T>(fn: () => Promise<T>): Promise<T> => {
          process.env.PAYMENTS_CRYPTO_AVAILABLE = "false";
          try {
            return await fn();
          } finally {
            process.env.PAYMENTS_CRYPTO_AVAILABLE = "true";
          }
        };

        it("says available:false, refuses a save with 403 and writes nothing", async () => {
          await withFlagOff(async () => {
            const read = await api.get("/tenants/payment-settings/bitcart", bearer(a.token));
            expect(read.status).toBe(200);
            expect(read.data.available).toBe(false);

            const saved = await failed(
              api.put("/tenants/payment-settings/bitcart", { api_key: "written-anyway-0000" }, bearer(a.token)),
            );
            expect(saved.status).toBe(403);
            expect(saved.data.message).toMatch(/PAYMENTS_CRYPTO_AVAILABLE/);

            const fresh = await failed(
              api.put(
                "/tenants/payment-settings/bitcart",
                { server_url: "https://pay.cashonly.test/api", store_id: "01JSTORE9" },
                bearer(b.token),
              ),
            );
            expect(fresh.status).toBe(403);
          });

          const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION);
          expect(await pg("tenant_integration_secret").where({ tenant_id: b.tenant.id, provider: "bitcart" })).toHaveLength(0);
          const after = await api.get("/tenants/payment-settings/bitcart", bearer(a.token));
          expect(after.data.settings.api_key.last4).toBe(API_KEY.slice(-4));
        });

        it("offers no Bitcart at checkout, opens no session, and ignores the notification", async () => {
          const keyed = withKey(a.tenant.api_key.token);
          const products = await api.get(`/store/products?region_id=${regionId}&limit=1&fields=id,*variants`, keyed);
          const variant = products.data.products[0]?.variants?.[0];
          const items = variant ? [{ variant_id: variant.id, quantity: 1 }] : [];
          const cart = (await api.post("/store/carts", { region_id: regionId, items }, keyed)).data.cart;
          const collection = (await api.post("/store/payment-collections", { cart_id: cart.id }, keyed)).data
            .payment_collection;

          await withFlagOff(async () => {
            const providers = await api.get(`/store/payment-providers?region_id=${regionId}`, keyed);
            expect(providerIds(providers)).toEqual(["pp_system_default"]);

            const session = await failed(
              api.post(`/store/payment-collections/${collection.id}/payment-sessions`, { provider_id: PROVIDER }, keyed),
            );
            expect(session.status).toBe(404);

            const delivered = await api.post(`/bitcart/webhook/${a.tenant.id}`, { id: "01JINV1", status: "complete" });
            expect(delivered.status).toBe(200);
            expect(delivered.data).toEqual({ status: "ignored", reason: "unavailable" });
          });
        });

        it("still lets the owner remove a saved store", async () => {
          await withFlagOff(async () => {
            const removed = await api.delete("/tenants/payment-settings/bitcart", bearer(a.token));
            expect(removed.status).toBe(200);
            expect(removed.data).toMatchObject({ deleted: true, settings: null, available: false });
          });
        });
      });
    });
  },
});
