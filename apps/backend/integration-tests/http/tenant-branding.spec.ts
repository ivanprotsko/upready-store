import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { deleteTenantFiles } from "../../src/tenant-files";

jest.setTimeout(180_000);

/**
 * Seam test of `/tenants/branding` and `/tenants/branding/upload`
 * (t16-owner-branding): the tenant's brand identity round-trips through
 * `tenant.metadata.branding`, the contrast warning fires on the threshold
 * that actually matters (see `api/tenants/branding/contrast.ts` — WCAG AA's
 * 4.5:1 is unreachable as a failure once the foreground is auto-picked, so
 * this is measured against 7:1), the upload route rejects what it should,
 * and `/storefront/by-host` serves the same document to the storefront with
 * no extra tenant round trip.
 */

const PASSWORD = "supersecret-owner";

// A minimal valid 1x1 transparent PNG — far too small for any of this
// route's dimension floors, used only to exercise the "too small" rejection.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const buildMultipart = (
  fields: Record<string, string>,
  fileField: string,
  filename: string,
  mimeType: string,
  content: Buffer,
): { body: Buffer; contentType: string } => {
  const boundary = `----tenantBrandingSpec${Date.now()}${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`,
    ),
  );
  parts.push(content);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
};

type Registered = { token: string; tenant: { id: string; handle: string } };

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenant branding: logo/favicon/og image/primary colour/footer credit", () => {
      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", { email, password: PASSWORD });
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

      const uploadBranding = async (owner: Registered, kind: string, mimeType: string, content: Buffer) => {
        const { body, contentType } = buildMultipart({ kind }, "files", "asset", mimeType, content);
        return api
          .post("/tenants/branding/upload", body, {
            headers: { ...bearer(owner.token).headers, "content-type": contentType },
          })
          .catch((error) => error.response);
      };

      let owner: Registered;

      beforeAll(async () => {
        owner = await registerTenant("branding-owner", "Owner");
      });

      afterAll(async () => {
        await deleteTenantFiles(getContainer(), owner.tenant.id);
      });

      it("starts empty and reports no contrast warning with no colour set", async () => {
        const response = await api.get("/tenants/branding", bearer(owner.token));
        expect(response.status).toBe(200);
        expect(response.data.branding).toEqual({
          logo_light_url: null,
          logo_dark_url: null,
          favicon_url: null,
          og_image_url: null,
          primary_color: null,
          shop_name_short: null,
          footer_credit: null,
          primary_foreground: null,
          low_contrast: false,
        });
      });

      it("rejects an upload smaller than the kind's floor", async () => {
        const response = await uploadBranding(owner, "favicon", "image/png", TINY_PNG);
        expect(response.status).toBe(400);
        expect(response.data.message).toMatch(/at least 32x32px/);
      });

      it("rejects a mime type outside the SVG/PNG/WebP allow-list", async () => {
        const response = await uploadBranding(owner, "logo_light", "image/jpeg", TINY_PNG);
        expect(response.status).toBe(400);
        expect(response.data.message).toMatch(/not accepted here/);
      });

      it("rejects an SVG carrying a <script>", async () => {
        const evilSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        const response = await uploadBranding(owner, "logo_dark", "image/svg+xml", evilSvg);
        expect(response.status).toBe(400);
        expect(response.data.message).toMatch(/script or an event handler/);
      });

      it("accepts a safe SVG and writes it under the tenant's own prefix", async () => {
        const safeSvg = Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect width="100" height="40"/></svg>',
        );
        const response = await uploadBranding(owner, "logo_light", "image/svg+xml", safeSvg);
        expect(response.status).toBe(200);
        expect(response.data.kind).toBe("logo_light");
        expect(response.data.file.url).toContain(`/static/tenants/${owner.tenant.id}/`);
        expect(response.data.file.url).toContain("branding-logo_light-");
      });

      it("saves fields, merges rather than clobbering, and clears only what is set to null", async () => {
        const first = await api.put(
          "/tenants/branding",
          { primary_color: "#1a2b3c", shop_name_short: "Тест" },
          bearer(owner.token),
        );
        expect(first.status).toBe(200);
        expect(first.data.branding.primary_color).toBe("#1a2b3c");
        expect(first.data.branding.shop_name_short).toBe("Тест");
        // Auto-picked foreground and a real contrast pass, not a hardcoded echo.
        expect(first.data.branding.primary_foreground).toBe("#ffffff");
        expect(first.data.branding.low_contrast).toBe(false);

        const second = await api.put(
          "/tenants/branding",
          { footer_credit: { enabled: true, text: "Создание сайта — Иван Процко", href: "https://upready.dev" } },
          bearer(owner.token),
        );
        expect(second.status).toBe(200);
        // The earlier fields survive an update that never names them.
        expect(second.data.branding.primary_color).toBe("#1a2b3c");
        expect(second.data.branding.shop_name_short).toBe("Тест");
        expect(second.data.branding.footer_credit).toEqual({
          enabled: true,
          text: "Создание сайта — Иван Процко",
          href: "https://upready.dev",
        });

        const cleared = await api.put("/tenants/branding", { shop_name_short: null }, bearer(owner.token));
        expect(cleared.status).toBe(200);
        expect(cleared.data.branding.shop_name_short).toBeNull();
        expect(cleared.data.branding.primary_color).toBe("#1a2b3c");
      });

      it("warns on a colour where even the best of black/white text stays under 7:1", async () => {
        // #757575 measured as the grayscale minimum of max(contrast-vs-black,
        // contrast-vs-white) — see the backend contrast helper's own doc
        // comment. A strong colour right after proves the flag is not stuck on.
        const borderline = await api.put("/tenants/branding", { primary_color: "#757575" }, bearer(owner.token));
        expect(borderline.status).toBe(200);
        expect(borderline.data.branding.low_contrast).toBe(true);

        const strong = await api.put("/tenants/branding", { primary_color: "#0b3d91" }, bearer(owner.token));
        expect(strong.status).toBe(200);
        expect(strong.data.branding.low_contrast).toBe(false);
      });

      it("rejects a malformed hex colour before it ever reaches the tenant row", async () => {
        const response = await api
          .put("/tenants/branding", { primary_color: "blue" }, bearer(owner.token))
          .catch((error) => error.response);
        expect(response.status).toBe(400);
      });

      it("serves the same branding document to the storefront through /storefront/by-host", async () => {
        await api.put(
          "/tenants/branding",
          { primary_color: "#0b3d91", shop_name_short: "Витрина" },
          bearer(owner.token),
        );

        const byHost = await api.get(
          `/storefront/by-host?host=${owner.tenant.handle}.localhost`,
        );
        expect(byHost.status).toBe(200);
        expect(byHost.data.branding.primary_color).toBe("#0b3d91");
        expect(byHost.data.branding.shop_name_short).toBe("Витрина");
        expect(byHost.data.branding.primary_foreground).toBe("#ffffff");
      });

      it("a second tenant with no branding gets the empty document, not the first tenant's", async () => {
        const other = await registerTenant("branding-other", "Other");

        const response = await api.get("/tenants/branding", bearer(other.token));
        expect(response.status).toBe(200);
        expect(response.data.branding.primary_color).toBeNull();
        expect(response.data.branding.shop_name_short).toBeNull();
      });
    });
  },
});
