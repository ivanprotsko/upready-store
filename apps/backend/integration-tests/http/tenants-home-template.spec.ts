import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test of `POST /tenants/home/template` (t-2026-10-12-33): a shop applies a store
 * template, the expanded document reads back on `/tenants/home` and on the public
 * `/store/tenant/home`, the overrides it takes and the ones it refuses, and what a plain
 * `PUT /tenants/home` from the panel keeps of it afterwards.
 *
 * Sibling of `tenants-home.spec.ts`, with its runner facts: the database is restored from
 * its post-`beforeAll` snapshot before every test, so each test writes the rows it reads,
 * and `DB_HOST` must be the literal `localhost`.
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
  publishableKey: { id: string; token: string };
};

const PASSWORD = "supersecret-owner";

/** The document the panel's form saves today: no template fields at all. */
const document = (overrides: Record<string, unknown> = {}) => ({
  theme: { preset: "sneakers" },
  settings: {
    defaultMode: "dark",
    header: "h5",
    hero: "k",
    tiles: "on",
    listing: "p1",
    footer: "f3",
  },
  content: {
    hero: {
      title: "Night wave hero",
      subtitle: "Everything the tenant typed",
      cta_label: "Shop",
      cta_href: "/store",
      image_url: null,
    },
    products: { source: "popular" },
    order: ["products", "hero"],
  },
  ...overrides,
});

/** `apps/storefront/src/templates/long-morning/template.json`, the fields the document gets. */
const LONG_MORNING = {
  settings: { defaultMode: "light", header: "h2", hero: "h", tiles: "on", listing: "p4", footer: "f1" },
  layers: { radius: "soft", buttonStyle: "filled", photoStyle: "landscape", density: "spacious" },
  blocks: ["announcement/text-bar", "hero/h", "tiles/on", "listing/p4"],
};

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenants: applying a store template", () => {
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      const storeKey = (owner: Registered) => ({
        headers: { "x-publishable-api-key": owner.publishableKey.token },
      });

      const failed = (promise: Promise<any>) => promise.catch((error) => error.response);

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
          publishableKey: created.data.tenant.api_key,
        };
      };

      const blocksOf = (home: { content: { sections?: { block: string }[] } }) =>
        home.content.sections?.map((section) => section.block);

      beforeAll(async () => {
        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      it("refuses an anonymous call", async () => {
        const anonymous = await failed(api.post("/tenants/home/template", { id: "long-morning" }));
        expect(anonymous.status).toBe(401);
      });

      it("writes the expanded template for a shop with no document", async () => {
        const applied = await api.post("/tenants/home/template", { id: "long-morning" }, bearer(a.token));
        expect(applied.status).toBe(200);
        expect(applied.data.advisories).toEqual([]);

        const home = applied.data.home;
        expect(home.schema).toBe("upready.tenant-home/v1");
        expect(home.settings).toEqual(LONG_MORNING.settings);
        expect(home.theme).toEqual({ preset: "home-goods", layers: LONG_MORNING.layers });
        expect(blocksOf(home)).toEqual(LONG_MORNING.blocks);
        expect(home.template).toEqual({
          id: "long-morning",
          schema: "upready.storefront-template/v1",
          fontPair: { display: "Fraunces", body: "Manrope" },
        });
        expect(home.content.order).toEqual(["hero", "categories", "products"]);
        expect(home.content.products).toEqual({ source: "popular" });

        const read = await api.get("/tenants/home", bearer(a.token));
        expect(read.data.home).toEqual(home);
      });

      it("keeps the shop's own content and serves the document to its key only", async () => {
        const own = await api.put("/tenants/home", document(), bearer(a.token));
        expect(own.status).toBe(200);
        expect(own.data.home.template).toBeUndefined();
        expect(own.data.home.theme).toEqual({ preset: "sneakers" });

        const applied = await api.post("/tenants/home/template", { id: "long-morning" }, bearer(a.token));
        expect(applied.status).toBe(200);
        expect(applied.data.home.content.hero.title).toBe("Night wave hero");
        expect(applied.data.home.content.order).toEqual(["products", "hero"]);

        const asA = await api.get("/store/tenant/home", storeKey(a));
        expect(asA.data.home.template.id).toBe("long-morning");
        expect(blocksOf(asA.data.home)).toEqual(LONG_MORNING.blocks);

        const asB = await api.get("/store/tenant/home", storeKey(b));
        expect(asB.data.home).toBeNull();
        const mine = await api.get("/tenants/home", bearer(b.token));
        expect(mine.data.home).toBeNull();
      });

      it("takes the palette, a layer and a section's props", async () => {
        const applied = await api.post(
          "/tenants/home/template",
          {
            id: "long-morning",
            overrides: {
              palette: "default",
              layers: { radius: "pill" },
              sections: [{ index: 0, block: "announcement/text-bar", props: { text: { ru: "Свои слова" } } }],
            },
          },
          bearer(a.token),
        );
        expect(applied.status).toBe(200);
        expect(applied.data.home.theme).toEqual({
          preset: "medusa",
          layers: { ...LONG_MORNING.layers, radius: "pill" },
        });
        expect(applied.data.home.content.sections[0]).toEqual({
          block: "announcement/text-bar",
          props: { text: { ru: "Свои слова" } },
        });
      });

      it("refuses an unknown template, a bad override and an override outside the three kinds", async () => {
        const unknown = await failed(api.post("/tenants/home/template", { id: "no-such" }, bearer(a.token)));
        expect(unknown.status).toBe(400);

        const props = await failed(
          api.post(
            "/tenants/home/template",
            {
              id: "long-morning",
              overrides: { sections: [{ index: 0, block: "announcement/text-bar", props: { text: { xx: "Hi" } } }] },
            },
            bearer(a.token),
          ),
        );
        expect(props.status).toBe(400);
        expect(props.data.message).toContain("sections[0].props");

        const palette = await failed(
          api.post("/tenants/home/template", { id: "long-morning", overrides: { palette: "neon" } }, bearer(a.token)),
        );
        expect(palette.status).toBe(400);

        const settings = await failed(
          api.post(
            "/tenants/home/template",
            { id: "long-morning", overrides: { settings: { header: "h4", hero: "k" } } },
            bearer(a.token),
          ),
        );
        expect(settings.status).toBe(400);

        const read = await api.get("/tenants/home", bearer(a.token));
        expect(read.data.home).toBeNull();
      });

      it("keeps the template through a plain PUT, the slot sections following the settings", async () => {
        const applied = await api.post("/tenants/home/template", { id: "long-morning" }, bearer(a.token));
        expect(applied.status).toBe(200);

        const saved = await api.put(
          "/tenants/home",
          document({
            theme: { preset: "geist" },
            settings: { ...LONG_MORNING.settings, hero: "g", listing: "none" },
          }),
          bearer(a.token),
        );
        expect(saved.status).toBe(200);
        expect(saved.data.home.template.id).toBe("long-morning");
        expect(saved.data.home.theme).toEqual({ preset: "geist", layers: LONG_MORNING.layers });
        expect(blocksOf(saved.data.home)).toEqual(["announcement/text-bar", "hero/g", "tiles/on"]);
        expect(saved.data.home.content.hero.title).toBe("Night wave hero");
      });
    });
  },
});
