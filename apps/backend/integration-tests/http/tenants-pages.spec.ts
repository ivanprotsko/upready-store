import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test for tenant-panel wave 2, piece 7 (content pages). A sibling of
 * `tenants.spec.ts` rather than an extension of it: eight pieces of the same
 * wave touch that file's `describe` block in parallel worktrees, so this one
 * keeps its own copy of the small tenant-registration helper (nothing there is
 * exported; each `describe` callback is its own closure).
 *
 * Two seams are under test, and they fail differently:
 *
 * - `/tenants/pages/**`, scoped by the tenant behind the bearer token. Tenant B
 *   asking for its own list must never see a row tenant A wrote, and there is no
 *   id in these routes to smuggle one in with — the key is one of five fixed
 *   words, so isolation here means B's list comes back as five blanks after A
 *   has filled all five.
 * - `/store/tenant/pages/**`, scoped by the storefront's publishable key. A
 *   draft, an unwritten page and a NEIGHBOUR's page all answer 404, which is the
 *   property a visitor could otherwise probe.
 */
const PASSWORD = "supersecret-owner";

type Registered = {
  token: string;
  publishableKey: { id: string; token: string };
};

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenants: content pages (/tenants/pages, /store/tenant/pages)", () => {
      let a: Registered;
      let b: Registered;

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
      const storeKey = (owner: Registered) => ({
        headers: { "x-publishable-api-key": owner.publishableKey.token },
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

      beforeAll(async () => {
        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
      });

      it("rejects the tenant routes without a token", async () => {
        const list = await api.get("/tenants/pages").catch((e) => e.response);
        expect(list.status).toBe(401);

        const write = await api
          .put("/tenants/pages/contacts", { title: "X", body: "", published: false })
          .catch((e) => e.response);
        expect(write.status).toBe(401);
      });

      it("lists all five sections as blanks before anything is saved", async () => {
        const list = await api.get("/tenants/pages", bearer(a.token));
        expect(list.status).toBe(200);
        expect(list.data.pages.map((page: { key: string }) => page.key)).toEqual([
          "contacts",
          "legal",
          "about",
          "privacy",
          "offer",
        ]);
        expect(list.data.pages.every((page: { id: string | null }) => page.id === null)).toBe(true);
        expect(list.data.pages[0]).toMatchObject({
          key: "contacts",
          locale: "en",
          title: "",
          body: "",
          published: false,
        });
      });

      it("404s an unknown key on both read and write", async () => {
        const read = await api.get("/tenants/pages/shipping", bearer(a.token)).catch((e) => e.response);
        expect(read.status).toBe(404);

        const write = await api
          .put("/tenants/pages/shipping", { title: "X", body: "", published: false }, bearer(a.token))
          .catch((e) => e.response);
        expect(write.status).toBe(404);
      });

      it("400s an unknown body field and a published page without a title", async () => {
        const extra = await api
          .put(
            "/tenants/pages/contacts",
            { title: "X", body: "", published: false, tenant_id: "ten_evil" },
            bearer(a.token),
          )
          .catch((e) => e.response);
        expect(extra.status).toBe(400);

        const nameless = await api
          .put("/tenants/pages/contacts", { title: "  ", body: "Text", published: true }, bearer(a.token))
          .catch((e) => e.response);
        expect(nameless.status).toBe(400);
      });

      it("upserts a page for A: PUT, then GET list and GET detail show it, B's list stays empty", async () => {
        const saved = await api.put(
          "/tenants/pages/contacts",
          { title: "Contact Acme", body: "# Visit us\n\n10 Market Street.", published: true },
          bearer(a.token),
        );
        expect(saved.status).toBe(200);
        expect(saved.data.page).toMatchObject({
          key: "contacts",
          locale: "en",
          title: "Contact Acme",
          published: true,
        });
        expect(saved.data.page.id).toEqual(expect.any(String));

        // A second PUT on the same key updates the same row rather than adding one.
        const updated = await api.put(
          "/tenants/pages/contacts",
          { title: "Contact Acme", body: "# Visit us\n\n11 Market Street.", published: true },
          bearer(a.token),
        );
        expect(updated.status).toBe(200);
        expect(updated.data.page.id).toBe(saved.data.page.id);
        expect(updated.data.page.body).toContain("11 Market Street");

        const list = await api.get("/tenants/pages", bearer(a.token));
        expect(list.data.pages).toHaveLength(5);
        expect(list.data.pages.find((page: { key: string }) => page.key === "contacts")).toMatchObject({
          id: saved.data.page.id,
          title: "Contact Acme",
          published: true,
        });

        const detail = await api.get("/tenants/pages/contacts", bearer(a.token));
        expect(detail.status).toBe(200);
        expect(detail.data.page.title).toBe("Contact Acme");

        // Isolation: B's own list is untouched by A's write — five blanks.
        const listB = await api.get("/tenants/pages", bearer(b.token));
        expect(listB.data.pages).toHaveLength(5);
        expect(listB.data.pages.every((page: { id: string | null }) => page.id === null)).toBe(true);

        const detailB = await api.get("/tenants/pages/contacts", bearer(b.token));
        expect(detailB.status).toBe(200);
        expect(detailB.data.page).toMatchObject({ id: null, title: "", published: false });
      });

      it("serves a published page to its own storefront key and 404s it to the neighbour's", async () => {
        await api.put(
          "/tenants/pages/contacts",
          { title: "Contact Acme", body: "10 Market Street.", published: true },
          bearer(a.token),
        );

        const list = await api.get("/store/tenant/pages", storeKey(a));
        expect(list.status).toBe(200);
        expect(list.data.pages).toEqual([{ key: "contacts", title: "Contact Acme", locale: "en" }]);

        const page = await api.get("/store/tenant/pages/contacts", storeKey(a));
        expect(page.status).toBe(200);
        expect(page.data.page).toMatchObject({
          key: "contacts",
          title: "Contact Acme",
          body: "10 Market Street.",
          published: true,
        });

        // The neighbour's storefront key never reaches A's page.
        const listB = await api.get("/store/tenant/pages", storeKey(b));
        expect(listB.status).toBe(200);
        expect(listB.data.pages).toEqual([]);

        const pageB = await api
          .get("/store/tenant/pages/contacts", storeKey(b))
          .catch((e) => e.response);
        expect(pageB.status).toBe(404);
      });

      it("serves the visitor's locale on the storefront and falls back to en, then to any locale", async () => {
        // Cherkashina case (2026-09-12): a shop whose default language is ru writes ru and en rows;
        // the storefront sends x-medusa-locale (and repeats it as ?locale= for its cache key).
        await api.put(
          "/tenants/pages/about",
          { title: "About Acme", body: "English body.", published: true },
          bearer(a.token),
        );
        await api.put(
          "/tenants/pages/about",
          { title: "Об Acme", body: "Русский текст.", published: true, locale: "ru" },
          bearer(a.token),
        );
        await api.put(
          "/tenants/pages/offer",
          { title: "Оферта", body: "Только по-русски.", published: true, locale: "ru" },
          bearer(a.token),
        );
        const withHeader = { headers: { ...storeKey(a).headers, "x-medusa-locale": "ru" } };
        const ru = await api.get("/store/tenant/pages/about", withHeader);
        expect(ru.status).toBe(200);
        expect(ru.data.page).toMatchObject({ key: "about", locale: "ru", title: "Об Acme" });
        const viaQuery = await api.get("/store/tenant/pages/about?locale=ru", storeKey(a));
        expect(viaQuery.data.page.locale).toBe("ru");
        const en = await api.get("/store/tenant/pages/about", storeKey(a));
        expect(en.data.page).toMatchObject({ locale: "en", title: "About Acme" });
        // an unknown language falls back to en; a key that only exists in ru answers ru for everyone
        const de = await api.get("/store/tenant/pages/about?locale=de", storeKey(a));
        expect(de.data.page.locale).toBe("en");
        const offerDe = await api.get("/store/tenant/pages/offer?locale=de", storeKey(a));
        expect(offerDe.data.page).toMatchObject({ key: "offer", locale: "ru", title: "Оферта" });
        // the list follows the same rule, one entry per key, in TENANT_PAGE_KEYS order
        const listRu = await api.get("/store/tenant/pages?locale=ru", storeKey(a));
        expect(listRu.data.pages).toEqual(
          expect.arrayContaining([
            { key: "about", title: "Об Acme", locale: "ru" },
            { key: "offer", title: "Оферта", locale: "ru" },
          ]),
        );
        const listEn = await api.get("/store/tenant/pages", storeKey(a));
        expect(listEn.data.pages).toEqual(
          expect.arrayContaining([
            { key: "about", title: "About Acme", locale: "en" },
            { key: "offer", title: "Оферта", locale: "ru" },
          ]),
        );
        // a malformed locale is «no preference» on a public route, never a 400
        const junk = await api.get("/store/tenant/pages/about?locale=%3Cscript%3E", storeKey(a));
        expect(junk.status).toBe(200);
        expect(junk.data.page.locale).toBe("en");
      });

      it("hides a draft from the storefront and shows it again when published", async () => {
        await api.put(
          "/tenants/pages/legal",
          { title: "Legal details", body: "Acme Ltd.", published: false },
          bearer(a.token),
        );

        const draft = await api.get("/store/tenant/pages/legal", storeKey(a)).catch((e) => e.response);
        expect(draft.status).toBe(404);

        const list = await api.get("/store/tenant/pages", storeKey(a));
        expect(list.data.pages.map((page: { key: string }) => page.key)).not.toContain("legal");

        // The tenant still sees its own draft.
        const own = await api.get("/tenants/pages/legal", bearer(a.token));
        expect(own.data.page).toMatchObject({ title: "Legal details", published: false });

        await api.put(
          "/tenants/pages/legal",
          { title: "Legal details", body: "Acme Ltd.", published: true },
          bearer(a.token),
        );

        const published = await api.get("/store/tenant/pages/legal", storeKey(a));
        expect(published.status).toBe(200);
        expect(published.data.page.title).toBe("Legal details");
      });

      it("404s an unknown key and an unwritten page on the storefront, the same as a draft", async () => {
        const unknown = await api
          .get("/store/tenant/pages/shipping", storeKey(a))
          .catch((e) => e.response);
        expect(unknown.status).toBe(404);

        const unwritten = await api
          .get("/store/tenant/pages/offer", storeKey(a))
          .catch((e) => e.response);
        expect(unwritten.status).toBe(404);
      });

      // t05-page-keys: the closed five-key enum became a free slug per tenant.
      describe("custom pages (t05-page-keys)", () => {
        it("400s an invalid slug and a reserved slug on create", async () => {
          const tooShort = await api
            .post("/tenants/pages", { slug: "a", title: "X" }, bearer(a.token))
            .catch((e) => e.response);
          expect(tooShort.status).toBe(400);

          const upper = await api
            .post("/tenants/pages", { slug: "Delivery", title: "X" }, bearer(a.token))
            .catch((e) => e.response);
          expect(upper.status).toBe(400);

          const underscore = await api
            .post("/tenants/pages", { slug: "de_livery", title: "X" }, bearer(a.token))
            .catch((e) => e.response);
          expect(underscore.status).toBe(400);

          const reserved = await api
            .post("/tenants/pages", { slug: "contacts", title: "X" }, bearer(a.token))
            .catch((e) => e.response);
          expect(reserved.status).toBe(400);
        });

        it("creates, edits, publishes, links from the footer, reorders and deletes a custom slug — round trip", async () => {
          const created = await api.post(
            "/tenants/pages",
            { slug: "delivery", title: "Доставка" },
            bearer(a.token),
          );
          expect(created.status).toBe(201);
          expect(created.data.page).toMatchObject({
            key: "delivery",
            title: "Доставка",
            published: false,
            in_footer: false,
            reserved: false,
          });
          expect(created.data.page.id).toEqual(expect.any(String));

          // It shows up in the panel's list, appended after the reserved five.
          const list = await api.get("/tenants/pages", bearer(a.token));
          expect(list.data.pages.map((page: { key: string }) => page.key)).toEqual([
            "contacts",
            "legal",
            "about",
            "privacy",
            "offer",
            "delivery",
          ]);

          // A second create on the same slug is INVALID_DATA, not a silent overwrite.
          const duplicate = await api
            .post("/tenants/pages", { slug: "delivery", title: "Ещё раз" }, bearer(a.token))
            .catch((e) => e.response);
          expect(duplicate.status).toBe(400);

          // Publish it and turn on the footer link.
          const published = await api.put(
            "/tenants/pages/delivery",
            {
              title: "Доставка",
              body: "# Доставка\n\nПо всей стране за 3-5 дней.",
              published: true,
              in_footer: true,
            },
            bearer(a.token),
          );
          expect(published.status).toBe(200);
          expect(published.data.page).toMatchObject({
            key: "delivery",
            published: true,
            in_footer: true,
          });

          // It is now on the storefront, own tenant only.
          const storefrontPage = await api.get("/store/tenant/pages/delivery", storeKey(a));
          expect(storefrontPage.status).toBe(200);
          expect(storefrontPage.data.page).toMatchObject({
            key: "delivery",
            title: "Доставка",
            published: true,
          });
          const storefrontListA = await api.get("/store/tenant/pages", storeKey(a));
          expect(storefrontListA.data.pages).toEqual(
            expect.arrayContaining([{ key: "delivery", title: "Доставка", locale: "en" }]),
          );

          // The neighbour tenant sees neither the page nor the slug.
          const storefrontPageB = await api
            .get("/store/tenant/pages/delivery", storeKey(b))
            .catch((e) => e.response);
          expect(storefrontPageB.status).toBe(404);
          const storefrontListB = await api.get("/store/tenant/pages", storeKey(b));
          expect(
            storefrontListB.data.pages.map((page: { key: string }) => page.key),
          ).not.toContain("delivery");
          const panelListB = await api.get("/tenants/pages", bearer(b.token));
          expect(
            panelListB.data.pages.map((page: { key: string }) => page.key),
          ).not.toContain("delivery");

          // Reorder against a reserved footer entry: add a second custom page,
          // put both in the footer explicitly ordered, then swap them.
          await api.post("/tenants/pages", { slug: "faq", title: "Вопросы и ответы" }, bearer(a.token));
          await api.put(
            "/tenants/pages/faq",
            { title: "Вопросы и ответы", body: "…", published: true, in_footer: true, footer_order: 10 },
            bearer(a.token),
          );
          await api.put(
            "/tenants/pages/delivery",
            {
              title: "Доставка",
              body: "# Доставка\n\nПо всей стране за 3-5 дней.",
              published: true,
              in_footer: true,
              footer_order: 20,
            },
            bearer(a.token),
          );
          const orderedFooter = await api.get("/store/tenant/pages", storeKey(a));
          const positions = orderedFooter.data.pages
            .map((page: { key: string }, index: number) => [page.key, index])
            .filter(([key]: [string]) => key === "faq" || key === "delivery");
          expect(positions).toEqual([
            ["faq", positions[0][1]],
            ["delivery", positions[1][1]],
          ]);
          expect(positions[0][1]).toBeLessThan(positions[1][1]);

          // Delete: removed from the panel list and 404s everywhere else.
          const deleted = await api.delete("/tenants/pages/delivery", bearer(a.token));
          expect(deleted.status).toBe(200);
          expect(deleted.data).toMatchObject({ id: "delivery", deleted: true });

          const afterDelete = await api
            .get("/tenants/pages/delivery", bearer(a.token))
            .catch((e) => e.response);
          expect(afterDelete.status).toBe(404);

          const afterDeleteStorefront = await api
            .get("/store/tenant/pages/delivery", storeKey(a))
            .catch((e) => e.response);
          expect(afterDeleteStorefront.status).toBe(404);
        });

        it("keeps a reserved key working as before: cannot be deleted, upserts without in_footer default to on", async () => {
          const deleteReserved = await api
            .delete("/tenants/pages/about", bearer(a.token))
            .catch((e) => e.response);
          expect(deleteReserved.status).toBe(400);

          // A PUT that never mentions in_footer (the old contract shape) still
          // defaults a fresh reserved row to "on", same as before this task.
          const legacyShapePut = await api.put(
            "/tenants/pages/privacy",
            { title: "Privacy", body: "Text.", published: true },
            bearer(a.token),
          );
          expect(legacyShapePut.status).toBe(200);
          expect(legacyShapePut.data.page.in_footer).toBe(true);
        });
      });
    });
  },
});
