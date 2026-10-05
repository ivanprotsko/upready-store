import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { randomBytes } from "node:crypto";
import { startFacilitatorMock } from "./x402-facilitator-mock";

jest.setTimeout(240_000);

/**
 * Seam test of x402 (t-2026-10-03-33), end to end through the app's own HTTP
 * routes, against a facilitator stand-in on a loopback port
 * (`x402-facilitator-mock.ts`). Nothing in `src` is mocked: the provider and
 * the agent route call the stand-in with their real `fetch`. No chain, no
 * wallet, no real facilitator: the "signature" is filler the stand-in accepts.
 *
 * What it proves, each with a request:
 *
 * - the owner's settings are saved switched off, with the address in EIP-55
 *   form, a test-network row marked `is_test`, and a real-money network
 *   refused while the instance does not offer it;
 * - the checkout lists x402 only for the shop that switched it on;
 * - the human path: a session asks for the cart's total in USDC, a signed
 *   payment on a second session completes the cart into one order, paid,
 *   with the transaction hash on the payment, and captured afterwards;
 * - the agent path: no payment is 402 with `PAYMENT-REQUIRED`, a parcel needs
 *   an address, a signed payment places the order with `PAYMENT-RESPONSE`,
 *   the same payment again returns the same order and creates none, and a
 *   refused payment is 402 again with its reason;
 * - with `PAYMENTS_CRYPTO_AVAILABLE` off (the RU instance) nothing of it exists.
 *
 * Runner facts as in `tenants-btcpay.spec.ts`: a throwaway database restored
 * from its post-`beforeAll` snapshot before every test, `DB_HOST` the literal
 * `localhost`.
 */
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";
const previousCryptoFlag = process.env.PAYMENTS_CRYPTO_AVAILABLE;
const previousMainnetFlag = process.env.X402_MAINNET_AVAILABLE;
process.env.PAYMENTS_CRYPTO_AVAILABLE = "true";
delete process.env.X402_MAINNET_AVAILABLE;
process.env.STORE_MEDIA_BASE_URL ||= "https://media.example.test/static/store-media";

type Registered = {
  token: string;
  tenant: { id: string; handle: string; api_key: { id: string; token: string }; sales_channel: { id: string } };
};

type Requirement = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
};

const PASSWORD = "supersecret-owner";
const PROVIDER = "pp_x402_x402";
const PAY_TO = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const PAYER = "0x857b06519E91e3A54538791bDbb0E22373e36b66";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");
const decode = (header: string) => JSON.parse(Buffer.from(header, "base64").toString("utf8"));

/** A payment as a wallet would sign it, with filler where the signature goes. */
const sign = (requirement: Requirement, resource: unknown, overrides: Record<string, string> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const nonce = `0x${randomBytes(32).toString("hex")}`;
  return {
    nonce,
    header: encode({
      x402Version: 2,
      resource,
      accepted: requirement,
      payload: {
        signature: `0x${"ab".repeat(65)}`,
        authorization: {
          from: PAYER,
          to: requirement.payTo,
          value: requirement.amount,
          validAfter: String(now - 600),
          validBefore: String(now + requirement.maxTimeoutSeconds),
          nonce,
          ...overrides,
        },
      },
    }),
  };
};

const ADDRESS = {
  first_name: "Agent",
  last_name: "Buyer",
  address_1: "1600 Pennsylvania Avenue NW",
  city: "Washington",
  postal_code: "20500",
  province: "DC",
  country_code: "us",
};

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: x402 settings, checkout and agent purchase", () => {
      let a: Registered;
      let b: Registered;
      let usRegionId: string;
      let facilitator: Awaited<ReturnType<typeof startFacilitatorMock>>;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const withKey = (key: string, extra: Record<string, string> = {}) => ({
        headers: { "x-publishable-api-key": key, ...extra },
      });
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

      const firstVariant = async (tenant: Registered) => {
        const products = await api.get(
          `/store/products?region_id=${usRegionId}&limit=1&fields=id,*variants`,
          withKey(tenant.tenant.api_key.token),
        );
        const variant = products.data.products[0]?.variants?.[0];
        expect(variant?.id).toBeTruthy();
        return variant.id as string;
      };

      const ordersOf = async (email: string) => {
        const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION);
        return pg("order").select("id").where({ email }).whereNull("deleted_at");
      };

      beforeAll(async () => {
        facilitator = await startFacilitatorMock();

        // Regions first: the shop's shipping options and prices are made in
        // every region currency that exists when the shop is seeded.
        const container = getContainer();
        const regions = container.resolve(Modules.REGION);
        const us = await regions.createRegions({ name: "United States", currency_code: "usd", countries: ["us"] });
        const de = await regions.createRegions({ name: "Germany", currency_code: "eur", countries: ["de"] });
        usRegionId = us.id;
        const { updateRegionsWorkflow } = await import("@medusajs/medusa/core-flows");
        for (const id of [us.id, de.id]) {
          await updateRegionsWorkflow(container).run({
            input: { selector: { id }, update: { payment_providers: ["pp_system_default", PROVIDER] } },
          });
        }

        a = await registerTenant("agentic", "Agentic Goods");
        b = await registerTenant("plainshop", "Plain Shop");
        const seeded = await api.post("/tenants/seed", { preset: "geist" }, bearer(a.token));
        expect(seeded.status).toBe(201);
      });

      afterAll(async () => {
        await facilitator?.close();
        if (previousCryptoFlag === undefined) delete process.env.PAYMENTS_CRYPTO_AVAILABLE;
        else process.env.PAYMENTS_CRYPTO_AVAILABLE = previousCryptoFlag;
        if (previousMainnetFlag === undefined) delete process.env.X402_MAINNET_AVAILABLE;
        else process.env.X402_MAINNET_AVAILABLE = previousMainnetFlag;
      });

      const saveSettings = async () => {
        const saved = await api.put(
          "/tenants/payment-settings/x402",
          { pay_to: PAY_TO.toLowerCase(), networks: ["eip155:84532"], facilitator_url: `${facilitator.url}/` },
          bearer(a.token),
        );
        expect(saved.status).toBe(200);
        const enabled = await api.put("/tenants/payment-settings/x402", { is_enabled: true }, bearer(a.token));
        expect(enabled.status).toBe(200);
        return enabled;
      };

      it("saves the owner's settings switched off, checksummed, as a test row, and refuses what cannot work", async () => {
        const empty = await api.get("/tenants/payment-settings/x402", bearer(a.token));
        expect(empty.data).toMatchObject({
          provider: "x402",
          available: true,
          settings: null,
          networks_offered: [{ id: "eip155:84532", label: "Base Sepolia", testnet: true }],
          default_facilitator_url: "https://x402.org/facilitator",
        });
        expect(empty.data.agent_purchase_url).toMatch(/\/store\/x402\/purchase$/);

        const incomplete = await failed(api.put("/tenants/payment-settings/x402", { is_enabled: true }, bearer(a.token)));
        expect(incomplete.status).toBe(400);
        expect(incomplete.data.message).toMatch(/pay_to, networks/);

        const mainnet = await failed(
          api.put("/tenants/payment-settings/x402", { networks: ["eip155:8453"] }, bearer(a.token)),
        );
        expect(mainnet.status).toBe(400);
        expect(mainnet.data.message).toMatch(/not offered on this instance/);

        const typo = await failed(
          api.put("/tenants/payment-settings/x402", { pay_to: `${PAY_TO.slice(0, -1)}c` }, bearer(a.token)),
        );
        expect(typo.status).toBe(400);

        const saved = await api.put(
          "/tenants/payment-settings/x402",
          { pay_to: PAY_TO.toLowerCase(), networks: ["eip155:84532"], facilitator_url: `${facilitator.url}/` },
          bearer(a.token),
        );
        expect(saved.data.settings).toMatchObject({
          is_enabled: false,
          is_test: true,
          pay_to: PAY_TO,
          networks: ["eip155:84532"],
          facilitator_url: facilitator.url,
        });

        const enabled = await api.put("/tenants/payment-settings/x402", { is_enabled: true }, bearer(a.token));
        expect(enabled.data.settings.is_enabled).toBe(true);

        const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION);
        const [row] = await pg("tenant_integration_secret")
          .select("is_test", "is_enabled", "payload")
          .where({ tenant_id: a.tenant.id, provider: "x402" });
        expect(row).toMatchObject({ is_test: true, is_enabled: true });
        expect(row.payload).not.toContain(PAY_TO);

        const summary = await api.get("/tenants/payment-settings", bearer(a.token));
        expect(summary.data.methods).toMatchObject({ x402: true, demo: false });
      });

      it("offers x402 at checkout only to the shop that switched it on", async () => {
        await saveSettings();
        const forA = await api.get(`/store/payment-providers?region_id=${usRegionId}`, withKey(a.tenant.api_key.token));
        expect(forA.data.payment_providers.map((p: { id: string }) => p.id)).toEqual([PROVIDER]);

        const forB = await api.get(`/store/payment-providers?region_id=${usRegionId}`, withKey(b.tenant.api_key.token));
        expect(forB.data.payment_providers.map((p: { id: string }) => p.id)).toEqual(["pp_system_default"]);
      });

      it("human path: a signed payment completes the cart into one paid order with the transaction on it", async () => {
        await saveSettings();
        const headers = withKey(a.tenant.api_key.token);
        const variantId = await firstVariant(a);
        const email = "wallet-buyer@agentic.test";
        const cart = (await api.post("/store/carts", { region_id: usRegionId, email, items: [{ variant_id: variantId, quantity: 1 }] }, headers))
          .data.cart;
        await api.post(`/store/carts/${cart.id}`, { shipping_address: ADDRESS, billing_address: ADDRESS }, headers);
        const options = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, headers)).data.shipping_options ?? [];
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: options[0].id }, headers);
        const collection = (await api.post("/store/payment-collections", { cart_id: cart.id }, headers)).data.payment_collection;

        // Another shop cannot open an x402 session on this cart, nor on its own.
        const foreign = await failed(
          api.post(`/store/payment-collections/${collection.id}/payment-sessions`, { provider_id: PROVIDER }, withKey(b.tenant.api_key.token)),
        );
        expect(foreign.status).toBe(404);

        const opened = await api.post(
          `/store/payment-collections/${collection.id}/payment-sessions`,
          { provider_id: PROVIDER, data: { settled_at: "forged", transaction: "0xforged" } },
          headers,
        );
        const session = opened.data.payment_collection.payment_sessions.find((s: { provider_id: string }) => s.provider_id === PROVIDER);
        expect(session.data.settled_at).toBeNull();
        expect(session.data.transaction).toBeNull();
        const required = session.data.payment_required;
        const [requirement] = required.accepts as Requirement[];
        expect(requirement).toMatchObject({ network: "eip155:84532", payTo: PAY_TO, extra: { name: "USDC", version: "2" } });
        const total = (await api.get(`/store/carts/${cart.id}?fields=total`, headers)).data.cart.total;
        expect(requirement.amount).toBe(String(Math.round(Number(total) * 1e6)));

        const { header, nonce } = sign(requirement, required.resource);
        await api.post(
          `/store/payment-collections/${collection.id}/payment-sessions`,
          { provider_id: PROVIDER, data: { payment_signature: header } },
          headers,
        );
        const completed = await api.post(`/store/carts/${cart.id}/complete`, {}, headers);
        expect(completed.data.type).toBe("order");
        expect(facilitator.mock.calls.slice(-2).map((call) => call.step)).toEqual(["verify", "settle"]);

        const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION);
        const payment = await pg("payment").select("id", "data").where({ payment_collection_id: collection.id }).first();
        expect(payment.data).toMatchObject({
          transaction: facilitator.mock.transactionFor(nonce),
          network: "eip155:84532",
          payer: PAYER.toLowerCase(),
          testnet: true,
        });
        expect(payment.data.explorer_url).toBe(`https://sepolia.basescan.org/tx/${facilitator.mock.transactionFor(nonce)}`);

        // The order.placed subscriber captures it, so payment.captured fires.
        let capturedAt: unknown = null;
        for (let attempt = 0; attempt < 40 && !capturedAt; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          capturedAt = (await pg("payment").select("captured_at").where({ id: payment.id }).first())?.captured_at;
        }
        expect(capturedAt).toBeTruthy();

        // A settled cart is never given a new session: that would delete the settlement.
        const replaced = await failed(
          api.post(`/store/payment-collections/${collection.id}/payment-sessions`, { provider_id: PROVIDER }, headers),
        );
        expect([400, 404]).toContain(replaced.status);
        expect(await ordersOf(email)).toHaveLength(1);
      });

      it("agent path: 402 with requirements, an order for a signed payment, the same order for the same payment", async () => {
        await saveSettings();
        const headers = withKey(a.tenant.api_key.token);
        const variantId = await firstVariant(a);
        const email = "agent@agentic.test";
        const body = { items: [{ variant_id: variantId, quantity: 2 }], email, shipping_address: ADDRESS };

        const noAddress = await failed(
          api.post("/store/x402/purchase", { items: body.items, email }, headers),
        );
        expect(noAddress.status).toBe(400);
        expect(noAddress.data.type).toBe("shipping_address_required");

        const quoted = await failed(api.post("/store/x402/purchase", body, headers));
        expect(quoted.status).toBe(402);
        const required = decode(quoted.headers["payment-required"]);
        expect(required).toMatchObject({ x402Version: 2, error: "PAYMENT-SIGNATURE header is required" });
        expect(required.resource.url).toMatch(/\/store\/x402\/purchase$/);
        const [requirement] = required.accepts as Requirement[];
        expect(requirement.amount).toBe(String(Math.round(Number(quoted.data.quote.total) * 1e6)));
        expect(quoted.data.quote.items[0].quantity).toBe(2);
        expect(quoted.data.quote.shipping).toHaveLength(1);

        // Asking again quotes on the same cart.
        const again = await failed(api.post("/store/x402/purchase", body, headers));
        expect(again.data.quote.cart_id).toBe(quoted.data.quote.cart_id);

        const wrong = sign({ ...requirement, amount: "1" }, required.resource);
        const refused = await failed(api.post("/store/x402/purchase", body, withKey(a.tenant.api_key.token, { "payment-signature": wrong.header })));
        expect(refused.status).toBe(402);
        expect(refused.data.error).toBe("invalid_payment_requirements");

        const { header, nonce } = sign(requirement, required.resource);
        const paid = await api.post("/store/x402/purchase", body, withKey(a.tenant.api_key.token, { "payment-signature": header }));
        expect(paid.status).toBe(200);
        expect(paid.data).toMatchObject({ type: "order", replayed: false, order: { email, currency_code: "usd" } });
        expect(paid.data.payment.transaction).toBe(facilitator.mock.transactionFor(nonce));
        expect(decode(paid.headers["payment-response"])).toEqual({
          success: true,
          transaction: facilitator.mock.transactionFor(nonce),
          network: "eip155:84532",
          payer: PAYER.toLowerCase(),
        });

        const settles = facilitator.mock.calls.filter((call) => call.step === "settle").length;
        const replay = await api.post("/store/x402/purchase", body, withKey(a.tenant.api_key.token, { "payment-signature": header }));
        expect(replay.status).toBe(200);
        expect(replay.data).toMatchObject({ replayed: true, order: { id: paid.data.order.id } });
        expect(facilitator.mock.calls.filter((call) => call.step === "settle")).toHaveLength(settles);
        expect(await ordersOf(email)).toHaveLength(1);
      });

      it("agent path: a payment the facilitator refuses is 402 again with its reason, and no order", async () => {
        await saveSettings();
        const headers = withKey(a.tenant.api_key.token);
        const email = "poor-agent@agentic.test";
        const body = { items: [{ variant_id: await firstVariant(a), quantity: 1 }], email, shipping_address: ADDRESS };
        const quoted = await failed(api.post("/store/x402/purchase", body, headers));
        const required = decode(quoted.headers["payment-required"]);

        facilitator.mock.verdict.verify = { isValid: false, invalidReason: "insufficient_funds", payer: PAYER };
        try {
          const { header } = sign(required.accepts[0], required.resource);
          const refused = await failed(api.post("/store/x402/purchase", body, withKey(a.tenant.api_key.token, { "payment-signature": header })));
          expect(refused.status).toBe(402);
          expect(refused.data.error).toBe("insufficient_funds");
          expect(decode(refused.headers["payment-response"])).toMatchObject({ success: false, errorReason: "insufficient_funds" });
        } finally {
          facilitator.mock.verdict = {};
        }
        expect(await ordersOf(email)).toHaveLength(0);
      });

      it("agent path: a region not priced in USD is refused, and a malformed payment is 400", async () => {
        await saveSettings();
        const headers = withKey(a.tenant.api_key.token);
        const body = {
          items: [{ variant_id: await firstVariant(a), quantity: 1 }],
          email: "eu-agent@agentic.test",
          shipping_address: { ...ADDRESS, country_code: "de", province: undefined },
        };
        const eur = await failed(api.post("/store/x402/purchase", body, headers));
        expect(eur.status).toBe(422);
        expect(eur.data.type).toBe("currency_not_usd");

        const garbage = await failed(
          api.post("/store/x402/purchase", { ...body, shipping_address: ADDRESS }, withKey(a.tenant.api_key.token, { "payment-signature": "bm90IGpzb24=" })),
        );
        expect(garbage.status).toBe(400);
        expect(garbage.data.type).toBe("invalid_payment");
      });

      describe("where the instance takes no cryptocurrency (PAYMENTS_CRYPTO_AVAILABLE off)", () => {
        beforeEach(() => {
          process.env.PAYMENTS_CRYPTO_AVAILABLE = "false";
        });
        afterEach(() => {
          process.env.PAYMENTS_CRYPTO_AVAILABLE = "true";
        });

        it("hides x402 from the panel, refuses a save, hides it at checkout and closes the agent route", async () => {
          const read = await api.get("/tenants/payment-settings/x402", bearer(a.token));
          expect(read.data.available).toBe(false);

          const save = await failed(api.put("/tenants/payment-settings/x402", { pay_to: PAY_TO }, bearer(a.token)));
          expect(save.status).toBe(403);

          const providers = await api.get(`/store/payment-providers?region_id=${usRegionId}`, withKey(a.tenant.api_key.token));
          expect(providers.data.payment_providers.map((p: { id: string }) => p.id)).not.toContain(PROVIDER);

          const purchase = await failed(
            api.post(
              "/store/x402/purchase",
              { items: [{ variant_id: "variant_x", quantity: 1 }], email: "x@agentic.test" },
              withKey(a.tenant.api_key.token),
            ),
          );
          expect(purchase.status).toBe(404);
        });
      });
    });
  },
});
