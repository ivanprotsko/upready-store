import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(180_000);

/**
 * Seam test of the catalogue spreadsheet (t14-product-import):
 * `GET /tenants/products/export`, `POST /tenants/products/import`,
 * `GET /tenants/products/import/:id` and the confirm.
 *
 * What it defends, in order of how expensive the mistake would be:
 *
 *  1. A ROUND TRIP WITH NO EDITS CHANGES NOTHING. Export, import the same
 *     bytes, and every row reports «unchanged». This is the one promise the
 *     whole feature rests on; if it ever breaks, every import silently rewrites
 *     the catalogue.
 *  2. A FATAL ERROR WRITES NOTHING. A duplicate row rejects the whole file and
 *     the confirm refuses it.
 *  3. THE REPORT SURVIVES A RELOAD, which is what the `tenant_product_import`
 *     row exists for.
 *  4. ISOLATION: one shop's export never carries another shop's product.
 *
 * Runner facts that shape this file (the same ones `tenant-export.spec.ts`
 * documents): `DB_HOST` must be the literal `localhost`, and the database is
 * restored before every test, so each `it` registers its own tenant.
 */
const PASSWORD = "supersecret";

const productBody = (title: string, handle: string, sku: string, amount: number) => ({
  title,
  handle,
  status: "published",
  options: [{ title: "Вариант", values: ["Стандарт"] }],
  variants: [
    {
      title: "Стандарт",
      sku,
      prices: [{ currency_code: "eur", amount }],
      manage_inventory: false,
      options: { "Вариант": "Стандарт" },
    },
  ],
});

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("tenant catalogue CSV: export, dry run, confirm", () => {
      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      const registerTenant = async (handle: string, name: string) => {
        const email = `owner@${handle}.test`;

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

        return { token: login.data.token as string, tenant: created.data.tenant };
      };

      const createProduct = async (
        token: string,
        title: string,
        handle: string,
        sku: string,
        amount: number,
      ) => {
        const created = await api.post(
          "/tenants/products",
          productBody(title, handle, sku, amount),
          bearer(token),
        );
        expect(created.status).toBe(201);
        return created.data.product;
      };

      const exportCsv = async (token: string) => {
        const response = await api.get("/tenants/products/export", bearer(token));
        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toContain("text/csv");
        return response.data as string;
      };

      /**
       * Uploads a CSV as multipart, the way the panel does. `form-data` is a
       * transitive dependency of the runner's own axios stack; building the body
       * by hand keeps this file free of a new dependency and of any assumption
       * about which multipart library is resolvable here.
       */
      const upload = async (token: string, filename: string, content: string) => {
        const boundary = "----t14productimportboundary";
        const body =
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
          `Content-Type: text/csv\r\n\r\n` +
          content +
          `\r\n--${boundary}--\r\n`;

        const response = await api
          .post("/tenants/products/import", Buffer.from(body, "utf8"), {
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": `multipart/form-data; boundary=${boundary}`,
            },
          })
          .catch((error) => error.response);

        return response;
      };

      it("reports every row as unchanged when the exported file is imported back", async () => {
        const { token } = await registerTenant("acme", "Acme");
        await createProduct(token, "Acme mug", "acme-mug", "ACME-MUG", 10);
        await createProduct(token, "Acme tote", "acme-tote", "ACME-TOTE", 20);

        // Read as BYTES, not as a decoded string: the runner's axios drops a
        // leading BOM when it decodes, which would both hide the BOM from the
        // assertion and strip it from what this test uploads back — turning the
        // round trip into a round trip of a different file.
        const raw = await api.get("/tenants/products/export", {
          ...bearer(token),
          responseType: "arraybuffer",
        });
        expect(raw.status).toBe(200);
        expect(raw.headers["content-type"]).toContain("text/csv");

        const bytes = Buffer.from(raw.data);
        expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

        const csv = bytes.toString("utf8");

        expect(csv).toContain('"Код товара"');
        expect(csv).toContain("acme-mug");
        expect(csv).toContain("ACME-TOTE");

        const dry = await upload(token, "catalog.csv", csv);
        expect(dry.status).toBe(200);

        const report = dry.data.product_import.report;
        expect(report.status).toBe("pending");
        expect(report.fatal).toEqual([]);
        expect(report.summary.rows).toBe(2);
        expect(report.summary.unchanged).toBe(2);
        expect(report.summary.update).toBe(0);
        expect(report.summary.create).toBe(0);
        expect(report.encoding).toBe("utf-8-bom");
        expect(report.delimiter).toBe(";");
      });

      it("plans a price change on the row that carries it and applies it on confirm", async () => {
        const { token } = await registerTenant("acme", "Acme");
        await createProduct(token, "Acme mug", "acme-mug", "ACME-MUG", 10);

        const csv = await exportCsv(token);
        const edited = csv.replace('"10"', '"12"');
        expect(edited).not.toBe(csv);

        const dry = await upload(token, "catalog.csv", edited);
        expect(dry.status).toBe(200);

        const record = dry.data.product_import;
        expect(record.report.summary.update).toBe(1);
        expect(record.report.rows[0].changes).toEqual([
          { field: "Цена, EUR", from: "10", to: "12" },
        ]);

        // Nothing is written until the confirm: the product still costs 10.
        const before = await api.get(
          "/tenants/products?fields=id,variants.prices.amount,variants.prices.currency_code",
          bearer(token),
        );
        expect(
          before.data.products[0].variants[0].prices.find(
            (price: { currency_code: string }) => price.currency_code === "eur",
          ).amount,
        ).toBe(10);

        const confirmed = await api.post(
          `/tenants/products/import/${record.id}/confirm`,
          {},
          bearer(token),
        );
        expect(confirmed.status).toBe(200);
        expect(confirmed.data.product_import.status).toBe("applied");
        expect(confirmed.data.product_import.report.rows[0].applied).toBe(true);

        const after = await api.get(
          "/tenants/products?fields=id,variants.prices.amount,variants.prices.currency_code",
          bearer(token),
        );
        expect(
          after.data.products[0].variants[0].prices.find(
            (price: { currency_code: string }) => price.currency_code === "eur",
          ).amount,
        ).toBe(12);
      });

      it("rejects a file with a duplicate row whole, and refuses to apply it", async () => {
        const { token } = await registerTenant("acme", "Acme");
        await createProduct(token, "Acme mug", "acme-mug", "ACME-MUG", 10);

        const broken =
          "﻿" +
          [
            "Код товара;Название;Цена, EUR",
            "acme-mug;Acme mug;11",
            "acme-mug;Acme mug again;12",
            "novyi;Новый;по запросу",
          ].join("\r\n") +
          "\r\n";

        const dry = await upload(token, "broken.csv", broken);
        expect(dry.status).toBe(200);

        const record = dry.data.product_import;
        expect(record.status).toBe("rejected");
        expect(record.report.fatal.map((entry: { code: string }) => entry.code)).toContain(
          "duplicate_row",
        );
        expect(record.report.fatal[0].line).toBe(3);

        const rowErrors = record.report.rows
          .flatMap((row: { errors: { code: string }[] }) => row.errors)
          .map((error: { code: string }) => error.code);
        expect(rowErrors).toContain("bad_number");

        const refused = await api
          .post(`/tenants/products/import/${record.id}/confirm`, {}, bearer(token))
          .catch((error) => error.response);
        expect(refused.status).toBe(400);

        // The catalogue is untouched: still one product, still priced 10.
        const after = await api.get(
          "/tenants/products?fields=id,handle,variants.prices.amount,variants.prices.currency_code",
          bearer(token),
        );
        expect(after.data.count).toBe(1);
        expect(
          after.data.products[0].variants[0].prices.find(
            (price: { currency_code: string }) => price.currency_code === "eur",
          ).amount,
        ).toBe(10);
      });

      it("answers the stored report by id, so a page reload does not lose it", async () => {
        const { token } = await registerTenant("acme", "Acme");
        await createProduct(token, "Acme mug", "acme-mug", "ACME-MUG", 10);

        const csv = await exportCsv(token);
        const dry = await upload(token, "catalog.csv", csv);
        const id = dry.data.product_import.id;

        const again = await api.get(`/tenants/products/import/${id}`, bearer(token));
        expect(again.status).toBe(200);
        expect(again.data.product_import.id).toBe(id);
        expect(again.data.product_import.report.summary.rows).toBe(1);
        expect(again.data.product_import.filename).toBe("catalog.csv");

        const list = await api.get("/tenants/products/import", bearer(token));
        expect(list.status).toBe(200);
        expect(list.data.product_imports.map((row: { id: string }) => row.id)).toContain(id);
        expect(list.data.limits.max_rows).toBeGreaterThan(0);
        // The uploaded file itself never crosses over to the panel.
        expect(list.data.product_imports[0].source).toBeUndefined();
      });

      it("never carries another shop's product into an export, and 404s a foreign import id", async () => {
        const acme = await registerTenant("acme", "Acme");
        await createProduct(acme.token, "Acme mug", "acme-mug", "ACME-MUG", 10);

        const globex = await registerTenant("globex", "Globex");
        await createProduct(globex.token, "Globex bottle", "globex-bottle", "GLOBEX-BOTTLE", 30);

        const acmeCsv = await exportCsv(acme.token);
        expect(acmeCsv).toContain("acme-mug");
        expect(acmeCsv).not.toContain("globex-bottle");

        const globexCsv = await exportCsv(globex.token);
        expect(globexCsv).toContain("globex-bottle");
        expect(globexCsv).not.toContain("acme-mug");

        const acmeUpload = await upload(acme.token, "catalog.csv", acmeCsv);
        const acmeImportId = acmeUpload.data.product_import.id;

        const foreign = await api
          .get(`/tenants/products/import/${acmeImportId}`, bearer(globex.token))
          .catch((error) => error.response);
        expect(foreign.status).toBe(404);

        const foreignConfirm = await api
          .post(`/tenants/products/import/${acmeImportId}/confirm`, {}, bearer(globex.token))
          .catch((error) => error.response);
        expect(foreignConfirm.status).toBe(404);
      });

      it("refuses an XLSX with an answer the owner can act on", async () => {
        const { token } = await registerTenant("acme", "Acme");

        // The first bytes of any XLSX: it is a ZIP.
        const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]).toString("binary");
        const refused = await upload(token, "catalog.xlsx", zip);

        expect(refused.status).toBe(400);
        expect(refused.data.message).toContain("CSV");
      });
    });
  },
});
