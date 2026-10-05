import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createHmac } from "node:crypto";
import { sweepBtcpayInvoices } from "../../src/jobs/btcpay-invoice-sweep";
import { startBtcpayMock } from "./btcpay-mock";

jest.setTimeout(240_000);

/**
 * Seam test of the BTCPay provider (ask-20261005-070255-438f), end to end
 * through the app's own HTTP routes, against a BTCPay Server stand-in on a
 * loopback port (`btcpay-mock.ts`). Nothing in `src` is mocked: the provider,
 * the webhook and the sweep call the stand-in with their real `fetch`.
 *
 * What it proves, each with a request:
 *
 * - the owner's store is saved switched off, comes back masked, keeps a stored
 *   secret that a later save leaves out, and cannot be switched on incomplete;
 * - the checkout lists BTCPay only for the shop that switched it on, and the
 *   other shop cannot open a BTCPay session at all;
 * - a session is an invoice on the shop's own store, for the cart's amount,
 *   and forged client data never reaches it;
 * - the webhook refuses a bad signature, settles only what the server says is
 *   Settled, turns the cart into one paid order, and a redelivery adds none;
 * - the sweep job and the cart completion settle an invoice whose webhook
 *   never came.
 *
 * Runner facts, as in `tenants-payment-settings.spec.ts`: a throwaway database
 * restored from its post-`beforeAll` snapshot before every test, `DB_HOST`
 * the literal `localhost`. The app's own scheduler runs the sweep job every
 * minute during this suite too, so an assertion about who settled an invoice
 * accepts either the webhook or the sweep; the number of orders it never
 * relaxes.
 */
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";
process.env.STORE_MEDIA_BASE_URL ||= "https://media.example.test/static/store-media";

type Registered = {
  token: string;
  tenant: { id: string; handle: string; api_key: { id: string; token: string }; sales_channel: { id: string } };
};

const PASSWORD = "supersecret-owner";
const PROVIDER = "pp_btcpay_btcpay";
const STORE_ID = "SeamStore1";
const API_KEY = "seam-greenfield-api-key";
const WEBHOOK_SECRET = "seam-webhook-secret";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: BTCPay Server store, checkout, webhook and sweep", () => {
      let a: Registered;
      let b: Registered;
      let regionId: string;
      let btcpay: Awaited<ReturnType<typeof startBtcpayMock>>;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const withKey = (key: string) => ({ headers: { "x-publishable-api-key": key } });
      const failed = (promise: Promise<any>) => promise.catch((error) => error.response);

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
        btcpay = await startBtcpayMock({ storeId: STORE_ID, apiKey: API_KEY });

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
          input: { selector: { id: regionId }, update: { payment_providers: ["pp_system_default", PROVIDER] } },
        });

        a = await registerTenant("satoshi", "Satoshi Goods");
        b = await registerTenant("fiatonly", "Fiat Only");

        const seeded = await api.post("/tenants/seed", { preset: "geist" }, bearer(a.token));
        expect(seeded.status).toBe(201);

        const saved = await api.put(
          "/tenants/payment-settings/btcpay",
          { server_url: `${btcpay.serverUrl}/`, store_id: STORE_ID, api_key: API_KEY, webhook_secret: WEBHOOK_SECRET },
          bearer(a.token),
        );
        expect(saved.status).toBe(200);
        // A new store starts switched off: no shop offers BTCPay until its owner says so.
        expect(saved.data.settings.is_enabled).toBe(false);

        const enabled = await api.put("/tenants/payment-settings/btcpay", { is_enabled: true }, bearer(a.token));
        expect(enabled.status).toBe(200);
      });

      afterAll(async () => {
        await btcpay?.close();
      });

      it("returns the saved store masked, with the webhook URL to paste into BTCPay", async () => {
        const read = await api.get("/tenants/payment-settings/btcpay", bearer(a.token));

        expect(read.status).toBe(200);
        expect(read.data).toMatchObject({
          provider: "btcpay",
          settings: {
            provider: "btcpay",
            is_enabled: true,
            server_url: btcpay.serverUrl,
            store_id: STORE_ID,
            api_key: { set: true, last4: API_KEY.slice(-4) },
            webhook_secret: { set: true, last4: WEBHOOK_SECRET.slice(-4) },
          },
          unreadable: null,
        });
        expect(read.data.webhook_url).toMatch(new RegExp(`/btcpay/webhook/${a.tenant.id}$`));
        const serialized = JSON.stringify(read.data);
        expect(serialized).not.toContain(API_KEY);
        expect(serialized).not.toContain(WEBHOOK_SECRET);

        // At rest: ciphertext only.
        const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION);
        const rows = await pg("tenant_integration_secret")
          .select("payload")
          .where({ tenant_id: a.tenant.id, provider: "btcpay" });
        expect(rows).toHaveLength(1);
        expect(rows[0].payload).not.toContain(API_KEY);
        expect(rows[0].payload).not.toContain(STORE_ID);

        // The panel's unified status names BTCPay as connected.
        const summary = await api.get("/tenants/payment-settings", bearer(a.token));
        expect(summary.data.methods).toMatchObject({ btcpay: true, demo: false });
      });

      it("keeps a stored secret a later save leaves out, and refuses an incomplete or plain-http store", async () => {
        const rotated = await api.put("/tenants/payment-settings/btcpay", { api_key: "rotated-key-9999" }, bearer(a.token));
        expect(rotated.status).toBe(200);
        expect(rotated.data.settings.api_key.last4).toBe("9999");
        expect(rotated.data.settings.webhook_secret.last4).toBe(WEBHOOK_SECRET.slice(-4));
        expect(rotated.data.settings.is_enabled).toBe(true);

        const incomplete = await failed(
          api.put(
            "/tenants/payment-settings/btcpay",
            { server_url: "https://pay.fiatonly.test", is_enabled: true },
            bearer(b.token),
          ),
        );
        expect(incomplete.status).toBe(400);
        expect(incomplete.data.message).toMatch(/store_id, api_key, webhook_secret/);

        const plainHttp = await failed(
          api.put("/tenants/payment-settings/btcpay", { server_url: "http://pay.fiatonly.test" }, bearer(b.token)),
        );
        expect(plainHttp.status).toBe(400);

        const bRead = await api.get("/tenants/payment-settings/btcpay", bearer(b.token));
        expect(bRead.data.settings).toBeNull();
      });

      it("offers BTCPay at checkout only to the shop that switched it on", async () => {
        const forA = await api.get(`/store/payment-providers?region_id=${regionId}`, withKey(a.tenant.api_key.token));
        expect(forA.data.payment_providers.map((p: { id: string }) => p.id)).toEqual([PROVIDER]);

        const forB = await api.get(`/store/payment-providers?region_id=${regionId}`, withKey(b.tenant.api_key.token));
        expect(forB.data.payment_providers.map((p: { id: string }) => p.id)).toEqual(["pp_system_default"]);
      });

      describe("payment session, webhook, sweep and completion", () => {
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

        const deliver = (tenantId: string, body: Record<string, unknown>, secret = WEBHOOK_SECRET) => {
          const raw = JSON.stringify(body);
          const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
          return failed(
            api.post(`/btcpay/webhook/${tenantId}`, raw, {
              headers: { "content-type": "application/json", "btcpay-sig": signature },
            }),
          );
        };

        // Live links only: `completeCartWorkflow` (2.19) creates the order before
        // it authorizes the payment, and when the authorization fails its
        // compensation soft-deletes the `order_cart` row instead of removing it.
        const ordersOf = async (cartId: string) => {
          const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION);
          return pg("order_cart").select("order_id").where({ cart_id: cartId }).whereNull("deleted_at");
        };

        it("refuses a BTCPay session for a shop that has none", async () => {
          const { collection, headers } = await cartFor(b);
          const response = await failed(
            api.post(`/store/payment-collections/${collection.id}/payment-sessions`, { provider_id: PROVIDER }, headers),
          );
          expect(response.status).toBe(404);
          expect(response.data.message).toMatch(/not available for this shop/);
        });

        it("creates an invoice on the shop's own store for the cart's amount and ignores forged client data", async () => {
          const { cart, session } = await openSession(a, {
            tenant_id: b.tenant.id,
            confirmed_at: "2020-01-01T00:00:00Z",
            invoice_id: "inv_forged",
            return_url: "https://satoshi.shop.test/api/payment-return?provider=btcpay",
          });

          // The database is restored before every test, so the key is the one saved in `beforeAll`.
          const created = btcpay.mock.calls.filter((call) => call.method === "POST" && call.path.endsWith("/invoices")).pop();
          expect(created).toMatchObject({
            path: `/api/v1/stores/${STORE_ID}/invoices`,
            authorization: `token ${API_KEY}`,
          });
          expect(created?.body).toMatchObject({
            currency: "EUR",
            metadata: { orderId: session.id },
            checkout: { redirectURL: "https://satoshi.shop.test/api/payment-return?provider=btcpay" },
          });
          expect(Number(session.amount)).toBeGreaterThan(0);
          expect((created?.body as { amount: string }).amount).toBe(Number(session.amount).toFixed(2));
          expect(cart.id).toBeTruthy();

          expect(session.data).toMatchObject({
            provider: "btcpay",
            tenant_id: a.tenant.id,
            store_id: STORE_ID,
            invoice_status: "New",
            confirmed_at: null,
          });
          expect(session.data.invoice_id).toMatch(/^inv_\d+$/);
          expect(session.data.checkout_link).toBe(`${btcpay.serverUrl}/i/${session.data.invoice_id}`);
          expect(JSON.stringify(session.data)).not.toContain(WEBHOOK_SECRET);
        });

        it("settles through the webhook only what the server says is Settled, once", async () => {
          const { cart, session } = await openSession(a);
          const invoiceId = session.data.invoice_id as string;
          const event = (type: string, extra: Record<string, unknown> = {}) => ({
            deliveryId: `d_${type}`,
            type,
            storeId: STORE_ID,
            invoiceId,
            ...extra,
          });

          const forged = await deliver(a.tenant.id, event("InvoiceSettled"), "not-the-secret");
          expect(forged.status).toBe(401);

          // The body says Settled; the server says Processing. Nothing is paid.
          btcpay.mock.setStatus(invoiceId, "Processing");
          const early = await deliver(a.tenant.id, event("InvoiceSettled"));
          expect(early.status).toBe(200);
          expect(early.data.status).toBe("ok");
          expect(await ordersOf(cart.id)).toHaveLength(0);

          btcpay.mock.setStatus(invoiceId, "Settled");
          const settled = await deliver(a.tenant.id, event("InvoiceSettled"));
          expect(settled.status).toBe(200);
          expect(["captured", "already_captured"]).toContain(settled.data.outcome);

          const orders = await ordersOf(cart.id);
          expect(orders).toHaveLength(1);
          const [payment] = await getContainer()
            .resolve(Modules.PAYMENT)
            .listPayments({ payment_session_id: session.id });
          expect(payment.captured_at).not.toBeNull();

          const replay = await deliver(a.tenant.id, event("InvoiceSettled", { deliveryId: "d_again", isRedelivery: true }));
          expect(replay.status).toBe(200);
          expect(replay.data.outcome).toBe("already_captured");
          expect(await ordersOf(cart.id)).toHaveLength(1);

          // Not this shop's business: answered 2xx so BTCPay stops retrying.
          const payout = await deliver(a.tenant.id, { type: "PayoutCreated", storeId: STORE_ID, deliveryId: "d_p" });
          expect(payout.status).toBe(200);
          expect(payout.data.status).toBe("ignored");
        });

        it("settles an invoice whose webhook never came: the sweep job reads it from the server", async () => {
          const { cart, session } = await openSession(a);
          btcpay.mock.setStatus(session.data.invoice_id, "Settled", "PaidOver");

          await sweepBtcpayInvoices(getContainer());

          expect(await ordersOf(cart.id)).toHaveLength(1);
          await sweepBtcpayInvoices(getContainer());
          expect(await ordersOf(cart.id)).toHaveLength(1);
        });

        it("completes the cart when the buyer is back and the invoice is Settled, and refuses while it is not", async () => {
          const { cart, session, headers } = await openSession(a);

          const tooEarly = await failed(api.post(`/store/carts/${cart.id}/complete`, {}, headers));
          expect(tooEarly.data.type ?? "error").not.toBe("order");
          expect(await ordersOf(cart.id)).toHaveLength(0);

          btcpay.mock.setStatus(session.data.invoice_id, "Settled");
          const completed = await api.post(`/store/carts/${cart.id}/complete`, {}, headers);
          expect(completed.data.type).toBe("order");
          expect(await ordersOf(cart.id)).toHaveLength(1);
        });

        it("records an expired invoice on the session as canceled", async () => {
          const { session } = await openSession(a);
          btcpay.mock.setStatus(session.data.invoice_id, "Expired");

          const expired = await deliver(a.tenant.id, {
            deliveryId: "d_exp",
            type: "InvoiceExpired",
            storeId: STORE_ID,
            invoiceId: session.data.invoice_id,
          });
          expect(expired.status).toBe(200);

          const [stored] = await getContainer()
            .resolve(Modules.PAYMENT)
            .listPaymentSessions({ id: session.id }, { select: ["id", "status", "data"] });
          expect(stored.status).toBe("canceled");
          expect(stored.data).toMatchObject({ invoice_status: "Expired" });
        });
      });
    });
  },
});
