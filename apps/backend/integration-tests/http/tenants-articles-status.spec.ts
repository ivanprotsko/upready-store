import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(240_000);

/**
 * Seam test for what b18-blog-full added to the journal: publication STATE,
 * rubrics, renaming an address, and the three fields a reader sees under a
 * title. Its own file beside `tenants-articles.spec.ts` for the same reason
 * that one is its own: nothing there is exported and each `describe` callback
 * is its own closure.
 *
 * What is actually at stake here, in the order the cases run:
 *
 * - a `draft` is invisible to a visitor, and a `scheduled` article is invisible
 *   UNTIL its date and visible after it WITHOUT any job having run — the whole
 *   reason `status` replaced the `published` boolean is that a boolean plus a
 *   date needs a cron to agree with itself;
 * - the slug names the ARTICLE, so renaming moves every language row at once;
 *   a rename that split an article into two would be invisible in the panel and
 *   fatal on the site;
 * - the deprecated `published` boolean keeps working, because the panel bundle
 *   deployed before this change is what a shop is running the minute the
 *   backend is updated.
 *
 * Every case creates the rows it reads. The runner restores the database from
 * its post-`beforeAll` snapshot before every test (AGENTS.md, "Verifying Your
 * Work"), so nothing an earlier `it` wrote is on file here.
 */
const PASSWORD = "supersecret";

type Registered = {
  token: string;
  publishableKey: { id: string; token: string };
};

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenants: journal publication state, rubrics and renaming (b18-blog-full)", () => {
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

      /** One call, whole article — what the panel's «Новая статья» screen sends. */
      const createArticle = async (
        owner: Registered,
        payload: Record<string, unknown>,
      ) => {
        const created = await api.post(
          "/tenants/articles",
          { locale: "ru", title: String(payload.slug), body: "текст", ...payload },
          bearer(owner.token),
        );
        expect(created.status).toBe(201);
        return created.data.article;
      };

      const inDays = (days: number) =>
        new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      beforeAll(async () => {
        a = await registerTenant("journal-st-a", "Journal ST A");
        b = await registerTenant("journal-st-b", "Journal ST B");
      });

      it("writes the whole article in one POST, no second call needed", async () => {
        const article = await createArticle(a, {
          slug: "peptidy-vvedenie",
          title: "Пептиды: введение",
          body: "## Что это\n\nКороткий текст.",
          excerpt: "Коротко о пептидах",
          category: "Здоровье",
          author: "Оксана Черкашина",
          tags: ["пептиды", "здоровье"],
          status: "published",
          seo_title: "Пептиды — введение",
        });

        expect(article).toMatchObject({
          slug: "peptidy-vvedenie",
          status: "published",
          published: true,
          category: "Здоровье",
          author: "Оксана Черкашина",
          tags: ["пептиды", "здоровье"],
          seo_title: "Пептиды — введение",
        });
        // The date is stamped on a first publish, not left null (t10 rule).
        expect(article.published_at).toEqual(expect.any(String));
        // Reading time is computed from the body, whole minutes, never 0.
        expect(article.reading_minutes).toBeGreaterThanOrEqual(1);

        const feed = await api.get("/store/tenant/articles", storeKey(a, "ru"));
        expect(feed.status).toBe(200);
        expect(feed.data.articles.map((row: { slug: string }) => row.slug)).toEqual([
          "peptidy-vvedenie",
        ]);
      });

      it("keeps a draft off the storefront and answers 404 for its address", async () => {
        await createArticle(a, { slug: "chernovik", status: "draft" });

        const owner = await api.get("/tenants/articles", bearer(a.token));
        expect(owner.data.articles).toHaveLength(1);
        expect(owner.data.articles[0]).toMatchObject({ status: "draft", published: false });

        const feed = await api.get("/store/tenant/articles", storeKey(a, "ru"));
        expect(feed.data).toMatchObject({ articles: [], count: 0 });

        const direct = await api
          .get("/store/tenant/articles/chernovik", storeKey(a, "ru"))
          .catch((e) => e.response);
        expect(direct.status).toBe(404);
      });

      it("hides a scheduled article until its date and shows it after, with no job run", async () => {
        await createArticle(a, {
          slug: "zavtra",
          status: "scheduled",
          published_at: inDays(2),
        });
        await createArticle(a, {
          slug: "vchera",
          status: "scheduled",
          published_at: inDays(-2),
        });

        // The owner sees both, each with the intent she set.
        const owner = await api.get("/tenants/articles", bearer(a.token));
        const bySlug = Object.fromEntries(
          owner.data.articles.map((row: { slug: string }) => [row.slug, row]),
        );
        expect(bySlug["zavtra"]).toMatchObject({ status: "scheduled", published: false });
        // Already due: the state is still «scheduled», but it IS public — the
        // computed flag is what the panel's badge and the feed both read.
        expect(bySlug["vchera"]).toMatchObject({ status: "scheduled", published: true });

        const feed = await api.get("/store/tenant/articles", storeKey(a, "ru"));
        expect(feed.data.articles.map((row: { slug: string }) => row.slug)).toEqual(["vchera"]);

        const future = await api
          .get("/store/tenant/articles/zavtra", storeKey(a, "ru"))
          .catch((e) => e.response);
        expect(future.status).toBe(404);

        const past = await api.get("/store/tenant/articles/vchera", storeKey(a, "ru"));
        expect(past.status).toBe(200);
      });

      it("refuses a schedule with no date and a published article with no title", async () => {
        const noDate = await api
          .post(
            "/tenants/articles",
            { slug: "bez-daty", locale: "ru", title: "Без даты", status: "scheduled" },
            bearer(a.token),
          )
          .catch((e) => e.response);
        expect(noDate.status).toBe(400);

        await createArticle(a, { slug: "est-statya", status: "draft" });
        const noTitle = await api
          .put(
            "/tenants/articles/est-statya",
            { locale: "ru", title: "   ", body: "текст", status: "published" },
            bearer(a.token),
          )
          .catch((e) => e.response);
        expect(noTitle.status).toBe(400);
      });

      it("renames the address of every language of the article at once", async () => {
        await createArticle(a, { slug: "staryy-adres", locale: "ru", status: "published" });
        await api.post(
          "/tenants/articles",
          { slug: "staryy-adres", locale: "en", title: "Old address", status: "published" },
          bearer(a.token),
        );

        const renamed = await api.put(
          "/tenants/articles/staryy-adres",
          {
            locale: "ru",
            title: "Новый адрес",
            body: "текст",
            slug: "novyy-adres",
            status: "published",
          },
          bearer(a.token),
        );
        expect(renamed.status).toBe(200);
        expect(renamed.data.article.slug).toBe("novyy-adres");
        // BOTH language rows moved — a rename that took only the saved row
        // would leave the English text stranded under the old address.
        expect(renamed.data.renamed_locales).toBe(2);

        const gone = await api
          .get("/tenants/articles/staryy-adres", bearer(a.token))
          .catch((e) => e.response);
        expect(gone.status).toBe(404);

        const moved = await api.get("/tenants/articles/novyy-adres", bearer(a.token));
        expect(moved.status).toBe(200);
        expect(moved.data.articles.map((row: { locale: string }) => row.locale).sort()).toEqual([
          "en",
          "ru",
        ]);

        const onSite = await api.get("/store/tenant/articles/novyy-adres", storeKey(a, "ru"));
        expect(onSite.status).toBe(200);
        const oldOnSite = await api
          .get("/store/tenant/articles/staryy-adres", storeKey(a, "ru"))
          .catch((e) => e.response);
        expect(oldOnSite.status).toBe(404);
      });

      it("refuses a rename onto an address another article of the same shop uses", async () => {
        await createArticle(a, { slug: "pervaya", status: "published" });
        await createArticle(a, { slug: "vtoraya", status: "published" });

        const clash = await api
          .put(
            "/tenants/articles/vtoraya",
            { locale: "ru", title: "Вторая", body: "текст", slug: "pervaya", status: "published" },
            bearer(a.token),
          )
          .catch((e) => e.response);
        expect(clash.status).toBe(400);

        // Nothing moved: the check runs before anything is written.
        const first = await api.get("/tenants/articles/pervaya", bearer(a.token));
        expect(first.data.articles).toHaveLength(1);
        const second = await api.get("/tenants/articles/vtoraya", bearer(a.token));
        expect(second.data.articles).toHaveLength(1);
      });

      it("filters the feed by rubric and answers an empty feed for an unknown one", async () => {
        await createArticle(a, { slug: "zdorovye-1", category: "Здоровье", status: "published" });
        await createArticle(a, { slug: "novosti-1", category: "Новости", status: "published" });
        await createArticle(a, { slug: "bez-rubriki", status: "published" });

        const all = await api.get("/store/tenant/articles", storeKey(a, "ru"));
        expect(all.data.count).toBe(3);

        const health = await api.get(
          "/store/tenant/articles?category=%D0%97%D0%B4%D0%BE%D1%80%D0%BE%D0%B2%D1%8C%D0%B5",
          storeKey(a, "ru"),
        );
        expect(health.data.articles.map((row: { slug: string }) => row.slug)).toEqual([
          "zdorovye-1",
        ]);
        expect(health.data.category).toBe("Здоровье");

        // A stale link must not quietly show «everything» as if it were the rubric.
        const unknown = await api.get("/store/tenant/articles?category=Nope", storeKey(a, "ru"));
        expect(unknown.data).toMatchObject({ articles: [], count: 0 });
      });

      it("lists the owner's whole rubric vocabulary and the visitor's public part", async () => {
        await createArticle(a, { slug: "pub-1", category: "Здоровье", status: "published" });
        await createArticle(a, { slug: "pub-2", category: "Здоровье", status: "published" });
        await createArticle(a, { slug: "dr-1", category: "Черновая", status: "draft" });

        const owner = await api.get("/tenants/article-categories", bearer(a.token));
        expect(owner.status).toBe(200);
        expect(owner.data.categories).toEqual([
          { category: "Здоровье", count: 2 },
          { category: "Черновая", count: 1 },
        ]);

        // A rubric whose only article is a draft leads nowhere, so it is absent.
        const visitor = await api.get("/store/tenant/article-categories", storeKey(a, "ru"));
        expect(visitor.status).toBe(200);
        expect(visitor.data.categories).toEqual([{ category: "Здоровье", count: 2 }]);
      });

      it("suggests up to three related articles, same rubric first, never itself", async () => {
        await createArticle(a, { slug: "glavnaya", category: "Здоровье", status: "published" });
        await createArticle(a, { slug: "rodnaya-1", category: "Здоровье", status: "published" });
        await createArticle(a, { slug: "rodnaya-2", category: "Здоровье", status: "published" });
        await createArticle(a, { slug: "chuzhaya-1", category: "Новости", status: "published" });
        await createArticle(a, { slug: "chuzhaya-2", category: "Новости", status: "published" });
        await createArticle(a, { slug: "chernovoy", category: "Здоровье", status: "draft" });

        const page = await api.get("/store/tenant/articles/glavnaya", storeKey(a, "ru"));
        expect(page.status).toBe(200);
        const slugs = page.data.related.map((row: { slug: string }) => row.slug);

        expect(slugs).toHaveLength(3);
        expect(slugs).not.toContain("glavnaya");
        expect(slugs).not.toContain("chernovoy");
        expect(slugs.slice(0, 2).sort()).toEqual(["rodnaya-1", "rodnaya-2"]);
      });

      it("keeps a neighbour's rubrics and articles out of both answers", async () => {
        await createArticle(a, { slug: "nasha", category: "Наша рубрика", status: "published" });
        await createArticle(b, { slug: "chuzhaya", category: "Чужая рубрика", status: "published" });

        const ourCategories = await api.get("/tenants/article-categories", bearer(a.token));
        expect(ourCategories.data.categories).toEqual([{ category: "Наша рубрика", count: 1 }]);

        const ourFeed = await api.get("/store/tenant/articles", storeKey(a, "ru"));
        expect(ourFeed.data.articles.map((row: { slug: string }) => row.slug)).toEqual(["nasha"]);

        // A neighbour's slug asked by name is the same 404 as one nobody wrote.
        const probe = await api
          .get("/store/tenant/articles/chuzhaya", storeKey(a, "ru"))
          .catch((e) => e.response);
        expect(probe.status).toBe(404);
      });

      it("still understands the boolean the panel deployed before this change sends", async () => {
        // The live panel bundle knows nothing about `status`; the minute the
        // backend is updated it keeps saving with `published: true/false`.
        await createArticle(a, { slug: "staryy-klient", status: "draft" });

        const legacy = await api.put(
          "/tenants/articles/staryy-klient",
          {
            locale: "ru",
            title: "Старый клиент",
            body: "текст",
            published: true,
            published_at: "2026-06-14T00:00:00.000Z",
          },
          bearer(a.token),
        );
        expect(legacy.status).toBe(200);
        expect(legacy.data.article).toMatchObject({
          status: "published",
          published: true,
          published_at: "2026-06-14T00:00:00.000Z",
        });

        const back = await api.put(
          "/tenants/articles/staryy-klient",
          { locale: "ru", title: "Старый клиент", body: "текст", published: false },
          bearer(a.token),
        );
        expect(back.data.article).toMatchObject({ status: "draft", published: false });
      });
    });
  },
});
