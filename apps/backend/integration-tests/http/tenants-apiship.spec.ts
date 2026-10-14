import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createOrdersWorkflow, createRegionsWorkflow } from "@medusajs/medusa/core-flows";
import linkOrderToTenantWorkflow from "../../src/workflows/tenant/link-order-to-tenant";
import { startApishipMock, type MockApiship } from "./apiship-mock";

// Set before the runner boots the app (same process): the provisioned methods
// are named in Russian, the status poll stays quiet, and every ApiShip call of
// the app goes to the stand-in on a port chosen before boot (`client.ts` reads
// `APISHIP_BASE_URL` once, at load).
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";
process.env.STOREFRONT_DEFAULT_LOCALE = "ru";
process.env.APISHIP_SCHEDULER = "off";
const MOCK_PORT = 18500 + (process.pid % 1000);
process.env.APISHIP_BASE_URL = `http://127.0.0.1:${MOCK_PORT}/v1`;

jest.setTimeout(240_000);

/**
 * Seam test of shipping through ApiShip (t-2026-10-14-58): the owner's
 * settings, the checkout's price and points, the shipment from the order
 * card, the label and the act, the statuses by poll and by webhook, the
 * cancel, and the walls between two shops. Every ApiShip answer comes from
 * `apiship-mock.ts`, whose shapes were measured on ApiShip's test contour.
 *
 * Runner facts as in the other specs: a throwaway database migrated from this
 * repository's config, restored from its post-`beforeAll` snapshot before
 * every test, so every `it` connects the shop it needs; `DB_HOST` must be the
 * literal `localhost`.
 */
type Registered = {
  token: string;
  tenant: { id: string; handle: string; sales_channel: { id: string }; api_key: { token: string } };
  publishableKey: string;
};

const PASSWORD = "supersecret-owner";
const TOKEN = "seam-apiship-token-aaaa1111";
const SENDER = {
  sender_name: "Иванов Иван",
  sender_company: "Черкашино",
  sender_phone: "+7 (925) 000-11-15",
  sender_email: "shop@example.com",
  sender_region: "Москва",
  sender_city: "Москва",
  sender_address: "г Москва, ул Машкова, д 21",
  sender_index: "105062",
};
const ORDER_FIELDS =
  "fields=id,display_id,status,fulfillment_status,*fulfillments,*fulfillments.labels,+fulfillments.data,+fulfillments.metadata";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: shipping through ApiShip", () => {
      let mock: MockApiship;
      let ruRegionId: string;
      let deRegionId: string;
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const storeKey = (owner: Registered) => ({ headers: { "x-publishable-api-key": owner.publishableKey } });
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
        return { token: login.data.token, tenant: created.data.tenant, publishableKey: created.data.tenant.api_key.token };
      };

      const createVariant = async (owner: Registered, title: string, weight: number | null, price: number) => {
        const created = await api.post(
          "/tenants/products",
          {
            title,
            status: "published",
            options: [{ title: "Size", values: ["One"] }],
            variants: [
              {
                title,
                ...(weight === null ? {} : { weight }),
                prices: [
                  { currency_code: "rub", amount: price },
                  { currency_code: "eur", amount: price },
                ],
                manage_inventory: false,
                options: { Size: "One" },
              },
            ],
          },
          bearer(owner.token),
        );
        expect(created.status).toBe(201);
        return created.data.product.variants[0].id as string;
      };

      const cartWith = async (owner: Registered, regionId: string, variantId: string, address: Record<string, string>) => {
        const created = await api.post("/store/carts", { region_id: regionId, email: "buyer@example.com" }, storeKey(owner));
        expect(created.status).toBe(200);
        const cartId = created.data.cart.id as string;
        const added = await api.post(`/store/carts/${cartId}/line-items`, { variant_id: variantId, quantity: 1 }, storeKey(owner));
        expect(added.status).toBe(200);
        const addressed = await api.post(
          `/store/carts/${cartId}`,
          {
            shipping_address: {
              first_name: "Пётр",
              last_name: "Петров",
              phone: "8 (921) 123-45-67",
              address_1: "Невский пр-кт, 1",
              ...address,
            },
          },
          storeKey(owner),
        );
        expect(addressed.status).toBe(200);
        return cartId;
      };

      const spb = { city: "Санкт-Петербург", province: "г Санкт-Петербург", postal_code: "191186", country_code: "ru" };

      const optionsFor = async (owner: Registered, cartId: string) => {
        const res = await api.get(`/store/shipping-options?cart_id=${cartId}&fields=%2Bdata,%2Bprovider_id`, storeKey(owner));
        expect(res.status).toBe(200);
        return res.data.shipping_options as Array<{ id: string; name: string; provider_id: string; amount?: number; data?: Record<string, unknown> }>;
      };

      /**
       * The cart's methods WITH their `data`: the store cart answer selects
       * neither `data` nor `name` of a shipping method unless asked, the way
       * the storefront asks (`lib/data/cart.ts`, `+shipping_methods.data`).
       */
      const cartMethods = async (owner: Registered, cartId: string) => {
        const res = await api.get(`/store/carts/${cartId}?fields=%2Bshipping_methods.data,%2Bshipping_methods.name`, storeKey(owner));
        expect(res.status).toBe(200);
        return res.data.cart.shipping_methods as Array<{ id: string; shipping_option_id: string; name: string; amount: number; data: Record<string, unknown> }>;
      };

      const connect = (owner: Registered, extra: Record<string, unknown> = {}) =>
        api.put("/tenants/apiship", { token: TOKEN, ...SENDER, ...extra }, bearer(owner.token));

      /** A cart priced through ApiShip, its СДЭК point chosen, turned into a placed order of the shop. */
      const placeApishipOrder = async (owner: Registered) => {
        const variantId = await createVariant(owner, "Плед", 700, 2500);
        const cartId = await cartWith(owner, ruRegionId, variantId, spb);
        const pickup = (await optionsFor(owner, cartId)).find((option) => option.name === "СДЭК — пункт выдачи");
        expect(pickup).toBeTruthy();
        const withMethod = await api.post(
          `/store/carts/${cartId}/shipping-methods`,
          { option_id: pickup!.id, data: { apiship_point_id: 491 } },
          storeKey(owner),
        );
        expect(withMethod.status).toBe(200);
        const method = (await cartMethods(owner, cartId))[0];
        expect(method.data).toMatchObject({ provider: "apiship", apiship_point_id: 491 });

        const container = getContainer();
        const { result: order } = await createOrdersWorkflow(container).run({
          input: {
            region_id: ruRegionId,
            currency_code: "rub",
            email: "buyer@example.com",
            sales_channel_id: owner.tenant.sales_channel.id,
            items: [{ title: "Плед", variant_id: variantId, quantity: 1, unit_price: 2500 }],
            shipping_address: {
              first_name: "Пётр",
              last_name: "Петров",
              phone: "8 (921) 123-45-67",
              address_1: "Невский пр-кт, 1",
              city: spb.city,
              province: spb.province,
              postal_code: spb.postal_code,
              country_code: "ru",
            },
            shipping_methods: [
              { shipping_option_id: pickup!.id, name: pickup!.name, amount: method.amount, data: method.data },
            ],
          },
        });
        await linkOrderToTenantWorkflow(container).run({ input: { order_id: order.id } });
        return { order, itemId: order.items![0].id as string };
      };

      const fulfil = async (owner: Registered, orderId: string, itemId: string) => {
        const fulfilled = await api.post(
          `/tenants/orders/${orderId}/fulfillments`,
          { items: [{ id: itemId, quantity: 1 }] },
          bearer(owner.token),
        );
        expect(fulfilled.status).toBe(200);
        const read = await api.get(`/tenants/orders/${orderId}?${ORDER_FIELDS}`, bearer(owner.token));
        expect(read.status).toBe(200);
        return read.data.order;
      };

      const readOrder = async (owner: Registered, orderId: string) =>
        (await api.get(`/tenants/orders/${orderId}?${ORDER_FIELDS}`, bearer(owner.token))).data.order;

      beforeAll(async () => {
        mock = await startApishipMock({ token: TOKEN, port: MOCK_PORT });
        const container = getContainer();
        const { result: regions } = await createRegionsWorkflow(container).run({
          input: {
            regions: [
              { name: "Russia", currency_code: "rub", countries: ["ru"] },
              { name: "Germany", currency_code: "eur", countries: ["de"] },
            ],
          },
        });
        ruRegionId = regions.find((region) => region.name === "Russia")!.id;
        deRegionId = regions.find((region) => region.name === "Germany")!.id;
        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      afterAll(async () => {
        await mock.close();
      });

      it("refuses a token ApiShip rejects and stores nothing", async () => {
        const refused = await failed(api.put("/tenants/apiship", { token: "wrong-token", ...SENDER }, bearer(a.token)));
        expect(refused.status).toBe(400);
        expect(refused.data.message).toContain("не принял токен");

        const read = await api.get("/tenants/apiship", bearer(a.token));
        expect(read.status).toBe(200);
        expect(read.data.settings).toBeNull();
        expect(read.data.carriers).toEqual([]);
      });

      it("stores the token masked, learns the cabinet's carriers, provisions four methods and registers the webhooks", async () => {
        const saved = await connect(a);
        expect(saved.status).toBe(200);
        expect(saved.data.settings.token).toEqual({ set: true, last4: TOKEN.slice(-4) });
        expect(saved.data.settings.sender_name).toBe("Иванов Иван");
        expect(saved.data.settings.sender_mode).toBe("courier");
        expect(saved.data.missing).toEqual([]);
        expect(saved.data.verified).toEqual({ connections: 2, carriers_connected: ["cdek", "rupost"], carriers_skipped: [] });
        expect(saved.data.webhook).toEqual({ registered: true, error: null });
        expect(saved.data.webhook_url).toContain("/apiship/webhook?tenant=");
        expect(JSON.stringify(saved.data)).not.toContain(TOKEN);

        const carriers = [...saved.data.carriers].sort((x: { provider_key: string }, y: { provider_key: string }) =>
          x.provider_key.localeCompare(y.provider_key),
        );
        expect(carriers.map((carrier: { provider_key: string; label: string }) => [carrier.provider_key, carrier.label])).toEqual([
          ["cdek", "СДЭК"],
          ["rupost", "Почта России"],
        ]);
        for (const carrier of carriers) {
          expect([...carrier.kinds].sort()).toEqual(["courier", "pickup"]);
          expect(carrier.methods).toHaveLength(2);
          expect(carrier.methods.every((method: { enabled: boolean }) => method.enabled)).toBe(true);
        }
        // The cabinet has one connection per carrier, so it is pinned without the owner naming it.
        expect(carriers[0].connection_id).toBe("1700");

        expect(mock.webhooks.map((hook) => hook.type).sort()).toEqual(["ORDER_NUMBER_UPDATE", "ORDER_STATUS"]);
        expect(mock.webhooks.every((hook) => hook.url === saved.data.webhook_url)).toBe(true);

        // The old token-only route still works and keeps the sender it does not know about.
        const keyOnly = await api.put("/tenants/apiship/key", { token: `${TOKEN}-rotated` }, bearer(a.token));
        expect(keyOnly.status).toBe(200);
        expect(keyOnly.data.settings.token.last4).toBe("ated");
        const after = await api.get("/tenants/apiship", bearer(a.token));
        expect(after.data.settings.sender_name).toBe("Иванов Иван");
        expect(after.data.settings.sender_address).toBe("г Москва, ул Машкова, д 21");
      });

      it("refuses a carrier the cabinet has not connected, naming what to do", async () => {
        const refused = await failed(
          connect(a, { carriers: [{ provider_key: "boxberry", kinds: ["pickup"] }] }),
        );
        expect(refused.status).toBe(400);
        expect(refused.data.message).toContain("Boxberry");
        expect(refused.data.message).toContain("не подключён в кабинете ApiShip");
      });

      it("prices the four cards from the calculator at the checkout and drops them for an address ApiShip does not serve", async () => {
        expect((await connect(a, { markup_amount: 30 })).status).toBe(200);
        const variantId = await createVariant(a, "Плед", 700, 2500);

        const cart = await cartWith(a, ruRegionId, variantId, spb);
        const options = await optionsFor(a, cart);
        const byName = Object.fromEntries(options.map((option) => [option.name, option]));
        expect(byName["СДЭК — курьером до двери"]).toMatchObject({ provider_id: "apiship_apiship" });
        expect(byName["СДЭК — пункт выдачи"]).toBeTruthy();
        expect(byName["Почта России — курьером до двери"]).toBeTruthy();
        expect(byName["Почта России — до отделения"]).toBeTruthy();

        // 420 from the calculator for a parcel under a kilo, plus the shop's 30.
        const calculated = await api.post(
          `/store/shipping-options/${byName["СДЭК — курьером до двери"].id}/calculate`,
          { cart_id: cart },
          storeKey(a),
        );
        expect(calculated.status).toBe(200);
        expect(calculated.data.shipping_option.amount).toBe(450);

        const pochta = await api.post(
          `/store/shipping-options/${byName["Почта России — до отделения"].id}/calculate`,
          { cart_id: cart },
          storeKey(a),
        );
        expect(pochta.data.shipping_option.amount).toBe(380);

        // The option sits on the warehouse's base zone, so it is LISTED for a
        // German address; the price is what says no, the way the direct СДЭК
        // option behaves, and the storefront drops a card it cannot price.
        const de = await cartWith(a, deRegionId, variantId, { city: "Berlin", postal_code: "10115", country_code: "de" });
        const deCourier = (await optionsFor(a, de)).find((option) => option.name === "СДЭК — курьером до двери");
        expect(deCourier).toBeTruthy();
        const refused = await failed(api.post(`/store/shipping-options/${deCourier!.id}/calculate`, { cart_id: de }, storeKey(a)));
        expect(refused.status).toBe(400);
        expect(refused.data.message).toContain("не возит по этому адресу");
      });

      it("lists a carrier's points of a city and records the chosen point on the cart's method", async () => {
        expect((await connect(a)).status).toBe(200);
        const points = await api.get("/store/apiship/points?provider_key=cdek&city=Санкт-Петербург", storeKey(a));
        expect(points.status).toBe(200);
        expect(points.data.configured).toBe(true);
        expect(points.data.points.map((point: { id: number; code: string }) => [point.id, point.code])).toEqual([
          [491, "SPB3"],
          [2358, "SPB9"],
        ]);
        expect(points.data.points[0]).toMatchObject({ lat: 60.008152, lng: 30.29509, weight_max: 30000, type: 1 });

        const nothing = await api.get("/store/apiship/points?provider_key=cdek&city=Тверь", storeKey(a));
        expect(nothing.data.points).toEqual([]);

        const variantId = await createVariant(a, "Плед", 700, 2500);
        const cart = await cartWith(a, ruRegionId, variantId, spb);
        const pickup = (await optionsFor(a, cart)).find((option) => option.name === "СДЭК — пункт выдачи")!;

        const withoutPoint = await failed(api.post(`/store/carts/${cart}/shipping-methods`, { option_id: pickup.id }, storeKey(a)));
        expect(withoutPoint.status).toBe(400);
        expect(withoutPoint.data.message).toBe("Выберите пункт выдачи");

        const gone = await failed(
          api.post(`/store/carts/${cart}/shipping-methods`, { option_id: pickup.id, data: { apiship_point_id: 999 } }, storeKey(a)),
        );
        expect(gone.status).toBe(400);
        expect(gone.data.message).toContain("больше не принимает");

        const chosen = await api.post(
          `/store/carts/${cart}/shipping-methods`,
          { option_id: pickup.id, data: { apiship_point_id: 491 } },
          storeKey(a),
        );
        expect(chosen.status).toBe(200);
        const methods = await cartMethods(a, cart);
        expect(methods[0].data).toMatchObject({
          provider: "apiship",
          provider_key: "cdek",
          kind: "pickup",
          apiship_connection_id: "1700",
          apiship_point_id: 491,
          apiship_point_code: "SPB3",
          tariff_id: 55,
          tariff_name: "Посылка дверь-склад",
          carrier_amount: 250,
          term_label: "2-4 дня",
        });
        expect(methods[0].amount).toBe(250);
      });

      it("creates the ApiShip order from the order card; the number, the label, the act, the statuses and the letter's data follow", async () => {
        expect((await connect(a)).status).toBe(200);
        const { order, itemId } = await placeApishipOrder(a);

        const fulfilled = await fulfil(a, order.id, itemId);
        expect(fulfilled.fulfillment_status).toBe("fulfilled");
        const fulfillment = fulfilled.fulfillments[0];
        const apishipOrderId = fulfillment.data.apiship_order_id as number;
        expect(apishipOrderId).toBeGreaterThan(0);
        expect(fulfillment.data).toMatchObject({
          provider: "apiship",
          provider_key: "cdek",
          kind: "pickup",
          apiship_point_id: 491,
          apiship_status: "uploading",
          apiship_provider_number: null,
        });
        expect(fulfillment.labels).toEqual([]);

        // What ApiShip received: the shop's sender, the buyer's phone as digits, the point, the goods.
        const sent = mock.orders.get(apishipOrderId)!.request as any;
        expect(sent.order).toMatchObject({
          clientNumber: String(order.display_id),
          providerKey: "cdek",
          providerConnectId: "1700",
          pickupType: 1,
          deliveryType: 2,
          tariffId: 55,
          pointOutId: 491,
          weight: 700,
        });
        expect(sent.sender).toMatchObject({ contactName: "Иванов Иван", phone: "79250001115", addressString: "г Москва, ул Машкова, д 21" });
        expect(sent.recipient).toMatchObject({ contactName: "Пётр Петров", phone: "79211234567", addressString: "197341, Санкт-Петербург, пр-т Коломяжский, 28, корп.2" });
        expect(sent.cost).toEqual({ assessedCost: 2500, codCost: 0, deliveryCost: 250, isDeliveryPayedByRecipient: false });
        expect(sent.places[0].items).toEqual([{ description: "Плед", quantity: 1, articul: expect.any(String), assessedCost: 2500, cost: 0, weight: 700 }]);

        // No label while the carrier has not accepted the order: the answer says so per order.
        const early = await api.post("/tenants/apiship/documents", { kind: "labels", order_ids: [order.id] }, bearer(a.token));
        expect(early.status).toBe(200);
        expect(early.data.files).toEqual([]);
        expect(early.data.failed).toEqual([
          { order_id: order.id, display_id: String(order.display_id), fulfillment_id: fulfillment.id, apiship_order_id: apishipOrderId, message: "Заказ не был передан в СД" },
        ]);

        // The carrier accepts: the number becomes a label and the carrier's name the metadata the letter reads.
        mock.advance(apishipOrderId, { status: "uploaded", providerNumber: "1110019183" });
        const synced = await api.post("/tenants/apiship/status-sync", { order_ids: [order.id] }, bearer(a.token));
        expect(synced.status).toBe(200);
        expect(synced.data).toMatchObject({ checked: 1, updated: 1, shipped: 0, delivered: 0, failed: 0 });
        let read = await readOrder(a, order.id);
        expect(read.fulfillments[0].data.apiship_status).toBe("uploaded");
        expect(read.fulfillments[0].data.apiship_provider_number).toBe("1110019183");
        expect(read.fulfillments[0].labels).toHaveLength(1);
        expect(read.fulfillments[0].labels[0]).toMatchObject({ tracking_number: "1110019183", tracking_url: "https://www.cdek.ru/ru/tracking/?order_id=1110019183" });
        expect(read.fulfillments[0].metadata.carrier).toBe("СДЭК");
        expect(read.fulfillments[0].shipped_at).toBeNull();
        expect(read.fulfillment_status).toBe("fulfilled");

        // The same answer twice changes nothing.
        const again = await api.post("/tenants/apiship/status-sync", { order_ids: [order.id] }, bearer(a.token));
        expect(again.data).toMatchObject({ checked: 1, updated: 0 });

        // The label and the act, as files, through this backend.
        const labels = await api.post("/tenants/apiship/documents", { kind: "labels", order_ids: [order.id] }, bearer(a.token));
        expect(labels.data.failed).toEqual([]);
        expect(labels.data.files).toHaveLength(1);
        expect(labels.data.files[0]).toMatchObject({ label: "Наклейки", order_ids: [order.id], display_ids: [String(order.display_id)] });
        expect(labels.data.files[0].url).toContain("/storage/file/get?file=labels_");
        const pdf = await api.get(labels.data.files[0].download, { ...bearer(a.token), responseType: "arraybuffer" });
        expect(pdf.status).toBe(200);
        expect(String(pdf.headers["content-type"])).toContain("application/pdf");
        expect(Buffer.from(pdf.data).subarray(0, 5).toString("latin1")).toBe("%PDF-");

        const acts = await api.post("/tenants/apiship/documents", { kind: "waybills", order_ids: [order.id] }, bearer(a.token));
        expect(acts.data.files).toHaveLength(1);
        expect(acts.data.files[0]).toMatchObject({ provider_key: "cdek", label: "Акт приёма-передачи — СДЭК", order_ids: [order.id] });

        // The webhook: «в пути» marks the shipment shipped through the same workflow the panel uses.
        const settings = await api.get("/tenants/apiship", bearer(a.token));
        const hook = new URL(settings.data.webhook_url);
        const shippedHook = await api.post(`${hook.pathname}${hook.search}`, {
          orderInfo: { orderId: String(apishipOrderId), providerKey: "cdek", providerNumber: "1110019183", clientNumber: String(order.display_id) },
          status: { key: "onWay", name: "В пути", created: "2026-10-14T09:00:00+03:00" },
        });
        expect(shippedHook.status).toBe(200);
        read = await readOrder(a, order.id);
        expect(read.fulfillment_status).toBe("shipped");
        expect(read.fulfillments[0].shipped_at).toBeTruthy();
        expect(read.fulfillments[0].data.apiship_status).toBe("onWay");
        expect(read.fulfillments[0].labels).toHaveLength(1);
        expect(read.fulfillments[0].labels[0].tracking_number).toBe("1110019183");

        const deliveredHook = await api.post(`${hook.pathname}${hook.search}`, {
          orderInfo: { orderId: String(apishipOrderId), providerKey: "cdek", providerNumber: "1110019183" },
          status: { key: "delivered", name: "Вручён", created: "2026-10-14T12:00:00+03:00" },
        });
        expect(deliveredHook.status).toBe(200);
        read = await readOrder(a, order.id);
        expect(read.fulfillment_status).toBe("delivered");
        expect(read.fulfillments[0].delivered_at).toBeTruthy();

        // A callback with the wrong token is swallowed, never applied.
        const forged = await api.post(`${hook.pathname}?tenant=${encodeURIComponent(a.tenant.id)}&token=forged`, {
          orderInfo: { orderId: String(apishipOrderId) },
          status: { key: "lost", name: "Утерян", created: "2026-10-14T13:00:00+03:00" },
        });
        expect(forged.status).toBe(200);
        read = await readOrder(a, order.id);
        expect(read.fulfillments[0].data.apiship_status).toBe("delivered");
      });

      it("cancels the shipment in ApiShip when the owner cancels the fulfillment", async () => {
        expect((await connect(a)).status).toBe(200);
        const { order, itemId } = await placeApishipOrder(a);
        const fulfilled = await fulfil(a, order.id, itemId);
        const fulfillment = fulfilled.fulfillments[0];
        const apishipOrderId = fulfillment.data.apiship_order_id as number;

        const canceled = await api.post(`/tenants/orders/${order.id}/fulfillments/${fulfillment.id}/cancel`, {}, bearer(a.token));
        expect(canceled.status).toBe(200);
        expect(mock.orders.get(apishipOrderId)!.canceled).toBe(true);
        const read = await readOrder(a, order.id);
        expect(read.fulfillments[0].canceled_at).toBeTruthy();
        expect(read.fulfillments[0].data.apiship_cancelled_at).toBeTruthy();
      });

      it("refuses the owner's click, not the buyer's, when the shop's sender is incomplete", async () => {
        // An empty string clears the field (the validator trims, the reader turns "" into null).
        expect((await connect(a, { sender_phone: "" })).status).toBe(200);
        const read = await api.get("/tenants/apiship", bearer(a.token));
        expect(read.data.missing).toEqual(["sender_phone"]);

        const { order, itemId } = await placeApishipOrder(a);
        const refused = await failed(
          api.post(`/tenants/orders/${order.id}/fulfillments`, { items: [{ id: itemId, quantity: 1 }] }, bearer(a.token)),
        );
        expect(refused.status).toBe(400);
        expect(refused.data.message).toContain("телефон отправителя");
      });

      it("answers the probe with the cabinet's carriers and the fixed-route calculator", async () => {
        expect((await connect(a)).status).toBe(200);
        const probe = await api.get("/tenants/apiship/probe?calculator=1", bearer(a.token));
        expect(probe.status).toBe(200);
        expect(probe.data.token_set).toBe(true);
        expect(probe.data.probe).toMatchObject({ ok: true, status: 200, connections: 2 });
        expect(probe.data.providers_connected).toEqual(["cdek", "rupost"]);
        expect(probe.data.connections[0]).toMatchObject({ id: "1700", provider_key: "cdek", label: "СДЭК", test: true });
        const cdek = probe.data.calculator.results.find((entry: { provider_key: string }) => entry.provider_key === "cdek");
        expect(cdek.door).toEqual({ tariffs: 1, cheapest: { tariff_id: 56, name: "Посылка дверь-дверь", cost: 430, days_min: 2, days_max: 4 } });
        expect(cdek.point.tariffs).toBe(1);
        expect(JSON.stringify(probe.data)).not.toContain(TOKEN);
      });

      it("keeps one shop's ApiShip invisible and its orders unreachable to another", async () => {
        expect((await connect(a)).status).toBe(200);
        const { order, itemId } = await placeApishipOrder(a);
        await fulfil(a, order.id, itemId);

        const readB = await api.get("/tenants/apiship", bearer(b.token));
        expect(readB.data.settings).toBeNull();
        const probeB = await api.get("/tenants/apiship/probe", bearer(b.token));
        expect(probeB.data.token_set).toBe(false);

        const documentsB = await failed(api.post("/tenants/apiship/documents", { kind: "labels", order_ids: [order.id] }, bearer(b.token)));
        expect(documentsB.status).toBe(404);
        const syncB = await failed(api.post("/tenants/apiship/status-sync", { order_ids: [order.id] }, bearer(b.token)));
        expect(syncB.status).toBe(404);

        const pointsB = await api.get("/store/apiship/points?provider_key=cdek&city=Санкт-Петербург", storeKey(b));
        expect(pointsB.data).toMatchObject({ configured: false, points: [] });
      });

      it("forgets the connection on DELETE and switches the methods off, keeping them for carts that chose them", async () => {
        expect((await connect(a)).status).toBe(200);
        const removed = await api.delete("/tenants/apiship", bearer(a.token));
        expect(removed.status).toBe(200);
        expect(removed.data.deleted).toBe(true);
        expect(removed.data.settings).toBeNull();
        expect(removed.data.carriers.every((carrier: { kinds: string[] }) => carrier.kinds.length === 0)).toBe(true);

        const variantId = await createVariant(a, "Плед", 700, 2500);
        const cart = await cartWith(a, ruRegionId, variantId, spb);
        const names = (await optionsFor(a, cart)).map((option) => option.name);
        expect(names.some((name) => name.startsWith("СДЭК") || name.startsWith("Почта России"))).toBe(false);
      });
    });
  },
});
