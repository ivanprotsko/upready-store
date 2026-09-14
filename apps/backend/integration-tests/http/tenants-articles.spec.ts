import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test for the tenant journal (t10-blog). A sibling of
 * `tenants-pages.spec.ts`, and deliberately its own file with its own copy of
 * the small registration helper: nothing there is exported and each `describe`
 * callback is its own closure.
 *
 * Two seams, failing differently:
 *
 * - `/tenants/articles/**`, scoped by the tenant behind the bearer token. Here
 *   the slug is FREE, unlike a page key, so isolation has a real handle to
 *   smuggle: B asking for A's slug by name must get the same 404 it gets for a
 *   slug nobody wrote.
 * - `/store/tenant/articles/**`, scoped by the storefront's publishable key. A
 *   draft, an unwritten slug and a neighbour's article all answer 404 — the
 *   property a visitor could otherwise probe — and the feed of one shop never
 *   carries another shop's cards.
 *
 * The locale fallback gets its own case because it is what makes a Russian
 * shop readable at all: a `ru`-only article must open for an `en` visitor
 * rather than 404.
 *
 * Every case creates the rows it reads. The runner restores the database from
 * its post-`beforeAll` snapshot before each test (AGENTS.md, "Verifying Your
 * Work"), so nothing an earlier `it` wrote is on file here.
 */
const PASSWORD = "supersecret";

type Registered = {
  token: string;
  publishableKey: { id: string; token: string };
};

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenants: journal articles (/tenants/articles, /store/tenant/articles)", () => {
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const storeKey = (owner: Registered, locale?: string) => ({
        headers: {
          "x-publishable-api-key": owner.publishableKey.token,
          ...(locale && { "x-medusa-locale": locale }),
        },
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
          publishableKey: created.data.tenant.api_key,
        };
      };

      /**
       * Creates one language row of one article and saves its text in a single
       * step, which is what the panel and the import script both do.
       */
      const writeArticle = async (
        owner: Registered,
        slug: string,
        locale: string,
        fields: Record<string, unknown> = {},
      ) => {
        const title = (fields.title as string) ?? slug;
        const created = await api.post(
          "/tenants/articles",
          { slug, locale, title },
          bearer(owner.token),
        );
        expect(created.status).toBe(201);

        const saved = await api.put(
          `/tenants/articles/${slug}`,
          {
            locale,
            title,
            body: "текст",
            published: true,
            published_at: "2026-06-14T00:00:00.000Z",
            ...fields,
          },
          bearer(owner.token),
        );
        expect(saved.status).toBe(200);
        return saved.data.article;
      };

      beforeAll(async () => {
        a = await registerTenant("journal-a", "Journal A");
        b = await registerTenant("journal-b", "Journal B");
      });

      it("rejects the tenant routes without a token", async () => {
        const list = await api.get("/tenants/articles").catch((e) => e.response);
        expect(list.status).toBe(401);

        const write = await api
          .put("/tenants/articles/anything", { title: "X", body: "", published: false })
          .catch((e) => e.response);
        expect(write.status).toBe(401);
      });

      it("starts empty and creates one row per locale of one slug", async () => {
        const empty = await api.get("/tenants/articles", bearer(a.token));
        expect(empty.status).toBe(200);
        expect(empty.data).toMatchObject({ articles: [], count: 0 });

        const ru = await api.post(
          "/tenants/articles",
          { slug: "detoks-i-kortizol", locale: "ru", title: "Детокс и кортизол" },
          bearer(a.token),
        );
        expect(ru.status).toBe(201);
        expect(ru.data.article).toMatchObject({
          slug: "detoks-i-kortizol",
          locale: "ru",
          title: "Детокс и кортизол",
          body: "",
          published: false,
          published_at: null,
          tags: [],
          cover_url: null,
        });

        const en = await api.post(
          "/tenants/articles",
          { slug: "detoks-i-kortizol", locale: "en", title: "Detox and cortisol" },
          bearer(a.token),
        );
        expect(en.status).toBe(201);

        const again = await api
          .post(
            "/tenants/articles",
            { slug: "detoks-i-kortizol", locale: "ru", title: "Дубль" },
            bearer(a.token),
          )
          .catch((e) => e.response);
        expect(again.status).toBe(400);

        const list = await api.get("/tenants/articles", bearer(a.token));
        expect(list.data.count).toBe(2);
        expect(
          [...list.data.articles].map((row: { locale: string }) => row.locale).sort(),
        ).toEqual(["en", "ru"]);
      });

      it("refuses a malformed slug and a PUT to a slug that does not exist", async () => {
        const bad = await api
          .post(
            "/tenants/articles",
            { slug: "Не Слаг", locale: "ru", title: "X" },
            bearer(a.token),
          )
          .catch((e) => e.response);
        expect(bad.status).toBe(400);

        const missing = await api
          .put(
            "/tenants/articles/nikogda-ne-sozdavali",
            { locale: "ru", title: "X", body: "", published: false },
            bearer(a.token),
          )
          .catch((e) => e.response);
        expect(missing.status).toBe(404);
      });

      it("refuses to publish an article without a title", async () => {
        const created = await api.post(
          "/tenants/articles",
          { slug: "detoks-i-kortizol", locale: "ru", title: "Детокс и кортизол" },
          bearer(a.token),
        );
        expect(created.status).toBe(201);

        const blank = await api
          .put(
            "/tenants/articles/detoks-i-kortizol",
            { locale: "ru", title: "   ", body: "текст", published: true },
            bearer(a.token),
          )
          .catch((e) => e.response);
        expect(blank.status).toBe(400);
      });

      it("keeps a draft off the storefront and publishes on demand", async () => {
        const created = await api.post(
          "/tenants/articles",
          { slug: "detoks-i-kortizol", locale: "ru", title: "Детокс и кортизол" },
          bearer(a.token),
        );
        expect(created.status).toBe(201);

        const draft = await api
          .get("/store/tenant/articles/detoks-i-kortizol", storeKey(a, "ru"))
          .catch((e) => e.response);
        expect(draft.status).toBe(404);

        const feedBefore = await api.get("/store/tenant/articles", storeKey(a, "ru"));
        expect(feedBefore.data).toMatchObject({ articles: [], count: 0 });

        const published = await api.put(
          "/tenants/articles/detoks-i-kortizol",
          {
            locale: "ru",
            title: "Детокс и кортизол",
            excerpt: "Почему детокс не работает на фоне стресса.",
            cover_url: "/static/tenants/cover.png",
            body: "> **Кратко**\n\n---\n\n## Почему\n\nТекст статьи.",
            published: true,
            published_at: "2026-06-14T00:00:00.000Z",
            tags: ["детокс", "кортизол"],
            seo_title: "Детокс и кортизол",
            seo_description: "Что мешает очищению организма.",
          },
          bearer(a.token),
        );
        expect(published.status).toBe(200);
        expect(published.data.article).toMatchObject({
          published: true,
          published_at: "2026-06-14T00:00:00.000Z",
          tags: ["детокс", "кортизол"],
          cover_url: "/static/tenants/cover.png",
        });

        const live = await api.get("/store/tenant/articles/detoks-i-kortizol", storeKey(a, "ru"));
        expect(live.status).toBe(200);
        expect(live.data.article).toMatchObject({
          slug: "detoks-i-kortizol",
          locale: "ru",
          title: "Детокс и кортизол",
          published_at: "2026-06-14T00:00:00.000Z",
        });
        expect(live.data.article.body).toContain("## Почему");

        const feed = await api.get("/store/tenant/articles", storeKey(a, "ru"));
        expect(feed.data.count).toBe(1);
        expect(feed.data.articles[0]).toMatchObject({ slug: "detoks-i-kortizol", locale: "ru" });
        // The feed card carries no body: one page of cards must not ship the
        // whole journal's markdown.
        expect(feed.data.articles[0].body).toBeUndefined();
      });

      it("falls back to a published language when the visitor's own is a draft", async () => {
        await writeArticle(a, "detoks-i-kortizol", "ru", { title: "Детокс и кортизол" });
        // The English text exists but stays a draft.
        const en = await api.post(
          "/tenants/articles",
          { slug: "detoks-i-kortizol", locale: "en", title: "Detox and cortisol" },
          bearer(a.token),
        );
        expect(en.status).toBe(201);

        // An English visitor must still read the Russian text rather than a 404.
        const asEnglish = await api.get(
          "/store/tenant/articles/detoks-i-kortizol",
          storeKey(a, "en"),
        );
        expect(asEnglish.status).toBe(200);
        expect(asEnglish.data.article.locale).toBe("ru");

        const feed = await api.get("/store/tenant/articles", storeKey(a, "en"));
        expect(feed.data.count).toBe(1);
      });

      it("shows one card per article when two languages are published", async () => {
        await writeArticle(a, "detoks-i-kortizol", "ru", { title: "Детокс и кортизол" });
        await writeArticle(a, "detoks-i-kortizol", "en", { title: "Detox and cortisol" });

        const ruFeed = await api.get("/store/tenant/articles", storeKey(a, "ru"));
        expect(ruFeed.data.count).toBe(1);
        expect(ruFeed.data.articles[0].locale).toBe("ru");

        const enFeed = await api.get("/store/tenant/articles", storeKey(a, "en"));
        expect(enFeed.data.count).toBe(1);
        expect(enFeed.data.articles[0].locale).toBe("en");
      });

      it("keeps one tenant's journal invisible to another", async () => {
        await writeArticle(a, "detoks-i-kortizol", "ru", { title: "Детокс и кортизол" });

        const bList = await api.get("/tenants/articles", bearer(b.token));
        expect(bList.data).toMatchObject({ articles: [], count: 0 });

        const bReadsA = await api
          .get("/tenants/articles/detoks-i-kortizol", bearer(b.token))
          .catch((e) => e.response);
        expect(bReadsA.status).toBe(404);

        const bWritesA = await api
          .put(
            "/tenants/articles/detoks-i-kortizol",
            { locale: "ru", title: "Захват", body: "", published: false },
            bearer(b.token),
          )
          .catch((e) => e.response);
        expect(bWritesA.status).toBe(404);

        const bDeletesA = await api
          .delete("/tenants/articles/detoks-i-kortizol", bearer(b.token))
          .catch((e) => e.response);
        expect(bDeletesA.status).toBe(404);

        // A's article still stands after every one of those.
        const stillThere = await api.get(
          "/store/tenant/articles/detoks-i-kortizol",
          storeKey(a, "ru"),
        );
        expect(stillThere.status).toBe(200);

        // And B's own storefront neither lists nor serves it.
        const bFeed = await api.get("/store/tenant/articles", storeKey(b, "ru"));
        expect(bFeed.data).toMatchObject({ articles: [], count: 0 });

        const bStore = await api
          .get("/store/tenant/articles/detoks-i-kortizol", storeKey(b, "ru"))
          .catch((e) => e.response);
        expect(bStore.status).toBe(404);
      });

      it("pages the feed and sorts it newest first", async () => {
        await writeArticle(a, "detoks-i-kortizol", "ru", { title: "Детокс и кортизол" });
        await writeArticle(a, "staraya", "ru", { published_at: "2026-01-10T00:00:00.000Z" });
        await writeArticle(a, "svezhaya", "ru", { published_at: "2026-09-01T00:00:00.000Z" });

        const feed = await api.get("/store/tenant/articles", storeKey(a, "ru"));
        expect(feed.data.count).toBe(3);
        expect(feed.data.articles.map((row: { slug: string }) => row.slug)).toEqual([
          "svezhaya",
          "detoks-i-kortizol",
          "staraya",
        ]);

        const firstPage = await api.get("/store/tenant/articles?limit=2", storeKey(a, "ru"));
        expect(firstPage.data.articles.map((row: { slug: string }) => row.slug)).toEqual([
          "svezhaya",
          "detoks-i-kortizol",
        ]);
        expect(firstPage.data).toMatchObject({ count: 3, limit: 2, offset: 0 });

        const secondPage = await api.get(
          "/store/tenant/articles?limit=2&offset=2",
          storeKey(a, "ru"),
        );
        expect(secondPage.data.articles.map((row: { slug: string }) => row.slug)).toEqual([
          "staraya",
        ]);
      });

      it("unpublishes and deletes, per locale and whole", async () => {
        await writeArticle(a, "staraya", "ru");
        await writeArticle(a, "detoks-i-kortizol", "ru", { title: "Детокс и кортизол" });
        await writeArticle(a, "detoks-i-kortizol", "en", { title: "Detox and cortisol" });

        const unpublished = await api.put(
          "/tenants/articles/staraya",
          { locale: "ru", title: "staraya", body: "x", published: false },
          bearer(a.token),
        );
        expect(unpublished.status).toBe(200);

        const gone = await api
          .get("/store/tenant/articles/staraya", storeKey(a, "ru"))
          .catch((e) => e.response);
        expect(gone.status).toBe(404);

        // One language away, the other stays.
        const dropEn = await api.delete(
          "/tenants/articles/detoks-i-kortizol?locale=en",
          bearer(a.token),
        );
        expect(dropEn.status).toBe(200);
        expect(dropEn.data).toMatchObject({ deleted: true, locales: 1 });

        const remaining = await api.get("/tenants/articles/detoks-i-kortizol", bearer(a.token));
        expect(remaining.data.articles.map((row: { locale: string }) => row.locale)).toEqual([
          "ru",
        ]);

        // The whole article away.
        const dropAll = await api.delete("/tenants/articles/detoks-i-kortizol", bearer(a.token));
        expect(dropAll.status).toBe(200);

        const afterDelete = await api
          .get("/tenants/articles/detoks-i-kortizol", bearer(a.token))
          .catch((e) => e.response);
        expect(afterDelete.status).toBe(404);

        const storeAfterDelete = await api
          .get("/store/tenant/articles/detoks-i-kortizol", storeKey(a, "ru"))
          .catch((e) => e.response);
        expect(storeAfterDelete.status).toBe(404);
      });
    });
  },
});
