import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { deleteTenantFiles } from "../../src/tenant-files";

jest.setTimeout(180_000);

/**
 * Architecture review 2026-09-21, finding S-4. `POST /tenants/uploads` took any
 * file, and the backend serves `static/` from its own host with the type the
 * file name asks for, so an owner uploaded `probe.html` and the platform served
 * it as a page of the engine's domain.
 *
 * Two lines of defence, both pinned here: the upload refuses what is not an
 * image, and `/static` answers with `nosniff` and sends everything that is not
 * a raster image as a download.
 */

const PASSWORD = "supersecret-owner";

// A minimal valid 1x1 transparent PNG.
const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const HTML = Buffer.from("<!doctype html><script>document.title = 'owned'</script>");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>');
const SVG_WITH_SCRIPT = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title = "owned"</script></svg>',
);

/**
 * Builds a multipart/form-data body by hand. The repository has no
 * `form-data` package resolvable from `apps/backend` (only transitively, via
 * axios), so this avoids adding a dependency for one test file.
 */
const buildMultipart = (
  fieldName: string,
  filename: string,
  mimeType: string,
  content: Buffer,
): { body: Buffer; contentType: string } => {
  const boundary = `----tenantUploadsSpec${Date.now()}${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, content, tail]), contentType: `multipart/form-data; boundary=${boundary}` };
};

type Registered = { token: string; tenant: { id: string; handle: string } };

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("tenant uploads: active content", () => {
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

      const upload = async (owner: Registered, filename: string, mimeType: string, content: Buffer) => {
        const { body, contentType } = buildMultipart("files", filename, mimeType, content);
        return api
          .post("/tenants/uploads", body, {
            headers: { ...bearer(owner.token).headers, "content-type": contentType },
          })
          .catch((error: { response: { status: number; data: { message?: string } } }) => error.response);
      };

      const readStatic = (url: string) => api.get(new URL(url).pathname, { responseType: "arraybuffer" });

      let acme: Registered;

      beforeAll(async () => {
        acme = await registerTenant("acme-active", "Acme");
      });

      afterAll(async () => {
        await deleteTenantFiles(getContainer(), acme.tenant.id);
      });

      it("refuses a page, whatever type the caller claims for it", async () => {
        const asPage = await upload(acme, "probe.html", "text/html", HTML);
        expect(asPage.status).toBe(400);

        // The static server takes the type from the file name, so a page that
        // claims to be a picture is still a page.
        const asPicture = await upload(acme, "probe.html", "image/png", HTML);
        expect(asPicture.status).toBe(400);

        const script = await upload(acme, "probe.js", "text/javascript", Buffer.from("alert(1)"));
        expect(script.status).toBe(400);
      });

      it("refuses a drawing that carries a script and takes a plain one", async () => {
        const armed = await upload(acme, "armed.svg", "image/svg+xml", SVG_WITH_SCRIPT);
        expect(armed.status).toBe(400);

        const plain = await upload(acme, "plain.svg", "image/svg+xml", SVG);
        expect(plain.status).toBe(200);
      });

      it("serves a picture inline with nosniff", async () => {
        const uploaded = await upload(acme, "logo.png", "image/png", PNG_BUFFER);
        expect(uploaded.status).toBe(200);

        const served = await readStatic(uploaded.data.files[0].url);
        expect(served.status).toBe(200);
        expect(served.headers["content-type"]).toBe("image/png");
        expect(served.headers["x-content-type-options"]).toBe("nosniff");
        expect(served.headers["content-disposition"]).toBeUndefined();
      });

      it("serves a drawing as a download, so opening its address runs nothing", async () => {
        const uploaded = await upload(acme, "plain.svg", "image/svg+xml", SVG);
        expect(uploaded.status).toBe(200);

        const served = await readStatic(uploaded.data.files[0].url);
        expect(served.status).toBe(200);
        expect(served.headers["x-content-type-options"]).toBe("nosniff");
        expect(served.headers["content-disposition"]).toMatch(/^attachment/);
      });
    });
  },
});
