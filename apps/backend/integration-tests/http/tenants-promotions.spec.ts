import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows";

jest.setTimeout(180_000);

/**
 * Seam test of the tenant promotion and campaign surface (wave 2, piece 6).
 *
 * Two things are under test. The ownership boundary every `/tenants/*` route
 * shares (own rows listed, a foreign id 404 on every verb), and the one rule that
 * is specific to promotions: a tenant's promotion carries a
 * `sales_channel_id eq <tenant channel>` rule it cannot lose, so the discount it
 * grants reaches the tenant's own storefront and no other. The last is measured
 * where it actually matters, on a store cart behind each tenant's publishable
 * key, not only on the rule row.
 *
 * Same runner facts as `tenants.spec.ts`: the database is restored from its
 * post-`beforeAll` snapshot before every test, so each test creates what it
 * reads, and `DB_HOST` must be the literal `localhost` or the runner forces SSL
 * and nothing connects.
 */
type Tenant = {
  id: string;
  handle: string;
  sales_channel: { id: string; name: string };
  api_key: { id: string; token: string };
};

type Registered = {
  token: string;
  tenant: Tenant;
};

type PromotionRule = {
  id?: string;
  attribute: string;
  operator: string;
  values: { value: string }[];
};

type Promotion = {
  id: string;
  code: string;
  rules: PromotionRule[];
};

const PASSWORD = "supersecret-owner";
const CURRENCY = "eur";

const productBody = (title: string) => ({
  title,
  status: "published",
  options: [{ title: "Color", values: ["Blue"] }],
  variants: [
    {
      title,
      prices: [{ currency_code: CURRENCY, amount: 100 }],
      manage_inventory: false,
      options: { Color: "Blue" },
    },
  ],
});

const promotionBody = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  type: "standard",
  status: "active",
  application_method: {
    type: "percentage",
    target_type: "order",
    allocation: "across",
    value: 10,
    currency_code: CURRENCY,
  },
  ...extra,
});

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: promotions and campaigns", () => {
      let a: Registered;
      let b: Registered;
      let regionId: string;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const publishable = (tenant: Tenant) => ({
        headers: { "x-publishable-api-key": tenant.api_key.token },
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

        return { token: login.data.token, tenant: created.data.tenant };
      };

      const createPromotion = async (
        owner: Registered,
        code: string,
        extra: Record<string, unknown> = {},
      ): Promise<Promotion> => {
        const created = await api.post(
          "/tenants/promotions",
          promotionBody(code, extra),
          bearer(owner.token),
        );
        expect(created.status).toBe(200);
        return created.data.promotion as Promotion;
      };

      const channelRuleOf = (promotion: Promotion) =>
        promotion.rules.find((rule) => rule.attribute === "sales_channel_id");

      /** The response of a call that is expected to fail, without throwing. */
      const failed = (promise: Promise<any>) => promise.catch((error) => error.response);

      /**
       * A cart in the tenant's own channel holding one unit of one of its own
       * products. The channel comes from the publishable key, which is what a
       * storefront sends; nothing in the body names it.
       */
      const cartWithOneItem = async (owner: Registered, title: string): Promise<string> => {
        const product = await api.post(
          "/tenants/products",
          productBody(title),
          bearer(owner.token),
        );
        expect(product.status).toBe(201);
        const variantId = product.data.product.variants[0].id;

        const cart = await api.post(
          "/store/carts",
          { region_id: regionId },
          publishable(owner.tenant),
        );
        expect(cart.status).toBe(200);

        const withItem = await api.post(
          `/store/carts/${cart.data.cart.id}/line-items`,
          { variant_id: variantId, quantity: 1 },
          publishable(owner.tenant),
        );
        expect(withItem.status).toBe(200);
        expect(withItem.data.cart.subtotal).toBeGreaterThan(0);

        return cart.data.cart.id;
      };

      const applyCode = async (owner: Registered, cartId: string, code: string) => {
        const applied = await api.post(
          `/store/carts/${cartId}/promotions`,
          { promo_codes: [code] },
          publishable(owner.tenant),
        );
        expect(applied.status).toBe(200);

        const read = await api.get(`/store/carts/${cartId}`, publishable(owner.tenant));
        expect(read.status).toBe(200);

        return {
          discount_total: read.data.cart.discount_total,
          codes: (read.data.cart.promotions ?? []).map(
            (promotion: { code?: string } | null) => promotion?.code,
          ),
        };
      };

      beforeAll(async () => {
        const regions = await createRegionsWorkflow(getContainer()).run({
          input: { regions: [{ name: "Europe", currency_code: CURRENCY, countries: ["de"] }] },
        });
        regionId = regions.result[0].id;

        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      it("forces the tenant's own sales-channel rule onto a created promotion", async () => {
        const promotion = await createPromotion(a, "ACME10");

        const rule = channelRuleOf(promotion);
        expect(rule).toBeDefined();
        expect(rule!.operator).toBe("eq");
        expect(rule!.values.map((value) => value.value)).toEqual([a.tenant.sales_channel.id]);
      });

      it("replaces a sales-channel rule that names another tenant's channel", async () => {
        const promotion = await createPromotion(a, "ACME10", {
          rules: [
            {
              attribute: "sales_channel_id",
              operator: "eq",
              values: [b.tenant.sales_channel.id],
            },
          ],
        });

        const channelRules = promotion.rules.filter(
          (rule) => rule.attribute === "sales_channel_id",
        );
        expect(channelRules).toHaveLength(1);
        expect(channelRules[0].values.map((value) => value.value)).toEqual([
          a.tenant.sales_channel.id,
        ]);
      });

      it("lists the tenant's own promotions in the Admin shape and nobody else's", async () => {
        const promotion = await createPromotion(a, "ACME10");

        const mine = await api.get("/tenants/promotions", bearer(a.token));
        expect(mine.status).toBe(200);
        expect(mine.data.count).toBe(1);
        expect(mine.data.promotions.map((row: { code: string }) => row.code)).toEqual(["ACME10"]);
        expect(mine.data.offset).toBe(0);
        expect(mine.data.limit).toBe(50);

        const theirs = await api.get("/tenants/promotions", bearer(b.token));
        expect(theirs.status).toBe(200);
        expect(theirs.data.count).toBe(0);
        expect(theirs.data.promotions).toEqual([]);

        const byId = await failed(
          api.get(`/tenants/promotions/${promotion.id}`, bearer(b.token)),
        );
        expect(byId.status).toBe(404);

        // The Admin accepts a code in the `:id` position, so the code has to 404
        // for the other tenant too: otherwise a guessed code reads a foreign row.
        const byCode = await failed(api.get("/tenants/promotions/ACME10", bearer(b.token)));
        expect(byCode.status).toBe(404);
      });

      it("refuses every write verb on another tenant's promotion", async () => {
        const promotion = await createPromotion(a, "ACME10");

        const updated = await failed(
          api.post(`/tenants/promotions/${promotion.id}`, { status: "draft" }, bearer(b.token)),
        );
        expect(updated.status).toBe(404);

        const deleted = await failed(
          api.delete(`/tenants/promotions/${promotion.id}`, bearer(b.token)),
        );
        expect(deleted.status).toBe(404);

        const ruleBatch = await failed(
          api.post(
            `/tenants/promotions/${promotion.id}/rules/batch`,
            { delete: [channelRuleOf(promotion)!.id] },
            bearer(b.token),
          ),
        );
        expect(ruleBatch.status).toBe(404);

        // The promotion is untouched: its rule still names tenant A's channel.
        const read = await api.get(`/tenants/promotions/${promotion.id}`, bearer(a.token));
        expect(read.status).toBe(200);
        expect(channelRuleOf(read.data.promotion)!.values.map((v: { value: string }) => v.value)).toEqual(
          [a.tenant.sales_channel.id],
        );
      });

      it("refuses to delete, alter or duplicate the forced sales-channel rule", async () => {
        const promotion = await createPromotion(a, "ACME10");
        const ruleId = channelRuleOf(promotion)!.id as string;

        const removed = await failed(
          api.post(
            `/tenants/promotions/${promotion.id}/rules/batch`,
            { delete: [ruleId] },
            bearer(a.token),
          ),
        );
        expect(removed.status).toBe(400);

        const moved = await failed(
          api.post(
            `/tenants/promotions/${promotion.id}/rules/batch`,
            { update: [{ id: ruleId, values: [b.tenant.sales_channel.id] }] },
            bearer(a.token),
          ),
        );
        expect(moved.status).toBe(400);

        const widened = await failed(
          api.post(
            `/tenants/promotions/${promotion.id}/rules/batch`,
            {
              create: [
                {
                  attribute: "sales_channel_id",
                  operator: "eq",
                  values: [b.tenant.sales_channel.id],
                },
              ],
            },
            bearer(a.token),
          ),
        );
        expect(widened.status).toBe(400);

        // Any other rule still goes through: the guard is the channel, not the route.
        const allowed = await api.post(
          `/tenants/promotions/${promotion.id}/rules/batch`,
          { create: [{ attribute: "currency_code", operator: "eq", values: [CURRENCY] }] },
          bearer(a.token),
        );
        expect(allowed.status).toBe(200);
        expect(allowed.data.created).toHaveLength(1);

        const read = await api.get(`/tenants/promotions/${promotion.id}`, bearer(a.token));
        expect(
          channelRuleOf(read.data.promotion)!.values.map((v: { value: string }) => v.value),
        ).toEqual([a.tenant.sales_channel.id]);
      });

      it("discounts a cart in the tenant's own channel and leaves another tenant's cart alone", async () => {
        await createPromotion(a, "ACME10");

        const ownCart = await cartWithOneItem(a, "Acme chair");
        const own = await applyCode(a, ownCart, "ACME10");
        expect(own.codes).toEqual(["ACME10"]);
        expect(own.discount_total).toBeGreaterThan(0);

        const foreignCart = await cartWithOneItem(b, "Globex chair");
        const foreign = await applyCode(b, foreignCart, "ACME10");
        expect(foreign.codes).toEqual([]);
        expect(foreign.discount_total).toBe(0);
      });

      it("answers the sales-channel rule values with the tenant's own channel alone", async () => {
        const mine = await api.get(
          "/tenants/promotions/rule-value-options/rules/sales_channel",
          bearer(a.token),
        );
        expect(mine.status).toBe(200);
        expect(mine.data.values).toEqual([
          { label: a.tenant.sales_channel.name, value: a.tenant.sales_channel.id },
        ]);
        expect(mine.data.count).toBe(1);

        const theirs = await api.get(
          "/tenants/promotions/rule-value-options/rules/sales_channel",
          bearer(b.token),
        );
        expect(theirs.data.values).toEqual([
          { label: b.tenant.sales_channel.name, value: b.tenant.sales_channel.id },
        ]);
      });

      it("lists the sales-channel attribute the create route forces", async () => {
        const attributes = await api.get(
          "/tenants/promotions/rule-attribute-options/rules",
          bearer(a.token),
        );
        expect(attributes.status).toBe(200);
        expect(
          attributes.data.attributes.find(
            (attribute: { id: string }) => attribute.id === "sales_channel",
          )?.value,
        ).toBe("sales_channel_id");
      });

      it("labels the promotion's own rules for the edit screens and 404s for another tenant", async () => {
        const promotion = await createPromotion(a, "ACME10");

        const rules = await api.get(
          `/tenants/promotions/${promotion.id}/rules`,
          bearer(a.token),
        );
        expect(rules.status).toBe(200);
        const channelRule = rules.data.rules.find(
          (rule: { attribute: string }) => rule.attribute === "sales_channel_id",
        );
        expect(channelRule.attribute_label).toBe("Sales Channel");
        expect(channelRule.values).toEqual([
          { value: a.tenant.sales_channel.id, label: a.tenant.sales_channel.name },
        ]);

        const theirs = await failed(
          api.get(`/tenants/promotions/${promotion.id}/rules`, bearer(b.token)),
        );
        expect(theirs.status).toBe(404);
      });

      it("stops listing a deleted promotion, link and all", async () => {
        const promotion = await createPromotion(a, "ACME10");

        const deleted = await api.delete(
          `/tenants/promotions/${promotion.id}`,
          bearer(a.token),
        );
        expect(deleted.status).toBe(200);
        expect(deleted.data).toEqual({
          id: promotion.id,
          object: "promotion",
          deleted: true,
        });

        // The tenant-promotion link is removed with it; a surviving link would
        // keep feeding a dead id to the list and the list would answer with a row
        // the promotion module can no longer resolve.
        const after = await api.get("/tenants/promotions", bearer(a.token));
        expect(after.data.count).toBe(0);
        expect(after.data.promotions).toEqual([]);
      });

      it("creates a campaign the tenant owns and lists nobody else's", async () => {
        const created = await api.post(
          "/tenants/campaigns",
          {
            name: "Acme spring",
            campaign_identifier: "acme-spring",
            budget: { type: "usage", limit: 100 },
          },
          bearer(a.token),
        );
        expect(created.status).toBe(200);
        expect(created.data.campaign.name).toBe("Acme spring");

        const mine = await api.get("/tenants/campaigns", bearer(a.token));
        expect(mine.status).toBe(200);
        expect(mine.data.count).toBe(1);
        expect(mine.data.offset).toBe(0);

        const theirs = await api.get("/tenants/campaigns", bearer(b.token));
        expect(theirs.data.count).toBe(0);
        expect(theirs.data.campaigns).toEqual([]);

        const read = await failed(
          api.get(`/tenants/campaigns/${created.data.campaign.id}`, bearer(b.token)),
        );
        expect(read.status).toBe(404);

        const updated = await failed(
          api.post(
            `/tenants/campaigns/${created.data.campaign.id}`,
            { name: "Globex spring" },
            bearer(b.token),
          ),
        );
        expect(updated.status).toBe(404);

        const removed = await failed(
          api.delete(`/tenants/campaigns/${created.data.campaign.id}`, bearer(b.token)),
        );
        expect(removed.status).toBe(404);
      });

      it("adds the tenant's own promotion to its campaign and refuses a foreign one", async () => {
        const promotion = await createPromotion(a, "ACME10");

        const mine = await api.post(
          "/tenants/campaigns",
          { name: "Acme spring", campaign_identifier: "acme-spring" },
          bearer(a.token),
        );
        expect(mine.status).toBe(200);

        const added = await api.post(
          `/tenants/campaigns/${mine.data.campaign.id}/promotions`,
          { add: [promotion.id] },
          bearer(a.token),
        );
        expect(added.status).toBe(200);

        const read = await api.get(
          `/tenants/promotions/${promotion.id}?fields=id,campaign_id`,
          bearer(a.token),
        );
        expect(read.data.promotion.campaign_id).toBe(mine.data.campaign.id);

        // Tenant B's own campaign may not swallow tenant A's promotion: the
        // workflow addresses it by bare id, so the route proves ownership first.
        const theirs = await api.post(
          "/tenants/campaigns",
          { name: "Globex spring", campaign_identifier: "globex-spring" },
          bearer(b.token),
        );
        expect(theirs.status).toBe(200);

        const stolen = await failed(
          api.post(
            `/tenants/campaigns/${theirs.data.campaign.id}/promotions`,
            { add: [promotion.id] },
            bearer(b.token),
          ),
        );
        expect(stolen.status).toBe(404);

        const intact = await api.get(
          `/tenants/promotions/${promotion.id}?fields=id,campaign_id`,
          bearer(a.token),
        );
        expect(intact.data.promotion.campaign_id).toBe(mine.data.campaign.id);
      });

      it("stops listing a deleted campaign, link and all", async () => {
        const created = await api.post(
          "/tenants/campaigns",
          { name: "Acme spring", campaign_identifier: "acme-spring" },
          bearer(a.token),
        );
        expect(created.status).toBe(200);

        const deleted = await api.delete(
          `/tenants/campaigns/${created.data.campaign.id}`,
          bearer(a.token),
        );
        expect(deleted.status).toBe(200);
        expect(deleted.data).toEqual({
          id: created.data.campaign.id,
          object: "campaign",
          deleted: true,
        });

        const after = await api.get("/tenants/campaigns", bearer(a.token));
        expect(after.data.count).toBe(0);
      });

      it("keeps the whole namespace behind the tenant token", async () => {
        for (const path of [
          "/tenants/promotions",
          "/tenants/campaigns",
          "/tenants/promotions/rule-attribute-options/rules",
          "/tenants/promotions/rule-value-options/rules/sales_channel",
        ]) {
          const anonymous = await failed(api.get(path));
          expect(anonymous.status).toBe(401);
        }
      });
    });
  },
});
