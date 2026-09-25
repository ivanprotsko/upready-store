import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import type { IAuthModuleService } from "@medusajs/framework/types";

import { OKSANA_3TIER_PRICING } from "../../src/modules/platform-pricing/seed/oksana-3tier";

jest.setTimeout(180_000);

/**
 * The platform pricing page's HTTP seams (t-2026-09-25-08): the staff write
 * `POST /admin/platform-pricing`, its read, and the public
 * `GET /platform/pricing` the storefront's `/pricing` fetches with no key.
 * Runner facts as in `admin-tenants.spec.ts`: `DB_HOST=localhost`, a free
 * `PORT`, and a database restored after `beforeAll` before every test, so each
 * test writes the page it reads.
 */
const PASSWORD = "supersecret";

const page = () => JSON.parse(JSON.stringify(OKSANA_3TIER_PRICING));

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("platform pricing page", () => {
      let adminHeaders: { headers: Record<string, string> };

      beforeAll(async () => {
        const container = getContainer();
        const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);

        const email = "pricing-staff@platform.test";
        const registered = await authModuleService.register("emailpass", {
          body: { email, password: PASSWORD },
        });
        if (!registered.success || !registered.authIdentity) {
          throw new Error(`Could not register the staff auth identity: ${JSON.stringify(registered)}`);
        }
        await createUserAccountWorkflow(container).run({
          input: {
            authIdentityId: registered.authIdentity.id,
            userData: { email, first_name: "Pricing", last_name: "Staff" },
          },
        });

        const login = await api.post("/auth/user/emailpass", { email, password: PASSWORD });
        expect(login.status).toBe(200);
        adminHeaders = { headers: { authorization: `Bearer ${login.data.token}` } };
      });

      it("refuses the admin read and write without a staff session (401)", async () => {
        const write = await api
          .post("/admin/platform-pricing", { pricing: page(), revision: null })
          .catch((error) => error.response);
        expect(write.status).toBe(401);

        const read = await api.get("/admin/platform-pricing").catch((error) => error.response);
        expect(read.status).toBe(401);
      });

      it("answers 400 naming the field when the page does not match the schema", async () => {
        const noName = page();
        delete noName.tiers[0].name;
        const missing = await api
          .post("/admin/platform-pricing", { pricing: noName, revision: null }, adminHeaders)
          .catch((error) => error.response);
        expect(missing.status).toBe(400);
        expect(missing.data.message).toContain("pricing, tiers, 0, name");

        const noValue = page();
        delete noValue.sections[1].rows[2].values.scale;
        const hole = await api
          .post("/admin/platform-pricing", { pricing: noValue, revision: null }, adminHeaders)
          .catch((error) => error.response);
        expect(hole.status).toBe(400);
        expect(hole.data.message).toContain('sections.1.rows.2.values.scale: no value for tier "scale"');

        const noTrial = page();
        noTrial.tiers[2].button.action = { type: "card_trial" };
        const trial = await api
          .post("/admin/platform-pricing", { pricing: noTrial, revision: null }, adminHeaders)
          .catch((error) => error.response);
        expect(trial.status).toBe(400);
        expect(trial.data.message).toContain("tiers, 2, button, action");

        const script = page();
        script.tiers[1].button.action = { type: "link", href: "javascript:alert(1)" };
        const unsafe = await api
          .post("/admin/platform-pricing", { pricing: script, revision: null }, adminHeaders)
          .catch((error) => error.response);
        expect(unsafe.status).toBe(400);
        expect(unsafe.data.message).toContain("tiers.1.button.action.href");
      });

      it("serves the saved page publicly, with no key and a short cache", async () => {
        const before = await api.get("/platform/pricing").catch((error) => error.response);
        expect(before.status).toBe(404);

        const saved = await api.post("/admin/platform-pricing", { pricing: page(), revision: null }, adminHeaders);
        expect(saved.status).toBe(200);
        expect(saved.data.revision).toBe(1);

        const pub = await api.get("/platform/pricing");
        expect(pub.status).toBe(200);
        expect(pub.headers["cache-control"]).toBe("public, max-age=15");
        expect(pub.data.revision).toBe(1);
        expect(pub.data.pricing).toEqual(OKSANA_3TIER_PRICING);
        expect(pub.data.pricing.tiers.map((t: { name: string }) => t.name)).toEqual([
          "Старт",
          "Рост",
          "Масштаб",
          "Глобализация",
        ]);

        const admin = await api.get("/admin/platform-pricing", adminHeaders);
        expect(admin.status).toBe(200);
        expect(admin.data.pricing).toEqual(OKSANA_3TIER_PRICING);
      });

      it("saves a new button action and refuses a save over a newer revision (409)", async () => {
        await api.post("/admin/platform-pricing", { pricing: page(), revision: null }, adminHeaders);

        const edited = page();
        edited.tiers[0].button = { label: "Создать магазин", style: "solid", action: { type: "onboarding_free" } };
        const second = await api.post("/admin/platform-pricing", { pricing: edited, revision: 1 }, adminHeaders);
        expect(second.status).toBe(200);
        expect(second.data.revision).toBe(2);

        const pub = await api.get("/platform/pricing");
        expect(pub.data.pricing.tiers[0].button).toEqual({
          label: "Создать магазин",
          style: "solid",
          action: { type: "onboarding_free" },
        });

        const stale = await api
          .post("/admin/platform-pricing", { pricing: page(), revision: 1 }, adminHeaders)
          .catch((error) => error.response);
        expect(stale.status).toBe(409);
        expect(stale.data.message).toContain("changed since it was loaded (revision 2, the editor had 1)");

        const recreate = await api
          .post("/admin/platform-pricing", { pricing: page(), revision: null }, adminHeaders)
          .catch((error) => error.response);
        expect(recreate.status).toBe(409);
      });
    });
  },
});
