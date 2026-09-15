import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test for t12-legal-requisites. Own file, the same reason
 * `tenants-pages.spec.ts` is not folded into `tenants.spec.ts`: it keeps its
 * own copy of the small tenant-registration helper rather than sharing a
 * `describe` block other worktrees touch in parallel.
 *
 * Every `it` here is self-contained: `medusaIntegrationTestRunner` restores
 * the database to its post-`beforeAll` snapshot before EACH test
 * (AGENTS.md's own note on the three integration-suite catches), so a tenant
 * registered in `beforeAll` survives into every test, but anything a PREVIOUS
 * `it` wrote — a saved requisites row, a published page — does not.
 *
 * Four seams, per the step plan's own acceptance list and b02's rule on top
 * of it (an empty requisite is never SHOWN to the buyer — the block carrying
 * it is hidden and the panel says so):
 *
 * - A page with every token filled renders no braces.
 * - A page with one field missing renders no braces either: exactly the block
 *   that carried it is gone, everything else is untouched.
 * - `GET /tenants/requisites` names the pages losing blocks and how many
 *   (`hidden_blocks`), which is the only place the owner can learn it.
 * - A second tenant's requisites never leak into the first tenant's page —
 *   scoped the same way `/tenants/pages` already is, by the bearer token for
 *   writes and the publishable key for the storefront read.
 */
const PASSWORD = "supersecret";

type Registered = {
  token: string;
  publishableKey: { id: string; token: string };
};

/**
 * One token per BLOCK, the shape a real legal page has (the live
 * `/ru/pages/contacts` is a heading, a table of requisites and a list of
 * contact methods): b02 hides the smallest block that carries a blank
 * requisite, so a fixture with all sixteen in one sentence could only ever
 * show "the whole page went".
 */
const BODY_WITH_TOKENS = [
  "## Продавец",
  "",
  "| Поле | Значение |",
  "|---|---|",
  "| Продавец | {{ФИО_ИП}} |",
  "| ИНН | {{ИНН}} |",
  "| ОГРНИП | {{ОГРНИП}} |",
  "| Адрес | {{ЮР_АДРЕС}} |",
  "| Режим работы | 09:00–21:00 МСК |",
  "",
  "## Как с нами связаться",
  "",
  "- Возврат: {{АДРЕС_ВОЗВРАТА}}",
  "- Телефон: {{ТЕЛЕФОН}}",
  "- Почта: {{EMAIL}}",
  "- Персональные данные: {{EMAIL_ДПО}}",
  "- Telegram: [t.me/example](https://t.me/example)",
  "",
  "Доставка: {{СПОСОБЫ_ДОСТАВКИ}}.",
  "",
  "Действует с {{ДАТА_ВСТУПЛЕНИЯ}}, редакция {{ДАТА_РЕДАКЦИИ}}, документ от {{ДАТА_ДОКУМЕНТА}}.",
  "",
  "РКН {{РКН_РЕГ_НОМЕР}} от {{ДАТА_УВЕДОМЛЕНИЯ_РКН}}.",
  "",
  "Сайт {{ДОМЕН_САЙТА}}, рассылки {{ССЫЛКА_УПРАВЛЕНИЯ_РАССЫЛКАМИ}}.",
  "",
  "Возврат товара — в течение 7 дней (ЗоЗПП ст. 26.1).",
].join("\n");

const FULL_REQUISITES = {
  legal_name: "ИП Черкашина Оксана Ивановна",
  inn: "524900658999",
  ogrn: "309524933000032",
  legal_address: "г. Элиста, ул. Ленина, 1",
  return_address: "СДЭК, Элиста, Ленина 1",
  phone: "+7 (911) 718-01-23",
  phone_confirmed: true,
  email: "shop@cherkashino.example",
  dpo_email: "dpo@cherkashino.example",
  delivery_methods: "СДЭК, Почта России",
  effective_date: "01.09.2026",
  revision_date: "01.09.2026",
  document_date: "01.09.2026",
  rkn_notice_date: "01.09.2026",
  rkn_reg_number: "77-12-345678",
  newsletter_management_url: "https://example.com/unsubscribe",
};

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenants: legal requisites (/tenants/requisites, /store/tenant/pages)", () => {
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

      const publishOfferPage = async (owner: Registered, body: string) => {
        const put = await api.put(
          "/tenants/pages/offer",
          { title: "Публичная оферта", body, published: true },
          bearer(owner.token),
        );
        expect(put.status).toBe(200);
      };

      // `beforeAll` runs before the FIRST test and its result is the snapshot
      // every later test resets to (see the module doc above) — a and b exist
      // in every `it` below, but nothing either of them saves does.
      beforeAll(async () => {
        a = await registerTenant("t12-cherkashino", "Cherkashino");
        b = await registerTenant("t12-neighbour", "Neighbour");
      });

      it("rejects /tenants/requisites without a token", async () => {
        const get = await api.get("/tenants/requisites").catch((e) => e.response);
        expect(get.status).toBe(401);
      });

      it("GET creates the row on first read, blank, with every stored token missing", async () => {
        const get = await api.get("/tenants/requisites", bearer(b.token));
        expect(get.status).toBe(200);
        expect(get.data.requisites.inn).toBeNull();
        // ДОМЕН_САЙТА is not among these 15: it always resolves from the
        // tenant's own technical subdomain, with no requisites saved at all.
        expect(get.data.missing.length).toBe(15);
        expect(get.data.missing.map((m: { token: string }) => m.token)).toContain("ИНН");
        expect(get.data.missing.map((m: { token: string }) => m.token)).not.toContain("ДОМЕН_САЙТА");
      });

      it("a fully filled document renders no braces, a single missing field costs exactly its own block, and it never touches a neighbour tenant's page", async () => {
        const put = await api.put("/tenants/requisites", FULL_REQUISITES, bearer(a.token));
        expect(put.status).toBe(200);
        expect(put.data.missing).toEqual([]);
        expect(put.data.hidden_blocks).toEqual([]);

        await publishOfferPage(a, BODY_WITH_TOKENS);
        await publishOfferPage(b, "Наш ИНН: {{ИНН}}.");

        const fullPage = await api.get("/store/tenant/pages/offer", storeKey(a));
        expect(fullPage.status).toBe(200);
        expect(fullPage.data.page.body).not.toMatch(/\{\{/);
        expect(fullPage.data.page.body).toContain(FULL_REQUISITES.inn);

        // B never saved requisites of its own: the buyer gets the page WITHOUT
        // the paragraph that was nothing but a placeholder, and never A's ИНН —
        // the isolation this route is scoped for (tenant id from the
        // bearer/publishable key, never the body).
        const bPage = await api.get("/store/tenant/pages/offer", storeKey(b));
        expect(bPage.status).toBe(200);
        expect(bPage.data.page.body).toBe("");
        expect(bPage.data.page.body).not.toContain(FULL_REQUISITES.inn);

        // Now clear one field on A: only the table ROW that carried it is gone,
        // the rest of the document — and B — stay exactly as they were.
        const clear = await api.put("/tenants/requisites", { inn: "" }, bearer(a.token));
        expect(clear.status).toBe(200);
        expect(clear.data.missing.map((m: { token: string }) => m.token)).toEqual(["ИНН"]);
        expect(clear.data.hidden_blocks).toEqual([
          { key: "offer", title: "Публичная оферта", locale: "en", hidden: 1 },
        ]);

        const partialPage = await api.get("/store/tenant/pages/offer", storeKey(a));
        expect(partialPage.status).toBe(200);
        const body: string = partialPage.data.page.body;
        expect(body).not.toMatch(/\{\{/);
        expect(body).not.toContain("| ИНН |");
        // Every other row, item and paragraph is still there, resolved.
        expect(body).toContain(`| ОГРНИП | ${FULL_REQUISITES.ogrn} |`);
        expect(body).toContain(`| Адрес | ${FULL_REQUISITES.legal_address} |`);
        expect(body).toContain(`- Возврат: ${FULL_REQUISITES.return_address}`);
        expect(body).toContain("| Режим работы | 09:00–21:00 МСК |");
        expect(body).toContain("Возврат товара — в течение 7 дней (ЗоЗПП ст. 26.1).");

        const bPageAfter = await api.get("/store/tenant/pages/offer", storeKey(b));
        expect(bPageAfter.data.page.body).toBe("");
      });

      it("withholds {{ТЕЛЕФОН}} while phone_confirmed is false, and fills it once confirmed", async () => {
        await api.put(
          "/tenants/requisites",
          { phone: "+7 900 000-00-00", phone_confirmed: false },
          bearer(b.token),
        );
        await publishOfferPage(b, "Тел: {{ТЕЛЕФОН}}.");

        const unconfirmed = await api.get("/store/tenant/pages/offer", storeKey(b));
        expect(unconfirmed.status).toBe(200);
        expect(unconfirmed.data.page.body).toBe("");

        const missing = await api.get("/tenants/requisites", bearer(b.token));
        expect(missing.data.missing.map((m: { token: string }) => m.token)).toContain("ТЕЛЕФОН");
        expect(missing.data.hidden_blocks).toEqual([
          { key: "offer", title: "Публичная оферта", locale: "en", hidden: 1 },
        ]);

        await api.put("/tenants/requisites", { phone_confirmed: true }, bearer(b.token));
        const confirmed = await api.get("/store/tenant/pages/offer", storeKey(b));
        expect(confirmed.data.page.body).toBe("Тел: +7 900 000-00-00.");
      });

      it("resolves {{ДОМЕН_САЙТА}} from the tenant's own technical subdomain, not a stored field", async () => {
        const get = await api.get("/tenants/requisites", bearer(a.token));
        expect(get.status).toBe(200);
        expect(typeof get.data.domain).toBe("string");
        expect(get.data.domain).toContain("t12-cherkashino");
      });
    });
  },
});
