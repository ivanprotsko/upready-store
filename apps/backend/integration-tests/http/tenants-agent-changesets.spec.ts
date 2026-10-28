import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows";
import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";

jest.setTimeout(300_000);

/**
 * t-2026-10-27-04: the owner's agent's changesets, end to end on a local
 * database. A shop with a custom page, a saved home page and one product gets
 * a stage site; each target then goes change → stage → publish → rollback.
 * Apart: drift refuses a rollback, a denied op never becomes a draft, the
 * stage site is noindex and out of the main site's hreflang, and the product
 * overlay shows on the stage storefront only.
 */
const PASSWORD = "supersecret-owner";
const OWNER = "owner@w27-stage.test";
const MAIN_HOST = "shop.w27-stage.test";
const STAGE_HOST = `stage.${MAIN_HOST}`;

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

const home = (title: string) => ({
  theme: { preset: "sneakers" },
  settings: { defaultMode: "dark", header: "h5", hero: "k", tiles: "on", listing: "p1", footer: "f3" },
  content: {
    hero: { title, subtitle: "Subtitle", cta_label: "Shop", cta_href: "/store", image_url: null },
    products: { source: "popular" },
    order: ["hero", "categories", "products"],
  },
});

const page = (title: string) => ({ title, body: `${title} — текст`, published: true });

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: agent changesets and the stage site", () => {
      let token: string;
      let mainId: string;
      let stageId: string;
      let stageToken: string;
      let mainKey: string;
      let stageKey: string;
      let regionId: string;
      let productId: string;
      let variantId: string;

      const call = <T = Record<string, any>>(promise: Promise<T>) =>
        promise.catch((error) => error.response as T);

      const post = (path: string, body: unknown = {}, as = token) => call(api.post(path, body, bearer(as)));
      const get = (path: string, as = token) => call(api.get(path, bearer(as)));

      const draft = async (ops: unknown[]) => {
        const created = await post("/tenants/agent-changesets", { source: "owner-voice", summary: "test", ops });
        expect(created.status).toBe(201);
        expect(created.data.agent_changeset.status).toBe("draft");
        return created.data.agent_changeset.id as string;
      };

      const step = async (id: string, action: string, status: number, expected?: string) => {
        const answer = await post(`/tenants/agent-changesets/${id}/${action}`);
        expect({ action, status: answer.status, body: answer.data }).toMatchObject({ action, status });
        if (expected) expect(answer.data.agent_changeset.status).toBe(expected);
        return answer;
      };

      const pageTitle = async (as: string) => (await get("/tenants/pages/about-us", as)).data.page.title as string;
      const heroTitle = async (as: string) => (await get("/tenants/home", as)).data.home.content.hero.title as string;

      const storeProduct = (key: string) =>
        call(
          api.get(`/store/products/${productId}?region_id=${regionId}&fields=title,*variants.calculated_price`, {
            headers: { "x-publishable-api-key": key },
          }),
        );

      beforeAll(async () => {
        // The changeset runs its ops as HTTP requests to this same backend.
        process.env.AGENT_CHANGESET_API_URL = api.defaults.baseURL;

        const container = getContainer();
        const {
          result: [region],
        } = await createRegionsWorkflow(container).run({
          input: { regions: [{ name: "Europe", currency_code: "eur", countries: ["de"] }] },
        });
        regionId = region.id;

        const registration = await api.post("/auth/tenant/emailpass/register", { email: OWNER, password: PASSWORD });
        const created = await api.post(
          "/tenants",
          { name: "W27 shop", handle: "w27-stage", admin: { email: OWNER, first_name: "Olga" } },
          bearer(registration.data.token),
        );
        mainId = created.data.tenant.id;
        mainKey = created.data.tenant.api_key.token;
        token = (await api.post("/auth/tenant/emailpass", { email: OWNER, password: PASSWORD })).data.token;

        const tenants: TenantModuleService = container.resolve(TENANT_MODULE);
        await tenants.createTenantDomains({ tenant_id: mainId, host: MAIN_HOST, is_primary: true });

        expect((await post("/tenants/pages", { slug: "about-us", title: "О нас" })).status).toBe(201);
        expect((await call(api.put("/tenants/pages/about-us", page("О нас"), bearer(token)))).status).toBe(200);
        expect((await call(api.put("/tenants/home", home("Live hero"), bearer(token)))).status).toBe(200);

        const product = await post("/tenants/products", {
          title: "Live tea",
          status: "published",
          options: [{ title: "Size", values: ["S"] }],
          variants: [
            { title: "S", prices: [{ currency_code: "eur", amount: 10 }], manage_inventory: false, options: { Size: "S" } },
          ],
        });
        expect(product.status).toBe(201);
        productId = product.data.product.id;
        variantId = product.data.product.variants[0].id;

        const stage = await post("/tenants/agent-changesets/stage-site");
        expect(stage.status).toBe(200);
        expect(stage.data.stage).toMatchObject({ main_tenant_id: mainId, stage_host: STAGE_HOST, created: true });
        expect(stage.data.sites).toEqual({ main_url: `https://${MAIN_HOST}`, stage_url: `https://${STAGE_HOST}` });
        stageId = stage.data.stage.stage_tenant_id;

        const switched = await post("/tenants/me/switch", { tenant_id: stageId });
        expect(switched.status).toBe(200);
        stageToken = switched.data.token;

        const byHost = await api.get(`/storefront/by-host?host=${STAGE_HOST}`);
        stageKey = byHost.data.publishable_key;
      });

      it("makes the stage site once: a second run finds it", async () => {
        const again = await post("/tenants/agent-changesets/stage-site");
        expect(again.data.stage).toMatchObject({ stage_tenant_id: stageId, created: false });
      });

      it("copies no domain, order or secret: the stage site has its own host only", async () => {
        const tenants: TenantModuleService = getContainer().resolve(TENANT_MODULE);
        const stage = await tenants.retrieveTenant(stageId, { relations: ["domains"] });
        expect((stage.domains ?? []).map((domain) => domain?.host)).toEqual([STAGE_HOST]);
        expect(stage.metadata).toMatchObject({ stage_of: mainId, stage_host: STAGE_HOST });
        const orders = await get("/tenants/orders", stageToken);
        expect(orders.data.count ?? orders.data.orders?.length ?? 0).toBe(0);
      });

      it("page: change → stage → publish → rollback", async () => {
        const id = await draft([{ method: "PUT", path: "/tenants/pages/about-us", body: page("О нас — новое") }]);

        await step(id, "stage", 200, "staged");
        expect(await pageTitle(stageToken)).toBe("О нас — новое");
        expect(await pageTitle(token)).toBe("О нас");

        await step(id, "publish", 200, "published");
        expect(await pageTitle(token)).toBe("О нас — новое");
        expect((await get(`/tenants/agent-changesets/${id}`)).data.agent_changeset.drift).toEqual([]);

        const shown = await get(`/tenants/agent-changesets/${id}`);
        expect(shown.data.agent_changeset.ops[0]).toMatchObject({
          kind: "page",
          preview_path: "/pages/about-us",
          before: { title: "О нас" },
          changes: expect.arrayContaining([{ field: "title", before: "О нас", after: "О нас — новое" }]),
        });

        await step(id, "rollback", 200, "rolled_back");
        expect(await pageTitle(token)).toBe("О нас");
      });

      it("home page: change → stage → publish → rollback", async () => {
        const id = await draft([{ method: "PUT", path: "/tenants/home", body: home("Stage hero") }]);

        await step(id, "stage", 200, "staged");
        expect(await heroTitle(stageToken)).toBe("Stage hero");
        expect(await heroTitle(token)).toBe("Live hero");

        await step(id, "publish", 200, "published");
        expect(await heroTitle(token)).toBe("Stage hero");

        await step(id, "rollback", 200, "rolled_back");
        expect(await heroTitle(token)).toBe("Live hero");
      });

      it("product: change → stage (overlay on the stage storefront only) → publish → rollback latest", async () => {
        const id = await draft([
          { method: "POST", path: `/tenants/products/${productId}`, body: { title: "Stage tea" } },
          {
            method: "POST",
            path: `/tenants/products/${productId}/variants/${variantId}`,
            body: { prices: [{ amount: 25, currency_code: "eur" }] },
          },
        ]);

        await step(id, "stage", 200, "staged");
        const onStage = await storeProduct(stageKey);
        expect(onStage.status).toBe(200);
        expect(onStage.data.product.title).toBe("Stage tea");
        expect(onStage.data.product.variants[0].calculated_price.calculated_amount).toBe(25);

        // The live storefront and the live panel never see a staged product op.
        const onMain = await storeProduct(mainKey);
        expect(onMain.data.product.title).toBe("Live tea");
        expect(onMain.data.product.variants[0].calculated_price.calculated_amount).toBe(10);
        expect((await get(`/tenants/products/${productId}`)).data.product.title).toBe("Live tea");

        await step(id, "publish", 200, "published");
        const published = await storeProduct(mainKey);
        expect(published.data.product.title).toBe("Stage tea");
        expect(published.data.product.variants[0].calculated_price.calculated_amount).toBe(25);

        await step("latest", "rollback", 200, "rolled_back");
        const back = await storeProduct(mainKey);
        expect(back.data.product.title).toBe("Live tea");
        expect(back.data.product.variants[0].calculated_price.calculated_amount).toBe(10);
      });

      it("refuses a rollback after the live site changed, shows the drift, and changes nothing", async () => {
        const id = await draft([{ method: "PUT", path: "/tenants/pages/about-us", body: page("Agent title") }]);
        await step(id, "stage", 200);
        await step(id, "publish", 200);

        expect((await call(api.put("/tenants/pages/about-us", page("Owner by hand"), bearer(token)))).status).toBe(200);

        // The card shows the drift before anyone presses «Откатить».
        const card = await get(`/tenants/agent-changesets/${id}`);
        expect(card.data.agent_changeset.drift).toEqual([
          expect.objectContaining({ op_index: 0, now: expect.objectContaining({ title: "Owner by hand" }) }),
        ]);

        const refused = await step(id, "rollback", 409);
        expect(refused.data.type).toBe("drift");
        expect(refused.data.drift).toEqual([
          expect.objectContaining({
            op_index: 0,
            path: "/tenants/pages/about-us",
            before: expect.objectContaining({ title: "О нас" }),
            now: expect.objectContaining({ title: "Owner by hand" }),
          }),
        ]);
        expect(await pageTitle(token)).toBe("Owner by hand");
        expect((await get(`/tenants/agent-changesets/${id}`)).data.agent_changeset.status).toBe("published");
      });

      it("discards a staged changeset and puts the stage site back", async () => {
        const id = await draft([{ method: "PUT", path: "/tenants/pages/about-us", body: page("Never live") }]);
        await step(id, "stage", 200);
        expect(await pageTitle(stageToken)).toBe("Never live");

        await step(id, "discard", 200, "discarded");
        expect(await pageTitle(stageToken)).toBe("О нас");
        await step(id, "publish", 409);
      });

      it("never stores a denied op, whatever the role", async () => {
        const before = (await get("/tenants/agent-changesets")).data.count;
        for (const op of [
          { method: "POST", path: "/tenants/orders/order_1/cancel", body: {} },
          { method: "POST", path: "/tenants/customers", body: { email: "x@y.z" } },
          { method: "POST", path: "/tenants/domains", body: { host: "evil.test" } },
          { method: "PUT", path: "/tenants/payment-settings/manual", body: {} },
          { method: "POST", path: `/tenants/products/${productId}`, body: { status: "draft" } },
        ]) {
          const refused = await post("/tenants/agent-changesets", { source: "telegram", ops: [op] });
          expect({ op, status: refused.status }).toEqual({ op, status: 400 });
          expect(refused.data.type).toBe("op_denied");
        }
        expect((await get("/tenants/agent-changesets")).data.count).toBe(before);
      });

      it("lists changesets newest first with the links to both sites", async () => {
        const first = await draft([{ method: "PUT", path: "/tenants/home", body: home("One") }]);
        const second = await draft([{ method: "PUT", path: "/tenants/home", body: home("Two") }]);
        const listed = await get("/tenants/agent-changesets");
        expect(listed.status).toBe(200);
        expect(listed.data.agent_changesets.slice(0, 2).map((row: { id: string }) => row.id)).toEqual([second, first]);
        expect(listed.data.agent_changesets[0]).toMatchObject({ source: "owner-voice", author_email: OWNER, op_count: 1, preview_path: "/" });
        expect(listed.data.sites).toEqual({ main_url: `https://${MAIN_HOST}`, stage_url: `https://${STAGE_HOST}` });
      });

      it("refuses a changeset made on the stage site itself", async () => {
        const refused = await post(
          "/tenants/agent-changesets",
          { source: "panel", ops: [{ method: "PUT", path: "/tenants/home", body: home("x") }] },
          stageToken,
        );
        expect(refused.status).toBe(400);
        expect(refused.data.type).toBe("stage_site");
      });

      it("says noindex for the stage host only, and keeps the stage site out of hreflang", async () => {
        expect((await api.get(`/storefront/by-host?host=${STAGE_HOST}`)).data.stage).toBe(true);
        expect((await api.get(`/storefront/by-host?host=${MAIN_HOST}`)).data.stage).toBe(false);

        const sites = await api.get("/store/tenant/sites", { headers: { "x-publishable-api-key": mainKey } });
        expect(JSON.stringify(sites.data.sites)).not.toContain(STAGE_HOST);
      });
    });
  },
});
