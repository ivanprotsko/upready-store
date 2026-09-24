import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";

jest.setTimeout(240_000);

/**
 * t-2026-09-24-n12, step 4 of `docs/multitenancy/sites-one-db-many-storefronts.md`:
 * «Создать сайт» (`POST /tenants/sites`, `clone-tenant`) and the «Сайты» list
 * (`GET /tenants/sites`).
 *
 * Built once in `beforeAll` (the database is restored to that snapshot before
 * every `it`): owner A's shop with settings of every kind the clone copies,
 * one delivery method with a tariff, a custom page, a domain, two products;
 * and an unrelated shop C.
 */
const PASSWORD = "supersecret";
const OWNER_A = "owner@w12-clone.test";

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

const productBody = (title: string) => ({
  title,
  status: "published",
  options: [{ title: "Color", values: ["Blue"] }],
  variants: [
    {
      title,
      prices: [{ currency_code: "eur", amount: 10 }],
      manage_inventory: false,
      options: { Color: "Blue" },
    },
  ],
});

type Shop = { id: string; token: string };

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: «Создать сайт» (POST /tenants/sites, clone-tenant)", () => {
      let a: Shop;
      let c: Shop;
      let productEverywhere: string;
      let productScoped: string;

      const service = (): TenantModuleService => getContainer().resolve(TENANT_MODULE);

      const register = async (email: string, handle: string, firstName: string): Promise<Shop> => {
        const registration = await api.post("/auth/tenant/emailpass/register", { email, password: PASSWORD });
        expect(registration.status).toBe(200);
        const created = await api.post(
          "/tenants",
          { name: handle, handle, admin: { email, first_name: firstName } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);
        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        return { id: created.data.tenant.id, token: login.data.token };
      };

      const createSite = (token: string, body: Record<string, unknown>) =>
        api.post("/tenants/sites", body, bearer(token)).catch((error) => error.response);

      const switchTo = async (token: string, tenantId: string) => {
        const switched = await api.post("/tenants/me/switch", { tenant_id: tenantId }, bearer(token));
        expect(switched.status).toBe(200);
        return switched.data.token as string;
      };

      beforeAll(async () => {
        const container = getContainer();
        await createRegionsWorkflow(container).run({
          input: { regions: [{ name: "Europe", currency_code: "eur", countries: ["de"] }] },
        });

        a = await register(OWNER_A, "w12-clone-a", "Olga");
        c = await register("owner@w12-clone-c.test", "w12-clone-c", "Other");

        const tenants = container.resolve(TENANT_MODULE) as TenantModuleService;
        const [tenantA] = await tenants.listTenants({ id: a.id });
        await tenants.updateTenants({
          id: a.id,
          metadata: {
            ...(tenantA.metadata ?? {}),
            branding: { primary_color: "#112233" },
            analytics: { yandex_metrika_id: "123" },
            shipping_default_weight_g: 700,
            auth_providers: ["emailpass"],
          },
        });
        await tenants.createTenantLocaleSettings({
          tenant_id: a.id,
          default_locale: "ru",
          enabled_locales: ["ru", "en"] as unknown as Record<string, unknown>,
          default_country: "ru",
        });
        await tenants.createTenantHomeConfigs({ tenant_id: a.id, config: { theme: { preset: "geist" } } });
        await tenants.createTenantRequisites({ tenant_id: a.id, legal_name: "ИП Тест", inn: "123456789012" });
        await tenants.createTenantNotificationSettings({
          tenant_id: a.id,
          email_reply_to: "shop@w12-clone.test",
          telegram_chat_id: "4242",
          link_code: "SECRET-LINK-CODE",
        });
        const attribute = await tenants.createTenantProductAttributes({
          tenant_id: a.id,
          key: "fabric",
          name: "Ткань",
          type: "select" as never,
        });
        await tenants.createTenantProductAttributeOptions([
          { attribute_id: attribute.id, value: "linen", label: "Лён", position: 0 },
        ]);
        await tenants.createTenantPages({ tenant_id: a.id, key: "about-us", locale: "ru", title: "О нас", body: "Текст" });
        await tenants.createTenantDomains({ tenant_id: a.id, host: "shop-a.w12-clone.test", is_primary: true });
        await tenants.createTenantRedirects({ tenant_id: a.id, from_path: "/old", to_path: "/new" });

        const method = await api.post(
          "/tenants/shipping-methods",
          { name: "Почта России", enabled: true, tariff: { kind: "per_kg", base_amount: 350, per_kg_amount: 120 } },
          bearer(a.token),
        );
        expect(method.status).toBe(201);

        const p1 = await api.post("/tenants/products", productBody("W12 everywhere"), bearer(a.token));
        const p2 = await api.post("/tenants/products", productBody("W12 site A only"), bearer(a.token));
        productEverywhere = p1.data.product.id;
        productScoped = p2.data.product.id;
      });

      it("creates a site of the same client, copies its settings and not its secrets, domains or redirects", async () => {
        const created = await createSite(a.token, { name: "Сайт два", handle: "w12-clone-b" });
        expect(created.status).toBe(201);
        const b = created.data.site.id as string;

        const [tenantA] = await service().listTenants({ id: a.id });
        const [tenantB] = await service().listTenants({ id: b });
        expect(tenantA.group_id).toMatch(/^tgrp_/);
        expect(tenantB.group_id).toBe(tenantA.group_id);

        expect(tenantB.metadata).toMatchObject({
          branding: { primary_color: "#112233" },
          analytics: { yandex_metrika_id: "123" },
          shipping_default_weight_g: 700,
        });
        expect(tenantB.metadata).not.toHaveProperty("auth_providers");

        const [locale] = await service().listTenantLocaleSettings({ tenant_id: b });
        expect(locale).toMatchObject({ default_locale: "ru", default_country: "ru" });
        const [home] = await service().listTenantHomeConfigs({ tenant_id: b });
        expect(home.config).toEqual({ theme: { preset: "geist" } });
        const [requisites] = await service().listTenantRequisites({ tenant_id: b });
        expect(requisites).toMatchObject({ legal_name: "ИП Тест", inn: "123456789012" });
        const [notifications] = await service().listTenantNotificationSettings({ tenant_id: b });
        expect(notifications).toMatchObject({ email_reply_to: "shop@w12-clone.test", telegram_chat_id: "4242" });
        expect(notifications.link_code).toBeNull();
        const attributes = await service().listTenantProductAttributes({ tenant_id: b }, { relations: ["options"] });
        expect(attributes.map((x) => [x.key, x.options.map((o) => o.value)])).toEqual([["fabric", ["linen"]]]);
        const pages = await service().listTenantPages({ tenant_id: b });
        expect(pages.map((page) => page.key)).toEqual(["about-us"]);

        expect(await service().listTenantDomains({ tenant_id: b })).toEqual([]);
        expect(await service().listTenantIntegrationSecrets({ tenant_id: b })).toEqual([]);
        expect(await service().listTenantRedirects({ tenant_id: b })).toEqual([]);
        const {
          data: [withAliases],
        } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({ entity: "tenant", fields: ["id", "handle_aliases.id"], filters: { id: b } });
        expect(withAliases.handle_aliases ?? []).toEqual([]);
      });

      it("copies delivery with its tariff instead of the provisioned defaults", async () => {
        const created = await createSite(a.token, { name: "Сайт два", handle: "w12-clone-b" });
        const tokenB = await switchTo(a.token, created.data.site.id);

        const methodsA = (await api.get("/tenants/shipping-methods", bearer(a.token))).data.methods;
        const methodsB = (await api.get("/tenants/shipping-methods", bearer(tokenB))).data.methods;
        const shape = (methods: { name: string; tariff: unknown; enabled: boolean }[]) =>
          methods.map((m) => ({ name: m.name, tariff: m.tariff, enabled: m.enabled }));
        expect(shape(methodsB)).toEqual(shape(methodsA));
        expect(methodsB.map((m: { id: string }) => m.id)).not.toEqual(methodsA.map((m: { id: string }) => m.id));
      });

      it("leaves pages and delivery alone when the flags are off", async () => {
        const created = await createSite(a.token, {
          name: "Сайт два",
          handle: "w12-clone-b",
          copy_pages: false,
          copy_shipping: false,
        });
        expect(created.status).toBe(201);
        expect(await service().listTenantPages({ tenant_id: created.data.site.id })).toEqual([]);

        const tokenB = await switchTo(a.token, created.data.site.id);
        const methodsB = (await api.get("/tenants/shipping-methods", bearer(tokenB))).data.methods;
        expect(methodsB.map((m: { name: string }) => m.name)).not.toContain("Почта России");
      });

      it("gives the new site every product shown everywhere, and none scoped to some sites", async () => {
        const first = await createSite(a.token, { name: "Сайт два", handle: "w12-clone-b" });
        const b = first.data.site.id as string;

        // After the first clone both products sat on A only, i.e. «везде» in a
        // one-site client, so B got both. Now scope one to A and add a third site.
        const scoped = await api.post(
          `/tenants/products/${productScoped}`,
          { site_scope: { tenant_ids: [a.id] } },
          bearer(a.token),
        );
        expect(scoped.status).toBe(200);

        const second = await createSite(a.token, { name: "Сайт три", handle: "w12-clone-d" });
        expect(second.status).toBe(201);
        const d = second.data.site.id as string;

        const listed = (await api.get("/tenants/products?fields=id", bearer(await switchTo(a.token, d)))).data
          .products as { id: string; site_scope: unknown }[];
        const byId = new Map(listed.map((p) => [p.id, p.site_scope]));
        expect(byId.get(productEverywhere)).toBe("all");
        expect(byId.get(productScoped)).toEqual({ tenant_ids: [a.id] });

        const sites = (await api.get("/tenants/sites", bearer(a.token))).data.sites as { id: string }[];
        expect(sites.map((s) => s.id).sort()).toEqual([a.id, b, d].sort());
      });

      it("keeps the owner's login on the site it opened and offers the new one in the switcher", async () => {
        const created = await createSite(a.token, { name: "Сайт два", handle: "w12-clone-b" });

        const relogin = await api.post("/auth/tenant/emailpass", { email: OWNER_A, password: PASSWORD });
        const me = await api.get("/tenants/me", bearer(relogin.data.token));
        expect(me.data.tenant_admin.tenant.id).toBe(a.id);

        const shops = (await api.get("/tenants/me/shops", bearer(relogin.data.token))).data.shops as { id: string }[];
        expect(shops.map((s) => s.id)).toContain(created.data.site.id);
      });

      it("lists the sites with addresses and a certificate state, and never another client's", async () => {
        const created = await createSite(a.token, { name: "Сайт два", handle: "w12-clone-b" });

        const asA = await api.get("/tenants/sites", bearer(a.token));
        expect(asA.status).toBe(200);
        const [current, other] = asA.data.sites;
        expect(current).toMatchObject({ id: a.id, handle: "w12-clone-a", is_current: true, primary_host: "shop-a.w12-clone.test" });
        expect(current.domains).toEqual([
          { host: "shop-a.w12-clone.test", is_primary: true, certificate: { status: "unreachable", valid_to: null } },
        ]);
        expect(other).toMatchObject({ id: created.data.site.id, handle: "w12-clone-b", is_current: false, domains: [] });

        const asC = await api.get("/tenants/sites", bearer(c.token));
        expect(asC.data.sites.map((s: { id: string }) => s.id)).toEqual([c.id]);
      });

      it("refuses a taken handle and creates nothing", async () => {
        const taken = await createSite(a.token, { name: "Дубль", handle: "w12-clone-c" });
        expect(taken.status).toBeGreaterThanOrEqual(400);
        expect(taken.status).toBeLessThan(500);

        const [tenantA] = await service().listTenants({ id: a.id });
        expect(tenantA.group_id).toBeNull();
        expect(await service().listTenantGroups({})).toEqual([]);
      });

      it("never copies another shop: the source is always the caller's own site", async () => {
        const invalid = await createSite(c.token, { name: "x", handle: "w12-clone-x", source_tenant_id: a.id });
        expect(invalid.status).toBe(400);
      });
    });
  },
});
