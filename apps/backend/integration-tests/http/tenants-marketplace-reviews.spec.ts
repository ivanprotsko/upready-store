import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace";
import type MarketplaceModuleService from "../../src/modules/marketplace/service";

jest.setTimeout(240_000);

/**
 * `GET /tenants/marketplaces/:marketplace/reviews` and the draft routes it
 * leans on — «Wildberries → Отзывы» (mp-section-design task-05).
 *
 * NOTHING HERE TALKS TO A MARKETPLACE. The rows are seeded straight into
 * `mp_review` / `mp_question` through the module service, the way the
 * projector would have written them, and no tenant in this suite has a key,
 * so no import can start (Ivan's standing order of 2026-09-16 02:46 WITA).
 *
 * What it proves, each with a request:
 *
 * - the list is ONE shop's reviews and questions of ONE marketplace, with the
 *   counts taken before the filters and the shop without a key told `missing`;
 * - `kind`, `answered` and `rating` narrow it, and sorting by rating puts the
 *   questions last;
 * - a draft saved through the existing `POST …/{reviews|questions}/:id/draft`
 *   is in the list afterwards and leaves `is_answered` alone; the generator
 *   answers text without saving it;
 * - another shop can neither see these rows nor write a draft into them.
 */
process.env.INTEGRATION_ENCRYPTION_KEY ||= "seam-test-encryption-key";

type Registered = {
  token: string;
  tenant: { id: string; handle: string };
};

type Item = { id: string; kind: string; rating: number | null; is_answered: boolean; answer_draft: string | null };

const PASSWORD = "supersecret-owner";

const DAY = 24 * 60 * 60 * 1000;

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenants: the reviews and questions of one marketplace", () => {
      let a: Registered;
      let b: Registered;
      const ids: Record<string, string> = {};

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const failed = (promise: Promise<any>) => promise.catch((error) => error.response);
      const idsOf = (items: Item[]) => items.map((one) => one.id);

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

      const mp = () => getContainer().resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

      const seedReview = async (key: string, tenantId: string, over: Record<string, unknown> = {}) => {
        const created = (await mp().createMpReviews({
          tenant_id: tenantId,
          marketplace: "wb",
          external_id: `fb-${key}`,
          vendor_code: `art-${key}`,
          rating: 5,
          text: `Отзыв ${key}`,
          author: "Покупатель",
          created_at_mp: new Date(Date.now() - DAY),
          is_answered: false,
          source_row_id: `src-${key}`,
          synced_at: new Date(),
          ...over,
        } as never)) as unknown as { id: string };
        ids[key] = created.id;
      };

      const seedQuestion = async (key: string, tenantId: string, over: Record<string, unknown> = {}) => {
        const created = (await mp().createMpQuestions({
          tenant_id: tenantId,
          marketplace: "wb",
          external_id: `q-${key}`,
          vendor_code: `art-${key}`,
          question_text: `Вопрос ${key}`,
          author: "Покупатель",
          created_at_mp: new Date(Date.now() - DAY),
          is_answered: false,
          source_row_id: `src-${key}`,
          synced_at: new Date(),
          ...over,
        } as never)) as unknown as { id: string };
        ids[key] = created.id;
      };

      beforeAll(async () => {
        a = await registerTenant("acme-mp-reviews", "Acme Reviews");
        b = await registerTenant("globex-mp-reviews", "Globex Reviews");
      });

      beforeEach(async () => {
        const now = Date.now();
        // A: three WB reviews (one answered on WB), two WB questions, one Ozon review.
        await seedReview("a-five", a.tenant.id, { created_at_mp: new Date(now - DAY), is_answered: true });
        await seedReview("a-one", a.tenant.id, { rating: 1, text: "Пришло мятым", created_at_mp: new Date(now - 2 * DAY) });
        await seedReview("a-three", a.tenant.id, { rating: 3, created_at_mp: new Date(now - 3 * DAY) });
        await seedQuestion("a-q-open", a.tenant.id, { created_at_mp: new Date(now - 4 * DAY) });
        await seedQuestion("a-q-done", a.tenant.id, { created_at_mp: new Date(now - 5 * DAY), is_answered: true });
        await seedReview("a-ozon", a.tenant.id, { marketplace: "ozon" });
        // B: one WB review of her own.
        await seedReview("b-five", b.tenant.id);
      });

      it("lists one shop's reviews and questions of one marketplace, counts before filters", async () => {
        const res = await api.get("/tenants/marketplaces/wb/reviews?limit=20&offset=0", bearer(a.token));

        expect(res.status).toBe(200);
        expect(res.data.count).toBe(5);
        expect(idsOf(res.data.items)).toEqual([
          ids["a-five"],
          ids["a-one"],
          ids["a-three"],
          ids["a-q-open"],
          ids["a-q-done"],
        ]);
        expect(res.data.items.map((one: Item) => one.kind)).toEqual([
          "reviews",
          "reviews",
          "reviews",
          "questions",
          "questions",
        ]);
        expect(res.data.counts).toEqual({
          reviews: { total: 3, unanswered: 2 },
          questions: { total: 2, unanswered: 1 },
        });
        expect(res.data.sending).toMatchObject({ enabled: false });
        expect(res.data.sending.reason).toContain("Wildberries");
        expect(res.data.generator).toMatchObject({ available: false, remote: false });
        // No key saved in this suite: the screen must say so rather than read as «отзывов нет».
        expect(res.data.connection).toMatchObject({
          marketplace: "wb",
          connected: false,
          last_run: null,
          last_success_at: null,
          notice: "missing",
        });
      });

      it("narrows by kind, answer and rating, keeps the counts, and sorts the questions last", async () => {
        const questions = await api.get("/tenants/marketplaces/wb/reviews?kind=questions", bearer(a.token));
        expect(idsOf(questions.data.items)).toEqual([ids["a-q-open"], ids["a-q-done"]]);
        expect(questions.data.counts.reviews.total).toBe(3);

        const open = await api.get("/tenants/marketplaces/wb/reviews?answered=no", bearer(a.token));
        expect(open.data.count).toBe(3);
        expect(open.data.items.every((one: Item) => !one.is_answered)).toBe(true);

        const bad = await api.get("/tenants/marketplaces/wb/reviews?rating=1,3", bearer(a.token));
        expect(idsOf(bad.data.items)).toEqual([ids["a-one"], ids["a-three"]]);

        const byRating = await api.get("/tenants/marketplaces/wb/reviews?order=rating", bearer(a.token));
        expect(byRating.data.items.map((one: Item) => one.rating)).toEqual([1, 3, 5, null, null]);

        const page = await api.get("/tenants/marketplaces/wb/reviews?limit=2&offset=2", bearer(a.token));
        expect(page.data).toMatchObject({ count: 5, limit: 2, offset: 2 });
        expect(idsOf(page.data.items)).toEqual([ids["a-three"], ids["a-q-open"]]);

        const search = await api.get(
          `/tenants/marketplaces/wb/reviews?q=${encodeURIComponent("мятым")}`,
          bearer(a.token),
        );
        expect(idsOf(search.data.items)).toEqual([ids["a-one"]]);
      });

      it("saves a draft through the existing route, shows it in the list, and leaves «без ответа» alone", async () => {
        const saved = await api.post(
          `/tenants/marketplaces/reviews/${ids["a-one"]}/draft`,
          { answer_draft: "  Спасибо, разберёмся.  " },
          bearer(a.token),
        );
        expect(saved.status).toBe(200);
        expect(saved.data.item).toMatchObject({ answer_draft: "Спасибо, разберёмся.", is_answered: false });
        expect(saved.data.item.answer_draft_at).toEqual(expect.any(String));

        const question = await api.post(
          `/tenants/marketplaces/questions/${ids["a-q-open"]}/draft`,
          { answer_draft: "Да, есть." },
          bearer(a.token),
        );
        expect(question.status).toBe(200);

        const list = await api.get("/tenants/marketplaces/wb/reviews?answered=no", bearer(a.token));
        const byId = new Map<string, Item>(list.data.items.map((one: Item) => [one.id, one]));
        expect(byId.get(ids["a-one"])).toMatchObject({ answer_draft: "Спасибо, разберёмся.", is_answered: false });
        expect(byId.get(ids["a-q-open"])).toMatchObject({ answer_draft: "Да, есть.", is_answered: false });
        expect(list.data.counts.reviews.unanswered).toBe(2);

        const cleared = await api.post(
          `/tenants/marketplaces/reviews/${ids["a-one"]}/draft`,
          { answer_draft: "" },
          bearer(a.token),
        );
        expect(cleared.data.item).toMatchObject({ answer_draft: null, answer_draft_at: null });
      });

      it("generates a draft only when the generator is on, and does not save it", async () => {
        const off = await failed(
          api.post(`/tenants/marketplaces/reviews/${ids["a-one"]}/suggest`, {}, bearer(a.token)),
        );
        expect(off.status).toBe(400);
        expect(JSON.stringify(off.data)).toContain("MP_DRAFT_GENERATOR");

        process.env.MP_DRAFT_GENERATOR = "template";
        try {
          const on = await api.post(`/tenants/marketplaces/reviews/${ids["a-one"]}/suggest`, {}, bearer(a.token));
          expect(on.status).toBe(200);
          expect(on.data.draft).toContain("Здравствуйте");

          const list = await api.get("/tenants/marketplaces/wb/reviews?rating=1", bearer(a.token));
          expect(list.data.generator.available).toBe(true);
          expect(list.data.items[0]).toMatchObject({ id: ids["a-one"], answer_draft: null });
        } finally {
          delete process.env.MP_DRAFT_GENERATOR;
        }
      });

      it("never shows tenant B anything of tenant A, nor lets her write a draft into it", async () => {
        const list = await api.get("/tenants/marketplaces/wb/reviews", bearer(b.token));
        expect(list.status).toBe(200);
        expect(idsOf(list.data.items)).toEqual([ids["b-five"]]);
        expect(list.data.counts.questions.total).toBe(0);

        const foreign = await failed(
          api.post(`/tenants/marketplaces/reviews/${ids["a-one"]}/draft`, { answer_draft: "чужой" }, bearer(b.token)),
        );
        expect(foreign.status).toBe(404);

        const own = await api.get("/tenants/marketplaces/wb/reviews?rating=1", bearer(a.token));
        expect(own.data.items[0].answer_draft).toBeNull();
      });

      it("answers a broken date filter with 400 and an unknown marketplace with 404", async () => {
        const broken = await failed(
          api.get("/tenants/marketplaces/wb/reviews?created_at=%7Bnot-json", bearer(a.token)),
        );
        expect(broken.status).toBe(400);

        const unknown = await failed(api.get("/tenants/marketplaces/avito/reviews", bearer(a.token)));
        expect(unknown.status).toBe(404);

        const ozon = await api.get("/tenants/marketplaces/ozon/reviews", bearer(a.token));
        expect(idsOf(ozon.data.items)).toEqual([ids["a-ozon"]]);
      });
    });
  },
});
