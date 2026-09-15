import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows";

// Set before the runner boots the app (same process): the two provisioned
// defaults are named in the store's default locale.
process.env.STOREFRONT_DEFAULT_LOCALE = "ru";

jest.setTimeout(240_000);

/**
 * Seam test of a tenant's own delivery methods (t04-shipping-tariffs):
 * `/tenants/shipping-methods/**` on the panel side, the tariff fulfillment
 * provider and `/store/shipping-methods/quote` on the checkout side. The
 * numbers below are the acceptance arithmetic: a cart of 2 × 700 g + 1 × 1000 g
 * = 2.4 kg on a «150 + 180 ₽/kg» tariff costs 582 ₽, and the SAME number must
 * come out of the quote route, Medusa's own calculate route and the cart's
 * shipping method, because all three run `quoteTariff`.
 *
 * Runner facts as in tenants.spec.ts: live Postgres at `DB_HOST=localhost`,
 * the database restored before every test, so every `it` builds what it reads.
 */
type Registered = {
  token: string;
  tenant: { id: string; handle: string; api_key: { token: string } };
  publishableKey: string;
};

const PASSWORD = "supersecret";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: shipping methods and tariffs", () => {
      let ruRegionId: string;
      let deRegionId: string;
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const storeKey = (owner: Registered) => ({
        headers: { "x-publishable-api-key": owner.publishableKey },
      });

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", {
          email,
          password: PASSWORD,
        });
        expect(registration.status).toBe(200);
        const created = await api.post(
          "/tenants",
          { name, handle, admin: { email, first_name: name } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);
        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        expect(login.status).toBe(200);
        return {
          token: login.data.token,
          tenant: created.data.tenant,
          publishableKey: created.data.tenant.api_key.token,
        };
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

      const cartWith = async (
        owner: Registered,
        regionId: string,
        lines: { variant_id: string; quantity: number }[],
        address: Record<string, string>,
      ) => {
        const created = await api.post(
          "/store/carts",
          { region_id: regionId, email: "buyer@example.com" },
          storeKey(owner),
        );
        expect(created.status).toBe(200);
        const cartId = created.data.cart.id as string;
        for (const line of lines) {
          const added = await api.post(`/store/carts/${cartId}/line-items`, line, storeKey(owner));
          expect(added.status).toBe(200);
        }
        const addressed = await api.post(
          `/store/carts/${cartId}`,
          { shipping_address: { first_name: "Анна", last_name: "Иванова", address_1: "ул. Ленина 1", ...address } },
          storeKey(owner),
        );
        expect(addressed.status).toBe(200);
        return cartId;
      };

      const optionsFor = async (owner: Registered, cartId: string) => {
        const res = await api.get(`/store/shipping-options?cart_id=${cartId}&fields=%2Bdata,%2Bprovider_id`, storeKey(owner));
        expect(res.status).toBe(200);
        return res.data.shipping_options as { id: string; name: string; price_type: string; provider_id: string; amount?: number }[];
      };

      const perKgTariff = { kind: "per_kg", base_amount: 150, per_kg_amount: 180 };

      beforeAll(async () => {
        const container = getContainer();
        const { result: regions } = await createRegionsWorkflow(container).run({
          input: {
            regions: [
              { name: "Russia", currency_code: "rub", countries: ["ru"] },
              { name: "Germany", currency_code: "eur", countries: ["de"] },
            ],
          },
        });
        ruRegionId = regions.find((r) => r.name === "Russia")!.id;
        deRegionId = regions.find((r) => r.name === "Germany")!.id;
        a = await registerTenant("shopa", "Магазин А");
        b = await registerTenant("shopb", "Магазин Б");
      });

      it("names a new tenant's two default methods in the store locale, in the base zone", async () => {
        const res = await api.get("/tenants/shipping-methods", bearer(a.token));
        expect(res.status).toBe(200);
        expect(res.data.methods.map((m: { name: string }) => m.name)).toEqual(["Самовывоз", "Курьером"]);
        expect(res.data.methods.every((m: { zone: unknown }) => m.zone === null)).toBe(true);
        expect(res.data.settings).toEqual({ default_weight_g: 500, currency_code: "rub" });

        // The same two names reach the customer through the Store API.
        const v = await createVariant(a, "Плед", 700, 1000);
        const cart = await cartWith(a, ruRegionId, [{ variant_id: v, quantity: 1 }], { city: "Москва", province: "г Москва", postal_code: "101000", country_code: "ru" });
        const names = (await optionsFor(a, cart)).map((o) => o.name).sort();
        expect(names).toEqual(["Курьером", "Самовывоз"]);
      });

      it("prices a per-kg method identically in the quote route, Medusa's calculate and the cart", async () => {
        const created = await api.post(
          "/tenants/shipping-methods",
          {
            name: "Почтой России, 1–2 кг",
            description: "Отправляем в течение двух дней",
            delivery_hint: "5–10 дней",
            enabled: true,
            zone: { country_code: "ru", provinces: [] },
            tariff: perKgTariff,
          },
          bearer(a.token),
        );
        expect(created.status).toBe(201);
        const method = created.data.method;
        expect(method.price_type).toBe("calculated");
        expect(method.provider_id).toBe("tariff_tariff");
        expect(method.own_zone).toBe(true);

        const v700 = await createVariant(a, "Плед", 700, 1000);
        const v1000 = await createVariant(a, "Подушка", 1000, 500);
        const cart = await cartWith(
          a,
          ruRegionId,
          [{ variant_id: v700, quantity: 2 }, { variant_id: v1000, quantity: 1 }],
          { city: "Москва", province: "г Москва", postal_code: "101000", country_code: "ru" },
        );

        const listed = (await optionsFor(a, cart)).find((o) => o.id === method.id);
        expect(listed?.name).toBe("Почтой России, 1–2 кг");

        const quote = await api.post(
          "/store/shipping-methods/quote",
          { cart_id: cart, shipping_option_id: method.id },
          storeKey(a),
        );
        expect(quote.status).toBe(200);
        expect(quote.data.quote).toMatchObject({
          amount: 582,
          weight_g: 2400,
          item_total: 2500,
          used_default_weight: false,
          explanation: "2,4 кг × 180 ₽ + 150 ₽",
        });

        const calculated = await api.post(
          `/store/shipping-options/${method.id}/calculate`,
          { cart_id: cart },
          storeKey(a),
        );
        expect(calculated.status).toBe(200);
        expect(calculated.data.shipping_option.amount).toBe(582);

        const withMethod = await api.post(
          `/store/carts/${cart}/shipping-methods`,
          { option_id: method.id },
          storeKey(a),
        );
        expect(withMethod.status).toBe(200);
        expect(withMethod.data.cart.shipping_methods[0].amount).toBe(582);
        expect(withMethod.data.cart.shipping_total).toBe(582);
      });

      it("hides a Russia-only method from a German address and a Moscow-only method from St Petersburg", async () => {
        const created = await api.post(
          "/tenants/shipping-methods",
          { name: "Почтой России", zone: { country_code: "ru", provinces: [] }, tariff: perKgTariff },
          bearer(a.token),
        );
        expect(created.status).toBe(201);
        const id = created.data.method.id as string;
        const v = await createVariant(a, "Плед", 700, 1000);

        const de = await cartWith(a, deRegionId, [{ variant_id: v, quantity: 1 }], { city: "Berlin", postal_code: "10115", country_code: "de" });
        expect((await optionsFor(a, de)).some((o) => o.id === id)).toBe(false);

        const restricted = await api.post(
          `/tenants/shipping-methods/${id}`,
          { zone: { country_code: "ru", provinces: ["г Москва", "Московская обл"] } },
          bearer(a.token),
        );
        expect(restricted.status).toBe(200);
        expect(restricted.data.method.zone.provinces).toEqual(["г Москва", "Московская обл"]);

        const msk = await cartWith(a, ruRegionId, [{ variant_id: v, quantity: 1 }], { city: "Москва", province: "г Москва", postal_code: "101000", country_code: "ru" });
        const spb = await cartWith(a, ruRegionId, [{ variant_id: v, quantity: 1 }], { city: "Санкт-Петербург", province: "г Санкт-Петербург", postal_code: "190000", country_code: "ru" });
        expect((await optionsFor(a, msk)).some((o) => o.id === id)).toBe(true);
        expect((await optionsFor(a, spb)).some((o) => o.id === id)).toBe(false);
      });

      it("falls back to the tenant default weight for a weightless variant and follows the setting", async () => {
        const created = await api.post(
          "/tenants/shipping-methods",
          { name: "По весу", zone: null, tariff: { kind: "per_kg", base_amount: 0, per_kg_amount: 100 } },
          bearer(a.token),
        );
        expect(created.status).toBe(201);
        const id = created.data.method.id as string;
        const weightless = await createVariant(a, "Без веса", null, 100);
        const cart = await cartWith(a, ruRegionId, [{ variant_id: weightless, quantity: 2 }], { city: "Москва", province: "г Москва", postal_code: "101000", country_code: "ru" });

        const before = await api.post("/store/shipping-methods/quote", { cart_id: cart, shipping_option_id: id }, storeKey(a));
        expect(before.data.quote).toMatchObject({ weight_g: 1000, amount: 100, used_default_weight: true });

        const settings = await api.post("/tenants/shipping-methods/settings", { default_weight_g: 250 }, bearer(a.token));
        expect(settings.status).toBe(200);
        expect(settings.data.settings.default_weight_g).toBe(250);

        const after = await api.post("/store/shipping-methods/quote", { cart_id: cart, shipping_option_id: id }, storeKey(a));
        expect(after.data.quote).toMatchObject({ weight_g: 500, amount: 50, used_default_weight: true });
        const calculated = await api.post(`/store/shipping-options/${id}/calculate`, { cart_id: cart }, storeKey(a));
        expect(calculated.data.shipping_option.amount).toBe(50);
      });

      it("prices free-above and flat tariffs, disables a method out of the checkout, and reorders", async () => {
        const free = await api.post(
          "/tenants/shipping-methods",
          { name: "Курьером, бесплатно от 5000", zone: null, tariff: { kind: "free_above", amount: 400, free_above_total: 5000 } },
          bearer(a.token),
        );
        expect(free.status).toBe(201);
        const flat = await api.post(
          "/tenants/shipping-methods",
          { name: "Фикс 300", zone: null, tariff: { kind: "flat", amount: 300 } },
          bearer(a.token),
        );
        expect(flat.status).toBe(201);
        expect(flat.data.method.price_type).toBe("flat");

        const v = await createVariant(a, "Плед", 700, 2500);
        const small = await cartWith(a, ruRegionId, [{ variant_id: v, quantity: 1 }], { city: "Москва", postal_code: "101000", country_code: "ru" });
        const big = await cartWith(a, ruRegionId, [{ variant_id: v, quantity: 2 }], { city: "Москва", postal_code: "101000", country_code: "ru" });

        const paid = await api.post("/store/shipping-methods/quote", { cart_id: small, shipping_option_id: free.data.method.id }, storeKey(a));
        expect(paid.data.quote).toMatchObject({ amount: 400, item_total: 2500, explanation: "Бесплатно при заказе от 5 000 ₽" });
        const gratis = await api.post("/store/shipping-methods/quote", { cart_id: big, shipping_option_id: free.data.method.id }, storeKey(a));
        expect(gratis.data.quote).toMatchObject({ amount: 0, item_total: 5000 });

        const flatListed = (await optionsFor(a, small)).find((o) => o.id === flat.data.method.id);
        expect(flatListed).toMatchObject({ price_type: "flat", amount: 300 });

        const disabled = await api.post(`/tenants/shipping-methods/${flat.data.method.id}`, { enabled: false }, bearer(a.token));
        expect(disabled.data.method.enabled).toBe(false);
        expect((await optionsFor(a, small)).some((o) => o.id === flat.data.method.id)).toBe(false);

        const list = await api.get("/tenants/shipping-methods", bearer(a.token));
        const ids = list.data.methods.map((m: { id: string }) => m.id).reverse();
        const reordered = await api.post("/tenants/shipping-methods/reorder", { ids }, bearer(a.token));
        expect(reordered.status).toBe(200);
        expect(reordered.data.methods.map((m: { id: string }) => m.id)).toEqual(ids);
        expect(reordered.data.methods.map((m: { sort_order: number }) => m.sort_order)).toEqual(ids.map((_: string, i: number) => i));
      });

      it("keeps one tenant's methods invisible and unwritable to another", async () => {
        const created = await api.post(
          "/tenants/shipping-methods",
          { name: "Только А", zone: null, tariff: { kind: "flat", amount: 1 } },
          bearer(a.token),
        );
        const id = created.data.method.id as string;

        const listB = await api.get("/tenants/shipping-methods", bearer(b.token));
        expect(listB.data.methods.map((m: { id: string }) => m.id)).not.toContain(id);

        const readB = await api.get(`/tenants/shipping-methods/${id}`, bearer(b.token)).catch((e) => e.response);
        expect(readB.status).toBe(404);
        const writeB = await api.post(`/tenants/shipping-methods/${id}`, { name: "Захват" }, bearer(b.token)).catch((e) => e.response);
        expect(writeB.status).toBe(404);
        const deleteB = await api.delete(`/tenants/shipping-methods/${id}`, bearer(b.token)).catch((e) => e.response);
        expect(deleteB.status).toBe(404);

        const still = await api.get(`/tenants/shipping-methods/${id}`, bearer(a.token));
        expect(still.data.method.name).toBe("Только А");

        // The quote route refuses a foreign shop's option for this shop's cart.
        const vB = await createVariant(b, "Чужой товар", 500, 100);
        const cartB = await cartWith(b, ruRegionId, [{ variant_id: vB, quantity: 1 }], { city: "Москва", postal_code: "101000", country_code: "ru" });
        const quoteB = await api.post("/store/shipping-methods/quote", { cart_id: cartB, shipping_option_id: id }, storeKey(b)).catch((e) => e.response);
        expect(quoteB.status).toBe(404);
      });

      it("deletes a method together with its own zone and leaves the base zone alone", async () => {
        const created = await api.post(
          "/tenants/shipping-methods",
          { name: "Временный", zone: { country_code: "ru", provinces: [] }, tariff: perKgTariff },
          bearer(a.token),
        );
        const id = created.data.method.id as string;
        const deleted = await api.delete(`/tenants/shipping-methods/${id}`, bearer(a.token));
        expect(deleted.status).toBe(200);
        expect(deleted.data).toMatchObject({ id, deleted: true });

        const list = await api.get("/tenants/shipping-methods", bearer(a.token));
        expect(list.data.methods.map((m: { name: string }) => m.name)).toEqual(["Самовывоз", "Курьером"]);
      });

      // b03-shipping-zones-weight: the nine ready-made Russian zones, one
      // «base + per kg» method each, and the buyer priced by the zone his
      // address falls into.
      it("lists the nine Russian zones and the carriers a method can name", async () => {
        const res = await api.get("/tenants/shipping-methods/zone-presets", bearer(a.token));
        expect(res.status).toBe(200);
        expect(res.data.presets.map((p: { key: string }) => p.key)).toEqual([
          "msk", "spb", "center", "northwest", "south", "volga", "ural", "siberia", "fareast",
        ]);
        const ural = res.data.presets.find((p: { key: string }) => p.key === "ural");
        expect(ural.name).toBe("Урал");
        expect(ural.provinces).toContain("Свердловская обл");
        expect(res.data.carriers.map((c: { key: string }) => c.key)).toContain("cdek");
        expect(res.data.currency_code).toBe("rub");
      });

      it("creates one method per chosen zone, names the zone, and skips a zone already set up", async () => {
        const created = await api.post(
          "/tenants/shipping-methods/zone-presets",
          {
            carrier: "cdek",
            zones: [
              { key: "msk", base_amount: 150, per_kg_amount: 120 },
              { key: "ural", base_amount: 150, per_kg_amount: 210 },
            ],
          },
          bearer(a.token),
        );
        expect(created.status).toBe(201);
        expect(created.data.created.map((c: { name: string }) => c.name)).toEqual([
          "СДЭК (расчёт по тарифу магазина) — Москва и область",
          "СДЭК (расчёт по тарифу магазина) — Урал",
        ]);
        expect(created.data.skipped).toEqual([]);

        const ural = created.data.methods.find((m: { name: string }) => m.name.endsWith("Урал"));
        expect(ural.zone_label).toBe("Урал");
        expect(ural.carrier).toBe("cdek");
        expect(ural.tariff).toMatchObject({ kind: "per_kg", base_amount: 150, per_kg_amount: 210 });

        // Running it again writes nothing new: the names are already taken.
        const again = await api.post(
          "/tenants/shipping-methods/zone-presets",
          { carrier: "cdek", zones: [{ key: "msk", base_amount: 999, per_kg_amount: 999 }] },
          bearer(a.token),
        );
        expect(again.data.created).toEqual([]);
        expect(again.data.skipped[0]).toMatchObject({ key: "msk" });
      });

      it("prices a cart by the zone of its address, and hides the other zones", async () => {
        await api.post(
          "/tenants/shipping-methods/zone-presets",
          {
            carrier: "cdek",
            zones: [
              { key: "msk", base_amount: 150, per_kg_amount: 120 },
              { key: "ural", base_amount: 150, per_kg_amount: 210 },
            ],
          },
          bearer(a.token),
        );
        const variant = await createVariant(a, "Мёд", 1000, 500);

        const moscow = await cartWith(
          a,
          ruRegionId,
          [{ variant_id: variant, quantity: 2 }],
          { city: "Москва", province: "г Москва", postal_code: "101000", country_code: "ru" },
        );
        const moscowOptions = await optionsFor(a, moscow);
        const moscowZone = moscowOptions.filter((o) => o.name.startsWith("СДЭК"));
        expect(moscowZone.map((o) => o.name)).toEqual(["СДЭК (расчёт по тарифу магазина) — Москва и область"]);
        const moscowQuote = await api.post(
          "/store/shipping-methods/quote",
          { cart_id: moscow, shipping_option_id: moscowZone[0].id },
          storeKey(a),
        );
        // 2 kg × 120 + 150
        expect(moscowQuote.data.quote).toMatchObject({ amount: 390, weight_g: 2000, zone_label: "Москва и область" });

        const ekb = await cartWith(
          a,
          ruRegionId,
          [{ variant_id: variant, quantity: 2 }],
          { city: "Екатеринбург", province: "Свердловская обл", postal_code: "620000", country_code: "ru" },
        );
        const ekbZone = (await optionsFor(a, ekb)).filter((o) => o.name.startsWith("СДЭК"));
        expect(ekbZone.map((o) => o.name)).toEqual(["СДЭК (расчёт по тарифу магазина) — Урал"]);
        const ekbQuote = await api.post(
          "/store/shipping-methods/quote",
          { cart_id: ekb, shipping_option_id: ekbZone[0].id },
          storeKey(a),
        );
        // 2 kg × 210 + 150 — the same parcel, a dearer zone
        expect(ekbQuote.data.quote).toMatchObject({ amount: 570, weight_g: 2000, zone_label: "Урал" });

        // And the price the cart is charged is the quoted one.
        const set = await api.post(
          `/store/carts/${ekb}/shipping-methods`,
          { option_id: ekbZone[0].id },
          storeKey(a),
        );
        expect(set.status).toBe(200);
        const cart = await api.get(`/store/carts/${ekb}`, storeKey(a));
        expect(cart.data.cart.shipping_total).toBe(570);
      });
    });
  },
});
